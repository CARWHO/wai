// Fixtures for the Swift port: real rows from Supabase and what the TypeScript lib computes from them.
// Run from the repo root: npx tsx ios/scripts/fixtures.ts
//
// JSON conventions: NaN is written as null, +/-Infinity as the strings "Infinity" / "-Infinity",
// undefined fields are left out. Dates are local to Pacific/Auckland (dayKey, visitsByDay).
process.env.TZ = "Pacific/Auckland";

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ago, breaches, isOnline, LIMITS, score, status, supabase, type Probe, type Reading, type Status } from "../../src/lib/supabase";
import {
  duration, every, fmt, hasLimit, issues, issueTitle, limitLines, limitText, mean, median, metric, metricName,
  METRICS, present, PRIMARY, state, withUnit, type Metric,
} from "../../src/lib/metrics";
import { demoFill, demoSeeded } from "../../src/lib/demo";
import {
  enrich, geofence, goodFix, health, interval, metres, recentFixes, timeToEmpty, visits, visitsByDay,
} from "../../src/lib/derive";

const DIR = resolve(__dirname, "../Fixtures");
const clean = (_k: string, v: unknown) =>
  typeof v === "number" && !isFinite(v) ? (isNaN(v) ? null : v > 0 ? "Infinity" : "-Infinity") : v;
const write = (name: string, v: unknown) => writeFileSync(resolve(DIR, name), JSON.stringify(v, clean, 1) + "\n");

let now = 0;
let here: { lat: number; lng: number } | null = null;

