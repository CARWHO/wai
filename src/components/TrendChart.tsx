"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Reading } from "@/lib/supabase";
import { SERIES, value, type Metric } from "@/lib/metrics";

export type Series = { name: string; readings: Reading[] };

// Time series for one metric, one line per probe, dashed limit lines
export function TrendChart({ m, series, hours, height = 200 }: { m: Metric; series: Series[]; hours: number; height?: number }) {
  // one row per timestamp so the tooltip lists every probe at that time
  const rows = new Map<number, Record<string, number>>();
  for (const s of series)
    for (const r of s.readings) {
      const t = new Date(r.created_at).getTime();
      const y = value(r, m);
      if (isNaN(y)) continue;
      rows.set(t, { ...(rows.get(t) ?? { t }), [s.name]: y });
    }
  const data = [...rows.values()].sort((a, b) => a.t - b.t);
  const tick = (t: number) =>
    new Date(t).toLocaleString("en-NZ", hours <= 24 ? { hour: "numeric" } : { day: "numeric", month: "short" });
  const axis = { fontSize: 11, fill: "#6b6b70" };

  if (!data.length)
    return <div className="grid place-items-center text-[14px] text-[var(--wai-muted)]" style={{ height }}>No readings in this period</div>;

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="#e5e5ea" />
          <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={tick} tick={axis} tickLine={false} axisLine={{ stroke: "#e5e5ea" }} minTickGap={28} />
          <YAxis tick={axis} tickLine={false} axisLine={false} width={40} domain={["auto", "auto"]} />
          <Tooltip
            isAnimationActive={false}
            labelFormatter={(t) => new Date(Number(t)).toLocaleString("en-NZ", { weekday: "short", hour: "numeric", minute: "2-digit" })}
            formatter={(v) => `${Number(v).toFixed(m.digits)}${m.unit ? ` ${m.unit}` : ""}`}
            contentStyle={{ borderRadius: 8, border: "1px solid #e5e5ea", boxShadow: "none", fontSize: 12 }}
          />
          {[m.min, m.max].map((y) => y != null && (
            <ReferenceLine key={y} y={y} stroke="#8e8e93" strokeDasharray="4 4" ifOverflow="extendDomain" />
          ))}
          {series.map((s, i) => (
            <Line key={s.name} dataKey={s.name} dot={false} connectNulls stroke={SERIES[i % SERIES.length]} strokeWidth={2} isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Legend({ names, limit }: { names: string[]; limit?: boolean }) {
  if (names.length < 2 && !limit) return null;
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-[var(--wai-muted)]">
      {names.length > 1 && names.map((n, i) => (
        <span key={n} className="flex items-center gap-1.5">
          <span className="h-0.5 w-4" style={{ background: SERIES[i % SERIES.length] }} /> {n}
        </span>
      ))}
      {limit && (
        <span className="flex items-center gap-1.5">
          <span className="w-4 border-t border-dashed border-[#8e8e93]" /> Limit
        </span>
      )}
    </div>
  );
}
