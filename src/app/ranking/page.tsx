"use client";

import { useEffect, useState, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { fetchRanking, fetchAreaIndex, PREFECTURE_NAMES } from "@/lib/data";
import { RANKING_METRIC_LABELS } from "@/types";
import type { RankingMetric, RankingEntry, Area } from "@/types";

export default function RankingPage() {
  const [rankingData, setRankingData] = useState<Record<string, RankingEntry[]>>({});
  const [selectedMetric, setSelectedMetric] = useState<RankingMetric>("surgeriesGA");
  const [selectedPref, setSelectedPref] = useState<string>("all");
  const [areas, setAreas] = useState<Area[]>([]);
  const [selectedArea, setSelectedArea] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchRanking("2023"), fetchAreaIndex()]).then(
      ([ranking, areaList]) => {
        setRankingData(ranking);
        setAreas(areaList);
        setLoading(false);
      }
    );
  }, []);

  const filteredAreas = useMemo(
    () =>
      selectedPref === "all"
        ? areas
        : areas.filter((a) => a.prefecture === selectedPref),
    [areas, selectedPref]
  );

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8">
        <p className="text-gray-500">データを読み込み中...</p>
      </div>
    );
  }

  // フィルタ適用
  let entries: RankingEntry[] = (rankingData[selectedMetric] || []);
  if (selectedPref !== "all") {
    entries = entries.filter((e) => e.prefecture === selectedPref);
  }
  if (selectedArea !== "all") {
    entries = entries.filter((e) => e.areaCode === selectedArea);
  }
  entries = entries.slice(0, 20);

  const chartData = entries.map((e) => ({
    name:
      e.hospitalName.length > 15
        ? e.hospitalName.slice(0, 15) + "..."
        : e.hospitalName,
    value: e.value,
    fullName: e.hospitalName,
    area: e.areaName,
    pref: PREFECTURE_NAMES[e.prefecture] || e.prefecture,
  }));

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="mb-2 text-2xl font-bold">診療実績ランキング</h1>
      <p className="mb-6 text-sm text-gray-500">
        全国の病院を診療実績で比較（2023年度）
      </p>

      {/* 指標選択 */}
      <div className="mb-4 flex flex-wrap gap-2">
        {(Object.keys(RANKING_METRIC_LABELS) as RankingMetric[]).map(
          (metric) => (
            <button
              key={metric}
              onClick={() => setSelectedMetric(metric)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                selectedMetric === metric
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {RANKING_METRIC_LABELS[metric]}
            </button>
          )
        )}
      </div>

      {/* 地域フィルタ */}
      <div className="mb-6 flex flex-wrap gap-4">
        <select
          value={selectedPref}
          onChange={(e) => {
            setSelectedPref(e.target.value);
            setSelectedArea("all");
          }}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="all">全国</option>
          {Object.entries(PREFECTURE_NAMES).map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>

        {selectedPref !== "all" && (
          <select
            value={selectedArea}
            onChange={(e) => setSelectedArea(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="all">全構想区域</option>
            {filteredAreas.map((a) => (
              <option key={a.code} value={a.code}>
                {a.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* 棒グラフ */}
      <div className="mb-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">
          {RANKING_METRIC_LABELS[selectedMetric]}{" "}
          {selectedPref !== "all"
            ? `${PREFECTURE_NAMES[selectedPref]}${selectedArea !== "all" ? ` / ${filteredAreas.find((a) => a.code === selectedArea)?.name || ""}` : ""}`
            : "全国"}{" "}
          上位{entries.length}病院
        </h2>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={Math.max(400, chartData.length * 30)}>
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 5, right: 30, left: 120, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis
                dataKey="name"
                type="category"
                width={120}
                tick={{ fontSize: 11 }}
              />
              <Tooltip
                content={({ payload }) => {
                  if (!payload || payload.length === 0) return null;
                  const data = payload[0]?.payload;
                  if (!data) return null;
                  return (
                    <div className="rounded border border-gray-200 bg-white p-3 text-sm shadow">
                      <p className="font-bold">{data.fullName}</p>
                      <p className="text-gray-500">
                        {data.pref} / {data.area}
                      </p>
                      <p className="mt-1 font-medium">
                        {data.value.toLocaleString()}件
                      </p>
                    </div>
                  );
                }}
              />
              <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="py-20 text-center text-gray-400">
            該当するデータがありません
          </p>
        )}
      </div>

      {/* テーブル */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">詳細テーブル</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="py-2 pr-4">順位</th>
                <th className="py-2 pr-4">病院名</th>
                <th className="py-2 pr-4">都道府県</th>
                <th className="py-2 pr-4">構想区域</th>
                <th className="py-2 text-right">
                  {RANKING_METRIC_LABELS[selectedMetric]}
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, i) => (
                <tr
                  key={entry.hospitalCode}
                  className="border-b border-gray-100 hover:bg-gray-50"
                >
                  <td className="py-2 pr-4 font-medium">{i + 1}</td>
                  <td className="py-2 pr-4">{entry.hospitalName}</td>
                  <td className="py-2 pr-4">
                    {PREFECTURE_NAMES[entry.prefecture] || entry.prefecture}
                  </td>
                  <td className="py-2 pr-4">{entry.areaName}</td>
                  <td className="py-2 text-right font-medium">
                    {entry.value.toLocaleString()}
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
