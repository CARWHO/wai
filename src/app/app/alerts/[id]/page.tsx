"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useFarm, type AlertKind } from "@/lib/farm";
import { useAI } from "@/lib/ai";
import { gps } from "@/lib/derive";
import { ago, statusColor } from "@/lib/supabase";
import { duration, every, fmt, HOUR, issues, limitText, mean, METRICS, value, type Metric } from "@/lib/metrics";
import { Card, Header, Label, Row } from "@/components/ui";

type Diagnosis = { wrong: string; cause: string; action: string; risk: string; source?: string };

const CHOICES = [
  { k: "handled", name: "Mark handled", sub: "Clears the alert until the next problem" },
  { k: "snooze", name: "Snooze 1 hour", sub: "Hides the alert, then shows it again if it's still happening" },
  { k: "send", name: "Send to worker", sub: "Share the problem and what to do" },
] as const;

const kindOf = (m: Metric): AlertKind => (m.wq ? "quality" : m.key === "soil_pct" ? "soil" : "level");
const when = (iso?: string) => (iso ? new Date(iso).toLocaleString("en-NZ", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "–");

export default function AlertPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { alerts, views, handle, snooze, loading } = useFarm();
  const [choice, setChoice] = useState<(typeof CHOICES)[number]["k"]>("handled");
  // id is probe~kind; a bare probe id opens that probe's first alert
  const a = alerts.find((x) => x.id === decodeURIComponent(id)) ?? alerts.find((x) => x.probe.id === id);
  const v = views.find((x) => x.probe.id === a?.probe.id);

  // usual = average before the problem started
  const before = (v?.history ?? []).filter((r) => a && r.created_at < a.since);
  const usual = (k: Metric) => mean(before.map((r) => value(r, k)).filter((n) => !isNaN(n)));
  const r = a?.reading;
  const g = gps(r);

  const ai = useAI<Diagnosis>(
    "alert",
    a && {
      kind: a.kind,
      probe: a.probe.name,
      title: a.title,
      detail: a.detail,
      started: ago(a.since),
      now: {
        level_cm: r?.level_cm, pct_full: r?.pct_full != null ? Math.round(r.pct_full) : null, soil_pct: r?.soil_pct,
        turbidity_ntu: r?.turbidity, ph: r?.ph, tds_ppm: r?.tds, temp_c: r?.temp_c,
      },
      usual: Object.fromEntries(METRICS.map((m) => [m.key, +usual(m).toFixed(m.digits)]).filter(([, x]) => !isNaN(x as number))),
      depth_cm: a.probe.depth_cm,
      empty_in_h: v?.emptyIn != null ? +v.emptyIn.toFixed(1) : null,
      distance_m: v?.geo ? Math.round(v.geo.distance) : null,
      geofence_m: a.probe.geofence_m,
      last_seen: ago(r?.created_at),
      interval: v ? every(v.interval) : null,
      via_lora: r?.raw?.via === "lora" ? 1 : 0,
    },
    a?.key ?? null,
  );

  if (!a || !r)
    return (
      <div>
        <Header title="Alert" back="/app/alerts" />
        {!loading && <Card className="py-8 text-center text-muted">No open alert here. It may have cleared or been handled.</Card>}
      </div>
    );

  const list = issues(r).filter((i) => kindOf(i.m) === a.kind);
  const sections: [string, keyof Diagnosis][] = [
    ["What's wrong", "wrong"],
    ["Likely cause", "cause"],
    ["Next step", "action"],
    ["Risk if ignored", "risk"],
  ];

  async function confirm() {
    if (choice === "handled") {
      handle(a!.key);
      router.push("/app");
    } else if (choice === "snooze") {
      snooze(a!.key, HOUR);
      router.push("/app/alerts");
    } else {
      const text = `${a!.probe.name}: ${a!.title}. ${ai?.action ?? ""}`.trim();
      const url = location.href;
      if (navigator.share) await navigator.share({ title: `${a!.probe.name}: ${a!.title}`, text, url }).catch(() => {});
      else location.href = `sms:?&body=${encodeURIComponent(`${text} ${url}`)}`;
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Header title={a.probe.name} back="/app/alerts" />
        <Label><span className="text-alert">● Alert</span> · started {ago(a.since)}</Label>
        <div className="mt-1 text-[28px] font-medium leading-tight tracking-tight">{a.title}</div>
      </div>

      {list.length > 0 && (
        <table className="w-full">
          <thead>
            <tr className="text-left font-mono text-[11px] uppercase tracking-wider text-muted">
              <th className="pb-1.5 font-normal"></th>
              <th className="pb-1.5 text-right font-normal">Now</th>
              <th className="pb-1.5 text-right font-normal">Usual</th>
              <th className="pb-1.5 text-right font-normal">Limit</th>
            </tr>
          </thead>
          <tbody className="font-mono text-[14px]">
            {list.map((i) => (
              <tr key={i.m.key} className="border-t border-line">
                <td className="py-2.5 font-sans text-[15px]">{i.m.name}{i.m.unit && i.m.unit !== "%" && <span className="font-mono text-xs text-muted"> {i.m.unit}</span>}</td>
                <td className="py-2.5 text-right" style={{ color: statusColor.bad }}>{fmt(i.m, i.x)}</td>
                <td className="py-2.5 text-right">{fmt(i.m, usual(i.m))}</td>
                <td className="py-2.5 text-right text-muted">{limitText(i.m).replace(` ${i.m.unit}`, "")}</td>
              </tr>
            ))}
            {a.kind === "level" && v?.emptyIn != null && (
              <tr className="border-t border-line">
                <td className="py-2.5 font-sans text-[15px]">Empty in</td>
                <td className="py-2.5 text-right" style={{ color: statusColor.bad }}>{duration(v.emptyIn)}</td>
                <td></td><td></td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {a.kind === "moved" && v?.geo && (
        <div className="-mt-3">
          <Row k="From home"><span style={{ color: statusColor.bad }}>{Math.round(v.geo.distance)} m</span></Row>
          <Row k="Geofence">{v.geo.radius} m</Row>
          {g && <Row k="GPS now">{g.fix ? `${g.sats ?? 0} sats · HDOP ${g.hdop?.toFixed(1) ?? "–"}` : "No fix"}</Row>}
          <Row k="Where it is now" sub="Last good fix" href={`/app/map?probe=${a.probe.id}`}>{v.probe.lat.toFixed(5)}, {v.probe.lng.toFixed(5)}</Row>
        </div>
      )}

      {a.kind === "offline" && v && (
        <div className="-mt-3">
          <Row k="Last reading">{when(r.created_at)}</Row>
          <Row k="Last heard"><span style={{ color: statusColor.bad }}>{ago(r.created_at)}</span></Row>
          <Row k="Usually reports every">{every(v.interval)}</Row>
          <Row k="Link">{r.raw?.via === "lora" ? "LoRa bridge" : "Wi-Fi"}</Row>
        </div>
      )}

      <Card className="flex flex-col gap-4">
        {sections.map(([name, k]) => (
          <div key={k}>
            <Label>{name}</Label>
            <div className={`mt-1 whitespace-pre-line text-[15px] leading-relaxed ${k === "action" ? "font-medium" : ""}`}>{ai ? ai[k] : "Loading…"}</div>
          </div>
        ))}
        {ai && (
          <Label>{ai.source === "openai" ? "Written from this probe's readings" : "Standard guidance for this problem"}</Label>
        )}
      </Card>

      <div className="flex flex-col gap-2.5">
        <div className="text-[20px] font-medium tracking-tight">What next?</div>
        {CHOICES.map((c) => (
          <button
            key={c.k} onClick={() => setChoice(c.k)}
            className={`flex items-center gap-3 rounded-2xl border bg-white px-4 py-3.5 text-left ${choice === c.k ? "border-ink" : "border-line"}`}
          >
            <div className="flex-1">
              <div className="text-[16px] font-medium">{c.name}</div>
              <div className="text-[13px] text-muted">{c.sub}</div>
            </div>
            <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 ${choice === c.k ? "border-ink" : "border-line"}`}>
              {choice === c.k && <span className="h-3 w-3 rounded-full bg-ink" />}
            </span>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-6">
        <button onClick={() => router.back()} className="text-[16px] underline underline-offset-4">Cancel</button>
        <button onClick={confirm} className="flex-1 rounded-full bg-ink py-3 text-[16px] text-paper">
          {choice === "send" ? "Send" : "Confirm"}
        </button>
      </div>
    </div>
  );
}
