"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useFarm } from "@/lib/farm";
import { useAI } from "@/lib/ai";
import { ago, statusColor } from "@/lib/supabase";
import { fmt, HOUR, issues, issueTitle, limitText, mean, METRICS, value } from "@/lib/metrics";
import { Card, Header, Label } from "@/components/ui";

type Diagnosis = { wrong: string; cause: string; action: string; risk: string; source?: string };

const CHOICES = [
  { k: "handled", name: "Mark handled", sub: "Clears the alert until the next problem" },
  { k: "snooze", name: "Snooze 1 hour", sub: "Hides the alert, then shows it again if still out of limits" },
  { k: "send", name: "Send to worker", sub: "Share the problem and what to do" },
] as const;

export default function AlertPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { alerts, views, handle, snooze, loading } = useFarm();
  const [choice, setChoice] = useState<(typeof CHOICES)[number]["k"]>("handled");
  const a = alerts.find((x) => x.probe.id === id);
  const v = views.find((x) => x.probe.id === id);

  // usual = average before the problem started
  const before = (v?.history ?? []).filter((r) => a && r.created_at < a.since);
  const usual = (k: (typeof METRICS)[number]) => mean(before.map((r) => value(r, k)).filter((n) => !isNaN(n)));

  const ai = useAI<Diagnosis>(
    "alert",
    a && {
      probe: a.probe.name,
      problems: a.breaches,
      started: ago(a.since),
      now: { turbidity_ntu: a.reading.turbidity, ph: a.reading.ph, tds_ppm: a.reading.tds, temp_c: a.reading.temp_c, level_cm: a.reading.level_cm },
      usual: Object.fromEntries(METRICS.map((m) => [m.key, +usual(m).toFixed(m.digits)])),
      recent_turbidity: v?.history.slice(-10).map((r) => r.turbidity),
    },
    a?.key ?? null,
  );

  if (!a)
    return (
      <div>
        <Header title="Alert" back="/app/alerts" />
        {!loading && <Card className="py-8 text-center text-muted">No open alert for this probe.</Card>}
      </div>
    );

  const list = issues(a.reading);
  const title = list.map(issueTitle).join(", ") || "Out of limits";
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
      const text = `${a!.probe.name}: ${title}. ${ai?.action ?? ""}`.trim();
      const url = location.href;
      if (navigator.share) await navigator.share({ title: `${a!.probe.name}: ${title}`, text, url }).catch(() => {});
      else location.href = `sms:?&body=${encodeURIComponent(`${text} ${url}`)}`;
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Header title={a.probe.name} back="/app/alerts" />
        <Label><span className="text-alert">● Alert</span> · started {ago(a.since)}</Label>
        <div className="mt-1 text-[28px] font-medium leading-tight tracking-tight">{title}</div>
      </div>

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
              <td className="py-2.5 font-sans text-[15px]">{i.m.name}{i.m.unit && <span className="font-mono text-xs text-muted"> {i.m.unit}</span>}</td>
              <td className="py-2.5 text-right" style={{ color: statusColor.bad }}>{fmt(i.m, i.x)}</td>
              <td className="py-2.5 text-right">{fmt(i.m, usual(i.m))}</td>
              <td className="py-2.5 text-right text-muted">{limitText(i.m).replace(` ${i.m.unit}`, "")}</td>
            </tr>
          ))}
        </tbody>
      </table>

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
