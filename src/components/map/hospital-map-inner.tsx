"use client";

import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import type { HospitalMapItem } from "./hospital-map";

// 自院用マーカー（青）
const selfIcon = new L.DivIcon({
  className: "",
  html: `<div style="width:16px;height:16px;background:#2563eb;border:2px solid #1d4ed8;border-radius:50%;box-shadow:0 0 6px rgba(37,99,235,0.5);"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
  popupAnchor: [0, -10],
});

// 他院用マーカー（グレー）
const otherIcon = new L.DivIcon({
  className: "",
  html: `<div style="width:12px;height:12px;background:#94a3b8;border:2px solid #cbd5e1;border-radius:50%;"></div>`,
  iconSize: [12, 12],
  iconAnchor: [6, 6],
  popupAnchor: [0, -8],
});

function FitBounds({ hospitals }: { hospitals: HospitalMapItem[] }) {
  const map = useMap();
  useEffect(() => {
    if (hospitals.length === 0) return;
    const bounds = L.latLngBounds(hospitals.map((h) => [h.lat, h.lng]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
  }, [map, hospitals]);
  return null;
}

interface Props {
  hospitals: HospitalMapItem[];
  selfCode: string;
}

export default function HospitalMapInner({ hospitals, selfCode }: Props) {
  if (hospitals.length === 0) return null;

  const self = hospitals.find((h) => h.code === selfCode);
  const center: [number, number] = self
    ? [self.lat, self.lng]
    : [hospitals[0].lat, hospitals[0].lng];

  return (
    <MapContainer
      center={center}
      zoom={11}
      style={{ height: "400px", width: "100%" }}
      className="rounded-lg"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds hospitals={hospitals} />
      {hospitals.map((h) => (
        <Marker
          key={h.code}
          position={[h.lat, h.lng]}
          icon={h.code === selfCode ? selfIcon : otherIcon}
          zIndexOffset={h.code === selfCode ? 1000 : 0}
        >
          <Popup>
            <div className="text-xs">
              <p className="font-bold">{h.name}</p>
              <p>{h.totalBeds.toLocaleString()}床</p>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
