import { LIMITS, type Probe, type Reading } from "./supabase";

// Demo mode for the hardware probe: real readings pass through as they are, except GPS, which
// can't get a fix indoors, so it reads as a fix at the phone (or the last good fix). Past silent
// stretches get readings every minute so the history is unbroken; up to now stays real, so an
// unplugged probe still shows offline.

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

function patch(r: Reading, g: Good, depth: number, ms: number, id: number): Reading {
  const real = goodLevel(r, depth);
  const level = real ?? +(g.level + wobble(ms, 0.4)).toFixed(1);
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
  const out: Reading[] = [];
  let fake = -1;
  const fill = (from: number, to: number, like: Reading) => {
    for (let k = 1, ms = from + STEP; ms < to - STEP / 2 && k <= MAX_FILL; k++, ms += STEP)
      out.push(patch({ ...like, raw: { ...(like.raw ?? {}), echo_ok: 0, soil_pct: 0, soil_adc: 0, gps: { fix: false } } }, g, depth, ms, fake--));
  };
  for (let i = 0; i < old.length; i++) {
    const r = old[i];
    if (i && t(r) - t(old[i - 1]) > MAX_GAP) fill(t(old[i - 1]), t(r), old[i - 1]);
    const f = goodGps(r);
    const gps = (r.raw?.gps as Record<string, unknown> | undefined) ?? {};
    out.push(f ? r : { ...r, raw: { ...r.raw, gps: { ...gps, fix: true, lat: g.lat, lng: g.lng, sats: 8, hdop: 0.9, age_ms: 800 } } });
    g.level = goodLevel(r, depth) ?? g.level;
    g.soil = goodSoil(r) ?? g.soil;
    if (f && !here) Object.assign(g, f);
  }
  return story(out, depth, now).reverse();
}

// A past event to point at in the live demo: this morning the trough ran low (a stuck float
// valve), the alert fired, and it refilled once the valve was freed. It sits 4 to 2 hours ago.
const LOW_AT = 4 * 60 * 60_000;
function story(out: Reading[], depth: number, now: number) {
  const low = depth * 0.14; // under the 25% limit
  const a = now - LOW_AT, b = now - LOW_AT / 2;
  const edge = 20 * 60_000; // drains over 20 min, refills over 20 min
  for (const r of out) {
    const ms = t(r);
    if (ms < a || ms > b || r.level_cm == null) continue;
    const f = Math.min(1, (ms - a) / edge, (b - ms) / edge);
    const level = +(r.level_cm + (low + wobble(ms, 0.3, 7 * 60_000) - r.level_cm) * f).toFixed(1);
    const echo = Math.round(((depth - level) / 0.0343) * 2);
    r.level_cm = level;
    r.raw = { ...r.raw, distance_cm: +(depth - level).toFixed(1), echo_ok: 5, echo_us: [echo, echo + 2, echo - 1, echo, echo + 1] };
  }
  return out;
}

// The seeded probes (no `raw`) report every 30 min. In demo mode they carry on from their last
// reading up to now, and two of them drift into a believable alert over the next few hours:
// the Dam's turbidity climbs after rain and Bore 1's paddock dries out.
const SEED_STEP = 30 * 60_000;
const SEED_MAX = 2 * 24 * 60 * 60_000;
const RAMP = 3 * 60 * 60_000;
const SCENARIO: Record<string, Partial<Record<"turbidity" | "soil_pct", number>>> = {
  Dam: { turbidity: 14.2 },
  "Bore 1": { soil_pct: 16.5 },
};

export function demoSeeded(rows: Reading[], probe: Probe, now: number): Reading[] {
  if (!rows.length || rows[0].raw) return rows;
  const last = rows[0];
  const out: Reading[] = [];
  for (let ms = t(last) + SEED_STEP; ms <= now && ms - t(last) <= SEED_MAX; ms += SEED_STEP) {
    const w = (amp: number, p: number) => wobble(ms, amp, p);
    out.push({
      ...last,
      id: -Math.floor(ms / 1000), // stable per slot, so handled/snoozed alerts stay that way
      created_at: new Date(ms).toISOString(),
      turbidity: last.turbidity == null ? null : +(last.turbidity + w(0.4, 3.1 * 3_600_000)).toFixed(2),
      ph: last.ph == null ? null : +(last.ph + w(0.05, 5.3 * 3_600_000)).toFixed(2),
      tds: last.tds == null ? null : +(last.tds + w(6, 4.2 * 3_600_000)).toFixed(1),
      temp_c: last.temp_c == null ? null : +(last.temp_c + w(0.6, 12 * 3_600_000)).toFixed(2),
      level_cm: last.level_cm == null ? null : +(last.level_cm + w(2, 7 * 3_600_000)).toFixed(1),
      soil_pct: last.soil_pct == null ? null : +(last.soil_pct + w(1, 9 * 3_600_000)).toFixed(1),
    });
  }
  // ramp the scenario in from the last real reading, so the alert's start time stays put
  const s = SCENARIO[probe.name] ?? {};
  const from = t(last);
  for (const r of [...rows, ...out]) {
    const f = Math.min(1, Math.max(0, (t(r) - from) / RAMP));
    if (!f) continue;
    for (const [k, target] of Object.entries(s) as ["turbidity" | "soil_pct", number][]) {
      const base = r[k];
      if (base != null) r[k] = +(base + (target - base) * f).toFixed(2);
    }
  }
  return [...out.reverse(), ...rows];
}
