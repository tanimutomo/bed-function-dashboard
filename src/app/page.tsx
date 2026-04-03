"use client";

import { useEffect, useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { KpiCard } from "@/components/ui/kpi-card";
import { FunctionBarChart } from "@/components/charts/function-bar-chart";
import { FunctionPieChart } from "@/components/charts/function-pie-chart";
import { fetchNationalSummary, fetchPrefectureSummary, fetchPopulation, PREFECTURE_NAMES } from "@/lib/data";
import type { PopulationData } from "@/lib/data";
import type { NationalSummary, FunctionType } from "@/types";
import { FUNCTION_LABELS, FUNCTION_COLORS } from "@/types";

const JapanMap = dynamic(() => import("@/components/map/japan-map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[500px] items-center justify-center rounded-lg bg-gray-50">
      <p className="text-gray-400">地図を読み込み中...</p>
    </div>
  ),
});

export default function HomePage() {
  const [national, setNational] = useState<NationalSummary[]>([]);
  const [prefData, setPrefData] = useState<Record<string, NationalSummary[]>>({});
  const [selectedYear, setSelectedYear] = useState<string>("");
  const [mapMetric, setMapMetric] = useState<"recoveryRate" | "acuteRate" | "agingRate">("recoveryRate");
  const [popData, setPopData] = useState<Record<string, PopulationData>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchNationalSummary(), fetchPrefectureSummary(), fetchPopulation()]).then(
      ([nat, pref, pop]) => {
        setNational(nat);
        setPrefData(pref);
        setPopData(pop.prefectures);
        // 病床機能データがある最新年度をデフォルトに
        const validYears = nat.filter(
          (d) => d.totalBeds > 0 && Object.values(d.bedsByFunction).some((v) => v > 0)
        );
        if (validYears.length > 0) {
          setSelectedYear(validYears[validYears.length - 1].year);
        }
        setLoading(false);
      }
    );
  }, []);

  // 地図用の都道府県データ（hookはearly returnの前に配置）
  const mapPrefData = useMemo(() => {
    const result: Record<string, { totalBeds: number; recoveryRate: number; acuteRate: number; agingRate: number }> = {};
    Object.entries(prefData).forEach(([code, years]) => {
      const yearData = years.find((y) => y.year === selectedYear) || years[years.length - 1];
      if (!yearData || yearData.totalBeds === 0) return;
      const total = yearData.totalBeds;
      const pop = popData[code];
      result[code] = {
        totalBeds: total,
        recoveryRate: (yearData.bedsByFunction.recovery / total) * 100,
        acuteRate:
          ((yearData.bedsByFunction.high_acute + yearData.bedsByFunction.acute) / total) * 100,
        agingRate: pop ? pop.agingRate : 0,
      };
    });
    return result;
  }, [prefData, selectedYear, popData]);

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8">
        <p className="text-gray-500">データを読み込み中...</p>
      </div>
    );
  }

  const availableYears = national.filter(
    (d) => d.totalBeds > 0 && Object.values(d.bedsByFunction).some((v) => v > 0)
  );
  const selected = national.find((d) => d.year === selectedYear) || national[national.length - 1];
  if (!selected) return null;

  const totalBeds = selected.totalBeds;
  const acuteBeds = selected.bedsByFunction.high_acute + selected.bedsByFunction.acute;
  const acuteRate = ((acuteBeds / totalBeds) * 100).toFixed(1);

  // 都道府県別データを棒グラフ用に変換（選択年度）
  const prefBarData = Object.entries(prefData)
    .map(([code, years]) => {
      const yearData = years.find((y) => y.year === selectedYear) || years[years.length - 1];
      if (!yearData) return null;
      return {
        label: PREFECTURE_NAMES[code] || code,
        ...yearData.bedsByFunction,
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const totalA = (a!.high_acute + a!.acute + a!.recovery + a!.chronic);
      const totalB = (b!.high_acute + b!.acute + b!.recovery + b!.chronic);
      return totalB - totalA;
    })
    .slice(0, 15) as {
      label: string;
      high_acute: number;
      acute: number;
      recovery: number;
      chronic: number;
    }[];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">全国俯瞰</h1>
          <p className="mt-1 text-sm text-gray-500">
            {selected.year}年度 病床機能報告データ（{selected.totalHospitals.toLocaleString()}病院）
          </p>
        </div>
        <select
          value={selectedYear}
          onChange={(e) => setSelectedYear(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
        >
          {availableYears.map((d) => (
            <option key={d.year} value={d.year}>
              {d.year}年度
            </option>
          ))}
        </select>
      </div>

      {/* KPIカード */}
      <div className="grid gap-4 sm:grid-cols-4">
        <KpiCard label="総病床数" value={totalBeds} unit="床" />
        <KpiCard label="報告病院数" value={selected.totalHospitals} unit="施設" />
        <KpiCard
          label="急性期病床割合"
          value={acuteRate}
          unit="%"
          description="高度急性期 + 急性期"
        />
        <KpiCard
          label="回復期病床数"
          value={selected.bedsByFunction.recovery}
          unit="床"
        />
      </div>

      {/* 機能別内訳 */}
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">機能別病床数（全国）</h2>
          <FunctionPieChart data={selected.bedsByFunction} height={280} />
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
            {(Object.keys(FUNCTION_LABELS) as FunctionType[]).map((key) => (
              <div key={key} className="flex items-center gap-2">
                <span
                  className="inline-block h-3 w-3 rounded-full"
                  style={{ backgroundColor: FUNCTION_COLORS[key] }}
                />
                <span className="text-gray-600">{FUNCTION_LABELS[key]}</span>
                <span className="font-medium">
                  {selected.bedsByFunction[key].toLocaleString()}床
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">
            都道府県別 機能別病床数（上位15）
          </h2>
          <FunctionBarChart data={prefBarData} height={400} />
        </div>
      </div>

      {/* 都道府県別ヒートマップ */}
      <div className="mt-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">都道府県別ヒートマップ</h2>
          <div className="flex gap-2">
            <button
              onClick={() => setMapMetric("recoveryRate")}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                mapMetric === "recoveryRate"
                  ? "bg-green-600 text-white"
                  : "bg-gray-100 text-gray-700"
              }`}
            >
              回復期比率
            </button>
            <button
              onClick={() => setMapMetric("acuteRate")}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                mapMetric === "acuteRate"
                  ? "bg-red-600 text-white"
                  : "bg-gray-100 text-gray-700"
              }`}
            >
              急性期比率
            </button>
            <button
              onClick={() => setMapMetric("agingRate")}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                mapMetric === "agingRate"
                  ? "bg-purple-600 text-white"
                  : "bg-gray-100 text-gray-700"
              }`}
            >
              高齢化率
            </button>
          </div>
        </div>
        <JapanMap
          prefectureData={mapPrefData}
          height={500}
          colorMetric={mapMetric}
        />
        <div className="mt-3 flex items-center justify-center gap-1 text-xs text-gray-500">
          {mapMetric === "recoveryRate" ? (
            <>
              <span>低い</span>
              <span className="inline-block h-3 w-4 rounded" style={{ backgroundColor: "#ef4444" }} />
              <span className="inline-block h-3 w-4 rounded" style={{ backgroundColor: "#fb923c" }} />
              <span className="inline-block h-3 w-4 rounded" style={{ backgroundColor: "#fde047" }} />
              <span className="inline-block h-3 w-4 rounded" style={{ backgroundColor: "#86efac" }} />
              <span className="inline-block h-3 w-4 rounded" style={{ backgroundColor: "#22c55e" }} />
              <span className="inline-block h-3 w-4 rounded" style={{ backgroundColor: "#15803d" }} />
              <span>高い</span>
            </>
          ) : (
            <>
              <span>低い</span>
              <span className="inline-block h-3 w-4 rounded" style={{ backgroundColor: "#15803d" }} />
              <span className="inline-block h-3 w-4 rounded" style={{ backgroundColor: "#22c55e" }} />
              <span className="inline-block h-3 w-4 rounded" style={{ backgroundColor: "#86efac" }} />
              <span className="inline-block h-3 w-4 rounded" style={{ backgroundColor: "#fde047" }} />
              <span className="inline-block h-3 w-4 rounded" style={{ backgroundColor: "#fb923c" }} />
              <span className="inline-block h-3 w-4 rounded" style={{ backgroundColor: "#ef4444" }} />
              <span>高い（過剰）</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
