"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useFarm } from "@/lib/farm";
import { ago, statusColor, statusLabel, type Reading } from "@/lib/supabase";
import {
  fmt, hasLimit, HOUR, issues, issueTitle, limitText, mean, median, METRICS, RANGES, rangeHours, state, value,
  type MetricKey, type Range,
} from "@/lib/metrics";
import { Card, Chips, Dot, Header, Icon, Ring, RoundButton, Row, Segmented, Sheet, Tabs } from "@/components/ui";
import { Legend, TrendChart } from "@/components/TrendChart";

const TABS = [{ k: "metrics", name: "Metrics" }, { k: "history", name: "History" }, { k: "device", name: "Device" }] as const;
const CHIPS = METRICS.map((m) => ({ k: m.key, name: m.name }));
const when = (iso?: string) => (iso ? new Date(iso).toLocaleString("en-NZ", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "–");

function csv(name: string, rows: Reading[]) {
  const head = ["time", ...METRICS.map((m) => `${m.name}${m.unit ? ` (${m.unit})` : ""}`)];
  const body = rows.map((r) => [r.created_at, ...METRICS.map((m) => r[m.key] ?? "")].join(","));
  const url = URL.createObjectURL(new Blob([[head.join(","), ...body].join("\n")], { type: "text/csv" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: `${name} readings.csv` });
  a.click();
  URL.revokeObjectURL(url);
}

export default function ProbePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { views, alerts, loading } = useFarm();
  const [tab, setTab] = useState<(typeof TABS)[number]["k"]>("metrics");
  const [range, setRange] = useState<Range>("1d");
  const [mk, setMk] = useState<MetricKey>("turbidity");
  const [menu, setMenu] = useState(false);
  const v = views.find((x) => x.probe.id === id);
  if (!v) return <Header title={loading ? "" : "Probe not found"} back="/app" />;

  const r = v.latest;
  const alert = alerts.find((a) => a.probe.id === id);
  const m = METRICS.find((x) => x.key === mk)!;
  // periods are measured back from the newest reading
  const since = (r ? new Date(r.created_at).getTime() : 0) - rangeHours(range) * HOUR;
  const rows = v.history.filter((x) => new Date(x.created_at).getTime() >= since);
  const xs = rows.map((x) => value(x, m)).filter((n) => !isNaN(n));
  const within = xs.length ? Math.round((xs.filter((x) => state(m, x) === "Normal").length / xs.length) * 100) : NaN;
  const gaps = v.history.slice(1).map((x, i) => (new Date(x.created_at).getTime() - new Date(v.history[i].created_at).getTime()) / 60_000);
  const interval = median(gaps);

  return (
    <div className="flex flex-col gap-4">
      <Header
        title={v.probe.name}
        right={
          <div className="flex gap-2">
            <RoundButton icon="more" label="More" onClick={() => setMenu(true)} />
            <RoundButton icon="close" label="Close" onClick={() => (history.length > 1 ? router.back() : router.push("/app"))} />
          </div>
        }
      />

      <div className="flex items-center gap-4">
        <Ring value={v.score} size={64} stroke={6} color={statusColor[v.status]}>
          <div className="text-[20px] font-bold tabular-nums">{v.score}</div>
        </Ring>
        <div>
          <div className="text-[22px] font-bold leading-tight">{statusLabel[v.status]}</div>
          <div className="text-[14px] text-[var(--wai-muted)]">{v.online ? "Live" : "Offline"} · updated {ago(r?.created_at)}</div>
        </div>
      </div>

      {alert && (
        <Card href={`/app/alerts/${id}`} className="flex items-center gap-3">
          <Dot s="bad" />
          <div className="flex-1">
            <div className="font-semibold">{issues(alert.reading).map(issueTitle).join(", ")}</div>
            <div className="text-[13px] text-[var(--wai-muted)]">Started {ago(alert.since)} · see what to do</div>
          </div>
          <Icon name="chevron" className="h-4 w-4 text-[#aeaeb2]" />
        </Card>
      )}

      <Tabs options={TABS} value={tab} onChange={setTab} />

      {tab === "metrics" && (
        <div className="-mt-3">
          {METRICS.map((x) => {
            const n = value(r, x);
            const st = state(x, n);
            return (
              <Row
                key={x.key}
                k={x.name}
                sub={hasLimit(x) ? `Limit ${limitText(x)}` : undefined}
                onClick={() => { setMk(x.key); setTab("history"); }}
              >
                {fmt(x, n)}
                <span className="ml-1 inline-block w-10 text-left text-[13px] font-normal text-[var(--wai-muted)]">{x.unit}</span>
                {hasLimit(x) && !isNaN(n) && (
                  <div className="text-[13px] font-medium" style={{ color: st === "Normal" ? statusColor.good : statusColor.bad }}>{st}</div>
                )}
              </Row>
            );
          })}
        </div>
      )}

      {tab === "history" && (
        <div className="flex flex-col gap-4">
          <Segmented options={RANGES} value={range} onChange={setRange} />
          <Chips options={CHIPS} value={mk} onChange={setMk} />
          <div>
            <div className="text-[40px] font-bold leading-none tabular-nums">
              {fmt(m, mean(xs))}<span className="ml-1 text-[16px] font-medium">{m.unit}</span>
            </div>
            <div className="mt-1 text-[14px] text-[var(--wai-muted)]">Average {m.name === "pH" ? "pH" : m.name.toLowerCase()}, {{ "1d": "last 24 hours", "7d": "last 7 days", "4w": "last 4 weeks" }[range]}</div>
          </div>
          <TrendChart m={m} hours={rangeHours(range)} series={[{ name: m.name, readings: rows }]} />
          <Legend names={[]} limit={hasLimit(m)} />
          <div>
            <Row k="Lowest">{xs.length ? fmt(m, Math.min(...xs)) : "–"}</Row>
            <Row k="Highest">{xs.length ? fmt(m, Math.max(...xs)) : "–"}</Row>
            {hasLimit(m) && <Row k="Within limits" sub={`Limit ${limitText(m)}`}>{isNaN(within) ? "–" : `${within}%`}</Row>}
            <Row k="Readings">{xs.length}</Row>
          </div>
          {v.history.length > 0 && rows.length === v.history.length && range !== "1d" && (
            <div className="text-[13px] text-[var(--wai-muted)]">Showing all readings; this probe has data from {when(v.history[0].created_at)}.</div>
          )}
        </div>
      )}

      {tab === "device" && (
        <div className="-mt-3">
          <Row k="Status">
            <span style={{ color: v.online ? statusColor.good : statusColor.bad }}>{v.online ? "Live" : "Offline"}</span>
          </Row>
          <Row k="Last reading">{when(r?.created_at)}</Row>
          <Row k="Reports every">{isNaN(interval) ? "–" : interval < 90 ? `${Math.round(interval)} min` : `${(interval / 60).toFixed(1)} h`}</Row>
          <Row k="Readings stored">{v.history.length}</Row>
          <Row k="First reading">{when(v.history[0]?.created_at)}</Row>
          <Row k="Location" href={`/app/map?probe=${v.probe.id}`}>{v.probe.lat.toFixed(4)}, {v.probe.lng.toFixed(4)}</Row>
        </div>
      )}

      {menu && (
        <Sheet title={v.probe.name} onClose={() => setMenu(false)}>
          <div className="flex flex-col gap-2.5">
            <Link href={`/app/map?probe=${v.probe.id}`} className="flex items-center gap-3 rounded-[12px] bg-[var(--wai-card)] px-4 py-3.5">
              <Icon name="pin" />
              <span className="flex-1 font-semibold">Show on map</span>
            </Link>
            <button onClick={() => { csv(v.probe.name, v.history); setMenu(false); }} className="flex items-center gap-3 rounded-[12px] bg-[var(--wai-card)] px-4 py-3.5 text-left">
              <Icon name="download" />
              <span className="flex-1 font-semibold">Download readings (CSV)</span>
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
