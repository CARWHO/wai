"use client";

import { useFarm } from "@/lib/farm";
import { LIMITS, statusColor, type Reading } from "@/lib/supabase";
import { issues, METRICS, present } from "@/lib/metrics";
import { Header, Icon } from "@/components/ui";

const stats = (all: (number | null | undefined)[]) => {
  const xs = all.filter((x): x is number => x != null);
  return xs.length ? { min: Math.min(...xs), max: Math.max(...xs), avg: xs.reduce((a, b) => a + b, 0) / xs.length } : null;
};
const fmt = (s: ReturnType<typeof stats>, d = 1) => (s ? `${s.min.toFixed(d)} – ${s.max.toFixed(d)} (avg ${s.avg.toFixed(d)})` : "–");
const ROWS: Record<string, [string, number]> = {
  level_cm: ["Level (cm)", 0], pct_full: ["% full", 0], soil_pct: ["Soil moisture (%)", 0],
  turbidity: ["Turbidity (NTU)", 1], ph: ["pH", 2], tds: ["TDS (ppm)", 0], temp_c: ["Temp (°C)", 1],
};

// Count exceedance events: a run of consecutive out-of-limit readings is one event
function events(rs: Reading[]) {
  let n = 0, prev = false;
  for (const r of rs) {
    const b = issues(r).length > 0;
    if (b && !prev) n++;
    prev = b;
  }
  return n;
}

export default function ReportPage() {
  const { views, readings } = useFarm();
  const from = readings.at(-1)?.created_at;
  const to = readings[0]?.created_at;
  const d = (iso?: string) => (iso ? new Date(iso).toLocaleString("en-NZ", { dateStyle: "medium", timeStyle: "short" }) : "–");
  const wq = present(readings, METRICS.filter((m) => m.wq && m.key !== "temp_c")).length > 0;

  return (
    <div className="flex flex-col gap-4 print:text-ink">
      <div className="print:hidden">
        <Header
          title="Report"
          back="/app/insights"
          right={
            <button onClick={() => window.print()} className="flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-[14px] font-medium text-paper">
              <Icon name="download" className="h-4 w-4" /> Save PDF
            </button>
          }
        />
      </div>

      <div className="text-[14px] text-ink">
        <div className="border-b border-line pb-3">
          <div className="text-[24px] font-medium tracking-tight">Farm water &amp; soil record</div>
          <div className="text-muted">UC farm</div>
          <div className="text-muted">{d(from)} to {d(to)}</div>
        </div>

        <div className="mt-3 text-muted">
          Limits applied: level ≥ {LIMITS.levelPct}% full · soil moisture {LIMITS.soilDry}–{LIMITS.soilWet}%
          {wq && <> · turbidity ≤ {LIMITS.turbidity} NTU · pH {LIMITS.phMin}–{LIMITS.phMax} · TDS ≤ {LIMITS.tds} ppm</>}.
          {" "}Readings are logged automatically by the probes.
        </div>

        {views.map((v) => {
          const rs = v.history;
          const ok = rs.filter((r) => !issues(r).length).length;
          const pct = rs.length ? (ok / rs.length) * 100 : 0;
          const ev = events(rs);
          return (
            <div key={v.probe.id} className="mt-4 break-inside-avoid">
              <div className="flex items-center justify-between">
                <div className="text-[15px] font-medium">{v.probe.name}</div>
                <div className="text-[13px] font-medium" style={{ color: ev ? statusColor.bad : statusColor.good }}>
                  {ev ? `${ev} exceedance${ev > 1 ? "s" : ""}` : "Within limits"}
                </div>
              </div>
              <table className="mt-1 w-full">
                <tbody className="[&_td]:border-b [&_td]:border-line [&_td]:py-1 [&_td:first-child]:text-muted">
                  <tr><td>Readings</td><td className="text-right">{rs.length} · {pct.toFixed(1)}% within limits</td></tr>
                  {present(rs).map((m) => (
                    <tr key={m.key}><td>{ROWS[m.key][0]}</td><td className="text-right font-mono">{fmt(stats(rs.map((r) => r[m.key])), ROWS[m.key][1])}</td></tr>
                  ))}
                  {v.hardware && v.visits.length > 0 && <tr><td>Trough visits</td><td className="text-right font-mono">{v.visits.length}</td></tr>}
                </tbody>
              </table>
            </div>
          );
        })}

        <div className="mt-5 border-t border-line pt-3 text-[11px] text-muted">
          Generated {d(new Date().toISOString())} by Wai. Source data is stored and available on request.
        </div>
      </div>
    </div>
  );
}