async function main() {
  const probes = ((await supabase.from("probes").select("*").order("name")).data ?? []) as Probe[];
  const rows: Reading[] = [];
  for (const p of probes) {
    const { data, error } = await supabase.from("readings").select("*").eq("probe_id", p.id)
      .order("created_at", { ascending: false }).range(0, 599);
    if (error) throw error;
    rows.push(...(data ?? []));
}
rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
if (!probes.length || !rows.length) throw new Error("no data");
write("probes.json", probes);
write("readings.json", rows);

now = new Date(rows[0].created_at).getTime() + 30_000;
Date.now = () => now;
const hw = probes.find((p) => rows.find((r) => r.probe_id === p.id)?.raw);
here = hw ? { lat: hw.lat + 30 / 111_320, lng: hw.lng } : null;
write("meta.json", { now, here });

const copy = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const enrichAll = (ps: Probe[], rs: Reading[]) => {
  const depth = Object.fromEntries(ps.map((p) => [p.id, p.depth_cm]));
  return rs.map((r) => enrich(r, depth[r.probe_id]));
};
const enriched = enrichAll(probes, rows);
const historyOf = (id: string) => enriched.filter((r) => r.probe_id === id).reverse();

// Synthetic set from the real rows, for paths the live data may not reach: a 3 h gap in the
// hardware history (demo fill and the story window), good GPS fixes outside then inside the
// geofence, one fix with a bad HDOP, a reported interval, and a probe with no readings.
const synth = (): [Probe[], Reading[]] => {
  const ps = copy(probes);
  ps.push({ id: "00000000-0000-0000-0000-000000000000", name: "Empty", lat: -43.5, lng: 172.5, depth_cm: null, home_lat: null, home_lng: null, geofence_m: 50 });
  const rs = copy(rows);
  if (!hw) return [ps, rs];
  const home = { lat: hw.home_lat ?? hw.lat, lng: hw.home_lng ?? hw.lng };
  rs.filter((r) => r.probe_id === hw.id).forEach((r, i) => {
    const raw = (r.raw ??= {});
    if (i >= 300) r.created_at = new Date(new Date(r.created_at).getTime() - 3 * 3_600_000).toISOString();
    if (i === 0) raw.interval_s = 5;
    if (i < 40 && i % 4 === 0) raw.gps = { fix: true, lat: home.lat + (i < 20 ? 0.002 : 0.0001), lng: home.lng, hdop: i === 8 ? 7 : 1.2, sats: 7, chars: 100 };
  });
  rs.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return [ps, rs];
};
const [synthProbes, synthRows] = synth();
write("synthetic-probes.json", synthProbes);
write("synthetic-readings.json", synthRows);

// derive.json
const deriveProbes = (ps: Probe[], rs: Reading[]) => ps.map((p) => {
  const h = enrichAll(ps, rs).filter((r) => r.probe_id === p.id).reverse();
  const v = visits(h);
  const latest = h.at(-1);
  return {
    id: p.id, interval: interval(h), timeToEmpty: timeToEmpty(h), visits: v, recentFixes: recentFixes(h, 3),
    recentFix: recentFixes(h), geofence: geofence(p, h), visitsByDay: visitsByDay(v, now).map((d) => ({ k: d.k, day: d.day.getTime(), n: d.n })),
    healthOnline: health(latest, true, ago(latest?.created_at)), healthOffline: health(latest, false, ago(latest?.created_at)),
  };
});
write("derive.json", {
  readings: enriched.map((r) => ({ id: r.id, pct_full: r.pct_full, soil_pct: r.soil_pct, goodFix: goodFix(r) })),
  probes: deriveProbes(probes, rows),
  synthetic: deriveProbes(synthProbes, synthRows),
  metres: [
    [{ lat: -41.29, lng: 174.78 }, { lat: -41.29, lng: 174.78 }],
    [{ lat: -41.29, lng: 174.78 }, { lat: -41.2903, lng: 174.7804 }],
    [{ lat: -36.85, lng: 174.76 }, { lat: -41.29, lng: 174.78 }],
    [{ lat: 0, lng: 0 }, { lat: 0, lng: 180 }],
    [{ lat: 51.5, lng: -0.12 }, { lat: 40.7, lng: -74 }],
  ].map(([a, b]) => ({ a, b, m: metres(a, b) })),
});

// metrics.json
const samples = [NaN, 0, -0.04, 0.05, 0.125, 0.5, 1.005, 1.5, 2.5, -0.5, -1.25, 6.45, 8.55, 19.95, 24.5, 90.5, 600.5, 1234.5678, -3];
const issueJSON = (i: ReturnType<typeof issues>[number]) => ({ key: i.m.key, state: i.state, x: i.x, title: issueTitle(i) });
write("metrics.json", {
  readings: enriched.map((r) => ({
    id: r.id, score: score(r), status: status(score(r)), breaches: breaches(r), issues: issues(r).map(issueJSON),
    wq: issues(r, METRICS.filter((m) => m.wq)).map(issueJSON),
  })),
  metrics: METRICS.map((m: Metric) => ({
    key: m.key, name: m.name, unit: m.unit, digits: m.digits, min: m.min, max: m.max, low: m.low, high: m.high, wq: !!m.wq,
    metricName: metricName(m), hasLimit: hasLimit(m), limitText: limitText(m), limitLines: limitLines(m),
    fmt: samples.map((x) => [x, fmt(m, x)]), withUnit: samples.map((x) => [x, withUnit(m, x)]),
    state: samples.map((x) => [x, state(m, x)]),
    issueTitle: (["High", "Low"] as const).map((s) => [s, issueTitle({ m, state: s })]),
  })),
  primary: PRIMARY.map((m) => m.key),
  present: probes.map((p) => ({ id: p.id, keys: present(historyOf(p.id)).map((m) => m.key) })),
  status: [-1, 0, 49.9, 50, 79.9, 80, 100, NaN].map((s) => [s, status(s)]),
  mean: [[], [1], [1, 2, 3, 4], [0.1, 0.2, 0.7]].map((xs) => [xs, mean(xs)]),
  median: [[], [5], [3, 1, 2], [4, 1, 3, 2]].map((xs) => [xs, median(xs)]),
  duration: [0, 0.001, 0.5, 0.9999, 1, 1.5, 2.5, 23.4, 47.9, 48, 49.5, 72.5, 100.7, 1000, Infinity, NaN].map((h) => [h, duration(h)]),
  every: [0, 499, 500, 1500, 2500, 5000, 59_999, 60_000, 90_000, 150_000, 1_800_000, 5_399_999, 5_400_000, 9_000_000, 12_345_678, Infinity, NaN]
    .map((ms) => [ms, every(ms)]),
  ago: [null, ...[0, 59_000, 60_000, 3_599_000, 3_600_000, 86_399_000, 86_400_000, 10 * 86_400_000, -5000]
    .map((d) => new Date(now - d).toISOString()), rows[0].created_at, rows.at(-1)!.created_at]
    .map((iso) => [iso, ago(iso ?? undefined)]),
  isOnline: [rows[0], rows.at(-1)!].map((r) => [r.id, isOnline(r)]),
});

type Result = ReturnType<typeof farm>;
const out = (set: string, demo: boolean, handled: string[], snoozed: Record<string, number>, r: Result) => ({
  set, demo, here, handled, snoozed,
  readingIds: r.readings.map((x) => x.id),
  // generated rows only exist in demo mode (real ones are in readings.json); once per data set and phone position
  readings: demo && !handled.length && !Object.keys(snoozed).length ? r.readings : undefined,
  views: r.views.map((v) => ({
    probe: v.probe, latestId: v.latest?.id ?? null, historyLength: v.history.length,
    firstId: v.history[0]?.id ?? null, lastId: v.history.at(-1)?.id ?? null,
    score: v.score, status: v.status, online: v.online, hardware: v.hardware, interval: v.interval, scores: v.scores,
    emptyIn: v.emptyIn, visits: v.visits, geo: v.geo, located: v.located,
  })),
  alerts: r.alerts.map((a) => ({
    id: a.id, key: a.key, kind: a.kind, probeId: a.probe.id, probe: a.probe, since: a.since, readingId: a.reading.id, title: a.title, detail: a.detail,
  })),
  subScores: r.subScores, farmScore: r.farmScore,
});

// Fresh copies each run: demoFill's story() changes the rows it is given in place.
const runs = [];
const phone = here;
for (const [set, ps, rs] of [["real", probes, rows], ["synthetic", synthProbes, synthRows]] as const) {
  for (const [demo, at] of [[false, phone], [true, phone], [true, null]] as const) {
    if (set === "real" && !demo && !at) continue;
    here = at;
    const base = farm(copy(ps), copy(rs), demo, [], {});
    runs.push(out(set, demo, [], {}, base));
    const keys = base.alerts.map((a) => a.key);
    if (!keys.length) continue;
    const handled = [keys[0]];
    runs.push(out(set, demo, handled, {}, farm(copy(ps), copy(rs), demo, handled, {})));
    const snoozed = Object.fromEntries(keys.map((k, i) => [k, i % 2 ? now - 1 : now + 60_000]));
    runs.push(out(set, demo, [], snoozed, farm(copy(ps), copy(rs), demo, [], snoozed)));
  }
}
write("farm.json", runs);
console.log(`${probes.length} probes, ${rows.length} readings, now ${new Date(now).toISOString()}, ` +
  runs.map((r) => `${r.set} here=${!!r.here} demo=${r.demo} handled=${r.handled.length} snoozed=${Object.keys(r.snoozed).length}: ${r.alerts.length} alerts`).join("; "));
}

