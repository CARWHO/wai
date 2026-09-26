"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { createContext, useContext, useMemo, useState } from "react";
import { useFarm } from "@/lib/farm";

const FarmMap = dynamic(() => import("@/components/FarmMap"), { ssr: false });

type Layer = "satellite" | "map";
type LiveMap = {
  sheet?: string; // "list" or a probe id
  setSheet: (s?: string) => void;
  layer: Layer;
  toggleLayer: () => void;
  showFarm: () => void;
};

const LiveMapContext = createContext<LiveMap | null>(null);

export function useLiveMap() {
  const ctx = useContext(LiveMapContext);
  if (!ctx) throw new Error("useLiveMap must be used inside LiveMapProvider");
  return ctx;
}

// One Leaflet map for the whole app session. It is created as soon as the probes load and kept
// full-size but invisible off the Live tab, so it has its tiles ready before the first tap on Live
// and switching tabs never rebuilds it.
export function LiveMapProvider({ children }: { children: React.ReactNode }) {
  const { views } = useFarm();
  const onMap = usePathname() === "/app/map";
  const [sheet, setSheet] = useState<string>();
  const [layer, setLayer] = useState<Layer>("satellite");
  const [fit, setFit] = useState(0);

  const value = useMemo<LiveMap>(() => ({
    sheet,
    setSheet,
    layer,
    toggleLayer: () => setLayer((l) => (l === "satellite" ? "map" : "satellite")),
    showFarm: () => setFit((n) => n + 1),
  }), [sheet, layer]);

  const selected = views.find((v) => v.probe.id === sheet)?.probe.id;

  return (
    <LiveMapContext value={value}>
      {views.length > 0 && (
        <div className={`fixed inset-0 z-0 bg-[#1b2a20] ${onMap ? "" : "invisible"}`}>
          <FarmMap views={views} layer={layer} selected={selected} onSelect={setSheet} fit={fit} visible={onMap} />
        </div>
      )}
      {children}
    </LiveMapContext>
  );
}
