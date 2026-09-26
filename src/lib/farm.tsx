"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ago, isOnline, LIMITS, score, status, supabase, type Probe, type Reading, type Status } from "./supabase";
import { issues, issueTitle, limitText, mean, metric, METRICS, withUnit, every, type Metric } from "./metrics";
import { DEMO_KEY, demoFill } from "./demo";
import { enrich, geofence, goodFix, interval, metres, recentFixes, timeToEmpty, visits } from "./derive";

export type ProbeView = {
  probe: Probe;
  latest?: Reading;
  history: Reading[]; // oldest first
  score: number;
  status: Status;
  online: boolean;
  hardware: boolean; // real ESP32 probe (fills `raw`), as opposed to a seeded/simulated one
  interval: number; // usual ms between reports
  scores: { level: number; soil: number; quality: number }; // NaN when the probe has no such sensor
  emptyIn: number | null; // hours until empty at the current rate, null if not falling
  visits: number[]; // trough visit start times (ms)
  geo: ReturnType<typeof geofence>;
  located: "gps" | "phone" | null; // real hardware probe placed by its GPS, or next to the phone
};

export type AlertKind = "quality" | "level" | "soil" | "moved" | "offline";
export type Alert = {
  id: string; // probe + kind, used in the URL
  key: string; // id + first reading of the streak, so a new streak is a new alert
  kind: AlertKind;
  probe: Probe;
  since: string;
  reading: Reading;
  title: string;
  detail: string[];
};

type Farm = {
  loading: boolean;
  views: ProbeView[];
  readings: Reading[];
  farmScore: number;
  subScores: { level: number; soil: number; quality: number; devices: number };
  alerts: Alert[];
  handle: (key: string) => void;
  snooze: (key: string, ms: number) => void;
  setHome: (probeId: string, at: { lat: number; lng: number }) => Promise<string | null>;
  demo: boolean;
  setDemo: (on: boolean) => void;
};

const FarmContext = createContext<Farm | null>(null);
const HANDLED_KEY = "wai-handled-alerts";
const SNOOZED_KEY = "wai-snoozed-alerts"; // alert key -> time it wakes up
const PAGE = 1000; // PostgREST row cap per request
const PAGES = 3; // per probe: ~4 h of a 5 s hardware probe, weeks of a 30 min one

// Metric alerts: which measurements each kind watches
const WATCH: Record<"quality" | "level" | "soil", Metric[]> = {
  quality: METRICS.filter((m) => m.wq),
  level: [metric("pct_full")],
  soil: [metric("soil_pct")],
};

// 0-100 sub-scores per probe
const levelScore = (pct?: number | null) => (pct == null ? NaN : Math.min(100, pct * 2));
const soilScore = (s?: number | null) => (s == null ? NaN : s < 30 ? (s / 30) * 100 : s > 80 ? Math.max(0, ((100 - s) / 20) * 100) : 100);
const avg = (xs: number[]) => mean(xs.filter((x) => !isNaN(x)));
// weighted mean over the parts that have data
function weighted(parts: [number, number][]) {
  const ok = parts.filter(([x]) => !isNaN(x));
  const w = ok.reduce((a, [, k]) => a + k, 0);
  return w ? Math.round(ok.reduce((a, [x, k]) => a + x * k, 0) / w) : 0;
}

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

async function probeReadings(id: string) {
  const out: Reading[] = [];
  for (let p = 0; p < PAGES; p++) {
    const { data } = await supabase.from("readings").select("*").eq("probe_id", id)
      .order("created_at", { ascending: false }).range(p * PAGE, p * PAGE + PAGE - 1);
    out.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGE) break;
  }
  return out;
}

