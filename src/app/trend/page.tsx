"use client";

import { useEffect, useState } from "react";
import { fetchNationalSummary, fetchPrefectureSummary, fetchPopulation, fetchHospitalReport, PREFECTURE_NAMES, PREFECTURE_LIST } from "@/lib/data";
import type { PopulationData, HospitalReportEntry } from "@/lib/data";
import { KpiCard } from "@/components/ui/kpi-card";
import type { NationalSummary } from "@/types";

export default function TrendPage() {
  const [national, setNational] = useState<NationalSummary[]>([]);
  const [prefData, setPrefData] = useState<Record<string, NationalSummary[]>>({});
  const [selectedPref, setSelectedPref] = useState<string>("all");
  const [popData, setPopData] = useState<Record<string, PopulationData>>({});
  const [hospReport, setHospReport] = useState<Record<string, { national: HospitalReportEntry; prefectures: Record<string, HospitalReportEntry> }>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchNationalSummary(), fetchPrefectureSummary(), fetchPopulation(), fetchHospitalReport()]).then(
      ([nat, pref, pop, hr]) => {
        setNational(nat);
        setPrefData(pref);
        setPopData(pop.prefectures);
        setHospReport(hr.years);
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
          {PREFECTURE_LIST.map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
      </div>

      {/* KPI: 病床データ */}
      {latest && (
        <div className="mb-4 grid gap-4 sm:grid-cols-3">
          <KpiCard
            label="総病床数"
            value={latest.totalBeds}
            unit="床"
            description={`${latest.year}年度`}
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

      {/* KPI: 人口・地域データ */}
      {latest && (() => {
        const pop = selectedPref === "all"
          ? Object.values(popData).reduce(
              (acc, p) => ({
                totalPopulation: acc.totalPopulation + p.totalPopulation,
                population65over: acc.population65over + p.population65over,
                agingRate: 0,
              }),
              { totalPopulation: 0, population65over: 0, agingRate: 0 }
            )
          : popData[selectedPref];
        const agingRate = pop
          ? pop.agingRate || (pop.totalPopulation > 0 ? Math.round(pop.population65over / pop.totalPopulation * 1000) / 10 : 0)
          : null;
        const bedsPerCapita = pop && pop.totalPopulation > 0
          ? Math.round(latest.totalBeds / pop.totalPopulation * 10000 * 10) / 10
          : null;
        if (!pop) return null;
        return (
          <div className="mb-8 grid gap-4 sm:grid-cols-3">
            <KpiCard
              label="人口"
              value={pop.totalPopulation}
              unit="人"
              description="2020年国勢調査"
            />
            {agingRate != null && (
              <KpiCard
                label="高齢化率"
                value={agingRate}
                unit="%"
                description="65歳以上"
              />
            )}
            {bedsPerCapita != null && (
              <KpiCard
                label="人口1万人あたり病床数"
                value={bedsPerCapita}
                unit="床"
              />
            )}
          </div>
        );
      })()}

      {/* トレンドテーブル */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">
          機能別病床数の推移
          {selectedPref !== "all" &&
            ` - ${PREFECTURE_NAMES[selectedPref]}`}
        </h2>
        {displayData.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="py-2 pr-4">年度</th>
                  <th className="py-2 pr-4 text-right">高度急性期</th>
                  <th className="py-2 pr-4 text-right">急性期</th>
                  <th className="py-2 pr-4 text-right">回復期</th>
                  <th className="py-2 pr-4 text-right">慢性期</th>
                  <th className="py-2 text-right">合計</th>
                </tr>
              </thead>
              <tbody>
                {displayData.map((d, i) => {
                  const prev = i > 0 ? displayData[i - 1] : null;
                  const diffStr = (cur: number, prevVal: number | undefined) => {
                    if (prevVal == null || prevVal === 0) return "";
                    const diff = cur - prevVal;
                    const rate = ((diff / prevVal) * 100).toFixed(1);
                    return diff > 0 ? ` (+${rate}%)` : ` (${rate}%)`;
                  };
                  return (
                    <tr key={d.year} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-2 pr-4 font-medium">{d.year}年度</td>
                      <td className="py-2 pr-4 text-right">
                        {d.bedsByFunction.high_acute.toLocaleString()}
                        {prev && <span className="text-xs text-gray-400">{diffStr(d.bedsByFunction.high_acute, prev.bedsByFunction.high_acute)}</span>}
                      </td>
                      <td className="py-2 pr-4 text-right">
                        {d.bedsByFunction.acute.toLocaleString()}
                        {prev && <span className="text-xs text-gray-400">{diffStr(d.bedsByFunction.acute, prev.bedsByFunction.acute)}</span>}
                      </td>
                      <td className="py-2 pr-4 text-right">
                        {d.bedsByFunction.recovery.toLocaleString()}
                        {prev && <span className="text-xs text-gray-400">{diffStr(d.bedsByFunction.recovery, prev.bedsByFunction.recovery)}</span>}
                      </td>
                      <td className="py-2 pr-4 text-right">
                        {d.bedsByFunction.chronic.toLocaleString()}
                        {prev && <span className="text-xs text-gray-400">{diffStr(d.bedsByFunction.chronic, prev.bedsByFunction.chronic)}</span>}
                      </td>
                      <td className="py-2 text-right font-medium">
                        {d.totalBeds.toLocaleString()}
                        {prev && <span className="text-xs text-gray-400">{diffStr(d.totalBeds, prev.totalBeds)}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="py-20 text-center text-gray-400">データがありません</p>
        )}
        <p className="mt-3 text-xs text-gray-400">
          ※ 一部の病院で令和4年度（2022）と令和6年度（2024）の報告値が同一となるケースが確認されています。これは厚生労働省が公開する元データに起因するもので、本ダッシュボードでの加工によるものではありません。
        </p>
      </div>

      {/* 病床利用率（病院報告） */}
      {Object.keys(hospReport).length > 0 && (
        <div className="mt-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-1 text-lg font-semibold">
            病床利用率・平均在院日数の推移
            {selectedPref !== "all" &&
              ` - ${PREFECTURE_NAMES[selectedPref]}`}
          </h2>
          <p className="mb-4 text-xs text-gray-400">
            出典: 厚生労働省「病院報告」（都道府県別）
          </p>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="py-2 pr-4">年</th>
                  <th className="py-2 pr-4 text-right">病床利用率（全体）</th>
                  <th className="py-2 pr-4 text-right">一般病床</th>
                  <th className="py-2 pr-4 text-right">療養病床</th>
                  <th className="py-2 pr-4 text-right">精神病床</th>
                  <th className="py-2 pr-4 text-right">平均在院日数（全体）</th>
                  <th className="py-2 text-right">一般病床</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(hospReport)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([year, data]) => {
                    const entry = selectedPref === "all"
                      ? data.national
                      : data.prefectures[selectedPref];
                    if (!entry) return null;
                    return (
                      <tr key={year} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-2 pr-4 font-medium">{year}年</td>
                        <td className="py-2 pr-4 text-right">
                          {entry.totalUtilization != null ? `${entry.totalUtilization}%` : "-"}
                        </td>
                        <td className="py-2 pr-4 text-right">
                          {entry.generalUtilization != null ? `${entry.generalUtilization}%` : "-"}
                        </td>
                        <td className="py-2 pr-4 text-right">
                          {entry.therapyUtilization != null ? `${entry.therapyUtilization}%` : "-"}
                        </td>
                        <td className="py-2 pr-4 text-right">
                          {entry.psychiatricUtilization != null ? `${entry.psychiatricUtilization}%` : "-"}
                        </td>
                        <td className="py-2 pr-4 text-right">
                          {entry.totalAvgStay != null ? `${entry.totalAvgStay}日` : "-"}
                        </td>
                        <td className="py-2 text-right">
                          {entry.generalAvgStay != null ? `${entry.generalAvgStay}日` : "-"}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}
