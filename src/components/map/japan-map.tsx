"use client";

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, GeoJSON } from "react-leaflet";
import type { GeoJsonObject, Feature } from "geojson";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface PrefectureData {
  totalBeds: number;
  recoveryRate: number;
  acuteRate: number;
  agingRate?: number;
  utilizationRate?: number;
}

type ColorMetric = "recoveryRate" | "acuteRate" | "agingRate" | "utilizationRate";

interface JapanMapProps {
  prefectureData: Record<string, PrefectureData>;
  height?: number;
  colorMetric?: ColorMetric;
}

function getColor(value: number, metric: ColorMetric): string {
  if (metric === "recoveryRate") {
    if (value >= 22) return "#15803d";
    if (value >= 18) return "#22c55e";
    if (value >= 14) return "#86efac";
    if (value >= 10) return "#fde047";
    if (value >= 6) return "#fb923c";
    return "#ef4444";
  } else if (metric === "acuteRate") {
    if (value >= 65) return "#ef4444";
    if (value >= 60) return "#fb923c";
    if (value >= 55) return "#fde047";
    if (value >= 50) return "#86efac";
    if (value >= 45) return "#22c55e";
    return "#15803d";
  } else if (metric === "agingRate") {
    // 高齢化率: 実データ範囲 約22%〜37%（高い＝赤、低い＝緑）
    if (value >= 35) return "#ef4444";
    if (value >= 32) return "#fb923c";
    if (value >= 29) return "#fde047";
    if (value >= 26) return "#86efac";
    if (value >= 23) return "#22c55e";
    return "#15803d";
  } else {
    // 病床利用率: 実データ範囲 約66%〜83%（高い＝緑、低い＝赤）
    if (value >= 82) return "#15803d";
    if (value >= 79) return "#22c55e";
    if (value >= 76) return "#86efac";
    if (value >= 73) return "#fde047";
    if (value >= 70) return "#fb923c";
    return "#ef4444";
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
    const value = data ? (data[colorMetric] ?? 0) : 0;
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
          `急性期比率: ${data.acuteRate.toFixed(1)}%` +
          (data.agingRate ? `<br/>高齢化率: ${data.agingRate.toFixed(1)}%` : "") +
          (data.utilizationRate ? `<br/>病床利用率: ${data.utilizationRate.toFixed(1)}%` : ""),
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
