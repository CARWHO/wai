"use client";

import { useFarm } from "@/lib/farm";
import { ago } from "@/lib/supabase";
import { Dot, Row } from "@/components/ui";

// Open alerts as rows; each opens its page with the AI's analysis
export function AlertList() {
  const { alerts, loading } = useFarm();
  if (!loading && !alerts.length)
    return <div className="border-y border-line py-6 text-center text-[15px] text-muted">No open alerts</div>;
  return (
    <div className="border-t border-line">
      {alerts.map((a) => (
        <Row
          key={a.key} href={`/app/alerts/${a.id}`}
          k={<span className="flex items-center gap-2"><Dot s="bad" /> {a.probe.name} · {a.title}</span>}
          sub={`${a.detail[0]} · ${ago(a.since)}`}
        />
      ))}
    </div>
  );
}
