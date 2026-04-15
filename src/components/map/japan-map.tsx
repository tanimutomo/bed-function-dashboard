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
  bedsPerCapita?: number;
}

type ColorMetric = "recoveryRate" | "acuteRate" | "agingRate" | "utilizationRate" | "bedsPerCapita";

interface JapanMapProps {
  prefectureData: Record<string, PrefectureData>;
  height?: number;
  colorMetric?: ColorMetric;
}

// 統一カラースケール: 低い=青、高い=赤
const HEAT_COLORS = [
  "#2563eb", // 青 (最低)
  "#60a5fa", // 薄青
  "#a5f3fc", // 水色
  "#fde68a", // 黄色
  "#fb923c", // オレンジ
  "#dc2626", // 赤 (最高)
];

// 各指標のしきい値（低い→高い順）
const THRESHOLDS: Record<ColorMetric, number[]> = {
  recoveryRate: [6, 10, 14, 18, 22],
  acuteRate: [45, 50, 55, 60, 65],
  agingRate: [23, 26, 29, 32, 35],
  utilizationRate: [70, 73, 76, 79, 82],
  bedsPerCapita: [80, 100, 120, 140, 160],
};

function getColor(value: number, metric: ColorMetric): string {
  const t = THRESHOLDS[metric];
  if (value >= t[4]) return HEAT_COLORS[5];
  if (value >= t[3]) return HEAT_COLORS[4];
  if (value >= t[2]) return HEAT_COLORS[3];
  if (value >= t[1]) return HEAT_COLORS[2];
  if (value >= t[0]) return HEAT_COLORS[1];
  return HEAT_COLORS[0];
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
          (data.utilizationRate ? `<br/>病床利用率: ${data.utilizationRate.toFixed(1)}%` : "") +
          (data.bedsPerCapita ? `<br/>人口1万人あたり病床数: ${data.bedsPerCapita.toFixed(1)}` : ""),
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