// farm.json: FarmProvider's computation. From src/lib/farm.tsx, copied verbatim:
// lines 57-73 (WATCH, levelScore, soilScore, avg, weighted), 187-197 (readings), 199-235 (views),
// 237-276 (alerts), 278-284 (subScores, farmScore). useMemo here just calls its function.
type ProbeView = {
  probe: Probe; latest?: Reading; history: Reading[]; score: number; status: Status; online: boolean; hardware: boolean;
  interval: number; scores: { level: number; soil: number; quality: number }; emptyIn: number | null; visits: number[];
  geo: ReturnType<typeof geofence>; located: "gps" | "phone" | null;
};
type AlertKind = "quality" | "level" | "soil" | "moved" | "offline";
type Alert = { id: string; key: string; kind: AlertKind; probe: Probe; since: string; reading: Reading; title: string; detail: string[] };
const useMemo = <T>(f: () => T, _deps: unknown[]) => f();

// ---- farm.tsx lines 57-73
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
// ---- end

function farm(probes: Probe[], rows: Reading[], demo: boolean, handled: string[], snoozed: Record<string, number>) {
  // ---- farm.tsx lines 187-197
  const readings = useMemo(() => {
    const depth = Object.fromEntries(probes.map((p) => [p.id, p.depth_cm]));
    const src = demo
      ? probes.flatMap((p) => {
        const mine = rows.filter((r) => r.probe_id === p.id);
        return mine[0]?.raw ? demoFill(mine, p, now, here) : demoSeeded(mine.map((r) => ({ ...r })), p, now);
      })
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
      : rows;
    return src.map((r) => enrich(r, depth[r.probe_id]));
  }, [rows, probes, demo, now, here]);

  // ---- farm.tsx lines 199-235
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

  // ---- farm.tsx lines 237-276
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

  // ---- farm.tsx lines 278-284
  const subScores = {
    level: Math.round(avg(views.map((v) => v.scores.level)) || 0),
    soil: Math.round(avg(views.map((v) => v.scores.soil)) || 0),
    quality: Math.round(avg(views.map((v) => v.scores.quality))), // NaN when no probe measures quality
    devices: views.length ? Math.round((views.filter((v) => v.online).length / views.length) * 100) : 0,
  };
  const farmScore = weighted([[subScores.level, 0.35], [subScores.soil, 0.25], [subScores.quality, 0.2], [subScores.devices, 0.2]]);
  // ---- end

  return { readings, views, alerts, subScores, farmScore };
}

main();
