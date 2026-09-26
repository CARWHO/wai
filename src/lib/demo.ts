import { LIMITS, type Probe, type Reading } from "./supabase";

// Demo mode: the hardware probe always looks like it's working. Real readings that look right
// pass through untouched; missing or failed values are filled in from the last good ones,
// and silent stretches (including up to now) get readings every minute.

export const DEMO_KEY = "wai-demo";
const STEP = 60_000;
const MAX_GAP = 3 * 60_000; // a gap longer than this gets filled
const MAX_FILL = 6 * 60; // at most 6 h of made-up readings per gap

const t = (r: Reading) => new Date(r.created_at).getTime();
const num = (x: unknown) => (typeof x === "number" && isFinite(x) ? x : null);
// small, steady wobble from the timestamp, so values don't jump between renders
const wobble = (ms: number, amp: number, period = 17 * 60_000) =>
  amp * (Math.sin((ms / period) * 2 * Math.PI) * 0.7 + Math.sin((ms / (period * 0.37)) * 2 * Math.PI) * 0.3);

type Good = { level: number; soil: number; lat: number; lng: number };

function goodLevel(r: Reading, depth: number) {
  const l = r.level_cm;
  const ok = num(r.raw?.echo_ok);
  return l != null && l > 0.5 && l < depth - 3 && ok !== 0 ? l : null; // under 3 cm is too close to trust
}
function goodSoil(r: Reading) {
  const s = r.soil_pct ?? num(r.raw?.soil_pct);
  return s != null && s > 0 && s < 100 ? s : null;
}
function goodGps(r: Reading) {
  const g = r.raw?.gps as { fix?: boolean; lat?: number; lng?: number; hdop?: number } | undefined;
  return g?.fix && num(g.lat) != null && num(g.lng) != null && (g.hdop ?? 99) <= LIMITS.hdopMax ? { lat: g.lat!, lng: g.lng! } : null;
}

// A trough fills and drains slowly, so in demo mode the level follows the median of the
// 10 minutes around each reading and moves at most 1 cm a minute. Spikes (a hand, a bump,
// the probe picked up) disappear; a real change still comes through, just smoothly.
const WINDOW = 5 * 60_000;
const RATE = 1 / 60_000; // cm per ms
function smoothLevels(old: Reading[], depth: number, start: number) {
  const good = old.map((r) => goodLevel(r, depth));
  const ts = old.map(t);
  let lo = 0, hi = 0, prev = start;
  return old.map((_, i) => {
    while (ts[lo] < ts[i] - WINDOW) lo++;
    while (hi < old.length && ts[hi] <= ts[i] + WINDOW) hi++;
    const xs = good.slice(lo, hi).filter((x): x is number => x != null).sort((a, b) => a - b);
    const target = xs.length ? xs[Math.floor(xs.length / 2)] : prev;
    const step = RATE * (i ? ts[i] - ts[i - 1] : 0);
    prev = +(prev + Math.max(-step, Math.min(step, target - prev))).toFixed(1);
    return prev;
  });
}

function patch(r: Reading, g: Good, depth: number, ms: number, id: number, smooth?: number): Reading {
  const real = goodLevel(r, depth);
  const level = smooth ?? real ?? +(g.level + wobble(ms, 0.4)).toFixed(1);
  const lvl = real != null && Math.abs(real - level) < 0.5 ? real : null;
  const soil = goodSoil(r) ?? +(g.soil + wobble(ms, 0.8, 41 * 60_000)).toFixed(1);
  const fix = goodGps(r);
  const distance = +(depth - level).toFixed(1);
  const echo = Math.round((distance / 0.0343) * 2);
  const raw = r.raw ?? {};
  const gps = (raw.gps as Record<string, unknown> | undefined) ?? {};
  return {
    ...r,
    id,
    created_at: new Date(ms).toISOString(),
    level_cm: level,
    soil_pct: soil,
    raw: {
      ...raw,
      distance_cm: lvl != null ? raw.distance_cm : distance,
      echo_ok: lvl != null ? raw.echo_ok : 5,
      echo_us: lvl != null ? raw.echo_us : [echo, echo + 3, echo - 2, echo + 1, echo],
      soil_pct: soil,
      soil_adc: goodSoil(r) != null ? raw.soil_adc : Math.round((soil / 100) * 1500),
      rssi: num(raw.rssi) ?? Math.round(-55 + wobble(ms, 4, 5 * 60_000)),
      gps: fix
        ? gps
        : { ...gps, fix: true, lat: g.lat, lng: g.lng, sats: 8, hdop: 0.9, age_ms: 800, chars: num(gps.chars) ?? 1 },
    },
  };
}

// rows: one probe's readings, newest first. Returns the same order.
// here: the phone's position, used when the probe has no good GPS fix (it's next to the phone)
export function demoFill(rows: Reading[], probe: Probe, now: number, here?: { lat: number; lng: number } | null): Reading[] {
  if (!rows.length || !rows[0].raw) return rows; // only real hardware probes
  const depth = probe.depth_cm ?? 30;
  const old = [...rows].reverse();
  // start from the first good values anywhere in the history
  const g: Good = {
    level: old.map((r) => goodLevel(r, depth)).find((x) => x != null) ?? depth * 0.8,
    soil: old.map(goodSoil).find((x) => x != null) ?? 42,
    ...(here ?? old.map(goodGps).find((x) => x) ?? { lat: probe.home_lat ?? probe.lat, lng: probe.home_lng ?? probe.lng }),
  };
  const smooth = smoothLevels(old, depth, g.level);
  const out: Reading[] = [];
  let fake = -1;
  const fill = (from: number, to: number, like: Reading) => {
    for (let k = 1, ms = from + STEP; ms < to - STEP / 2 && k <= MAX_FILL; k++, ms += STEP)
      out.push(patch({ ...like, raw: { ...(like.raw ?? {}), echo_ok: 0, soil_pct: 0, soil_adc: 0, gps: { fix: false } } }, g, depth, ms, fake--));
  };
  for (let i = 0; i < old.length; i++) {
    const r = old[i];
    if (i && t(r) - t(old[i - 1]) > MAX_GAP) fill(t(old[i - 1]), t(r), old[i - 1]);
    const p = patch(r, g, depth, t(r), r.id, smooth[i]);
    out.push(p);
    g.level = p.level_cm!;
    g.soil = p.soil_pct!;
    const f = goodGps(r);
    if (f && !here) Object.assign(g, f);
  }
  const last = old.at(-1)!;
  if (now - t(last) > MAX_GAP) {
    fill(Math.max(t(last), now - MAX_FILL * STEP), now - STEP, last);
    out.push(patch({ ...last, raw: { ...(last.raw ?? {}), echo_ok: 0, soil_pct: 0, soil_adc: 0, gps: { fix: false } } }, g, depth, now - 5_000, fake--));
  }
  return out.reverse();
}
