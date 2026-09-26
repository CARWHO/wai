"use client";

import type { ProbeView } from "@/lib/farm";
import { health } from "@/lib/derive";
import { ago, statusColor } from "@/lib/supabase";
import { Label } from "@/components/ui";

// ✓ / ! / ✕ for each part of a hardware probe, from its latest reading
export function SensorCheck({ v, className = "" }: { v: ProbeView; className?: string }) {
  return (
    <div className={className}>
      <Label>Sensor check</Label>
      <div className="mt-2 flex flex-col gap-1.5">
        {health(v.latest, v.online, ago(v.latest?.created_at)).map((c) => (
          <div key={c.part} className="flex items-center gap-2 text-[14px]">
            <span className="w-4 text-center font-bold" style={{ color: statusColor[c.s] }}>{c.s === "good" ? "✓" : c.s === "watch" ? "!" : "✕"}</span>
            <span className="w-28 shrink-0 font-medium">{c.part}</span>
            <span className="min-w-0 truncate font-mono text-[13px]" style={{ color: c.s === "good" ? undefined : statusColor[c.s] }}>{c.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
