import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
);

export type Probe = { id: string; name: string; lat: number; lng: number };
export type Reading = {
  id: number;
  probe_id: string;
  // null when the probe has no sensor for it (the ESP32 probe only sends level_cm)
  turbidity: number | null;
  ph: number | null;
  temp_c: number | null;
  tds: number | null;
  level_cm: number | null;
  // every unprocessed value the ESP32 probe read (see hardware/firmware/README.md)
  raw?: Record<string, unknown> | null;
  created_at: string;
};

export type Status = "good" | "watch" | "bad";

// Alert thresholds
export const LIMITS = { turbidity: 10, phMin: 6.5, phMax: 8.5, tds: 600 };

// 0-100: penalise turbidity above 5 NTU, pH away from 7.2, TDS above 400. Missing values count as fine.
export function score(r?: Reading) {
  if (!r) return 0;
  const s =
    100 -
    Math.max(0, (r.turbidity ?? 0) - 5) * 1.5 -
    (r.ph == null ? 0 : Math.abs(r.ph - 7.2) * 15) -
    Math.max(0, (r.tds ?? 0) - 400) * 0.05;
  return Math.round(Math.min(100, Math.max(0, s)));
}

export const status = (s: number): Status => (s >= 80 ? "good" : s >= 50 ? "watch" : "bad");
export const statusLabel: Record<Status, string> = { good: "Healthy", watch: "Watch", bad: "Action needed" };
export const statusColor: Record<Status, string> = { good: "#2e9d4f", watch: "#e08a1e", bad: "#d23c32" };

// Which limits a reading breaks, in plain words
export function breaches(r?: Reading) {
  if (!r) return [];
  const out: string[] = [];
  if (r.turbidity != null && r.turbidity > LIMITS.turbidity) out.push(`Turbidity ${r.turbidity.toFixed(0)} NTU (limit ${LIMITS.turbidity})`);
  if (r.ph != null && (r.ph < LIMITS.phMin || r.ph > LIMITS.phMax)) out.push(`pH ${r.ph.toFixed(1)} (safe ${LIMITS.phMin}–${LIMITS.phMax})`);
  if (r.tds != null && r.tds > LIMITS.tds) out.push(`TDS ${Math.round(r.tds)} ppm (limit ${LIMITS.tds})`);
  return out;
}

// Probe counts as online if it reported in the last 45 minutes (it reports every 30)
export const isOnline = (r?: Reading) => !!r && Date.now() - new Date(r.created_at).getTime() < 45 * 60_000;

export function ago(iso?: string) {
  if (!iso) return "never";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}
