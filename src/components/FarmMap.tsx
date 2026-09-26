"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, Marker, TileLayer } from "react-leaflet";
import { statusColor } from "@/lib/supabase";
import type { ProbeView } from "@/lib/farm";

// "Bore 1" -> "B1", "Trough A" -> "TA", "Dam" -> "DA"
export const initials = (name: string) => {
  const w = name.split(/\s+/);
  return (w.length > 1 ? w.map((x) => x[0]).join("") : name.slice(0, 2)).slice(0, 2).toUpperCase();
};

// Halter-style round badge pin
const badge = (v: ProbeView, selected: boolean) =>
  L.divIcon({
    className: "",
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    html: `<div style="width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:${statusColor[v.status]};color:#fff;font:700 12px/1 var(--wai-font);border:${selected ? "3px solid #111" : "2px solid #fff"}">${initials(v.probe.name)}</div>`,
  });

const TILES = {
  satellite: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  map: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
};

export default function FarmMap({ views, selected, onSelect, layer = "satellite" }: {
  views: ProbeView[]; selected?: string; onSelect: (id: string) => void; layer?: keyof typeof TILES;
}) {
  const lat = views.reduce((a, v) => a + v.probe.lat, 0) / views.length;
  const lng = views.reduce((a, v) => a + v.probe.lng, 0) / views.length;
  return (
    <MapContainer center={[lat, lng]} zoom={15} zoomControl={false} attributionControl={false} fadeAnimation={false} zoomAnimation={false} markerZoomAnimation={false} className="h-full w-full">
      <TileLayer key={layer} url={TILES[layer]} maxZoom={19} />
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
