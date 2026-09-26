"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useFarm, type ProbeView } from "@/lib/farm";
import { useFarmTip } from "@/lib/tip";
import { ago, status, statusColor, statusLabel } from "@/lib/supabase";
import { duration, HOUR, issues, issueTitle, metric, withUnit } from "@/lib/metrics";
import { Badge, Card, Dot, Header, Icon, Label, Ring, RoundButton, Section, Spark } from "@/components/ui";
import { signOut } from "@/lib/auth";import { Legend, TrendChart } from "@/components/TrendChart";
import { Koru, Wordmark } from "@/components/Koru";

const word = (v: number) => (v >= 80 ? "Good" : v >= 50 ? "Fair" : "Poor");
const LEVEL = metric("level_cm");
const FULL = metric("pct_full");
const SOIL = metric("soil_pct");

// Level now, % full, the change over the last 24 hours and time until empty
function levelStats(v: ProbeView) {
  const now = v.latest?.level_cm;
  if (now == null) return null;
  const t = new Date(v.latest!.created_at).getTime() - 24 * HOUR;
  const dayAgo = v.history.find((r) => new Date(r.created_at).getTime() >= t)?.level_cm ?? now;
  return { now, full: v.latest?.pct_full ?? NaN, change: now - dayAgo, empty: v.emptyIn };
}

