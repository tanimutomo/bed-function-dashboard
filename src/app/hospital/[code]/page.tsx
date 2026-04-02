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
  ScatterChart,
  Scatter,
  ZAxis,
  Cell,
  PieChart,
  Pie,
} from "recharts";
import { fetchHospitalDetail, fetchAreaDetail, fetchHospitalIndex, PREFECTURE_NAMES } from "@/lib/data";
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
  const [areaHospitalsFromIndex, setAreaHospitalsFromIndex] = useState<
    { code: string; name: string; totalBeds: number; bedsByFunction: Record<string, number> }[]
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!code) return;
    fetchHospitalDetail(code)
      .then((d) => {
        setDetail(d);
        if (d.areaCode) {
          // エリア詳細と病院インデックスを並行取得
          Promise.all([
            fetchAreaDetail(d.areaCode),
            fetchHospitalIndex(),
          ]).then(([area, idx]) => {
            setAreaDetail(area);
            // 同一構想区域の病院をインデックスから抽出（フォールバック用）
            // インデックスのareaCodeは個別JSONと異なる体系の場合がある
            // まず自院のインデックスエントリからareaCodeを取得し、それでマッチ
            const selfInIndex = idx.find((h: { code: string }) => h.code === code);
            const indexAreaCode = selfInIndex?.areaCode || d.areaCode;
            const sameArea = idx
              .filter((h: { areaCode: string }) => h.areaCode === indexAreaCode)
              .map((h: { code: string; name: string; totalBeds: number; bedsByFunction: Record<string, number> }) => ({
                code: h.code,
                name: h.name,
                totalBeds: h.totalBeds,
                bedsByFunction: h.bedsByFunction,
              }));
            setAreaHospitalsFromIndex(sameArea);
          });
        }
        setLoading(false);
      })
      .catch(() => {
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

  // エリアデータの最適年度を選択（bedsByFunctionが有効な年度を優先）
  const areaLatestYear = useMemo(() => {
    if (!areaDetail) return null;
    const areaYears = Object.keys(areaDetail.yearlyData).sort();
    if (areaYears.length === 0) return null;
    // bedsByFunctionが有効な最新年度を探す
    const yearWithBf = [...areaYears].reverse().find((y) => {
      const yd = areaDetail.yearlyData[y];
      return yd.hospitals.some((h: { bedsByFunction: Record<string, number> }) =>
        Object.values(h.bedsByFunction).some((v) => v > 0)
      );
    });
    return yearWithBf || areaYears[areaYears.length - 1];
  }, [areaDetail]);

  // ===== 1. 競合ポジショニングマップ =====
  const positioningData = useMemo(() => {
    // エリアデータからbfが有効か確認
    let sourceHospitals: { code: string; name: string; totalBeds: number; bedsByFunction: Record<string, number> }[] = [];
    let dataSource: "area" | "index" = "area";

    if (areaDetail && areaLatestYear) {
      const ayd = areaDetail.yearlyData[areaLatestYear];
      if (ayd) {
        const hasBf = ayd.hospitals.some((h: { bedsByFunction: Record<string, number> }) =>
          Object.values(h.bedsByFunction).some((v) => v > 0)
        );
        if (hasBf) {
          sourceHospitals = ayd.hospitals;
        }
      }
    }

    // エリアデータにbfがない場合、病院インデックスからフォールバック
    if (sourceHospitals.length === 0 && areaHospitalsFromIndex.length > 0) {
      sourceHospitals = areaHospitalsFromIndex;
      dataSource = "index";
    }

    if (sourceHospitals.length === 0) return { hospitals: [], self: null, dataSource };

    const hospitals = sourceHospitals
      .filter((h) => h.totalBeds > 0)
      .map((h) => {
        const bf = h.bedsByFunction;
        const total = h.totalBeds;
        const acuteVal = (bf.high_acute || 0) + (bf.acute || 0);
        const recoveryVal = bf.recovery || 0;
        const chronicVal = bf.chronic || 0;
        const funcTotal = acuteVal + recoveryVal + chronicVal;
        const base = funcTotal > 0 ? funcTotal : total;
        const acuteRatio = (acuteVal / base) * 100;
        const recoveryRatio = (recoveryVal / base) * 100;
        const chronicRatio = (chronicVal / base) * 100;
        return {
          code: h.code,
          hospitalName: h.name,
          totalBeds: total,
          acuteRatio: Math.round(acuteRatio * 10) / 10,
          recoveryRatio: Math.round(recoveryRatio * 10) / 10,
          chronicRatio: Math.round(chronicRatio * 10) / 10,
          isSelf: h.code === code,
        };
      });
    const self = hospitals.find((h) => h.isSelf) || null;
    return { hospitals, self, dataSource };
  }, [areaDetail, areaLatestYear, code, areaHospitalsFromIndex]);

  // ===== 2. 地域シェア分析 =====
  const shareData = useMemo(() => {
    if (!latestData) return null;

    // エリアデータまたはインデックスから病院リストを取得
    let areaHospitals: { code: string; name: string; totalBeds: number; bedsByFunction: Record<string, number> }[] = [];
    let usingAreaDetail = false;
    if (areaDetail && areaLatestYear) {
      const ayd = areaDetail.yearlyData[areaLatestYear];
      if (ayd) {
        const hasBf = ayd.hospitals.some((h: { bedsByFunction: Record<string, number> }) =>
          Object.values(h.bedsByFunction).some((v) => v > 0)
        );
        if (hasBf) {
          areaHospitals = ayd.hospitals;
          usingAreaDetail = true;
        }
      }
    }
    if (areaHospitals.length === 0 && areaHospitalsFromIndex.length > 0) {
      areaHospitals = areaHospitalsFromIndex;
    }
    if (areaHospitals.length === 0) return null;

    const areaTotal = areaHospitals.reduce((s, h) => s + h.totalBeds, 0);
    const areaBf: Record<string, number> = { high_acute: 0, acute: 0, recovery: 0, chronic: 0 };
    for (const h of areaHospitals) {
      for (const [k, v] of Object.entries(h.bedsByFunction)) {
        areaBf[k] = (areaBf[k] || 0) + v;
      }
    }
    const selfBf = latestData.bedsByFunction;

    // 機能別シェア
    const functionShares = (Object.keys(FUNCTION_LABELS) as FunctionType[]).map((key) => {
      const areaVal = areaBf[key] || 0;
      const selfVal = selfBf[key] || 0;
      const share = areaVal > 0 ? (selfVal / areaVal) * 100 : 0;
      return {
        function: key,
        label: FUNCTION_LABELS[key],
        selfBeds: selfVal,
        areaBeds: areaVal,
        share: Math.round(share * 10) / 10,
        color: FUNCTION_COLORS[key],
      };
    });

    // 総病床シェア
    const totalShare = areaTotal > 0 ? (latestData.totalBeds / areaTotal) * 100 : 0;

    // HHI（ハーフィンダール指数）: 総病床ベース
    const hhi = areaHospitals.reduce((sum, h) => {
      const s = areaTotal > 0 ? (h.totalBeds / areaTotal) * 100 : 0;
      return sum + s * s;
    }, 0);

    // 区域内順位（総病床数）
    const sorted = [...areaHospitals].sort((a, b) => b.totalBeds - a.totalBeds);
    const rank = sorted.findIndex((h) => h.code === code) + 1;

    // 診療実績シェア（エリアデータの年度を使う）
    // フォールバック（hospital index）使用時は個別病院の診療実績データがないため非表示
    let clinicalShares: { label: string; selfVal: number; areaVal: number; share: number }[] = [];
    if (usingAreaDetail && areaDetail && areaLatestYear) {
      // エリアデータ由来の病院リストを使っている場合のみ診療実績シェアを計算
      const clinicalAyd = areaDetail.yearlyData[areaLatestYear];
      const selfClinical = (detail?.yearlyData[areaLatestYear]) || clinicalData;
      if (clinicalAyd && clinicalAyd.hospitals.length > 1) {
        const totalEmergency = clinicalAyd.hospitals.reduce((s: number, h: { emergencyTransports: number }) => s + h.emergencyTransports, 0);
        const totalSurgery = clinicalAyd.hospitals.reduce((s: number, h: { surgeriesGA: number }) => s + h.surgeriesGA, 0);
        const totalChemo = clinicalAyd.hospitals.reduce((s: number, h: { chemotherapy: number }) => s + h.chemotherapy, 0);
        clinicalShares = [
          {
            label: "救急搬送",
            selfVal: selfClinical?.emergencyTransports || 0,
            areaVal: totalEmergency,
            share: totalEmergency > 0 ? Math.round(((selfClinical?.emergencyTransports || 0) / totalEmergency) * 1000) / 10 : 0,
          },
          {
            label: "全身麻酔手術",
            selfVal: selfClinical?.surgeriesGA || 0,
            areaVal: totalSurgery,
            share: totalSurgery > 0 ? Math.round(((selfClinical?.surgeriesGA || 0) / totalSurgery) * 1000) / 10 : 0,
          },
          {
            label: "化学療法",
            selfVal: selfClinical?.chemotherapy || 0,
            areaVal: totalChemo,
            share: totalChemo > 0 ? Math.round(((selfClinical?.chemotherapy || 0) / totalChemo) * 1000) / 10 : 0,
          },
        ];
      }
    }

    return {
      functionShares,
      totalShare: Math.round(totalShare * 10) / 10,
      hhi: Math.round(hhi),
      rank,
      totalHospitals: areaHospitals.length,
      clinicalShares,
    };
  }, [areaDetail, areaLatestYear, latestData, code, clinicalData, detail, areaHospitalsFromIndex]);

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
                      {Number(latestYear) + 6}年度予定: {future.toLocaleString()}床
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ===== 競合ポジショニングマップ ===== */}
      {positioningData.hospitals.length > 1 && (
        <div className="mt-6 rounded-lg border border-blue-200 bg-white p-6 shadow-sm">
          <h3 className="mb-1 text-lg font-semibold">
            競合ポジショニングマップ
          </h3>
          <p className="mb-4 text-xs text-gray-400">
            {detail.areaName}構想区域内の全{positioningData.hospitals.length}病院　|　X軸: 急性期比率　Y軸: 回復期比率　バブルサイズ: 総病床数
          </p>
          <ResponsiveContainer width="100%" height={400}>
            <ScatterChart margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                type="number"
                dataKey="acuteRatio"
                name="急性期比率"
                unit="%"
                domain={[0, 100]}
                tick={{ fontSize: 11 }}
                label={{ value: "急性期比率 (%)", position: "bottom", offset: 0, fontSize: 12 }}
              />
              <YAxis
                type="number"
                dataKey="recoveryRatio"
                name="回復期比率"
                unit="%"
                domain={[0, 100]}
                tick={{ fontSize: 11 }}
                label={{ value: "回復期比率 (%)", angle: -90, position: "insideLeft", offset: 10, fontSize: 12 }}
              />
              <ZAxis
                type="number"
                dataKey="totalBeds"
                range={[40, 800]}
                name="病床数"
              />
              <Tooltip
                cursor={{ strokeDasharray: "3 3" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.[0]) return null;
                  const d = payload[0].payload;
                  return (
                    <div className="rounded-lg border bg-white p-3 text-xs shadow-lg">
                      <p className="mb-1 font-bold">{d.hospitalName}</p>
                      <p>急性期: {d.acuteRatio}%　回復期: {d.recoveryRatio}%　慢性期: {d.chronicRatio}%</p>
                      <p>総病床数: {d.totalBeds.toLocaleString()}床</p>
                    </div>
                  );
                }}
              />
              <Scatter data={positioningData.hospitals} isAnimationActive={false}>
                {positioningData.hospitals.map((h, i) => (
                  <Cell
                    key={i}
                    fill={h.isSelf ? "#2563eb" : "#94a3b8"}
                    fillOpacity={h.isSelf ? 0.9 : 0.4}
                    stroke={h.isSelf ? "#1d4ed8" : "#cbd5e1"}
                    strokeWidth={h.isSelf ? 2 : 1}
                  />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
          {positioningData.self && (
            <div className="mt-3 flex flex-wrap gap-3 text-xs">
              <span className="rounded-full bg-blue-100 px-3 py-1 font-medium text-blue-800">
                {detail.name.slice(0, 15)}: 急性期 {positioningData.self.acuteRatio}% / 回復期 {positioningData.self.recoveryRatio}% / 慢性期 {positioningData.self.chronicRatio}%
              </span>
              <span className="rounded-full bg-gray-100 px-3 py-1 text-gray-600">
                灰色バブル = 同区域内の他院
              </span>
            </div>
          )}
        </div>
      )}

      {/* ===== 地域シェア分析 ===== */}
      {shareData && (
        <div className="mt-6 rounded-lg border border-green-200 bg-white p-6 shadow-sm">
          <h3 className="mb-1 text-lg font-semibold">
            地域シェア分析
          </h3>
          <p className="mb-4 text-xs text-gray-400">
            {detail.areaName}構想区域内でのポジション
          </p>

          {/* シェアKPI */}
          <div className="mb-6 grid gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
              <p className="text-xs text-gray-500">区域内順位</p>
              <p className="text-xl font-bold text-gray-900">
                {shareData.rank}<span className="text-sm font-normal text-gray-500">/{shareData.totalHospitals}施設</span>
              </p>
            </div>
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
              <p className="text-xs text-gray-500">総病床シェア</p>
              <p className="text-xl font-bold text-gray-900">{shareData.totalShare}%</p>
            </div>
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
              <p className="text-xs text-gray-500">地域集中度 (HHI)</p>
              <p className="text-xl font-bold text-gray-900">
                {shareData.hhi.toLocaleString()}
                <span className="ml-1 text-xs font-normal text-gray-500">
                  {shareData.hhi < 1500 ? "分散的" : shareData.hhi < 2500 ? "中程度" : "集中的"}
                </span>
              </p>
            </div>
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
              <p className="text-xs text-gray-500">区域内病院数</p>
              <p className="text-xl font-bold text-gray-900">{shareData.totalHospitals}施設</p>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* 機能別シェア */}
            <div>
              <h4 className="mb-3 text-sm font-semibold text-gray-700">機能別 病床シェア</h4>
              <div className="space-y-3">
                {shareData.functionShares.map((fs) => (
                  <div key={fs.function}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5">
                        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: fs.color }} />
                        {fs.label}
                      </span>
                      <span className="font-medium">
                        {fs.selfBeds.toLocaleString()} / {fs.areaBeds.toLocaleString()}床
                        <span className="ml-1 font-bold" style={{ color: fs.color }}>
                          ({fs.share}%)
                        </span>
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(fs.share, 100)}%`,
                          backgroundColor: fs.color,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 診療実績シェア */}
            {shareData.clinicalShares.length > 0 && (
              <div>
                <h4 className="mb-3 text-sm font-semibold text-gray-700">診療実績 シェア</h4>
                <div className="space-y-3">
                  {shareData.clinicalShares.map((cs) => (
                    <div key={cs.label}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span>{cs.label}</span>
                        <span className="font-medium">
                          {cs.selfVal.toLocaleString()} / {cs.areaVal.toLocaleString()}件
                          <span className="ml-1 font-bold text-blue-600">
                            ({cs.share}%)
                          </span>
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                        <div
                          className="h-full rounded-full bg-blue-500 transition-all"
                          style={{ width: `${Math.min(cs.share, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                {clinicalYear && clinicalYear !== latestYear && (
                  <p className="mt-2 text-xs text-gray-400">※ 診療実績は{clinicalYear}年度データ</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

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
                <th className="py-2 pr-4">{latestYear}年度</th>
                <th className="py-2 pr-4">{Number(latestYear) + 6}年度予定</th>
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