export function FarmProvider({ children }: { children: React.ReactNode }) {
  const [probes, setProbes] = useState<Probe[]>([]);
  const [rows, setRows] = useState<Reading[]>([]); // newest first, as stored
  const [loading, setLoading] = useState(true);
  // alerts only exist after readings load, so reading storage here can't cause a hydration mismatch
  const [handled, setHandled] = useState<string[]>(() => load(HANDLED_KEY, []));
  const [snoozed, setSnoozed] = useState<Record<string, number>>(() => load(SNOOZED_KEY, {}));
  const [now, setNow] = useState(() => Date.now());
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null);
  const [demo, setDemoState] = useState(false);
  const setDemo = useCallback((on: boolean) => {
    save(DEMO_KEY, on);
    setDemoState(on);
  }, []);

  // Demo mode refreshes every 5 s so the probe looks live
  useEffect(() => {
    if (!demo) return;
    const t = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(t);
  }, [demo]);

  // Demo mode is per device; ?demo=1 or ?demo=0 on any page turns it on or off
  useEffect(() => {
    const q = new URLSearchParams(location.search).get("demo");
    const t = setTimeout(() => (q != null ? setDemo(q === "1") : setDemoState(load(DEMO_KEY, false))));
    return () => clearTimeout(t);
  }, [setDemo]);

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
    // per probe, so a 5 s hardware probe can't push the others out of the row cap
    supabase.from("probes").select("*").order("name")
      .then(async ({ data }) => {
        const ps = (data ?? []) as Probe[];
        const all = (await Promise.all(ps.map((p) => probeReadings(p.id)))).flat();
        setProbes(ps);
        setRows(all.sort((a, b) => b.created_at.localeCompare(a.created_at)));
        setLoading(false);
      }, () => setLoading(false));

    const ch = supabase
      .channel("readings")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "readings" }, (p) =>
        setRows((r) => [p.new as Reading, ...r].slice(0, 10000)), // bounded: the 5 s probe adds ~17k rows a day
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

  const setHome = useCallback(async (probeId: string, at: { lat: number; lng: number }) => {
    const { error } = await supabase.from("probes").update({ home_lat: at.lat, home_lng: at.lng }).eq("id", probeId);
    if (!error) setProbes((ps) => ps.map((p) => (p.id === probeId ? { ...p, home_lat: at.lat, home_lng: at.lng } : p)));
    return error?.message ?? null;
  }, []);

  const readings = useMemo(() => {
    const depth = Object.fromEntries(probes.map((p) => [p.id, p.depth_cm]));
    const src = demo
      ? probes.flatMap((p) => demoFill(rows.filter((r) => r.probe_id === p.id), p, now, here))
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
      : rows;
    return src.map((r) => enrich(r, depth[r.probe_id]));
  }, [rows, probes, demo, now, here]);

  const views = useMemo<ProbeView[]>(
    () =>
      probes.map((probe) => {
        const mine = readings.filter((r) => r.probe_id === probe.id);
        const history = [...mine].reverse();
        const latest = mine[0];
        const hardware = !!latest?.raw;
        const iv = interval(history);
        const online = hardware
          ? now - new Date(latest.created_at).getTime() < Math.max(LIMITS.offlineMinMs, 3 * (iv || 0))
          : isOnline(latest);
        const scores = { level: levelScore(latest?.pct_full), soil: soilScore(latest?.soil_pct), quality: score(latest) };
        const geo = geofence(probe, history);
        let s = latest ? Math.round(avg([scores.level, scores.soil, scores.quality]) || 0) : 0;
        if (geo?.moved || (hardware && !online)) s = Math.min(s, 40);
        // Place a hardware probe by its last good GPS fix (XC3710), else next to the phone,
        // else where the probes table says.
        const fix = recentFixes(history)[0] ?? null;
        const located = fix ? "gps" : here && hardware ? "phone" : null;
        return {
          probe: fix ? { ...probe, ...fix } : located === "phone" ? { ...probe, ...here! } : probe,
          located,
          latest,
          history,
          score: s,
          status: status(s),
          online,
          hardware,
          interval: iv,
          scores,
          emptyIn: timeToEmpty(history),
          visits: hardware ? visits(history) : [],
          geo,
        };
      }),
    [probes, readings, here, now],
  );

  const alerts = useMemo<Alert[]>(() => {
    const out: Alert[] = [];
    for (const v of views) {
      if (!v.latest) continue;
      const mine = [...v.history].reverse(); // newest first
      const add = (kind: AlertKind, first: Reading, title: string, detail: string[]) => {
        const key = `${v.probe.id}:${kind}:${first.id}`;
        if (handled.includes(key) || (snoozed[key] ?? 0) > now) return;
        out.push({ id: `${v.probe.id}~${kind}`, key, kind, probe: v.probe, since: first.created_at, reading: v.latest!, title, detail });
      };

      if (v.hardware && !v.online)
        add("offline", v.latest, "Probe offline", [`Last heard ${ago(v.latest.created_at)}`, `Usually reports every ${every(v.interval)}`]);

      if (v.geo?.moved) {
        // walk back to the first fix outside the geofence; readings without a good fix don't break the streak
        let first = v.latest;
        for (const r of mine) {
          const f = goodFix(r);
          if (!f) continue;
          if (metres(v.geo.home, f) <= v.geo.radius) break;
          first = r;
        }
        add("moved", first, "Probe moved", [`${Math.round(v.geo.distance)} m from home · geofence ${v.geo.radius} m`]);
      }

      for (const kind of ["level", "soil", "quality"] as const) {
        const cur = issues(v.latest, WATCH[kind]);
        if (!cur.length) continue;
        let first = v.latest;
        for (const r of mine) {
          if (!issues(r, WATCH[kind]).length) break;
          first = r;
        }
        add(kind, first, cur.map(issueTitle).join(", "), cur.map((i) =>
          `${i.m.wq ? `${i.m.name} ` : ""}${withUnit(i.m, i.x)}${i.m.key === "pct_full" ? " full" : i.m.key === "soil_pct" ? " moisture" : ""} · limit ${limitText(i.m)}`));
      }
    }
    return out;
  }, [views, handled, snoozed, now]);

  const subScores = {
    level: Math.round(avg(views.map((v) => v.scores.level)) || 0),
    soil: Math.round(avg(views.map((v) => v.scores.soil)) || 0),
    quality: Math.round(avg(views.map((v) => v.scores.quality))), // NaN when no probe measures quality
    devices: views.length ? Math.round((views.filter((v) => v.online).length / views.length) * 100) : 0,
  };
  const farmScore = weighted([[subScores.level, 0.35], [subScores.soil, 0.25], [subScores.quality, 0.2], [subScores.devices, 0.2]]);

  return (
    <FarmContext.Provider value={{ loading, views, readings, farmScore, subScores, alerts, handle, snooze, setHome, demo, setDemo }}>
      {children}
    </FarmContext.Provider>
  );
}

export function useFarm() {
  const f = useContext(FarmContext);
  if (!f) throw new Error("useFarm must be used inside FarmProvider");
  return f;
}
