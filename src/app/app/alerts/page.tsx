"use client";

import { useFarm } from "@/lib/farm";
import { ago } from "@/lib/supabase";
import { issues, issueTitle, limitText, withUnit } from "@/lib/metrics";
import { Card, Header, Icon, Label } from "@/components/ui";

export default function AlertsPage() {
  const { alerts, loading } = useFarm();
  return (
    <div className="flex flex-col gap-3">
      <Header title="Alerts" />
      {!loading && alerts.length === 0 && (
        <Card className="py-8 text-center">
          <div className="text-[18px] font-medium">No open alerts</div>
          <div className="text-[14px] text-muted">You will see one here when a probe goes out of limits.</div>
        </Card>
      )}
      {alerts.map((a) => {
        const list = issues(a.reading);
        return (
          <Card key={a.key} href={`/app/alerts/${a.probe.id}`} className="flex items-center gap-3">
            <div className="flex-1">
              <Label className="flex justify-between">
                <span className="text-alert">● Alert</span>
                <span>started {ago(a.since)}</span>
              </Label>
              <div className="mt-1 text-[17px] font-medium">{a.probe.name}</div>
              {list.map((i) => (
                <div key={i.m.key} className="mt-0.5 font-mono text-[13px]">
                  <span className="text-alert">{issueTitle(i)} · {withUnit(i.m, i.x)}</span>
                  <span className="text-muted"> · limit {limitText(i.m)}</span>
                </div>
              ))}
            </div>
            <Icon name="chevron" className="h-4 w-4 text-muted" />
          </Card>
        );
      })}
    </div>
  );
}
