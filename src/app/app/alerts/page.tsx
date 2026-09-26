"use client";

import { useFarm } from "@/lib/farm";
import { ago, statusColor } from "@/lib/supabase";
import { issues, issueTitle, limitText, withUnit } from "@/lib/metrics";
import { Card, Dot, Header, Icon } from "@/components/ui";

export default function AlertsPage() {
  const { alerts, loading } = useFarm();
  return (
    <div className="flex flex-col gap-3">
      <Header title="Alerts" />
      {!loading && alerts.length === 0 && (
        <Card className="py-8 text-center">
          <div className="text-[18px] font-semibold">No open alerts</div>
          <div className="text-[14px] text-[var(--wai-muted)]">You will see one here when a probe goes out of limits.</div>
        </Card>
      )}
      {alerts.map((a) => {
        const list = issues(a.reading);
        return (
          <Card key={a.key} href={`/app/alerts/${a.probe.id}`} className="flex items-center gap-3">
            <Dot s="bad" />
            <div className="flex-1">
              <div className="text-[17px] font-semibold">{list.map(issueTitle).join(", ") || "Out of limits"}</div>
              <div className="text-[14px] text-[var(--wai-muted)]">{a.probe.name} · started {ago(a.since)}</div>
              {list.map((i) => (
                <div key={i.m.key} className="mt-1 text-[14px] tabular-nums">
                  <span className="font-semibold" style={{ color: statusColor.bad }}>{withUnit(i.m, i.x)}</span>
                  <span className="text-[var(--wai-muted)]"> · limit {limitText(i.m)}</span>
                </div>
              ))}
            </div>
            <Icon name="chevron" className="h-4 w-4 text-[#aeaeb2]" />
          </Card>
        );
      })}
    </div>
  );
}
