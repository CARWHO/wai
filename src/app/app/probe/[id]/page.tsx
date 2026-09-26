"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useFarm } from "@/lib/farm";
import { gps, metres, recentFixes, visitsByDay } from "@/lib/derive";
import { ago, statusColor, statusLabel, type Reading } from "@/lib/supabase";
import {
  duration, every, fmt, hasLimit, HOUR, limitText, mean, metricName, METRICS, present, PRIMARY, RANGES, rangeHours, state, value,
  type MetricKey, type Range,
} from "@/lib/metrics";
import { Badge, Card, Chips, Dot, Header, Icon, Ring, RoundButton, Row, Segmented, Sheet, Tabs } from "@/components/ui";
import { Legend, TrendChart } from "@/components/TrendChart";
import { Controls } from "@/components/Controls";

const TABS = [{ k: "metrics", name: "Metrics" }, { k: "history", name: "History" }, { k: "device", name: "Device" }] as const;
const when = (iso?: string) => (iso ? new Date(iso).toLocaleString("en-NZ", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "–");
const num = (x: unknown) => (typeof x === "number" && isFinite(x) ? x : null);

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
  const { views, alerts, loading, setHome } = useFarm();
  const [tab, setTab] = useState<(typeof TABS)[number]["k"]>("metrics");
  const [range, setRange] = useState<Range>("1d");
  const [mk, setMk] = useState<MetricKey>("pct_full");
  const [menu, setMenu] = useState(false);
  const [homeMsg, setHomeMsg] = useState<string | null>(null);
  const v = views.find((x) => x.probe.id === id);
  if (!v) return <Header title={loading ? "" : "Probe not found"} back="/app" />;

  const r = v.latest;
  const mine = alerts.filter((a) => a.probe.id === id);
  // only measurements this probe actually sends; water quality only from recent readings
  const primary = present(v.history, PRIMARY);
  const quality = present(v.history.slice(-50), METRICS.filter((x) => x.wq));
  const charted = present(v.history);
  const m = charted.find((x) => x.key === mk) ?? charted[0] ?? PRIMARY[0];
  // periods are measured back from the newest reading
  const newest = r ? new Date(r.created_at).getTime() : 0;
  const since = newest - rangeHours(range) * HOUR;
  const rows = v.history.filter((x) => new Date(x.created_at).getTime() >= since);
  const xs = rows.map((x) => value(x, m)).filter((n) => !isNaN(n));
  const within = xs.length ? Math.round((xs.filter((x) => state(m, x) === "Normal").length / xs.length) * 100) : NaN;

  const raw = r?.raw ?? {};
  const g = gps(r);
  const lora = raw.lora as { rssi?: number | null; snr?: number | null } | undefined;
  const fix = recentFixes(v.history)[0] ?? null;
  const trough = v.hardware && v.history.some((x) => x.raw?.distance_cm != null);
  const week = trough ? visitsByDay(v.visits, newest, 7) : [];

  async function markHome() {
    if (!fix) return;
    setHomeMsg("Saving…");
    const err = await setHome(v!.probe.id, fix);
    setHomeMsg(err ? `Couldn't save: ${err}` : "Home set to the current GPS position");
  }

  const metricRow = (x: (typeof METRICS)[number]) => {
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
        <span className="ml-1 inline-block w-10 text-left text-xs text-muted">{x.unit}</span>
        {hasLimit(x) && !isNaN(n) && (
          <div className="text-xs" style={{ color: st === "Normal" ? statusColor.good : statusColor.bad }}>{st}</div>
        )}
      </Row>
    );
  };

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
          <div className="text-[20px] font-medium tracking-tight tabular-nums">{v.score}</div>
        </Ring>
        <div>
          <div className="flex items-center gap-2 text-[22px] font-medium leading-tight tracking-tight">
            {statusLabel[v.status]} {v.geo?.moved && <Badge>Moved</Badge>}
          </div>
          <div className="mt-0.5 font-mono text-xs text-muted">{v.online ? "Live" : "Offline"} · updated {ago(r?.created_at)}</div>
        </div>
      </div>

      {mine.map((a) => (
        <Card key={a.key} href={`/app/alerts/${a.id}`} className="flex items-center gap-3">
          <Dot s="bad" />
          <div className="flex-1">
            <div className="font-medium">{a.title}</div>
            <div className="font-mono text-xs text-muted">Started {ago(a.since)} · see what to do</div>
          </div>
          <Icon name="chevron" className="h-4 w-4 text-muted" />
        </Card>
      ))}

      <Tabs options={TABS} value={tab} onChange={setTab} />

      {tab === "metrics" && (
        <div className="-mt-3">
          {primary.map(metricRow)}
          {r?.level_cm != null && <Row k="Empty in" sub="At the last 6 h rate">{r.level_cm <= 0 ? "Empty" : v.emptyIn != null ? duration(v.emptyIn) : "Steady"}</Row>}
          {trough && (
            <Row k="Trough visits today" sub={`${week.reduce((a, d) => a + d.n, 0)} in the last 7 days`}>{week.at(-1)!.n}</Row>
          )}
          {g && (
            <Row k="GPS accuracy" sub={g.fix ? `${g.hdop != null && g.hdop <= 2 ? "Good" : g.hdop != null && g.hdop <= 5 ? "Fair" : "Poor"} fix` : "Searching for satellites"}>
              {g.sats ?? 0} sats · HDOP {g.fix && g.hdop != null ? g.hdop.toFixed(1) : "–"}
            </Row>
          )}
          {quality.map(metricRow)}
        </div>
      )}

      {tab === "history" && (
        <div className="flex flex-col gap-4">
          <Segmented options={RANGES} value={range} onChange={setRange} />
          <Chips options={charted.map((x) => ({ k: x.key, name: x.name }))} value={m.key} onChange={setMk} />
          <div>
            <div className="text-[40px] font-medium leading-none tracking-tight tabular-nums">
              {fmt(m, mean(xs))}<span className="ml-1.5 font-mono text-[14px] text-muted">{m.unit}</span>
            </div>
            <div className="mt-1.5 font-mono text-xs text-muted">Average {metricName(m)}, {{ "1d": "last 24 hours", "7d": "last 7 days", "4w": "last 4 weeks" }[range]}</div>
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
            <div className="font-mono text-xs text-muted">Showing all readings; this probe has data from {when(v.history[0].created_at)}.</div>
          )}
        </div>
      )}

      {tab === "device" && (
        <div className="-mt-3">
          <Row k="Status">
            <span style={{ color: v.online ? statusColor.good : statusColor.bad }}>{v.online ? "Live" : "Offline"}</span>
          </Row>
          <Row k="Last reading">{when(r?.created_at)}</Row>
          <Row k="Reports every">{every(v.interval)}</Row>
          {num(raw.uptime_s) != null && <Row k="Uptime" sub="Since last restart">{duration(num(raw.uptime_s)! / 3600)}</Row>}
          {lora?.rssi != null ? (
            <Row k="LoRa signal" sub="Last uplink">{lora.rssi} dBm · SNR {lora.snr ?? "–"} dB</Row>
          ) : num(raw.rssi) != null ? (
            <Row k="Wi-Fi signal" sub={num(raw.wifi_ch) != null ? `Channel ${raw.wifi_ch}` : undefined}>{num(raw.rssi)} dBm</Row>
          ) : null}
          {num(raw.chip_temp_c) != null && <Row k="Chip temperature" sub="Board, not water">{num(raw.chip_temp_c)!.toFixed(1)} °C</Row>}
          {typeof raw.fw === "string" && <Row k="Firmware">{raw.fw}</Row>}
          {num(raw.free_heap) != null && <Row k="Free memory">{Math.round(num(raw.free_heap)! / 1024)} KB</Row>}
          {g && (
            <Row k="GPS" sub={g.fix ? `Fix ${num(g.age_ms) != null ? `${(g.age_ms! / 1000).toFixed(1)} s old` : "current"}` : "No fix"}>
              {g.sats ?? 0} sats · HDOP {g.fix && g.hdop != null ? g.hdop.toFixed(1) : "–"}
            </Row>
          )}
          <Row k="Location" href={`/app/map?probe=${v.probe.id}`}>{v.probe.lat.toFixed(4)}, {v.probe.lng.toFixed(4)}{v.located === "gps" ? " · GPS" : v.located === "phone" ? " · phone" : ""}</Row>
          <Row
            k="Home"
            sub={v.probe.home_lat == null ? "Not set, so no movement alerts" : `Geofence ${v.probe.geofence_m} m${v.geo ? ` · ${Math.round(v.geo.distance)} m away now` : ""}`}
          >
            {v.probe.home_lat != null && v.probe.home_lng != null ? `${v.probe.home_lat.toFixed(4)}, ${v.probe.home_lng.toFixed(4)}` : "–"}
          </Row>
          {v.hardware && (
            <div className="mt-3 flex flex-col gap-1.5">
              <button
                onClick={markHome} disabled={!fix}
                className="rounded-full border border-line bg-white py-2.5 text-[14px] disabled:opacity-50"
              >
                Set home to current GPS position
              </button>
              <div className="font-mono text-xs text-muted">
                {homeMsg ?? (!fix
                  ? "Waiting for a GPS fix with HDOP ≤ 5."
                  : v.probe.home_lat != null
                    ? `Uses the last good fix, ${Math.round(metres({ lat: v.probe.home_lat, lng: v.probe.home_lng! }, fix))} m from the current home.`
                    : "Uses the last good fix.")}
              </div>
            </div>
          )}
          <Row k="Readings stored">{v.history.length}</Row>
          <Row k="First reading">{when(v.history[0]?.created_at)}</Row>
          {/* only real hardware probes (they fill `raw`) can take commands */}
          {v.hardware && <div className="mt-6"><Controls probeId={v.probe.id} /></div>}
        </div>
      )}

      {menu && (
        <Sheet title={v.probe.name} onClose={() => setMenu(false)}>
          <div className="flex flex-col gap-2.5">
            <Link href={`/app/map?probe=${v.probe.id}`} className="flex items-center gap-3 rounded-2xl border border-line bg-white px-4 py-3.5">
              <Icon name="pin" />
              <span className="flex-1 font-medium">Show on map</span>
            </Link>
            <button onClick={() => { csv(v.probe.name, v.history); setMenu(false); }} className="flex items-center gap-3 rounded-2xl border border-line bg-white px-4 py-3.5 text-left">
              <Icon name="download" />
              <span className="flex-1 font-medium">Download readings (CSV)</span>
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
