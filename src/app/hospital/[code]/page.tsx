"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { fetchHospitalDetail, fetchAreaDetail, PREFECTURE_NAMES } from "@/lib/data";
import { FUNCTION_LABELS, FUNCTION_COLORS } from "@/types";
import type { FunctionType } from "@/types";

interface HospitalYearData {
  totalBeds: number;
  bedsByFunction: Record<FunctionType, number>;
  futureBedsByFunction: Record<FunctionType, number>;
  nurses: number;
  newAdmissions: number;
  surgeries: number;
  surgeriesGA: number;
  emergencyTransports: number;
  chemotherapy: number;
  radiotherapy: number;
  tpa: number;
  dialysis: number;
  rehab: number;
  wards: {
    wardName: string;
    functionType: string;
    futureFunctionType: string;
    beds: number;
    admissionFee: string;
  }[];
}

interface HospitalDetailData {
  code: string;
  name: string;
  areaCode: string;
  areaName: string;
  prefecture: string;
  yearlyData: Record<string, HospitalYearData>;
}

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
        chemotherapy: number;
      }[];
    }
  >;
}

export default function HospitalDetailPage() {
  const params = useParams();
  const code = params.code as string;
  const [detail, setDetail] = useState<HospitalDetailData | null>(null);
  const [areaDetail, setAreaDetail] = useState<AreaDetailData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!code) return;
    fetchHospitalDetail(code).then((d) => {
      setDetail(d);
      if (d.areaCode) {
        fetchAreaDetail(d.areaCode).then(setAreaDetail);
      }
      setLoading(false);
    });
  }, [code]);

  // 臨床データがある最新年度を使用
  const sortedYears = detail
    ? Object.keys(detail.yearlyData).sort()
    : [];
  const latestYear = sortedYears.length > 0 ? sortedYears[sortedYears.length - 1] : null;
  const latestData = latestYear ? detail?.yearlyData[latestYear] : null;

  const clinicalYear = sortedYears
    .slice()
    .reverse()
    .find((y) => {
      const d = detail?.yearlyData[y];
      if (!d) return false;
      const filledCount = [d.surgeriesGA, d.nurses, d.chemotherapy].filter((v) => v > 0).length;
      return filledCount >= 1;
    });
  const clinicalData = clinicalYear ? detail?.yearlyData[clinicalYear] : latestData;

  const areaAvg = useMemo(() => {
    if (!areaDetail || !clinicalYear) return null;
    const ayd = areaDetail.yearlyData[clinicalYear];
    if (!ayd || ayd.hospitals.length === 0) return null;
    const count = ayd.hospitals.length;
    const avgBeds = ayd.totalBeds / count;
    const avgEmergency =
      ayd.hospitals.reduce((s, h) => s + h.emergencyTransports, 0) / count;
    const avgSurgeries =
      ayd.hospitals.reduce((s, h) => s + h.surgeriesGA, 0) / count;
    const avgChemo =
      ayd.hospitals.reduce((s, h) => s + h.chemotherapy, 0) / count;
    return { avgBeds, avgEmergency, avgSurgeries, avgChemo };
  }, [areaDetail, clinicalYear]);

  const radarData = useMemo(() => {
    if (!clinicalData || clinicalData.totalBeds === 0) return [];
    const metrics = [
      { metric: "病床数", hospital: clinicalData.totalBeds, area: areaAvg?.avgBeds || 0 },
      { metric: "救急搬送", hospital: clinicalData.emergencyTransports, area: areaAvg?.avgEmergency || 0 },
      { metric: "手術件数", hospital: clinicalData.surgeriesGA, area: areaAvg?.avgSurgeries || 0 },
      { metric: "化学療法", hospital: clinicalData.chemotherapy, area: areaAvg?.avgChemo || 0 },
      { metric: "看護師数", hospital: clinicalData.nurses, area: 0 },
    ];
    const maxValues = metrics.map((m) => Math.max(m.hospital, m.area, 1));
    return metrics.map((m, i) => ({
      metric: m.metric,
      hospital: Math.round((m.hospital / maxValues[i]) * 100),
      area: Math.round((m.area / maxValues[i]) * 100),
      hospitalRaw: m.hospital,
      areaRaw: Math.round(m.area),
    }));
  }, [clinicalData, areaAvg]);

  const yearlyTrendData = useMemo(() => {
    if (!detail) return [];
    return sortedYears
      .filter((y) => {
        const d = detail.yearlyData[y];
        return d && d.totalBeds > 0 && Object.values(d.bedsByFunction).some((v) => v > 0);
      })
      .map((y) => {
        const d = detail.yearlyData[y];
        return {
          year: y,
          ...d.bedsByFunction,
        };
      });
  }, [detail, sortedYears]);

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8">
        <p className="text-gray-500">データを読み込み中...</p>
      </div>
    );
  }

  if (!detail || !latestData || !latestYear) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8">
        <p className="text-gray-500">病院が見つかりません</p>
        <Link href="/hospital" className="mt-2 inline-block text-sm text-blue-600 hover:underline">
          ← 病院一覧に戻る
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <Link href="/hospital" className="mb-4 inline-block text-sm text-blue-600 hover:underline">
        ← 病院一覧に戻る
      </Link>

      {/* 病院基本情報 */}
      <div className="mb-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold">{detail.name}</h2>
        <p className="mt-1 text-sm text-gray-500">
          {PREFECTURE_NAMES[detail.prefecture]} / {detail.areaName}構想区域
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-5">
          <div>
            <p className="text-xs text-gray-500">総病床数</p>
            <p className="text-lg font-bold">
              {latestData.totalBeds.toLocaleString()}床
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">救急搬送</p>
            <p className="text-lg font-bold">
              {(clinicalData?.emergencyTransports || 0).toLocaleString()}件
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">全身麻酔手術</p>
            <p className="text-lg font-bold">
              {(clinicalData?.surgeriesGA || 0).toLocaleString()}件
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">化学療法</p>
            <p className="text-lg font-bold">
              {(clinicalData?.chemotherapy || 0).toLocaleString()}件
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">看護師数</p>
            <p className="text-lg font-bold">
              {(clinicalData?.nurses || 0).toLocaleString()}人
            </p>
          </div>
        </div>
        {clinicalYear && clinicalYear !== latestYear && (
          <p className="mt-2 text-xs text-gray-400">
            診療実績は{clinicalYear}年度のデータを表示
          </p>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* レーダーチャート */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold">
            診療実績サマリー
            {areaAvg && (
              <span className="ml-2 text-sm font-normal text-gray-400">
                vs 区域平均
              </span>
            )}
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <RadarChart data={radarData}>
              <PolarGrid />
              <PolarAngleAxis dataKey="metric" tick={{ fontSize: 12 }} />
              <PolarRadiusAxis tick={false} axisLine={false} domain={[0, 100]} />
              <Radar
                name={detail.name}
                dataKey="hospital"
                stroke="#3b82f6"
                fill="#3b82f6"
                fillOpacity={0.3}
              />
              {areaAvg && (
                <Radar
                  name="区域平均"
                  dataKey="area"
                  stroke="#f97316"
                  fill="#f97316"
                  fillOpacity={0.1}
                />
              )}
              <Legend />
              <Tooltip
                formatter={(value: number, name: string, props: { payload?: { hospitalRaw?: number; areaRaw?: number; metric?: string } }) => {
                  const raw = name === detail.name
                    ? props.payload?.hospitalRaw
                    : props.payload?.areaRaw;
                  return [raw?.toLocaleString() || value, name];
                }}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* 機能別病床内訳 */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold">機能別病床構成</h3>
          <div className="space-y-3">
            {(Object.keys(FUNCTION_LABELS) as FunctionType[]).map((key) => {
              const current = latestData.bedsByFunction[key] || 0;
              const future = latestData.futureBedsByFunction[key] || 0;
              const total = latestData.totalBeds || 1;
              const pct = ((current / total) * 100).toFixed(1);
              return (
                <div key={key}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span
                        className="inline-block h-3 w-3 rounded-full"
                        style={{ backgroundColor: FUNCTION_COLORS[key] }}
                      />
                      {FUNCTION_LABELS[key]}
                    </span>
                    <span className="font-medium">
                      {current.toLocaleString()}床 ({pct}%)
                    </span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(current / total) * 100}%`,
                        backgroundColor: FUNCTION_COLORS[key],
                      }}
                    />
                  </div>
                  {future !== current && future > 0 && (
                    <p className="mt-0.5 text-xs text-gray-400">
                      6年後予定: {future.toLocaleString()}床
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 年度別病床推移 */}
      {yearlyTrendData.length > 1 && (
        <div className="mt-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold">機能別病床数の推移</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={yearlyTrendData} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="year" tickFormatter={(v: string) => `${v}年度`} />
              <YAxis />
              <Tooltip
                labelFormatter={(label: string) => `${label}年度`}
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
      )}

      {/* 病棟別テーブル */}
      <div className="mt-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-lg font-semibold">病棟別詳細</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="py-2 pr-4">病棟名</th>
                <th className="py-2 pr-4">現在の機能</th>
                <th className="py-2 pr-4">6年後予定</th>
                <th className="py-2 pr-4 text-right">病床数</th>
                <th className="py-2">算定入院料</th>
              </tr>
            </thead>
            <tbody>
              {latestData.wards.map((ward, i) => (
                <tr
                  key={i}
                  className="border-b border-gray-100 hover:bg-gray-50"
                >
                  <td className="py-2 pr-4">{ward.wardName}</td>
                  <td className="py-2 pr-4">
                    <span
                      className="inline-block rounded px-2 py-0.5 text-xs font-medium text-white"
                      style={{
                        backgroundColor:
                          FUNCTION_COLORS[
                            ward.functionType as FunctionType
                          ] || "#9ca3af",
                      }}
                    >
                      {FUNCTION_LABELS[ward.functionType as FunctionType] ||
                        ward.functionType}
                    </span>
                  </td>
                  <td className="py-2 pr-4">
                    <span
                      className="inline-block rounded px-2 py-0.5 text-xs font-medium text-white"
                      style={{
                        backgroundColor:
                          FUNCTION_COLORS[
                            ward.futureFunctionType as FunctionType
                          ] || "#9ca3af",
                      }}
                    >
                      {FUNCTION_LABELS[
                        ward.futureFunctionType as FunctionType
                      ] || ward.futureFunctionType}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-right">
                    {ward.beds.toLocaleString()}
                  </td>
                  <td className="py-2 text-xs text-gray-500">
                    {/^\d+$/.test(ward.admissionFee) ? "-" : ward.admissionFee}
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
