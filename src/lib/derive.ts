import { LIMITS, type Probe, type Reading } from "./supabase";
import { median } from "./metrics";

// Values the app works out from a probe's readings (see hardware/firmware/README.md for `raw`)

const t = (r: Reading) => new Date(r.created_at).getTime();
const num = (x: unknown) => (typeof x === "number" && isFinite(x) ? x : null);

// % full from the probe's depth; soil % from the column, or raw for rows written before the trigger
export function enrich(r: Reading, depth?: number | null): Reading {
  const soil = r.soil_pct ?? num(r.raw?.soil_pct);
  const pct = r.level_cm != null && depth ? Math.min(100, Math.max(0, (r.level_cm / depth) * 100)) : null;
  return { ...r, soil_pct: soil, pct_full: pct };
}

export type Gps = { fix?: boolean; lat?: number; lng?: number; hdop?: number; sats?: number; age_ms?: number };
export const gps = (r?: Reading) => r?.raw?.gps as Gps | undefined;

// A fix worth trusting: valid, and HDOP low enough that jitter stays within a few metres
export function goodFix(r?: Reading) {
  const g = gps(r);
  return g?.fix && num(g.lat) != null && num(g.lng) != null && (g.hdop ?? 99) <= LIMITS.hdopMax
    ? { lat: g.lat!, lng: g.lng! }
    : null;
}

// Metres between two points (haversine)
export function metres(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = Math.PI / 180;
  const x = Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lng - a.lng) * rad) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(x));
}

// Newest good fixes (up to n) from the hour before the latest reading, newest first
const FIX_MAX_AGE = 3_600_000;
export function recentFixes(history: Reading[], n = 1) {
  const out: { lat: number; lng: number }[] = [];
  const last = history.at(-1);
  if (!last) return out;
  const from = t(last) - FIX_MAX_AGE;
  for (let i = history.length - 1; i >= 0 && out.length < n && t(history[i]) >= from; i--) {
    const f = goodFix(history[i]);
    if (f) out.push(f);
  }
  return out;
}

// Distance of the probe from home, from its last 3 good fixes (oldest-first history).
// Moved only if all three are outside the geofence, so one wild fix doesn't raise an alert.
export function geofence(probe: Probe, history: Reading[]) {
  if (probe.home_lat == null || probe.home_lng == null) return null;
  const home = { lat: probe.home_lat, lng: probe.home_lng };
  const fixes = recentFixes(history, 3);
  if (!fixes.length) return null;
  const ds = fixes.map((f) => metres(home, f));
  return { home, distance: ds[0], moved: ds.every((d) => d > probe.geofence_m), radius: probe.geofence_m };
}

// Usual gap between reports, in ms: the probe's own setting if it sends one, else the median gap
export function interval(history: Reading[]) {
  const last = history.at(-1);
  const iv = num(last?.raw?.interval_s);
  if (iv) return iv * 1000;
  const recent = history.slice(-50);
  return median(recent.slice(1).map((r, i) => t(r) - t(recent[i])));
}

// Level trend over the last 6 h (least squares). Hours until empty if falling, else null.
export function timeToEmpty(history: Reading[]) {
  const last = history.at(-1);
  if (last?.level_cm == null) return null;
  const from = t(last) - 6 * 3_600_000;
  const pts = history.filter((r) => r.level_cm != null && t(r) >= from).map((r) => [(t(r) - from) / 3_600_000, r.level_cm!]);
  if (pts.length < 4) return null;
  const mx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
  const my = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  const den = pts.reduce((a, p) => a + (p[0] - mx) ** 2, 0);
  if (!den) return null;
  const slope = pts.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0) / den; // cm per hour
  if (slope > -0.05) return null;
  return Math.max(0, last.level_cm / -slope);
}

// Animal visits from the ultrasonic sensor: a head or muzzle over the trough reads closer than the water.
// A reading well below the median distance of the previous 10 minutes is a dip; dips less than
// 2 minutes apart are one visit. Returns visit start times (ms).
const BASELINE_MS = 10 * 60_000;
const MERGE_MS = 2 * 60_000;
export function visits(history: Reading[]) {
  const pts = history
    .map((r) => ({ t: t(r), d: num(r.raw?.distance_cm), ok: num(r.raw?.echo_ok) }))
    .filter((p): p is { t: number; d: number; ok: number | null } => p.d != null && p.d > 0 && p.ok !== 0);
  const out: number[] = [];
  let lastDip = -Infinity;
  let j = 0;
  for (let i = 0; i < pts.length; i++) {
    while (pts[j].t < pts[i].t - BASELINE_MS) j++;
    const window = pts.slice(j, i).map((p) => p.d);
    if (window.length < 5) continue;
    const base = median(window);
    if (pts[i].d >= base - Math.max(2, base * 0.2)) continue;
    if (pts[i].t - lastDip > MERGE_MS) out.push(pts[i].t);
    lastDip = pts[i].t;
  }
  return out;
}

export const dayKey = (ms: number) => new Date(ms).toLocaleDateString("en-CA"); // YYYY-MM-DD, local
// Visits per day for the last n days, oldest first
export function visitsByDay(starts: number[], now: number, n = 7) {
  return Array.from({ length: n }, (_, i) => {
    const day = new Date(now - (n - 1 - i) * 86_400_000);
    const k = dayKey(day.getTime());
    return { k, day, n: starts.filter((s) => dayKey(s) === k).length };
  });
}

// Is each part of a hardware probe working? From its latest reading, in plain words.
export type Check = { part: string; s: "good" | "watch" | "bad"; text: string };
export function health(latest: Reading | undefined, online: boolean, lastHeard: string): Check[] {
  const raw = latest?.raw ?? {};
  const rssi = num(raw.rssi);
  if (!online)
    return [{ part: "Connection", s: "bad", text: `Last heard ${lastHeard}` }];
  const out: Check[] = [
    rssi != null && rssi < -80
      ? { part: "Connection", s: "watch", text: `Weak · ${rssi} dBm` }
      : { part: "Connection", s: "good", text: rssi != null ? `Live · ${rssi} dBm` : "Live" },
  ];
  const ok = num(raw.echo_ok);
  const tries = Array.isArray(raw.echo_us) ? raw.echo_us.length : 5;
  if (ok != null)
    out.push(
      ok === 0
        ? { part: "Water level", s: "bad", text: "No echo" }
        : ok < tries
          ? { part: "Water level", s: "watch", text: `${ok} of ${tries} echoes` }
          : { part: "Water level", s: "good", text: `${num(raw.distance_cm)?.toFixed(0) ?? "–"} cm to water` },
    );
  const adc = num(raw.soil_adc);
  if (adc != null)
    out.push(
      adc === 0
        ? { part: "Soil moisture", s: "watch", text: "0%" }
        : { part: "Soil moisture", s: "good", text: `${num(raw.soil_pct)?.toFixed(0) ?? "–"}% moisture` },
    );
  const g = gps(latest);
  const chars = num((raw.gps as { chars?: number } | undefined)?.chars);
  if (g)
    out.push(
      g.fix
        ? { part: "GPS", s: (g.hdop ?? 99) <= LIMITS.hdopMax ? "good" : "watch", text: `${g.sats ?? 0} satellites` }
        : chars
          ? { part: "GPS", s: "watch", text: "No fix" }
          : { part: "GPS", s: "bad", text: "No data" },
    );
  return out;
}
