import { createClient } from "@supabase/supabase-js";

// Fallbacks so builds work without env vars (e.g. Vercel). Both values are public by design:
// the publishable key ships to every browser and access is limited by RLS.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://anrgrgtgxfmzfbbfjodf.supabase.co",
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_SHQJ47S7FUEQSTO0HgUynw_SJxAjKZM",
);

export type Probe = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  depth_cm: number | null; // sensor to floor, for % full
  home_lat: number | null; // geofence centre; null = no "moved" alert
  home_lng: number | null;
  geofence_m: number;
};
export type Reading = {
  id: number;
  probe_id: string;
  // null when the probe has no sensor for it (the ESP32 probe only sends level_cm)
  turbidity: number | null;
  ph: number | null;
  temp_c: number | null;
  tds: number | null;
  level_cm: number | null;
  soil_pct: number | null; // filled from raw.soil_pct by a trigger for hardware probes
  pct_full?: number | null; // derived in the app: level_cm / probe depth_cm
  // every unprocessed value the ESP32 probe read (see hardware/firmware/README.md)
  raw?: Record<string, unknown> | null;
  created_at: string;
};

// Remote command for a LoRa probe: the app inserts it, hardware/bridge sends it and records the ack
export type Command = {
  id: number;
  probe_id: string;
  cmd: "ping" | "read" | "interval";
  arg: number | null;
  status: "pending" | "sent" | "done" | "failed";
  created_at: string;
  sent_at: string | null;
  acked_at: string | null;
};

export type Status = "good" | "watch" | "bad";

// Alert thresholds, all in one place
export const LIMITS = {
  turbidity: 10, phMin: 6.5, phMax: 8.5, tds: 600,
  levelPct: 25, // % full below this is low
  soilDry: 20, soilWet: 90, // soil moisture %
  hdopMax: 5, // GPS fixes worse than this are ignored (jitter)
  offlineMinMs: 2 * 60_000, // hardware probe offline after max(this, 3 × its interval)
};

// 0-100 water quality: penalise turbidity above 5 NTU, pH away from 7.2, TDS above 400.
// NaN when the reading has no water quality sensor, so absent data doesn't count as good.
export function score(r?: Reading) {
  if (!r || (r.turbidity == null && r.ph == null && r.tds == null)) return NaN;
  const s =
    100 -
    Math.max(0, (r.turbidity ?? 0) - 5) * 1.5 -
    (r.ph == null ? 0 : Math.abs(r.ph - 7.2) * 15) -
    Math.max(0, (r.tds ?? 0) - 400) * 0.05;
  return Math.round(Math.min(100, Math.max(0, s)));
}

export const status = (s: number): Status => (s >= 80 ? "good" : s >= 50 ? "watch" : "bad");
export const statusLabel: Record<Status, string> = { good: "Healthy", watch: "Watch", bad: "Action needed" };
export const statusColor: Record<Status, string> = { good: "#3a9d5d", watch: "#d98b2b", bad: "#d9482b" };

// Which limits a reading breaks, in plain words
export function breaches(r?: Reading) {
  if (!r) return [];
  const out: string[] = [];
  if (r.turbidity != null && r.turbidity > LIMITS.turbidity) out.push(`Turbidity ${r.turbidity.toFixed(0)} NTU (limit ${LIMITS.turbidity})`);
  if (r.ph != null && (r.ph < LIMITS.phMin || r.ph > LIMITS.phMax)) out.push(`pH ${r.ph.toFixed(1)} (safe ${LIMITS.phMin}–${LIMITS.phMax})`);
  if (r.tds != null && r.tds > LIMITS.tds) out.push(`TDS ${Math.round(r.tds)} ppm (limit ${LIMITS.tds})`);
  return out;
}

// Seeded probes report every 30 min, so count them online for 45. Hardware probes: see farm.tsx.
export const isOnline = (r?: Reading) => !!r && Date.now() - new Date(r.created_at).getTime() < 45 * 60_000;

export function ago(iso?: string) {
  if (!iso) return "never";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}
