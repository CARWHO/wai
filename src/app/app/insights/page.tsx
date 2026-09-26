"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useFarm } from "@/lib/farm";
import { useAI } from "@/lib/ai";
import { visitsByDay } from "@/lib/derive";
import { statusColor, type Status } from "@/lib/supabase";
import {
  fmt, hasLimit, HOUR, issues, limitText, mean, metric, present, RANGES, rangeHours, state, value,
  type MetricKey, type Range,
} from "@/lib/metrics";
import { Bars, Card, Chips, Dot, Header, Icon, Ring, Row, Segmented } from "@/components/ui";
import { Legend, TrendChart } from "@/components/TrendChart";

const DAY = 24 * HOUR;
type Fertiliser = { verdict: string; reason: string; rain_48h_mm: number | null; soil_pct: number | null; source?: string };
const VERDICT_COLOR: Record<string, string> = { "Apply now": statusColor.good, "Wait for rain": statusColor.watch };

function Insights() {
  const router = useRouter();
  const params = useSearchParams();
  const { views, readings, loading } = useFarm();
  const [mk, setMk] = useState<MetricKey>("pct_full");
  const [range, setRange] = useState<Range>("1d");
  // only measurements some probe actually sends
  const shown = present(readings).filter((x) => x.key !== "temp_c");
  const m = shown.find((x) => x.key === mk) ?? metric("pct_full");
  // periods are measured back from the newest reading
  const now = readings[0] ? new Date(readings[0].created_at).getTime() : 0;
  const age = (iso: string) => now - new Date(iso).getTime();

  const period = (days: number) => {
    const rs = readings.filter((r) => age(r.created_at) < days * DAY);
    const bad = rs.filter((r) => issues(r).length).length;
    return { n: rs.length, bad, pct: rs.length ? Math.round(((rs.length - bad) / rs.length) * 100) : 0 };
  };
  const cards = [
    { name: "Today", ...period(1) },
    { name: "Last 7 days", ...period(7) },
  ];

  // mean of each probe's mean, so a probe reporting every 5 s doesn't outweigh one reporting every 30 min
  const avg = (from: number, to: number) =>
    mean(views.map((v) => mean(v.history.filter((r) => age(r.created_at) >= from * DAY && age(r.created_at) < to * DAY)
      .map((r) => value(r, m)).filter((n) => !isNaN(n)))).filter((n) => !isNaN(n)));
  const today = avg(0, 1);
  const week = avg(0, 7);
  const since = now - rangeHours(range) * HOUR;
  const unit = m.unit || "pH";

  // trough visits, only for probes with an ultrasonic sensor
  const troughs = views.filter((v) => v.hardware && v.history.some((r) => r.raw?.distance_cm != null));

  // fertiliser timing: average soil now, forecast at the farm
  const soils = views.map((v) => v.latest?.soil_pct).filter((x): x is number => x != null);
  const soil = mean(soils);
  const at = views.find((v) => v.located) ?? views[0];
  const fertKey = loading || !at || isNaN(soil) ? null : `${Math.floor(now / HOUR)}:${Math.round(soil / 5)}:${at.probe.lat.toFixed(2)},${at.probe.lng.toFixed(2)}`;
  const fert = useAI<Fertiliser>(
    "fertiliser",
    at && {
      soil_pct: Math.round(soil),
      lat: at.probe.lat,
      lng: at.probe.lng,
      paddocks: views.filter((v) => v.latest?.soil_pct != null).map((v) => ({ name: v.probe.name, soil_pct: Math.round(v.latest!.soil_pct!) })),
      month: new Date(now).toLocaleString("en-NZ", { month: "long" }),
    },
    fertKey,
  );

  const pct = cards[0].pct;
  const live = views.filter((v) => v.online).length;
  const visitsToday = troughs.reduce((a, v) => a + visitsByDay(v.visits, now, 1)[0].n, 0);
  const worst = views.filter((v) => v.status !== "good");

  // Settings-style drill-down (HireOS mobile): one list of sections, each row says what's
  // going on in a line; tap to open the detail. `?section=` so Back closes it.
  const SECTIONS: { id: string; name: string; sub: string; s: Status; body: React.ReactNode }[] = [
    {
      id: "probes", name: "Probes", s: worst.some((v) => v.status === "bad") ? "bad" : worst.length || live < views.length ? "watch" : "good",
      sub: `${live} of ${views.length} live${worst.length ? ` · ${worst.map((v) => v.probe.name).join(", ")} need a look` : ""}`,
      body: (
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="text-left font-mono text-[11px] uppercase tracking-wider text-muted">
                <th className="pb-1.5 font-normal">Probe</th>
                {shown.map((x) => (
                  <th key={x.key} className="pb-1.5 pl-2 text-right font-normal">{x.key === "soil_pct" ? "Soil" : x.name}{x.unit && x.unit !== "%" && <div>{x.unit}</div>}</th>
                ))}
              </tr>
            </thead>
            <tbody className="font-mono text-[13px]">
              {views.map((v) => (
                <tr key={v.probe.id} onClick={() => router.push(`/app/probe/${v.probe.id}`)} className="cursor-pointer border-t border-line">
                  <td className="py-3 pr-2">
                    <span className="flex items-center gap-2 whitespace-nowrap font-sans text-[14px] font-medium"><Dot s={v.status} /> {v.probe.name}</span>
                  </td>
                  {shown.map((x) => {
                    const n = value(v.latest, x);
                    const out = !isNaN(n) && state(x, n) !== "Normal";
                    return (
                      <td key={x.key} className={`py-3 pl-2 text-right ${out ? "font-medium" : ""} ${isNaN(n) ? "text-muted" : ""}`} style={{ color: out ? statusColor.bad : undefined }}>
                        {isNaN(n) ? "·" : fmt(x, n)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ),
    },
    {
      id: "limits", name: "Time within limits", s: pct >= 95 ? "good" : pct >= 80 ? "watch" : "bad",
      sub: `${pct}% today · ${cards[0].bad} of ${cards[0].n} readings outside`,
      body: <>
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
      </>,
    },
    ...(!isNaN(soil) ? [{
      id: "fertiliser", name: "Fertiliser timing", s: (!fert ? "watch" : fert.verdict === "Apply now" ? "good" : fert.verdict === "Wait for rain" ? "watch" : "bad") as Status,
      sub: fert ? `${fert.verdict} · soil ${Math.round(soil)}%` : "Checking the forecast…",
      body: (
        <Card className="flex flex-col gap-2">
          <div className="text-[24px] font-medium leading-tight tracking-tight" style={{ color: fert ? VERDICT_COLOR[fert.verdict] ?? statusColor.bad : undefined }}>
            {fert?.verdict ?? "Checking the forecast…"}
          </div>
          {fert && <div className="text-[15px] leading-relaxed">{fert.reason}</div>}
          <div className="mt-1 flex justify-between border-t border-line pt-2 font-mono text-xs text-muted">
            <span>Soil {Math.round(soil)}% avg</span>
            <span>{fert?.rain_48h_mm != null ? `${fert.rain_48h_mm} mm rain next 48 h` : fert ? "Forecast unavailable" : ""}</span>
          </div>
        </Card>
      ),
    }] : []),
    ...(troughs.length ? [{
      id: "visits", name: "Trough visits", s: "good" as Status,
      sub: `${visitsToday} today`,
      body: <>
        {troughs.map((v) => {
          const days = visitsByDay(v.visits, now, 7);
          return (
            <Card key={v.probe.id} href={`/app/probe/${v.probe.id}`} className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between">
                <div className="font-medium">{v.probe.name}</div>
                <div className="font-mono text-xs text-muted">last 7 days</div>
              </div>
              <div>
                <span className="text-[30px] font-medium leading-none tracking-tight tabular-nums">{days.at(-1)!.n}</span>
                <span className="ml-1.5 font-mono text-xs text-muted">visits today</span>
              </div>
              <Bars data={days.map((d) => ({ k: d.k, n: d.n, label: d.day.toLocaleDateString("en-NZ", { weekday: "narrow" }) }))} height={48} />
              <div className="font-mono text-xs text-muted">Counted from the level sensor: an animal at the trough reads closer than the water.</div>
            </Card>
          );
        })}
      </>,
    }] : []),
    {
      id: "trends", name: "Trends", s: "good",
      sub: "Averages and charts over time",
      body: <>
        <Chips options={shown.map((x) => ({ k: x.key, name: x.name }))} value={m.key} onChange={setMk} />
        <div className="grid grid-cols-3 divide-x divide-line">
          <div className="pr-3">
            <div className="font-mono text-xs uppercase tracking-wider text-muted">Today</div>
            <div className="text-[30px] font-medium leading-tight tracking-tight tabular-nums">{fmt(m, today)}</div>
            <div className="font-mono text-xs text-muted">{unit}</div>
          </div>
          <div className="px-3">
            <div className="font-mono text-xs uppercase tracking-wider text-muted">Last 7d</div>
            <div className="text-[18px] font-medium leading-tight tracking-tight tabular-nums">{fmt(m, week)}</div>
            <div className="font-mono text-xs text-muted">{unit}</div>
          </div>
          <div className="pl-3">
            <div className="font-mono text-xs uppercase tracking-wider text-muted">Limit</div>
            <div className="text-[18px] font-medium leading-tight tracking-tight tabular-nums">{hasLimit(m) ? limitText(m).replace(` ${m.unit}`, "").replace("%", "") : "None"}</div>
            <div className="font-mono text-xs text-muted">{hasLimit(m) ? unit : "varies by probe"}</div>
          </div>
        </div>
        <Segmented options={RANGES} value={range} onChange={setRange} />
        <TrendChart
          m={m} hours={rangeHours(range)} height={220}
          series={views.map((v) => ({ name: v.probe.name, readings: v.history.filter((r) => new Date(r.created_at).getTime() >= since) }))}
        />
        <Legend names={views.map((v) => v.probe.name)} limit={hasLimit(m)} />
      </>,
    },
  ];
  const open = SECTIONS.find((x) => x.id === params.get("section"));

  if (open)
    return (
      <div className="flex flex-col gap-6">
        <Header title={open.name} back="/app/insights" />
        {open.body}
      </div>
    );

  return (
    <div className="flex flex-col gap-6">
      <Header title="Insights" />
      <div className="-mt-4 border-t border-line">
        {SECTIONS.map((x) => (
          <Row key={x.id} k={<span className="flex items-center gap-2"><Dot s={x.s} /> {x.name}</span>} sub={x.sub} href={`/app/insights?section=${x.id}`} />
        ))}
        <Row k="Farm report" sub="Printable farm water & soil record" href="/app/report" />
      </div>
    </div>
  );
}

export default function InsightsPage() {
  return (
    <Suspense>
      <Insights />
    </Suspense>
  );
}
