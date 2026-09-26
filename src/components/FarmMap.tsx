"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useRef } from "react";
import { MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import { statusColor } from "@/lib/supabase";
import type { ProbeView } from "@/lib/farm";

// "Bore 1" -> "B1", "Trough A" -> "TA", "Dam" -> "DA"
export const initials = (name: string) => {
  const w = name.split(/\s+/);
  return (w.length > 1 ? w.map((x) => x[0]).join("") : name.slice(0, 2)).slice(0, 2).toUpperCase();
};

// Halter-style round badge pin. Icons are cached: a new icon object makes Leaflet rebuild the marker DOM on every render.
const icons = new Map<string, L.DivIcon>();
const badge = (v: ProbeView, selected: boolean) => {
  const key = `${v.status}|${v.probe.name}|${selected}`;
  let icon = icons.get(key);
  if (!icon) {
    icon = L.divIcon({
      className: "",
      iconSize: [34, 34],
      iconAnchor: [17, 17],
      html: `<div style="width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:${statusColor[v.status]};color:#f6f5f1;font:500 11px/1 var(--font-mono);border:${selected ? "3px solid #141412" : "2px solid #f6f5f1"}">${initials(v.probe.name)}</div>`,
    });
    icons.set(key, icon);
  }
  return icon;
};

const TILES = {
  satellite: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  map: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
};

// Jump to the live probe once, when the phone's position first arrives
function FollowLive({ live }: { live?: ProbeView }) {
  const map = useMap();
  const done = useRef(false);
  useEffect(() => {
    if (!live || done.current) return;
    done.current = true;
    map.setView([live.probe.lat, live.probe.lng], 17);
  }, [live, map]);
  return null;
}

// Go back to the start view each time `fit` changes ("Show whole farm")
function ShowFarm({ fit, lat, lng, zoom }: { fit: number; lat: number; lng: number; zoom: number }) {
  const map = useMap();
  const last = useRef(fit);
  useEffect(() => {
    if (fit === last.current) return;
    last.current = fit;
    map.setView([lat, lng], zoom);
  }, [fit, lat, lng, zoom, map]);
  return null;
}

// The map stays mounted while hidden (display: none), so measure its size again when it shows
function Resize({ visible }: { visible: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (visible) map.invalidateSize();
  }, [visible, map]);
  return null;
}

export default function FarmMap({ views, selected, onSelect, layer = "satellite", fit = 0, visible = true }: {
  views: ProbeView[]; selected?: string; onSelect: (id: string) => void; layer?: keyof typeof TILES; fit?: number; visible?: boolean;
}) {
  const live = views.find((v) => v.located);
  const lat = live?.probe.lat ?? views.reduce((a, v) => a + v.probe.lat, 0) / views.length;
  const lng = live?.probe.lng ?? views.reduce((a, v) => a + v.probe.lng, 0) / views.length;
  return (
    <MapContainer center={[lat, lng]} zoom={15} zoomControl={false} attributionControl={false} className="h-full w-full">
      {/* Leaflet scales the tiles it has during the zoom and keeps them until the new ones load; fetching only at zoom end avoids a burst of tile requests mid-pinch */}
      <TileLayer key={layer} url={TILES[layer]} maxZoom={19} updateWhenZooming={false} keepBuffer={4} />
      <FollowLive live={live} />
      <ShowFarm fit={fit} lat={lat} lng={lng} zoom={live ? 17 : 15} />
      <Resize visible={visible} />
      {views.map((v) => (
        <Marker
          key={v.probe.id}
          position={[v.probe.lat, v.probe.lng]}
          icon={badge(v, v.probe.id === selected)}
          eventHandlers={{ click: () => onSelect(v.probe.id) }}
        />
      ))}
    </MapContainer>
  );
}
