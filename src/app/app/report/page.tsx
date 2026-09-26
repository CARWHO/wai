"use client";

import { useFarm } from "@/lib/farm";
import { breaches, LIMITS, statusColor, type Reading } from "@/lib/supabase";
import { Header, Icon } from "@/components/ui";

const stats = (xs: number[]) =>
  xs.length ? { min: Math.min(...xs), max: Math.max(...xs), avg: xs.reduce((a, b) => a + b, 0) / xs.length } : null;
const fmt = (s: ReturnType<typeof stats>, d = 1) => (s ? `${s.min.toFixed(d)} – ${s.max.toFixed(d)} (avg ${s.avg.toFixed(d)})` : "–");

// Count breach events: a run of consecutive breaching readings is one event
function events(rs: Reading[]) {
  let n = 0, prev = false;
  for (const r of rs) {
    const b = breaches(r).length > 0;
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

  return (
    <div className="flex flex-col gap-4 print:text-black">
      <div className="print:hidden">
        <Header
          title="Report"
          back="/app/insights"
          right={
            <button onClick={() => window.print()} className="flex items-center gap-1.5 rounded-full bg-[#111] px-4 py-2 text-[14px] font-semibold text-white">
              <Icon name="download" className="h-4 w-4" /> Save PDF
            </button>
          }
        />
      </div>

      <div className="text-[14px] text-black">
        <div className="border-b border-black/10 pb-3">
          <div className="text-[24px] font-bold">Water quality record</div>
          <div className="text-black/60">Canterbury farm</div>
          <div className="text-black/60">{d(from)} to {d(to)}</div>
        </div>

        <div className="mt-3 text-black/70">
          Limits applied: turbidity ≤ {LIMITS.turbidity} NTU · pH {LIMITS.phMin}–{LIMITS.phMax} · TDS ≤ {LIMITS.tds} ppm.
          {" "}Readings are logged automatically by in-water probes.
        </div>

        {views.map((v) => {
          const rs = v.history;
          const ok = rs.filter((r) => !breaches(r).length).length;
          const pct = rs.length ? (ok / rs.length) * 100 : 0;
          const ev = events(rs);
          return (
            <div key={v.probe.id} className="mt-4 break-inside-avoid">
              <div className="flex items-center justify-between">
                <div className="text-[15px] font-semibold">{v.probe.name}</div>
                <div className="text-[13px] font-semibold" style={{ color: ev ? statusColor.bad : statusColor.good }}>
                  {ev ? `${ev} exceedance${ev > 1 ? "s" : ""}` : "Compliant"}
                </div>
              </div>
              <table className="mt-1 w-full">
                <tbody className="[&_td]:border-b [&_td]:border-black/5 [&_td]:py-1 [&_td:first-child]:text-black/60">
                  <tr><td>Readings</td><td className="text-right">{rs.length} · {pct.toFixed(1)}% within limits</td></tr>
                  <tr><td>Turbidity (NTU)</td><td className="text-right tabular-nums">{fmt(stats(rs.map((r) => r.turbidity)))}</td></tr>
                  <tr><td>pH</td><td className="text-right tabular-nums">{fmt(stats(rs.map((r) => r.ph)), 2)}</td></tr>
                  <tr><td>TDS (ppm)</td><td className="text-right tabular-nums">{fmt(stats(rs.map((r) => r.tds)), 0)}</td></tr>
                  <tr><td>Level (cm)</td><td className="text-right tabular-nums">{fmt(stats(rs.map((r) => r.level_cm).filter((x): x is number => x != null)), 0)}</td></tr>
                  <tr><td>Temp (°C)</td><td className="text-right tabular-nums">{fmt(stats(rs.map((r) => r.temp_c)))}</td></tr>
                </tbody>
              </table>
            </div>
          );
        })}

        <div className="mt-5 border-t border-black/10 pt-3 text-[11px] text-black/50">
          Generated {d(new Date().toISOString())} by Wai. Source data is stored and available on request.
        </div>
      </div>
    </div>
  );
}
