"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useFarm } from "@/lib/farm";
import { ago, status, statusColor, statusLabel } from "@/lib/supabase";
import { METRICS, value, withUnit } from "@/lib/metrics";
import { Dot, Icon, RoundButton, Ring, Row } from "@/components/ui";

const FarmMap = dynamic(() => import("@/components/FarmMap"), { ssr: false });

const dark = "grid h-11 w-11 place-items-center rounded-full bg-[#111] text-white";
const chip = "flex items-center gap-2 rounded-full bg-[#111] px-5 py-3 text-[15px] font-semibold text-white";

function Live() {
  const { views, farmScore, alerts } = useFarm();
  const [sheet, setSheet] = useState<string | undefined>(useSearchParams().get("probe") ?? undefined); // "list" or a probe id
  const [reset, setReset] = useState(0);
  const [layer, setLayer] = useState<"satellite" | "map">("satellite");
  const v = views.find((x) => x.probe.id === sheet);
  const live = views.filter((x) => x.online).length;
  const s = status(farmScore);

  return (
    <div className="fixed inset-0 z-0 bg-[#1b2a20]">
      {views.length > 0 && <FarmMap key={reset} views={views} layer={layer} selected={v?.probe.id} onSelect={setSheet} />}

      {/* Halter Live: round dark buttons either side of the summary pill */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[400] mx-auto flex max-w-md items-start justify-between gap-2 px-4 pt-[max(16px,env(safe-area-inset-top))]">
        <div className="pointer-events-auto flex flex-col gap-3">
          <Link href="/app" aria-label="Home" className={dark}><Icon name="home" /></Link>
          <button onClick={() => setReset((n) => n + 1)} aria-label="Show whole farm" className={dark}><Icon name="locate" /></button>
          <button onClick={() => setLayer((l) => (l === "satellite" ? "map" : "satellite"))} aria-label="Switch map layer" className={dark}><Icon name="layers" /></button>
        </div>
        <div className="pointer-events-auto flex items-center gap-2.5 rounded-full bg-[#111] py-1 pl-1 pr-4 text-white">
          <Ring value={farmScore} size={40} stroke={4} color={statusColor[s]} track="#3a3a3c">
            <span className="text-[12px] font-bold">{farmScore}</span>
          </Ring>
          <div className="text-[13px] leading-tight">
            <div>Farm health <b>{statusLabel[s]}</b></div>
            <div className="text-white/70">{live} of {views.length} probes live</div>
          </div>
        </div>
        <button onClick={() => setSheet("list")} aria-label="Find a probe" className={`pointer-events-auto ${dark}`}><Icon name="search" /></button>
      </div>

      {!sheet && (
        <div className="absolute inset-x-0 bottom-24 z-[400] flex justify-center gap-2">
          <button onClick={() => setSheet("list")} className={chip}>Probes</button>
          <Link href="/app/alerts" className={chip}>
            {alerts.length > 0 && <span className="h-2 w-2 rounded-full bg-[#f26b1d]" />} Alerts
          </Link>
        </div>
      )}

      {/* Halter bottom sheet */}
      {sheet && (
        <div className="absolute inset-x-0 bottom-0 z-[450] mx-auto max-h-[70dvh] max-w-md overflow-y-auto rounded-t-[20px] bg-white px-5 pb-24 pt-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[26px] font-bold leading-tight">{v ? v.probe.name : "Probes"}</div>
              {v && (
                <div className="mt-0.5 flex items-center gap-2 text-[14px] text-[var(--wai-muted)]">
                  <Dot s={v.status} /> {statusLabel[v.status]} · {v.online ? "Live" : `updated ${ago(v.latest?.created_at)}`}
                </div>
              )}
            </div>
            <RoundButton icon="close" label="Close" onClick={() => setSheet(undefined)} />
          </div>

          {v ? (
            <>
              <div className="mt-2">
                {METRICS.slice(0, 4).map((m) => (
                  <Row key={m.key} k={m.name}>{withUnit(m, value(v.latest, m))}</Row>
                ))}
              </div>
              <Link href={`/app/probe/${v.probe.id}`} className="mt-4 block rounded-[10px] bg-[#111] py-3.5 text-center text-[17px] font-semibold text-white">
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
