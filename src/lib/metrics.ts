import { LIMITS, type Reading } from "./supabase";

export type MetricKey = "level_cm" | "turbidity" | "ph" | "tds" | "temp_c";
export type Metric = { key: MetricKey; name: string; unit: string; digits: number; min?: number; max?: number };

// One definition per measurement, shared by every screen
export const METRICS: Metric[] = [
  { key: "level_cm", name: "Level", unit: "cm", digits: 0 },
  { key: "turbidity", name: "Turbidity", unit: "NTU", digits: 1, max: LIMITS.turbidity },
  { key: "ph", name: "pH", unit: "", digits: 1, min: LIMITS.phMin, max: LIMITS.phMax },
  { key: "tds", name: "TDS", unit: "ppm", digits: 0, max: LIMITS.tds },
  { key: "temp_c", name: "Temp", unit: "°C", digits: 1 },
];
export const metric = (k: MetricKey) => METRICS.find((m) => m.key === k)!;

export const value = (r: Reading | undefined, m: Metric) => (r?.[m.key] == null ? NaN : Number(r[m.key]));
export const fmt = (m: Metric, x: number) => (isNaN(x) ? "–" : x.toFixed(m.digits));
export const withUnit = (m: Metric, x: number) => (isNaN(x) ? "–" : m.unit ? `${fmt(m, x)} ${m.unit}` : fmt(m, x));

export type State = "High" | "Low" | "Normal";
export const state = (m: Metric, x: number): State =>
  m.max != null && x > m.max ? "High" : m.min != null && x < m.min ? "Low" : "Normal";
export const hasLimit = (m: Metric) => m.min != null || m.max != null;
export const limitText = (m: Metric) =>
  m.min != null ? `${m.min}–${m.max}` : m.max != null ? `≤ ${m.max}${m.unit ? ` ${m.unit}` : ""}` : "None";
// dashed lines on charts
export const limitLines = (m: Metric) => [m.min, m.max].filter((x): x is number => x != null);

// Out-of-limit measurements in a reading, e.g. { m: Turbidity, state: "High", x: 14 }
export function issues(r?: Reading) {
  if (!r) return [];
  return METRICS.filter(hasLimit)
    .map((m) => ({ m, x: value(r, m), state: state(m, value(r, m)) }))
    .filter((i) => i.state !== "Normal");
}
export const issueTitle = (i: { m: Metric; state: State }) => `${i.m.name} ${i.state.toLowerCase()}`;

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

// Probe line colours on multi-probe charts
export const SERIES = ["#141412", "#3a9d5d", "#d98b2b", "#6b6a64"];