export default function Home() {
  const { loading, views, farmScore, subScores, alerts, demo } = useFarm();
  const [page, setPage] = useState(0);
  const focus = useRef<HTMLDivElement>(null);
  const s = status(farmScore);
  const online = views.filter((v) => v.online).length;
  const dash = (x: string | number) => (loading ? "–" : x);

  const tip = useFarmTip();

  // Garmin Training Readiness factor grid
  const factors: [string, string][] = [
    [word(subScores.level), "Water level"],
    [word(subScores.soil), "Soil moisture"],
    [`${online} of ${views.length}`, "Probes live"],
    [alerts.length ? `${alerts.length} open` : "None", "Alerts"],
  ];
  const soilViews = views.filter((v) => v.latest?.soil_pct != null);
  const last24 = (v: ProbeView) => {
    const t = v.latest ? new Date(v.latest.created_at).getTime() - 24 * HOUR : 0;
    return v.history.filter((r) => new Date(r.created_at).getTime() >= t);
  };

  return (
    <div className="flex flex-col gap-7">
      <Header
        // demo mode drops the word, leaving the koru: a tell only we know
        title={demo ? <span className="flex h-7 items-center"><Koru className="size-6" /></span> : <Wordmark />}
        right={
          <div className="flex items-center gap-3">
            <Label>UC farm</Label>
            <RoundButton icon="logout" label="Sign out" onClick={signOut} />
          </div>
        }
      />

      {alerts.length > 0 && (
        <div className="-mt-3 flex flex-col gap-2">
          {alerts.map((a) => (
            <Card key={a.key} href={`/app/alerts/${a.id}`} className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <Label className="flex justify-between">
                  <span className="text-alert">● Alert</span>
                  <span>{ago(a.since)}</span>
                </Label>
                <div className="mt-1 font-medium">{a.probe.name}</div>
                <div className="font-mono text-[13px] text-alert">{a.title} · {a.detail[0]}</div>
              </div>
              <Icon name="chevron" className="h-4 w-4 text-muted" />
            </Card>
          ))}
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
                <div className="text-[28px] font-medium tracking-tight tabular-nums">{dash(farmScore)}</div>
              </Ring>
              <div className="min-w-0">
                <div className="text-[24px] font-medium leading-tight tracking-tight">{dash(statusLabel[s])}</div>
                <div className="mt-0.5 text-[14px] leading-snug text-muted">{loading ? "" : tip?.body ?? ""}</div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
              {factors.map(([v, k]) => (
                <div key={k}>
                  <div className="text-[18px] font-medium">{dash(v)}</div>
                  <Label>{k}</Label>
                </div>
              ))}
            </div>
          </Card>

          <Card className="w-full shrink-0 snap-start">
            <div className="text-[15px] font-medium">Water level</div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-[34px] font-medium leading-none tracking-tight tabular-nums">{dash(subScores.level)}</span>
              <span className="text-[17px] font-medium" style={{ color: statusColor[status(subScores.level)] }}>{dash(word(subScores.level))}</span>
            </div>
            <table className="mt-3 w-full text-[14px]">
              <thead>
                <tr className="text-left font-mono text-[11px] uppercase tracking-wider text-muted">
                  <th className="pb-1 font-normal">Probe</th>
                  <th className="pb-1 text-right font-normal">Now</th>
                  <th className="pb-1 text-right font-normal">Full</th>
                  <th className="pb-1 text-right font-normal">24 h</th>
                  <th className="pb-1 text-right font-normal">Empty in</th>
                </tr>
              </thead>
              <tbody className="font-mono text-[13px]">
                {views.map((v) => {
                  const l = levelStats(v);
                  if (!l) return null;
                  return (
                    <tr key={v.probe.id} className="border-t border-line">
                      <td className="py-2 font-sans text-[14px]">{v.probe.name}</td>
                      <td className="py-2 text-right">{withUnit(LEVEL, l.now)}</td>
                      <td className="py-2 text-right" style={{ color: l.full < FULL.min! ? statusColor.bad : undefined }}>{withUnit(FULL, l.full)}</td>
                      <td className="py-2 text-right">{`${Math.round(l.change) > 0 ? "+" : ""}${Math.round(l.change)}`}</td>
                      <td className="py-2 text-right" style={{ color: l.empty != null && l.empty < 24 ? statusColor.bad : undefined }}>
                        {l.now <= 0 ? "Empty" : l.empty != null ? duration(l.empty) : "Steady"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          <Card className="w-full shrink-0 snap-start">
            <div className="text-[15px] font-medium">Soil moisture</div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-[34px] font-medium leading-none tracking-tight tabular-nums">{dash(subScores.soil)}</span>
              <span className="text-[17px] font-medium" style={{ color: statusColor[status(subScores.soil)] }}>{dash(word(subScores.soil))}</span>
            </div>
            <Label className="mb-1 mt-3">Soil moisture, last 24 h (%)</Label>
            <TrendChart m={SOIL} hours={24} height={120} series={soilViews.map((v) => ({ name: v.probe.name, readings: last24(v) }))} />
            <div className="mt-2"><Legend names={soilViews.map((v) => v.probe.name)} limit /></div>
          </Card>
        </div>
        <div className="-mt-1 flex justify-center">
          {["Farm health", "Water level", "Soil moisture"].map((name, i) => (
            <button
              key={name} aria-label={name} className="grid h-6 w-4 place-items-center"
              onClick={() => focus.current?.scrollTo({ left: i * (focus.current.clientWidth + 16) })}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${i === page ? "bg-ink" : "bg-line"}`} />
            </button>
          ))}
        </div>
      </Section>

      <Section title="At a Glance" action={<Link href="/app/insights" className="text-[14px] text-muted underline underline-offset-4">See all</Link>}>
        <div className="grid grid-cols-2 gap-3">
          {views.map((v) => {
            const bad = issues(v.latest)[0];
            const full = v.latest?.pct_full;
            return (
              <Card key={v.probe.id} href={`/app/probe/${v.probe.id}`} className="flex flex-col">
                <div className="flex items-center gap-2 text-[15px] font-medium">
                  <Dot s={v.status} /> <span className="min-w-0 flex-1 truncate">{v.probe.name}</span>
                  {v.geo?.moved && <Badge>Moved</Badge>}
                </div>
                <div className="mt-3 flex items-baseline text-[26px] font-medium leading-none tracking-tight tabular-nums">
                  {v.latest?.level_cm?.toFixed(0) ?? "–"}<span className="ml-1 font-mono text-[13px] text-muted">cm</span>
                  {full != null && <span className="ml-auto font-mono text-[13px] text-muted">{Math.round(full)}%</span>}
                </div>
                <div className="mt-2"><Spark data={last24(v)} k="level_cm" height={40} /></div>
                <div className="mt-2 font-mono text-[14px]" style={{ color: bad ? statusColor.bad : undefined }}>
                  {bad ? `${issueTitle(bad)} · ${withUnit(bad.m, bad.x)}` : withUnit(SOIL, v.latest?.soil_pct ?? NaN)}
                </div>
                <div className="font-mono text-xs text-muted">{bad ? "Out of limits" : "Soil moisture"} · {v.online ? "live" : ago(v.latest?.created_at)}</div>
              </Card>
            );
          })}
        </div>
      </Section>
    </div>
  );
}
