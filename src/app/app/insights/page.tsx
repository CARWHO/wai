"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useFarm } from "@/lib/farm";
import { breaches, statusColor } from "@/lib/supabase";
import {
  fmt, hasLimit, HOUR, limitText, mean, metric, METRICS, RANGES, rangeHours, state, value,
  type MetricKey, type Range,
} from "@/lib/metrics";
import { Card, Chips, Dot, Header, Icon, Ring, Section, Segmented } from "@/components/ui";
import { Legend, TrendChart } from "@/components/TrendChart";

const DAY = 24 * HOUR;
const CHIPS = METRICS.filter((m) => m.key !== "temp_c").map((m) => ({ k: m.key, name: m.name }));
const TABLE = METRICS.filter((m) => m.key !== "temp_c");

export default function InsightsPage() {
  const router = useRouter();
  const { views, readings } = useFarm();
  const [mk, setMk] = useState<MetricKey>("turbidity");
  const [range, setRange] = useState<Range>("1d");
  const m = metric(mk);
  // periods are measured back from the newest reading
  const now = readings[0] ? new Date(readings[0].created_at).getTime() : 0;
  const age = (iso: string) => now - new Date(iso).getTime();

  const period = (days: number) => {
    const rs = readings.filter((r) => age(r.created_at) < days * DAY);
    const bad = rs.filter((r) => breaches(r).length).length;
    return { n: rs.length, bad, pct: rs.length ? Math.round(((rs.length - bad) / rs.length) * 100) : 0 };
  };
  const cards = [
    { name: "Today", ...period(1) },
    { name: "Last 7 days", ...period(7) },
  ];

  const avg = (from: number, to: number) =>
    mean(readings.filter((r) => age(r.created_at) >= from * DAY && age(r.created_at) < to * DAY).map((r) => value(r, m)).filter((n) => !isNaN(n)));
  const today = avg(0, 1);
  const week = avg(0, 7);
  const since = now - rangeHours(range) * HOUR;

  return (
    <div className="flex flex-col gap-8">
      <Header title="Insights" />

      <Section title="Time within limits">
        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 [scrollbar-width:none]">
          {cards.map((c) => (
            <Card key={c.name} href="/app/report" className="w-[46%] min-w-[160px] shrink-0 border-line">
              <Ring value={c.pct} size={44} stroke={4} color={statusColor[c.pct >= 95 ? "good" : c.pct >= 80 ? "watch" : "bad"]}>
                <span className="font-mono text-[10px]">{c.pct}%</span>
              </Ring>
              <div className="mt-2 font-mono text-xs uppercase tracking-wider text-muted">{c.name}</div>
              <div className="text-[32px] font-medium leading-tight tracking-tight tabular-nums">{c.n}</div>
              <div className="font-mono text-xs text-muted">readings</div>
              <div className="mt-3 flex items-center justify-between whitespace-nowrap border-t border-line pt-2 font-mono text-xs">
                {c.bad} outside limits <Icon name="chevron" className="h-4 w-4" />
              </div>
            </Card>
          ))}
        </div>
      </Section>

      <Section title={`Average ${m.name === "pH" ? "pH" : m.name.toLowerCase()}`}>
        <Chips options={CHIPS} value={mk} onChange={setMk} />
        <div className="grid grid-cols-3 divide-x divide-line">
          <div className="pr-3">
            <div className="font-mono text-xs uppercase tracking-wider text-muted">Today</div>
            <div className="text-[30px] font-medium leading-tight tracking-tight tabular-nums">{fmt(m, today)}</div>
            <div className="font-mono text-xs text-muted">{m.unit || "pH"}</div>
          </div>
          <div className="px-3">
            <div className="font-mono text-xs uppercase tracking-wider text-muted">Last 7d</div>
            <div className="text-[18px] font-medium leading-tight tracking-tight tabular-nums">{fmt(m, week)}</div>
            <div className="font-mono text-xs text-muted">{m.unit || "pH"}</div>
          </div>
          <div className="pl-3">
            <div className="font-mono text-xs uppercase tracking-wider text-muted">Limit</div>
            <div className="text-[18px] font-medium leading-tight tracking-tight tabular-nums">{hasLimit(m) ? limitText(m).replace(` ${m.unit}`, "") : "None"}</div>
            <div className="font-mono text-xs text-muted">{hasLimit(m) ? m.unit || "pH" : "varies by probe"}</div>
          </div>
        </div>
        <Segmented options={RANGES} value={range} onChange={setRange} />
        <TrendChart
          m={m} hours={rangeHours(range)} height={220}
          series={views.map((v) => ({ name: v.probe.name, readings: v.history.filter((r) => new Date(r.created_at).getTime() >= since) }))}
        />
        <Legend names={views.map((v) => v.probe.name)} limit={hasLimit(m)} />
      </Section>

      <Section title="Probes now">
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="text-left font-mono text-[11px] uppercase tracking-wider text-muted">
                <th className="pb-1.5 font-normal">Probe</th>
                {TABLE.map((x) => (
                  <th key={x.key} className="pb-1.5 text-right font-normal">{x.name}{x.unit && <div>{x.unit}</div>}</th>
                ))}
              </tr>
            </thead>
            <tbody className="font-mono text-[13px]">
              {views.map((v) => (
                <tr key={v.probe.id} onClick={() => router.push(`/app/probe/${v.probe.id}`)} className="cursor-pointer border-t border-line">
                  <td className="py-3 pr-2">
                    <span className="flex items-center gap-2 font-sans text-[14px] font-medium"><Dot s={v.status} /> {v.probe.name}</span>
                  </td>
                  {TABLE.map((x) => {
                    const n = value(v.latest, x);
                    const out = !isNaN(n) && state(x, n) !== "Normal";
                    return (
                      <td key={x.key} className={`py-3 pl-2 text-right ${out ? "font-medium" : ""}`} style={{ color: out ? statusColor.bad : undefined }}>
                        {fmt(x, n)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Card href="/app/report" className="flex items-center gap-3">
        <Icon name="doc" />
        <div className="flex-1">
          <div className="font-medium">Compliance report</div>
          <div className="font-mono text-xs text-muted">Printable water quality record</div>
        </div>
        <Icon name="chevron" className="h-4 w-4 text-muted" />
      </Card>
    </div>
  );
}
