"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useLayoutEffect } from "react";
import { useFarm } from "@/lib/farm";
import { ago, status, statusColor, statusLabel } from "@/lib/supabase";
import { METRICS, present, PRIMARY, value, withUnit } from "@/lib/metrics";
import { Badge, Dot, Icon, RoundButton, Ring, Row } from "@/components/ui";
import { useLiveMap } from "@/components/LiveMap";

const dark = "grid h-11 w-11 place-items-center rounded-full bg-ink text-paper";
const chip = "pointer-events-auto flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-[15px] font-medium text-paper";

function Live() {
  const { views, farmScore, alerts } = useFarm();
  // The map itself lives in the app layout (LiveMapProvider), so it survives navigation
  const { sheet, setSheet, toggleLayer, showFarm } = useLiveMap();
  const probe = useSearchParams().get("probe") ?? undefined;
  useLayoutEffect(() => setSheet(probe), [probe, setSheet]);
  const v = views.find((x) => x.probe.id === sheet);
  const live = views.filter((x) => x.online).length;
  const s = status(farmScore);

  return (
    <div className="pointer-events-none fixed inset-0 z-[400]">
      {/* Halter Live: round dark buttons either side of the summary pill */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[400] mx-auto flex max-w-md items-start justify-between gap-2 px-4 pt-[max(16px,env(safe-area-inset-top))]">
        <div className="pointer-events-auto flex flex-col gap-3">
          <Link href="/app" aria-label="Home" className={dark}><Icon name="home" /></Link>
          <button onClick={showFarm} aria-label="Show whole farm" className={dark}><Icon name="locate" /></button>
          <button onClick={toggleLayer} aria-label="Switch map layer" className={dark}><Icon name="layers" /></button>
        </div>
        <div className="pointer-events-auto flex items-center gap-2.5 rounded-full bg-ink py-1 pl-1 pr-4 text-paper">
          <Ring value={farmScore} size={40} stroke={4} color={statusColor[s]} track="#3f3e3a">
            <span className="font-mono text-[12px]">{farmScore}</span>
          </Ring>
          <div className="font-mono text-[12px] leading-tight">
            <div>Farm health · {statusLabel[s]}</div>
            <div className="text-paper/70">{live} of {views.length} probes live</div>
          </div>
        </div>
        <button onClick={() => setSheet("list")} aria-label="Find a probe" className={`pointer-events-auto ${dark}`}><Icon name="search" /></button>
      </div>

      {!sheet && (
        <div className="absolute inset-x-0 bottom-24 z-[400] flex justify-center gap-2">
          <button onClick={() => setSheet("list")} className={chip}>Probes</button>
          <Link href="/app/alerts" className={chip}>
            {alerts.length > 0 && <span className="h-2 w-2 rounded-full bg-watch" />} Alerts
          </Link>
        </div>
      )}

      {/* Halter bottom sheet */}
      {sheet && (
        <div className="pointer-events-auto absolute inset-x-0 bottom-0 z-[450] mx-auto max-h-[70dvh] max-w-md overflow-y-auto rounded-t-2xl border-t border-line bg-paper px-5 pb-24 pt-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[26px] font-medium leading-tight tracking-tight">{v ? v.probe.name : "Probes"}</div>
              {v && (
                <div className="mt-1 flex items-center gap-2 font-mono text-xs text-muted">
                  <Dot s={v.status} /> {statusLabel[v.status]} · {v.online ? "Live" : `updated ${ago(v.latest?.created_at)}`}
                </div>
              )}
            </div>
            <RoundButton icon="close" label="Close" onClick={() => setSheet(undefined)} />
          </div>

          {v ? (
            <>
              <div className="mt-2">
                {[...present(v.history, PRIMARY), ...present(v.history.slice(-50), METRICS.filter((m) => m.wq && m.key !== "temp_c"))].map((m) => (
                  <Row key={m.key} k={m.name}>{withUnit(m, value(v.latest, m))}</Row>
                ))}
                {v.geo && (
                  <Row k="From home" sub={`Geofence ${v.geo.radius} m`}>
                    {v.geo.moved ? <Badge>Moved</Badge> : null} {Math.round(v.geo.distance)} m
                  </Row>
                )}
              </div>
              <Link href={`/app/probe/${v.probe.id}`} className="mt-4 block rounded-full bg-ink py-3.5 text-center text-[17px] font-medium text-paper">
                Open probe
              </Link>
            </>
          ) : (
            <div className="mt-2">
              {views.map((p) => (
                <Row key={p.probe.id} k={<span className="flex items-center gap-2"><Dot s={p.status} /> {p.probe.name}</span>} sub={`${statusLabel[p.status]} · ${p.online ? "Live" : `updated ${ago(p.latest?.created_at)}`}`} onClick={() => setSheet(p.probe.id)} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function MapPage() {
  return (
    <Suspense>
      <Live />
    </Suspense>
  );
}
