"use client";

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, GeoJSON } from "react-leaflet";
import type { GeoJsonObject, Feature } from "geojson";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface PrefectureData {
  totalBeds: number;
  recoveryRate: number; // 回復期比率
  acuteRate: number; // 急性期比率
}

interface JapanMapProps {
  prefectureData: Record<string, PrefectureData>;
  height?: number;
  colorMetric?: "recoveryRate" | "acuteRate";
}

function getColor(value: number, metric: "recoveryRate" | "acuteRate"): string {
  if (metric === "recoveryRate") {
    // 回復期比率: 低い(赤) → 高い(緑)
    if (value >= 25) return "#15803d";
    if (value >= 20) return "#22c55e";
    if (value >= 15) return "#86efac";
    if (value >= 10) return "#fde047";
    if (value >= 5) return "#fb923c";
    return "#ef4444";
  } else {
    // 急性期比率: 高い(赤 = 過剰) → 低い(緑)
    if (value >= 70) return "#ef4444";
    if (value >= 60) return "#fb923c";
    if (value >= 50) return "#fde047";
    if (value >= 40) return "#86efac";
    if (value >= 30) return "#22c55e";
    return "#15803d";
  }
}

export default function JapanMap({
  prefectureData,
  height = 500,
  colorMetric = "recoveryRate",
}: JapanMapProps) {
  const [geoData, setGeoData] = useState<GeoJsonObject | null>(null);

  useEffect(() => {
    fetch("/data/geo/japan-prefectures.geojson")
      .then((res) => res.json())
      .then(setGeoData);
  }, []);

  if (!geoData) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center rounded-lg bg-gray-50"
      >
        <p className="text-gray-400">地図を読み込み中...</p>
      </div>
    );
  }

  const style = (feature: Feature | undefined) => {
    if (!feature || !feature.properties) {
      return { fillColor: "#d1d5db", weight: 1, opacity: 1, color: "#fff", fillOpacity: 0.7 };
    }
    const code = String(feature.properties.code || feature.properties.N03_001 || "").padStart(2, "0");
    const data = prefectureData[code];
    const value = data ? data[colorMetric] : 0;
    return {
      fillColor: getColor(value, colorMetric),
      weight: 1,
      opacity: 1,
      color: "#fff",
      fillOpacity: 0.7,
    };
  };

  const onEachFeature = (feature: Feature, layer: L.Layer) => {
    if (!feature.properties) return;
    const code = String(feature.properties.code || feature.properties.N03_001 || "").padStart(2, "0");
    const name = feature.properties.name || feature.properties.N03_001 || code;
    const data = prefectureData[code];
    if (data) {
      (layer as L.Path).bindTooltip(
        `<strong>${name}</strong><br/>` +
          `総病床数: ${data.totalBeds.toLocaleString()}<br/>` +
          `回復期比率: ${data.recoveryRate.toFixed(1)}%<br/>` +
          `急性期比率: ${data.acuteRate.toFixed(1)}%`,
        { sticky: true }
      );
    }
  };

  return (
    <div style={{ height }} className="rounded-lg overflow-hidden">
      <MapContainer
        center={[36.5, 137]}
        zoom={5}
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <GeoJSON
          key={colorMetric}
          data={geoData}
          style={style}
          onEachFeature={onEachFeature}
        />
      </MapContainer>
    </div>
  );
}
