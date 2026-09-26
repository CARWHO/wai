"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { breaches, isOnline, score, status, supabase, type Probe, type Reading, type Status } from "./supabase";

export type ProbeView = {
  probe: Probe;
  latest?: Reading;
  history: Reading[]; // oldest first
  score: number;
  status: Status;
  online: boolean;
  breaches: string[];
  atPhone: boolean; // real hardware probe, drawn where the phone is
};

export type Alert = {
  key: string; // probe id + first reading of the breach, so a new breach is a new alert
  probe: Probe;
  since: string;
  reading: Reading;
  breaches: string[];
};

type Farm = {
  loading: boolean;
  views: ProbeView[];
  readings: Reading[];
  farmScore: number;
  subScores: { level: number; quality: number; devices: number };
  alerts: Alert[];
  handle: (key: string) => void;
  snooze: (key: string, ms: number) => void;
};

const FarmContext = createContext<Farm | null>(null);
const HANDLED_KEY = "wai-handled-alerts";
const SNOOZED_KEY = "wai-snoozed-alerts"; // alert key -> time it wakes up

function load<T>(k: string, empty: T): T {
  if (typeof window === "undefined") return empty;
  try {
    return JSON.parse(localStorage.getItem(k) ?? "null") ?? empty;
  } catch {
    return empty;
  }
}
function save(k: string, v: unknown) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {}
}

export function FarmProvider({ children }: { children: React.ReactNode }) {
  const [probes, setProbes] = useState<Probe[]>([]);
  const [readings, setReadings] = useState<Reading[]>([]); // newest first
  const [loading, setLoading] = useState(true);
  // alerts only exist after readings load, so reading storage here can't cause a hydration mismatch
  const [handled, setHandled] = useState<string[]>(() => load(HANDLED_KEY, []));
  const [snoozed, setSnoozed] = useState<Record<string, number>>(() => load(SNOOZED_KEY, {}));
  const [now, setNow] = useState(() => Date.now());
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null);

  // Phone position. Needs HTTPS (or localhost); silently does nothing if denied.
  useEffect(() => {
    if (!navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (p) => setHere({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 10_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  useEffect(() => {
    Promise.all([
      supabase.from("probes").select("*").order("name"),
      supabase.from("readings").select("*").order("created_at", { ascending: false }).limit(2000),
    ]).then(([p, r]) => {
      setProbes(p.data ?? []);
      setReadings(r.data ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));

    const ch = supabase
      .channel("readings")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "readings" }, (p) =>
        setReadings((r) => [p.new as Reading, ...r]),
      )
      .subscribe();
    // re-render so "last seen", online state and snoozes stay fresh
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      supabase.removeChannel(ch);
      clearInterval(t);
    };
  }, []);

  const handle = useCallback((key: string) => {
    setHandled((h) => {
      const next = [...h, key];
      save(HANDLED_KEY, next);
      return next;
    });
  }, []);

  const snooze = useCallback((key: string, ms: number) => {
    setSnoozed((s) => {
      const next = { ...s, [key]: Date.now() + ms };
      save(SNOOZED_KEY, next);
      return next;
    });
  }, []);

  const views = useMemo<ProbeView[]>(
    () =>
      probes.map((probe) => {
        const mine = readings.filter((r) => r.probe_id === probe.id);
        const latest = mine[0];
        const s = score(latest);
        // the ESP32 probe fills `raw`; seeded probes don't. It sits next to the phone, so draw it there.
        const atPhone = !!here && !!latest?.raw;
        return {
          probe: atPhone ? { ...probe, ...here } : probe,
          atPhone,
          latest,
          history: mine.slice(0, 500).reverse(),
          score: s,
          status: status(s),
          online: isOnline(latest),
          breaches: breaches(latest),
        };
      }),
    [probes, readings, here],
  );

  const alerts = useMemo<Alert[]>(() => {
    const out: Alert[] = [];
    for (const v of views) {
      if (!v.latest || !v.breaches.length) continue;
      // walk back to the first reading of this breach streak
      const mine = readings.filter((r) => r.probe_id === v.probe.id);
      let first = mine[0];
      for (const r of mine) {
        if (!breaches(r).length) break;
        first = r;
      }
      const key = `${v.probe.id}:${first.id}`;
      if (handled.includes(key) || (snoozed[key] ?? 0) > now) continue;
      out.push({ key, probe: v.probe, since: first.created_at, reading: v.latest, breaches: v.breaches });
    }
    return out;
  }, [views, readings, handled, snoozed, now]);

  const quality = views.length ? Math.round(views.reduce((a, v) => a + v.score, 0) / views.length) : 0;
  const level = useMemo(() => {
    // how close each probe's level is to its own typical level
    const parts = views
      .filter((v) => v.latest?.level_cm != null)
      .map((v) => {
        const levels = v.history.map((r) => r.level_cm).filter((x): x is number => x != null).sort((a, b) => a - b);
        const typical = levels[Math.floor(levels.length / 2)] || 1;
        const drop = Math.max(0, (typical - v.latest!.level_cm!) / typical);
        return Math.max(0, 100 - drop * 250);
      });
    return parts.length ? Math.round(parts.reduce((a, b) => a + b, 0) / parts.length) : 0;
  }, [views]);
  const devices = views.length ? Math.round((views.filter((v) => v.online).length / views.length) * 100) : 0;
  const farmScore = Math.round(quality * 0.7 + level * 0.3);

  return (
    <FarmContext.Provider
      value={{ loading, views, readings, farmScore, subScores: { level, quality, devices }, alerts, handle, snooze }}
    >
      {children}
    </FarmContext.Provider>
  );
}

export function useFarm() {
  const f = useContext(FarmContext);
  if (!f) throw new Error("useFarm must be used inside FarmProvider");
  return f;
}
