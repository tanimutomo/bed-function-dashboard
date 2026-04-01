"use client";

import { useEffect, useState } from "react";
import { KpiCard } from "@/components/ui/kpi-card";
import { FunctionBarChart } from "@/components/charts/function-bar-chart";
import { FunctionPieChart } from "@/components/charts/function-pie-chart";
import { fetchNationalSummary, fetchPrefectureSummary, PREFECTURE_NAMES } from "@/lib/data";
import type { NationalSummary, FunctionType } from "@/types";
import { FUNCTION_LABELS, FUNCTION_COLORS } from "@/types";

export default function HomePage() {
  const [national, setNational] = useState<NationalSummary[]>([]);
  const [prefData, setPrefData] = useState<Record<string, NationalSummary[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchNationalSummary(), fetchPrefectureSummary()]).then(
      ([nat, pref]) => {
        setNational(nat);
        setPrefData(pref);
        setLoading(false);
      }
    );
  }, []);

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8">
        <p className="text-gray-500">データを読み込み中...</p>
      </div>
    );
  }

  const latest = national[national.length - 1];
  if (!latest) return null;

  const totalBeds = latest.totalBeds;
  const acuteBeds = latest.bedsByFunction.high_acute + latest.bedsByFunction.acute;
  const acuteRate = ((acuteBeds / totalBeds) * 100).toFixed(1);

  // 都道府県別データを棒グラフ用に変換
  const prefBarData = Object.entries(prefData)
    .map(([code, years]) => {
      const latestYear = years[years.length - 1];
      if (!latestYear) return null;
      return {
        label: PREFECTURE_NAMES[code] || code,
        ...latestYear.bedsByFunction,
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
      <h1 className="mb-2 text-2xl font-bold">全国俯瞰</h1>
      <p className="mb-6 text-sm text-gray-500">
        {latest.year}年度 病床機能報告データ（{latest.totalHospitals.toLocaleString()}病院）
      </p>

      {/* KPIカード */}
      <div className="grid gap-4 sm:grid-cols-4">
        <KpiCard label="総病床数" value={totalBeds} unit="床" />
        <KpiCard label="報告病院数" value={latest.totalHospitals} unit="施設" />
        <KpiCard
          label="急性期病床割合"
          value={acuteRate}
          unit="%"
          description="高度急性期 + 急性期"
        />
        <KpiCard
          label="回復期病床数"
          value={latest.bedsByFunction.recovery}
          unit="床"
        />
      </div>

      {/* 機能別内訳 */}
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">機能別病床数（全国）</h2>
          <FunctionPieChart data={latest.bedsByFunction} height={280} />
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
            {(Object.keys(FUNCTION_LABELS) as FunctionType[]).map((key) => (
              <div key={key} className="flex items-center gap-2">
                <span
                  className="inline-block h-3 w-3 rounded-full"
                  style={{ backgroundColor: FUNCTION_COLORS[key] }}
                />
                <span className="text-gray-600">{FUNCTION_LABELS[key]}</span>
                <span className="font-medium">
                  {latest.bedsByFunction[key].toLocaleString()}床
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

      {/* 地図プレースホルダー */}
      <div className="mt-8 flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-white">
        <p className="text-gray-400">
          構想区域別ヒートマップ（Phase 4で地図を統合予定）
        </p>
      </div>
    </div>
  );
}
