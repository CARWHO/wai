import { LIMITS, type Reading } from "./supabase";

export type MetricKey = "level_cm" | "pct_full" | "soil_pct" | "turbidity" | "ph" | "tds" | "temp_c";
export type Metric = {
  key: MetricKey; name: string; unit: string; digits: number; min?: number; max?: number;
  low?: string; high?: string; // alert titles, e.g. "Soil dry"
  wq?: true; // water quality sensor: only shown for probes that have one
};

// One definition per measurement, shared by every screen
export const METRICS: Metric[] = [
  { key: "level_cm", name: "Level", unit: "cm", digits: 0 },
  { key: "pct_full", name: "% full", unit: "%", digits: 0, min: LIMITS.levelPct, low: "Low level" },
  { key: "soil_pct", name: "Soil moisture", unit: "%", digits: 0, min: LIMITS.soilDry, max: LIMITS.soilWet, low: "Soil dry", high: "Soil saturated" },
  { key: "turbidity", name: "Turbidity", unit: "NTU", digits: 1, max: LIMITS.turbidity, wq: true },
  { key: "ph", name: "pH", unit: "", digits: 1, min: LIMITS.phMin, max: LIMITS.phMax, wq: true },
  { key: "tds", name: "TDS", unit: "ppm", digits: 0, max: LIMITS.tds, wq: true },
  { key: "temp_c", name: "Temp", unit: "°C", digits: 1, wq: true },
];
export const metric = (k: MetricKey) => METRICS.find((m) => m.key === k)!;
export const PRIMARY = METRICS.filter((m) => !m.wq);

export const value = (r: Reading | undefined, m: Metric) => (r?.[m.key] == null ? NaN : Number(r[m.key]));
export const fmt = (m: Metric, x: number) => (isNaN(x) ? "–" : x.toFixed(m.digits));
export const withUnit = (m: Metric, x: number) =>
  isNaN(x) ? "–" : m.unit === "%" ? `${fmt(m, x)}%` : m.unit ? `${fmt(m, x)} ${m.unit}` : fmt(m, x);
// Metrics with at least one value in these readings, so absent sensors don't show "–" everywhere
export const present = (rs: Reading[], ms = METRICS) => ms.filter((m) => rs.some((r) => r[m.key] != null));
export const metricName = (m: Metric) => (m.key === "ph" || m.key === "pct_full" ? m.name : m.name.toLowerCase());

export type State = "High" | "Low" | "Normal";
export const state = (m: Metric, x: number): State =>
  m.max != null && x > m.max ? "High" : m.min != null && x < m.min ? "Low" : "Normal";
export const hasLimit = (m: Metric) => m.min != null || m.max != null;
export const limitText = (m: Metric) => {
  const u = m.unit === "%" ? "%" : m.unit ? ` ${m.unit}` : "";
  return m.min != null && m.max != null ? `${m.min}–${m.max}${u}` : m.max != null ? `≤ ${m.max}${u}` : m.min != null ? `≥ ${m.min}${u}` : "None";
};
// dashed lines on charts
export const limitLines = (m: Metric) => [m.min, m.max].filter((x): x is number => x != null);

// Out-of-limit measurements in a reading, e.g. { m: Turbidity, state: "High", x: 14 }
export function issues(r?: Reading, ms = METRICS) {
  if (!r) return [];
  return ms.filter(hasLimit)
    .map((m) => ({ m, x: value(r, m), state: state(m, value(r, m)) }))
    .filter((i) => !isNaN(i.x) && i.state !== "Normal");
}
export const issueTitle = (i: { m: Metric; state: State }) =>
  (i.state === "Low" ? i.m.low : i.m.high) ?? `${i.m.name} ${i.state.toLowerCase()}`;

export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
export const median = (xs: number[]) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

export const HOUR = 3_600_000;
export const RANGES = [
  { k: "1d", name: "1d", hours: 24 },
  { k: "7d", name: "7d", hours: 168 },
  { k: "4w", name: "4w", hours: 672 },
] as const;
export type Range = (typeof RANGES)[number]["k"];
export const rangeHours = (k: Range) => RANGES.find((r) => r.k === k)!.hours;

// "3 d 4 h", "5 h", "40 min"
export function duration(hours: number) {
  if (!isFinite(hours)) return "–";
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) return `${Math.round(hours)} h`;
  return `${Math.floor(hours / 24)} d ${Math.round(hours % 24)} h`;
}

// Probe line colours on multi-probe charts
export const SERIES = ["#141412", "#3a9d5d", "#d98b2b", "#6b6a64"];

// Report interval: "5 s", "30 min", "1.5 h"
export const every = (ms: number) =>
  !isFinite(ms) ? "–" : ms < 60_000 ? `${Math.round(ms / 1000)} s` : ms < 90 * 60_000 ? `${Math.round(ms / 60_000)} min` : `${(ms / 3_600_000).toFixed(1)} h`;
