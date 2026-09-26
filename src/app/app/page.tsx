"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useFarm, type ProbeView } from "@/lib/farm";
import { useAI } from "@/lib/ai";
import { ago, status, statusColor, statusLabel } from "@/lib/supabase";
import { HOUR, issues, issueTitle, median, metric, withUnit } from "@/lib/metrics";
import { Card, Dot, Header, Icon, Ring, Section, Spark } from "@/components/ui";
import { Legend, TrendChart } from "@/components/TrendChart";

const word = (v: number) => (v >= 80 ? "Good" : v >= 50 ? "Fair" : "Poor");
const LEVEL = metric("level_cm");
const TURBIDITY = metric("turbidity");

// Level now against the probe's usual level, and the change over the last 24 hours
function levelStats(v: ProbeView) {
  const now = v.latest?.level_cm;
  if (now == null) return null;
  const levels = v.history.map((r) => r.level_cm).filter((x): x is number => x != null);
  const t = new Date(v.latest!.created_at).getTime() - 24 * HOUR;
  const dayAgo = v.history.find((r) => new Date(r.created_at).getTime() >= t)?.level_cm ?? now;
  return { now, usual: Math.round((now / (median(levels) || now)) * 100), change: now - dayAgo };
}

export default function Home() {
  const { loading, views, farmScore, subScores, alerts } = useFarm();
  const [page, setPage] = useState(0);
  const focus = useRef<HTMLDivElement>(null);
  const s = status(farmScore);
  const online = views.filter((v) => v.online).length;
  const dash = (x: string | number) => (loading ? "–" : x);

  const tipKey = loading ? null : `${Math.round(farmScore / 10)}:${views.map((v) => v.status).join(",")}`;
  const tip = useAI<{ title: string; body: string }>(
    "tip",
    {
      farmScore,
      subScores,
      probes: views.map((v) => ({ name: v.probe.name, score: v.score, problems: v.breaches, level_cm: v.latest?.level_cm })),
    },
    tipKey,
  );

  // Garmin Training Readiness factor grid
  const factors: [string, string][] = [
    [word(subScores.level), "Water level"],
    [word(subScores.quality), "Water quality"],
    [`${online} of ${views.length}`, "Probes live"],
    [alerts.length ? `${alerts.length} open` : "None", "Alerts"],
  ];
  const last24 = (v: ProbeView) => {
    const t = v.latest ? new Date(v.latest.created_at).getTime() - 24 * HOUR : 0;
    return v.history.filter((r) => new Date(r.created_at).getTime() >= t);
  };

  return (
    <div className="flex flex-col gap-7">
      <Header title="Home" right={<span className="text-[14px] text-[var(--wai-muted)]">Canterbury farm</span>} />

      {alerts.length > 0 && (
        <div className="-mt-3 flex flex-col gap-2">
          {alerts.map((a) => {
            const first = issues(a.reading)[0];
            return (
              <Card key={a.key} href={`/app/alerts/${a.probe.id}`} className="flex items-center gap-3">
                <Dot s="bad" />
                <div className="flex-1">
                  <div className="font-semibold">{first ? issueTitle(first) : "Out of limits"}</div>
                  <div className="text-[13px] text-[var(--wai-muted)]">{a.probe.name} · started {ago(a.since)}</div>
                </div>
                <Icon name="chevron" className="h-4 w-4 text-[#aeaeb2]" />
              </Card>
            );
          })}
        </div>
      )}

      <Section title="In Focus">
        <div
          ref={focus}
          className="flex snap-x snap-mandatory gap-4 overflow-x-auto [scrollbar-width:none]"
          // one card per screen width, no peeking edge; 16px is the gap
          onScroll={(e) => setPage(Math.round(e.currentTarget.scrollLeft / (e.currentTarget.clientWidth + 16)))}
        >
          <Card className="w-full shrink-0 snap-start">
            <div className="text-[15px] font-medium">Farm health</div>
            <div className="mt-3 flex items-center gap-4">
              <Ring value={loading ? 0 : farmScore} size={88} stroke={8} color={statusColor[s]}>
                <div className="text-[28px] font-bold tabular-nums">{dash(farmScore)}</div>
              </Ring>
              <div className="min-w-0">
                <div className="text-[24px] font-bold leading-tight">{dash(statusLabel[s])}</div>
                <div className="text-[14px] leading-snug text-[var(--wai-muted)]">{loading ? "" : tip?.body ?? ""}</div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
              {factors.map(([v, k]) => (
                <div key={k}>
                  <div className="text-[18px] font-medium">{dash(v)}</div>
                  <div className="text-[13px] text-[var(--wai-muted)]">{k}</div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="w-full shrink-0 snap-start">
            <div className="text-[15px] font-medium">Water level</div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-[34px] font-bold leading-none tabular-nums">{dash(subScores.level)}</span>
              <span className="text-[17px] font-semibold" style={{ color: statusColor[status(subScores.level)] }}>{dash(word(subScores.level))}</span>
            </div>
            <table className="mt-3 w-full text-[14px]">
              <thead>
                <tr className="text-left text-[12px] text-[var(--wai-muted)]">
                  <th className="pb-1 font-normal">Probe</th>
                  <th className="pb-1 text-right font-normal">Now</th>
                  <th className="pb-1 text-right font-normal">Of usual</th>
                  <th className="pb-1 text-right font-normal">24 h</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {views.map((v) => {
                  const l = levelStats(v);
                  return (
                    <tr key={v.probe.id} className="border-t border-[var(--wai-line)]">
                      <td className="py-2">{v.probe.name}</td>
                      <td className="py-2 text-right font-semibold">{l ? withUnit(LEVEL, l.now) : "–"}</td>
                      <td className="py-2 text-right" style={{ color: l && l.usual < 80 ? statusColor.bad : undefined }}>{l ? `${l.usual}%` : "–"}</td>
                      <td className="py-2 text-right">{l ? `${Math.round(l.change) > 0 ? "+" : ""}${Math.round(l.change)}` : "–"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          <Card className="w-full shrink-0 snap-start">
            <div className="text-[15px] font-medium">Water quality</div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-[34px] font-bold leading-none tabular-nums">{dash(subScores.quality)}</span>
              <span className="text-[17px] font-semibold" style={{ color: statusColor[status(subScores.quality)] }}>{dash(word(subScores.quality))}</span>
            </div>
            <div className="mb-1 mt-3 text-[13px] text-[var(--wai-muted)]">Turbidity, last 24 h ({TURBIDITY.unit})</div>
            <TrendChart m={TURBIDITY} hours={24} height={120} series={views.map((v) => ({ name: v.probe.name, readings: last24(v) }))} />
            <div className="mt-2"><Legend names={views.map((v) => v.probe.name)} limit /></div>
          </Card>
        </div>
        <div className="-mt-1 flex justify-center">
          {["Farm health", "Water level", "Water quality"].map((name, i) => (
            <button
              key={name} aria-label={name} className="grid h-6 w-4 place-items-center"
              onClick={() => focus.current?.scrollTo({ left: i * (focus.current.clientWidth + 16) })}
            >
              <span className={`h-2 w-2 rounded-full ${i === page ? "bg-black" : "bg-[#c7c7cc]"}`} />
            </button>
          ))}
        </div>
      </Section>

      <Section title="At a Glance" action={<Link href="/app/insights" className="text-[16px] text-[#0a66d0]">See All</Link>}>
        <div className="grid grid-cols-2 gap-3">
          {views.map((v) => {
            const bad = issues(v.latest)[0];
            return (
              <Card key={v.probe.id} href={`/app/probe/${v.probe.id}`} className="flex flex-col">
                <div className="flex items-center gap-2 text-[15px] font-medium">
                  <Dot s={v.status} /> {v.probe.name}
                </div>
                <div className="mt-3 text-[26px] font-bold leading-none tabular-nums">
                  {v.latest?.level_cm?.toFixed(0) ?? "–"}<span className="ml-1 text-[15px] font-medium">cm</span>
                </div>
                <div className="mt-2"><Spark data={last24(v)} k="level_cm" height={40} /></div>
                <div className="mt-2 text-[15px] font-medium" style={{ color: bad ? statusColor.bad : undefined }}>
                  {bad ? issueTitle(bad) : withUnit(TURBIDITY, Number(v.latest?.turbidity ?? NaN))}
                </div>
                <div className="text-[13px] text-[var(--wai-muted)]">{bad ? "Out of limits" : "Turbidity"} · {v.online ? "live" : ago(v.latest?.created_at)}</div>
              </Card>
            );
          })}
        </div>
      </Section>
    </div>
  );
}
