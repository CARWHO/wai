"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { supabase, type Probe } from "@/lib/supabase";

// Stand-in for the ESP32: writes readings to Supabase like the probe would
type Mode = "clean" | "dirty" | "low";
const BASE_LEVEL: Record<string, number> = { Dam: 180, "Trough A": 42 };
const jitter = (n: number, spread: number) => +(n + (Math.random() - 0.5) * spread).toFixed(2);

function reading(probe: Probe, mode: Mode) {
  const level = BASE_LEVEL[probe.name] ?? 95;
  const dirty = mode === "dirty";
  return {
    probe_id: probe.id,
    turbidity: dirty ? jitter(52, 10) : jitter(3, 1.5),
    ph: dirty ? jitter(6.1, 0.2) : jitter(7.2, 0.15),
    tds: dirty ? jitter(760, 40) : jitter(200, 10),
    temp_c: jitter(12.2, 0.4),
    level_cm: mode === "low" ? jitter(level * 0.45, 2) : jitter(level, 2),
  };
}

export default function Sim() {
  const [probes, setProbes] = useState<Probe[]>([]);
  const [probeId, setProbeId] = useState<string>();
  const [mode, setMode] = useState<Mode>("clean");
  const [auto, setAuto] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const state = useRef({ probes, probeId, mode });
  useEffect(() => {
    state.current = { probes, probeId, mode };
  }, [probes, probeId, mode]);

  useEffect(() => {
    supabase.from("probes").select("*").order("name").then(({ data }) => {
      setProbes(data ?? []);
      setProbeId(data?.[0]?.id);
    });
  }, []);

  async function send(m = state.current.mode) {
    const p = state.current.probes.find((x) => x.id === state.current.probeId);
    if (!p) return;
    const r = reading(p, m);
    const { error } = await supabase.from("readings").insert(r);
    const line = `${new Date().toLocaleTimeString()} ${p.name} ${m}: turb ${r.turbidity} · pH ${r.ph} · lvl ${r.level_cm}`;
    setLog((l) => [error ? `ERROR ${error.message}` : line, ...l].slice(0, 12));
  }

  // Auto mode streams every probe, like real hardware would
  useEffect(() => {
    if (!auto) return;
    const tick = async () => {
      const { probes, probeId, mode } = state.current;
      const rows = probes.map((p) => reading(p, p.id === probeId ? mode : "clean"));
      const { error } = await supabase.from("readings").insert(rows);
      setLog((l) => [error ? `ERROR ${error.message}` : `${new Date().toLocaleTimeString()} streamed ${rows.length} probes`, ...l].slice(0, 12));
    };
    tick();
    const t = setInterval(tick, 3000);
    return () => clearInterval(t);
  }, [auto]);

  const btn = (m: Mode, label: string, cls: string) => (
    <button
      onClick={() => {
        setMode(m);
        send(m);
      }}
      className={`rounded-[18px] py-5 text-[17px] font-semibold text-white ${cls} ${mode === m ? "ring-4 ring-black/20" : "opacity-80"}`}
    >
      {label}
    </button>
  );

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-[28px] font-bold">Probe simulator</h1>
        <Link href="/app" className="text-[14px] font-medium text-[#1f6b3f]">Open app →</Link>
      </div>
      <p className="text-[14px] text-[var(--wai-muted)]">Stands in for the ESP32. Each tap writes one reading to Supabase; the app updates live.</p>

      <select value={probeId} onChange={(e) => setProbeId(e.target.value)} className="rounded-[12px] bg-[var(--wai-card)] p-3 text-[16px]">
        {probes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>

      <div className="grid grid-cols-3 gap-2">
        {btn("clean", "Clean", "bg-[#2f9e5b]")}
        {btn("dirty", "Dirty", "bg-[#d64a3e]")}
        {btn("low", "Low level", "bg-[#e0912f]")}
      </div>

      <label className="flex items-center justify-between rounded-[12px] bg-[var(--wai-card)] p-4">
        <span>
          <div className="font-medium">Stream every 3 s</div>
          <div className="text-[13px] text-[var(--wai-muted)]">All probes report; the selected one uses the mode above</div>
        </span>
        <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="h-6 w-6 accent-[#1f6b3f]" />
      </label>

      <pre className="min-h-40 overflow-x-auto rounded-[12px] bg-black/[.05] p-3 text-[11px] leading-relaxed">{log.join("\n") || "No readings sent yet."}</pre>
    </main>
  );
}
