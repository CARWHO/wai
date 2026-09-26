"use client";

import { useFarm } from "@/lib/farm";
import { ago } from "@/lib/supabase";
import { Card, Header, Icon, Label } from "@/components/ui";

export default function AlertsPage() {
  const { alerts, loading } = useFarm();
  return (
    <div className="flex flex-col gap-3">
      <Header title="Alerts" />
      {!loading && alerts.length === 0 && (
        <Card className="py-8 text-center">
          <div className="text-[18px] font-medium">No open alerts</div>
          <div className="text-[14px] text-muted">You will see one here when a probe runs low, the soil goes out of range, or a probe moves or goes quiet.</div>
        </Card>
      )}
      {alerts.map((a) => (
        <Card key={a.key} href={`/app/alerts/${a.id}`} className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <Label className="flex justify-between">
              <span className="text-alert">● Alert</span>
              <span>started {ago(a.since)}</span>
            </Label>
            <div className="mt-1 text-[17px] font-medium">{a.probe.name} · {a.title}</div>
            {a.detail.map((d) => (
              <div key={d} className="mt-0.5 font-mono text-[13px] text-muted">{d}</div>
            ))}
          </div>
          <Icon name="chevron" className="h-4 w-4 text-muted" />
        </Card>
      ))}
    </div>
  );
}
