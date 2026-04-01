"use client";

import { useEffect, useState, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  ZAxis,
} from "recharts";
import { fetchAreaIndex, fetchAreaDetail, PREFECTURE_NAMES, PREFECTURE_LIST } from "@/lib/data";
import { FUNCTION_COLORS, FUNCTION_LABELS } from "@/types";
import type { Area, FunctionType } from "@/types";

interface AreaDetailData {
  code: string;
  name: string;
  prefecture: string;
  yearlyData: Record<
    string,
    {
      totalBeds: number;
      bedsByFunction: Record<FunctionType, number>;
      hospitals: {
        code: string;
        name: string;
        totalBeds: number;
        bedsByFunction: Record<FunctionType, number>;
        emergencyTransports: number;
        surgeriesGA: number;
      }[];
    }
  >;
}

export default function AreaPage() {
  const [areas, setAreas] = useState<Area[]>([]);
  const [selectedArea, setSelectedArea] = useState<string>("");
  const [selectedPref, setSelectedPref] = useState<string>("all");
  const [areaDetail, setAreaDetail] = useState<AreaDetailData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAreaIndex().then((data) => {
      setAreas(data);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (selectedArea) {
      fetchAreaDetail(selectedArea).then(setAreaDetail);
    }
  }, [selectedArea]);

  const filteredAreas = useMemo(
    () =>
      selectedPref === "all"
        ? areas
        : areas.filter((a) => a.prefecture === selectedPref),
    [areas, selectedPref]
  );

  const latestYear = areaDetail
    ? Object.keys(areaDetail.yearlyData).sort().pop()
    : null;
  const latestData = latestYear
    ? areaDetail?.yearlyData[latestYear]
    : null;

  // 病院別棒グラフデータ
  const hospitalBarData = useMemo(() => {
    if (!latestData) return [];
    return latestData.hospitals
      .sort((a, b) => b.totalBeds - a.totalBeds)
      .slice(0, 20)
      .map((h) => ({
        name: h.name.length > 12 ? h.name.slice(0, 12) + "..." : h.name,
        ...h.bedsByFunction,
      }));
  }, [latestData]);

  // 散布図データ
  const scatterData = useMemo(() => {
    if (!latestData) return [];
    return latestData.hospitals
      .filter((h) => h.totalBeds > 0)
      .map((h) => ({
        name: h.name,
        beds: h.totalBeds,
        emergency: h.emergencyTransports,
        surgeries: h.surgeriesGA,
      }));
  }, [latestData]);

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8">
        <p className="text-gray-500">データを読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="mb-2 text-2xl font-bold">構想区域別 詳細分析</h1>
      <p className="mb-6 text-sm text-gray-500">
        構想区域を選択して、区域内の病院ごとの機能別病床構成を比較
      </p>

      {/* フィルタ */}
      <div className="mb-6 flex flex-wrap gap-4">
        <select
          value={selectedPref}
          onChange={(e) => {
            setSelectedPref(e.target.value);
            setSelectedArea("");
            setAreaDetail(null);
          }}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="all">全都道府県</option>
          {PREFECTURE_LIST.map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>

        <select
          value={selectedArea}
          onChange={(e) => setSelectedArea(e.target.value)}
          className="min-w-[200px] rounded-md border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">構想区域を選択</option>
          {filteredAreas.map((a) => (
            <option key={a.code} value={a.code}>
              {a.name}（{PREFECTURE_NAMES[a.prefecture] || a.prefecture}）
            </option>
          ))}
        </select>
      </div>

      {!areaDetail && (
        <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-white">
          <p className="text-gray-400">構想区域を選択してください</p>
        </div>
      )}

      {areaDetail && latestData && (
        <>
          {/* 区域サマリー */}
          <div className="mb-6 grid gap-4 sm:grid-cols-4">
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-gray-500">区域名</p>
              <p className="text-lg font-bold">{areaDetail.name}</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-gray-500">総病床数</p>
              <p className="text-lg font-bold">
                {latestData.totalBeds.toLocaleString()}床
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-gray-500">病院数</p>
              <p className="text-lg font-bold">
                {latestData.hospitals.length}施設
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-gray-500">回復期比率</p>
              <p className="text-lg font-bold">
                {latestData.totalBeds > 0
                  ? (
                      (latestData.bedsByFunction.recovery /
                        latestData.totalBeds) *
                      100
                    ).toFixed(1)
                  : 0}
                %
              </p>
            </div>
          </div>

          {/* 病院別棒グラフ */}
          <div className="mb-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold">
              病院別 機能別病床構成（上位20施設）
            </h2>
            <ResponsiveContainer width="100%" height={Math.max(400, hospitalBarData.length * 30)}>
              <BarChart
                data={hospitalBarData}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(value: number, name: string) => [
                    `${value.toLocaleString()}床`,
                    FUNCTION_LABELS[name as FunctionType] || name,
                  ]}
                />
                <Legend
                  formatter={(value: string) =>
                    FUNCTION_LABELS[value as FunctionType] || value
                  }
                />
                {(Object.keys(FUNCTION_COLORS) as FunctionType[]).map((key) => (
                  <Bar
                    key={key}
                    dataKey={key}
                    stackId="a"
                    fill={FUNCTION_COLORS[key]}
                    name={key}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* 散布図 */}
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold">
              病床数 × 救急車搬送件数
            </h2>
            <ResponsiveContainer width="100%" height={400}>
              <ScatterChart margin={{ top: 20, right: 30, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  dataKey="beds"
                  name="病床数"
                  unit="床"
                />
                <YAxis
                  type="number"
                  dataKey="emergency"
                  name="救急車搬送"
                  unit="件"
                />
                <ZAxis
                  type="number"
                  dataKey="surgeries"
                  range={[20, 400]}
                  name="手術件数"
                />
                <Tooltip
                  formatter={(value: number, name: string) => {
                    const units: Record<string, string> = {
                      病床数: "床",
                      救急車搬送: "件",
                      手術件数: "件",
                    };
                    return [`${value.toLocaleString()}${units[name] || ""}`, name];
                  }}
                  labelFormatter={() => ""}
                  content={({ payload }) => {
                    if (!payload || payload.length === 0) return null;
                    const data = payload[0]?.payload;
                    if (!data) return null;
                    return (
                      <div className="rounded border border-gray-200 bg-white p-2 text-xs shadow">
                        <p className="font-bold">{data.name}</p>
                        <p>病床数: {data.beds.toLocaleString()}床</p>
                        <p>救急搬送: {data.emergency.toLocaleString()}件</p>
                        <p>手術件数: {data.surgeries.toLocaleString()}件</p>
                      </div>
                    );
                  }}
                />
                <Scatter data={scatterData} fill="#3b82f6" fillOpacity={0.6} />
              </ScatterChart>
            </ResponsiveContainer>
            <p className="mt-2 text-xs text-gray-400">
              バブルサイズは全身麻酔手術件数を表します
            </p>
          </div>
        </>
      )}
    </div>
  );
}
