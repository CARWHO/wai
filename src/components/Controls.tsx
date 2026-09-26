"use client";

import { useEffect, useState } from "react";
import { ago, statusColor, supabase, type Command } from "@/lib/supabase";
import { Row, Section } from "./ui";

// Remote control over LoRa. Commands queue in Supabase; the bridge sends one after each uplink,
// so they land within one report interval.
const LABEL = { ping: "Ping", read: "Read now", interval: "Interval" };
const STATE: Record<Command["status"], { name: string; color: string }> = {
  pending: { name: "Pending", color: "var(--color-muted)" },
  sent: { name: "Sent", color: statusColor.watch },
  done: { name: "Done", color: statusColor.good },
  failed: { name: "Failed", color: statusColor.bad },
};
const pill = "rounded-full px-3.5 py-1.5 text-[13px] disabled:opacity-50";

export function Controls({ probeId }: { probeId: string }) {
  const [cmds, setCmds] = useState<Command[]>([]);
  const [secs, setSecs] = useState("60");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = () =>
      supabase.from("commands").select("*").eq("probe_id", probeId).order("created_at", { ascending: false }).limit(5)
        .then(({ data }) => data && setCmds(data));
    load();
    const ch = supabase
      .channel(`commands-${probeId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "commands", filter: `probe_id=eq.${probeId}` }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [probeId]);

  async function send(cmd: Command["cmd"], arg: number | null = null) {
    setBusy(true);
    const { error } = await supabase.from("commands").insert({ probe_id: probeId, cmd, arg });
    setError(error?.message ?? null);
    setBusy(false);
  }
  const n = Math.round(Number(secs));

  return (
    <Section title="Controls">
      <div className="flex flex-wrap items-center gap-2">
        <button disabled={busy} onClick={() => send("ping")} className={`${pill} border border-line bg-white`}>Ping</button>
        <button disabled={busy} onClick={() => send("read")} className={`${pill} border border-line bg-white`}>Read now</button>
        <div className="ml-auto flex items-center gap-2">
          <input
            type="number" min={5} max={3600} value={secs} onChange={(e) => setSecs(e.target.value)} aria-label="Interval in seconds"
            className="w-20 rounded-full border border-line bg-white px-3 py-1.5 text-right font-mono text-[13px]"
          />
          <span className="font-mono text-xs text-muted">s</span>
          <button
            disabled={busy || !(n >= 5 && n <= 3600)} onClick={() => send("interval", n)}
            className={`${pill} bg-ink text-paper`}
          >
            Set interval
          </button>
        </div>
      </div>
      {error && <div className="font-mono text-xs" style={{ color: statusColor.bad }}>{error}</div>}
      {cmds.length > 0 && (
        <div className="-mt-1">
          {cmds.map((c) => (
            <Row key={c.id} k={`${LABEL[c.cmd]}${c.cmd === "interval" && c.arg != null ? ` ${c.arg} s` : ""}`} sub={ago(c.created_at)}>
              <span style={{ color: STATE[c.status].color }}>{STATE[c.status].name}</span>
            </Row>
          ))}
        </div>
      )}
      <div className="font-mono text-xs text-muted">Sent over LoRa after the probe&apos;s next report.</div>
    </Section>
  );
}
