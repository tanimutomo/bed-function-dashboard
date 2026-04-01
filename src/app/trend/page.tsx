"use client";

import { useEffect, useState } from "react";
import { TrendAreaChart } from "@/components/charts/trend-area-chart";
import { FunctionBarChart } from "@/components/charts/function-bar-chart";
import { fetchNationalSummary, fetchPrefectureSummary, PREFECTURE_NAMES } from "@/lib/data";
import { KpiCard } from "@/components/ui/kpi-card";
import type { NationalSummary } from "@/types";

export default function TrendPage() {
  const [national, setNational] = useState<NationalSummary[]>([]);
  const [prefData, setPrefData] = useState<Record<string, NationalSummary[]>>({});
  const [selectedPref, setSelectedPref] = useState<string>("all");
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

  // 表示するデータ（病床機能データが0の年度は除外）
  const rawData =
    selectedPref === "all"
      ? national
      : prefData[selectedPref] || [];
  const displayData = rawData.filter(
    (d) => d.totalBeds > 0 && Object.values(d.bedsByFunction).some((v) => v > 0)
  );

  const trendData = displayData.map((d) => ({
    year: d.year,
    ...d.bedsByFunction,
  }));

  const latest = displayData[displayData.length - 1];
  const earliest = displayData[0];

  // 変化率計算（ゼロ除算ガード）
  let recoveryChange = "-";
  let acuteChange = "-";
  if (latest && earliest && displayData.length > 1) {
    const earlyRecovery = earliest.bedsByFunction.recovery;
    if (earlyRecovery > 0) {
      const recDiff = latest.bedsByFunction.recovery - earlyRecovery;
      const recRate = ((recDiff / earlyRecovery) * 100).toFixed(1);
      recoveryChange = `${recDiff > 0 ? "+" : ""}${recRate}`;
    }

    const earlyAcute = earliest.bedsByFunction.acute + earliest.bedsByFunction.high_acute;
    if (earlyAcute > 0) {
      const acuteDiff =
        latest.bedsByFunction.acute +
        latest.bedsByFunction.high_acute -
        earlyAcute;
      const acuteRate = ((acuteDiff / earlyAcute) * 100).toFixed(1);
      acuteChange = `${acuteDiff > 0 ? "+" : ""}${acuteRate}`;
    }
  }

  // 都道府県別の回復期比率ランキング
  const prefRecoveryRanking = Object.entries(prefData)
    .map(([code, years]) => {
      const latestYear = years[years.length - 1];
      if (!latestYear || latestYear.totalBeds === 0) return null;
      const recoveryRate =
        (latestYear.bedsByFunction.recovery / latestYear.totalBeds) * 100;
      return {
        code,
        name: PREFECTURE_NAMES[code] || code,
        recoveryRate: Math.round(recoveryRate * 10) / 10,
        recoveryBeds: latestYear.bedsByFunction.recovery,
        totalBeds: latestYear.totalBeds,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b!.recoveryRate - a!.recoveryRate) as {
    code: string;
    name: string;
    recoveryRate: number;
    recoveryBeds: number;
    totalBeds: number;
  }[];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">経年変化トレンド</h1>
          <p className="mt-1 text-sm text-gray-500">
            病床機能の転換状況を時系列で可視化
          </p>
        </div>
        <select
          value={selectedPref}
          onChange={(e) => setSelectedPref(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="all">全国</option>
          {Object.entries(PREFECTURE_NAMES).map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
      </div>

      {/* KPI */}
      {latest && (
        <div className="mb-8 grid gap-4 sm:grid-cols-4">
          <KpiCard
            label="総病床数"
            value={latest.totalBeds}
            unit="床"
            description={`${latest.year}年度`}
          />
          <KpiCard
            label="回復期病床数"
            value={latest.bedsByFunction.recovery}
            unit="床"
          />
          <KpiCard
            label="回復期変化率"
            value={recoveryChange}
            unit="%"
            description={
              displayData.length > 1
                ? `${earliest?.year}→${latest.year}`
                : "経年データなし"
            }
          />
          <KpiCard
            label="急性期変化率"
            value={acuteChange}
            unit="%"
            description="高度急性期+急性期"
          />
        </div>
      )}

      {/* トレンドチャート */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">
          機能別病床数の推移
          {selectedPref !== "all" &&
            ` - ${PREFECTURE_NAMES[selectedPref]}`}
        </h2>
        {trendData.length > 0 ? (
          <TrendAreaChart data={trendData} height={400} />
        ) : (
          <p className="py-20 text-center text-gray-400">データがありません</p>
        )}
        {trendData.length === 1 && (
          <p className="mt-2 text-center text-sm text-gray-400">
            現在1年度分のデータのみ表示。複数年度のデータを追加すると経年推移が確認できます。
          </p>
        )}
      </div>

      {/* 都道府県別回復期比率ランキング */}
      <div className="mt-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">
          都道府県別 回復期病床比率ランキング
        </h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="py-2 pr-4">順位</th>
                <th className="py-2 pr-4">都道府県</th>
                <th className="py-2 pr-4 text-right">回復期比率</th>
                <th className="py-2 pr-4 text-right">回復期病床</th>
                <th className="py-2 text-right">総病床数</th>
              </tr>
            </thead>
            <tbody>
              {prefRecoveryRanking.slice(0, 20).map((item, i) => (
                <tr
                  key={item.code}
                  className="border-b border-gray-100 hover:bg-gray-50"
                >
                  <td className="py-2 pr-4 font-medium">{i + 1}</td>
                  <td className="py-2 pr-4">{item.name}</td>
                  <td className="py-2 pr-4 text-right font-medium">
                    {item.recoveryRate}%
                  </td>
                  <td className="py-2 pr-4 text-right">
                    {item.recoveryBeds.toLocaleString()}
                  </td>
                  <td className="py-2 text-right">
                    {item.totalBeds.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
