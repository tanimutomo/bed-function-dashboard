"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { fetchHospitalDetail, fetch630Summary, fetchHospitalIndex, PREFECTURE_NAMES } from "@/lib/data";
import { FUNCTION_LABELS, FUNCTION_COLORS } from "@/types";
import type { FunctionType } from "@/types";
import HospitalMap from "@/components/map/hospital-map";
import type { HospitalMapItem } from "@/components/map/hospital-map";
import { FuturePopulationPanel } from "@/components/ui/future-population-panel";

interface FacilityData {
  hospitals: number;
  beds: number;
  permittedBeds: number;
  inpatients: number;
  protectionRooms: number;
  psychiatrists_ft: number;
  psychiatrists_pt: number;
  designated_psychiatrists_ft: number;
  nurses_ft: number;
  nurses_pt: number;
  asst_nurses_ft: number;
  asst_nurses_pt: number;
  nurse_aides_ft: number;
  nurse_aides_pt: number;
  pt_ft: number;
  pt_pt: number;
  ot_ft: number;
  ot_pt: number;
  psw_ft: number;
  psw_pt: number;
  psychologists_ft: number;
  psychologists_pt: number;
  medicalProtectionPatients: number;
  involuntaryPatients: number;
}

interface PrefData {
  prefCode: string;
  prefName: string;
  overview: { hospitals: number; beds: number };
  admissionTypes: { involuntary: number; medicalProtection: number; voluntary: number; total: number; openWard: number; closedWard: number };
  diseases: Record<string, number>;
  lengthOfStay: { under3months: number; months3to12: number; over1year: number; under3months_u65: number; under3months_o65: number; months3to12_u65: number; months3to12_o65: number; over1year_u65: number; over1year_o65: number };
  facility?: FacilityData;
}

const STAFF_630_LABELS: [string, string, string][] = [
  ["精神科医師", "psychiatrists_ft", "psychiatrists_pt"],
  ["うち精神保健指定医", "designated_psychiatrists_ft", ""],
  ["看護師", "nurses_ft", "nurses_pt"],
  ["准看護師", "asst_nurses_ft", "asst_nurses_pt"],
  ["看護補助者", "nurse_aides_ft", "nurse_aides_pt"],
  ["理学療法士", "pt_ft", "pt_pt"],
  ["作業療法士", "ot_ft", "ot_pt"],
  ["精神保健福祉士", "psw_ft", "psw_pt"],
  ["臨床心理技術者", "psychologists_ft", "psychologists_pt"],
];

const DISEASE_LABELS: Record<string, string> = {
  F0_dementia: "認知症 (F0)",
  F1_substance: "物質使用障害 (F1)",
  F2_schizophrenia: "統合失調症 (F2)",
  F3_mood: "気分障害 (F3)",
  F4_neurotic: "神経症 (F4)",
  F7_intellectual: "知的障害 (F7)",
};

const DISEASE_COLORS = ["#ef4444", "#f97316", "#3b82f6", "#22c55e", "#a855f7", "#06b6d4", "#6b7280"];

export default function PsychiatricDetailPage() {
  const params = useParams();
  const code = params.code as string;
  const [detail, setDetail] = useState<{
    code: string;
    name: string;
    prefecture: string;
    areaCode: string;
    areaName: string;
    lat?: number;
    lng?: number;
    yearlyData: Record<
      string,
      {
        totalBeds: number;
        psychiatricBeds?: number;
        newAdmissions?: number;
        inpatientDays?: number;
        bedUtilizationRate?: number | null;
        wards?: {
          wardName: string;
          functionType: string;
          futureFunctionType: string;
          beds: number;
          admissionFee: string;
        }[];
      }
    >;
  } | null>(null);
  const [prefData, setPrefData] = useState<PrefData | null>(null);
  const [prefPsychHospitals, setPrefPsychHospitals] = useState<
    { code: string; name: string; totalBeds: number; lat?: number; lng?: number }[]
  >([]);
  const [planningAreaCode, setPlanningAreaCode] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!code) return;
    Promise.all([
      fetchHospitalDetail(code).catch(() => null),
      fetch630Summary(),
      fetchHospitalIndex(),
    ]).then(([d, summary, allHospitals]) => {
      setDetail(d);
      if (d?.prefecture) {
        const pref = String(d.prefecture).padStart(2, "0");
        setPrefData(summary.prefectures[pref] || null);
        // 同じ都道府県の精神科病院を抽出
        const psych = allHospitals.filter(
          (h: { prefecture: string; psychiatricBeds?: number }) =>
            String(h.prefecture).padStart(2, "0") === pref && (h.psychiatricBeds || 0) > 0
        );
        setPrefPsychHospitals(psych);

        // 構想区域コードを解決:
        // 1) index から自院エントリ（一般病院として登録されていれば areaCode あり）
        // 2) 精神科専門病院は areaCode 未設定 → 緯度経度で同県内の最寄り一般病院から推定
        const selfInIndex = allHospitals.find((h: { code: string }) => h.code === code);
        let resolvedAreaCode = selfInIndex?.areaCode || "";
        if (!resolvedAreaCode && d.lat && d.lng) {
          const candidates = allHospitals.filter(
            (h: { prefecture: string; areaCode: string; lat?: number; lng?: number }) =>
              String(h.prefecture).padStart(2, "0") === pref &&
              h.areaCode &&
              h.lat != null &&
              h.lng != null
          );
          let nearest: typeof candidates[number] | null = null;
          let minDistSq = Infinity;
          for (const h of candidates) {
            const dLat = (h.lat as number) - (d.lat as number);
            const dLng = (h.lng as number) - (d.lng as number);
            const dSq = dLat * dLat + dLng * dLng;
            if (dSq < minDistSq) {
              minDistSq = dSq;
              nearest = h;
            }
          }
          if (nearest) resolvedAreaCode = nearest.areaCode;
        }
        if (resolvedAreaCode) {
          setPlanningAreaCode(resolvedAreaCode);
        }
      }
      setLoading(false);
    });
  }, [code]);

  const latestYear = detail
    ? Object.keys(detail.yearlyData || {}).sort().pop()
    : null;
  const latestData = latestYear ? detail?.yearlyData[latestYear] : null;

  const psychiatricBeds = latestData?.psychiatricBeds || latestData?.totalBeds || 0;

  // 都道府県の疾患分布
  const diseaseData = useMemo(() => {
    if (!prefData?.diseases) return [];
    const d = prefData.diseases;
    const keys = ["F2_schizophrenia", "F0_dementia", "F3_mood", "F1_substance", "F4_neurotic", "F7_intellectual"];
    const otherTotal = d.total - keys.reduce((s, k) => s + (d[k] || 0), 0);
    return [
      ...keys.map((k) => ({ name: DISEASE_LABELS[k] || k, value: d[k] || 0 })),
      { name: "その他", value: Math.max(0, otherTotal) },
    ].filter((item) => item.value > 0);
  }, [prefData]);

  // 在院期間（年齢別）
  const losAgeData = useMemo(() => {
    if (!prefData?.lengthOfStay) return [];
    const l = prefData.lengthOfStay;
    return [
      { period: "3ヶ月未満", "65歳未満": l.under3months_u65, "65歳以上": l.under3months_o65 },
      { period: "3〜12ヶ月", "65歳未満": l.months3to12_u65, "65歳以上": l.months3to12_o65 },
      { period: "1年以上", "65歳未満": l.over1year_u65, "65歳以上": l.over1year_o65 },
    ];
  }, [prefData]);

  // 地図用データ
  const mapHospitals: HospitalMapItem[] = useMemo(() => {
    return prefPsychHospitals
      .filter((h) => h.lat && h.lng)
      .map((h) => ({
        code: h.code,
        name: h.name,
        lat: h.lat!,
        lng: h.lng!,
        totalBeds: h.totalBeds,
        isSelf: h.code === code,
      }));
  }, [prefPsychHospitals, code]);

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8">
        <p className="text-gray-500">データを読み込み中...</p>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8">
        <p className="text-gray-500">病院が見つかりません</p>
        <Link href="/psychiatric" className="mt-2 inline-block text-sm text-amber-600 hover:underline">
          ← 精神科病院一覧に戻る
        </Link>
      </div>
    );
  }

  const admTypes = prefData?.admissionTypes;
  const admTotal = admTypes?.total || 1;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <Link href="/psychiatric" className="mb-4 inline-block text-sm text-amber-600 hover:underline">
        ← 精神科病院一覧に戻る
      </Link>

      {/* 基本情報 */}
      <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-6 shadow-sm">
        <h2 className="text-xl font-bold text-amber-900">{detail.name}</h2>
        <p className="mt-1 text-sm text-amber-700">
          {PREFECTURE_NAMES[detail.prefecture] || detail.prefecture}
          {detail.areaName && ` / ${detail.areaName}構想区域`}
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-amber-600">精神病床数</p>
            <p className="text-2xl font-bold text-amber-900">{psychiatricBeds.toLocaleString()}床</p>
          </div>
          <div>
            <p className="text-xs text-amber-600">総病床数</p>
            <p className="text-2xl font-bold text-amber-900">{(latestData?.totalBeds || 0).toLocaleString()}床</p>
          </div>
          <div>
            <p className="text-xs text-amber-600">精神病床比率</p>
            <p className="text-2xl font-bold text-amber-900">
              {latestData?.totalBeds
                ? ((psychiatricBeds / latestData.totalBeds) * 100).toFixed(0)
                : 0}%
            </p>
          </div>
        </div>
      </div>

      {/* 年間入院実績 (様式1 由来) */}
      {(() => {
        const yearsSorted = Object.keys(detail.yearlyData || {}).sort();
        const rows = yearsSorted
          .map((y) => {
            const yd = detail.yearlyData[y];
            return {
              year: y,
              newAdmissions: yd.newAdmissions || 0,
              inpatientDays: yd.inpatientDays || 0,
              bedUtilizationRate: yd.bedUtilizationRate ?? null,
              totalBeds: yd.totalBeds || 0,
            };
          })
          .filter((r) => r.newAdmissions > 0 || r.inpatientDays > 0);
        if (rows.length === 0) return null;
        const latest = rows[rows.length - 1];
        const avgLOS =
          latest.newAdmissions > 0 ? latest.inpatientDays / latest.newAdmissions : 0;
        return (
          <div className="mb-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-start justify-between gap-2">
              <div>
                <h3 className="text-lg font-semibold">年間入院実績</h3>
                <p className="mt-0.5 text-xs text-gray-500">
                  病床機能報告 様式1 年間データ (4月〜翌3月) から集計
                </p>
              </div>
              <span className="text-xs text-gray-400">最新: {latest.year}年度</span>
            </div>
            <div className="mb-4 grid gap-3 sm:grid-cols-4">
              <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                <p className="text-xs text-gray-500">新規入院患者数 (年間)</p>
                <p className="mt-1 text-xl font-bold text-gray-900">
                  {latest.newAdmissions.toLocaleString()}
                  <span className="ml-1 text-sm font-normal text-gray-500">人</span>
                </p>
              </div>
              <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                <p className="text-xs text-gray-500">延べ入院日数</p>
                <p className="mt-1 text-xl font-bold text-gray-900">
                  {latest.inpatientDays.toLocaleString()}
                  <span className="ml-1 text-sm font-normal text-gray-500">人日</span>
                </p>
              </div>
              <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                <p className="text-xs text-gray-500">病床利用率</p>
                <p className="mt-1 text-xl font-bold text-gray-900">
                  {latest.bedUtilizationRate != null
                    ? latest.bedUtilizationRate.toFixed(1)
                    : "-"}
                  {latest.bedUtilizationRate != null && (
                    <span className="ml-1 text-sm font-normal text-gray-500">%</span>
                  )}
                </p>
              </div>
              <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                <p className="text-xs text-gray-500">平均在院日数 (概算)</p>
                <p className="mt-1 text-xl font-bold text-gray-900">
                  {avgLOS > 0 ? avgLOS.toFixed(1) : "-"}
                  {avgLOS > 0 && (
                    <span className="ml-1 text-sm font-normal text-gray-500">日</span>
                  )}
                </p>
                <p className="mt-0.5 text-[11px] text-gray-400">
                  延べ入院日数 ÷ 新規入院患者数
                </p>
              </div>
            </div>
            {rows.length > 1 && (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-gray-500">
                      <th className="py-2 pr-4">年度</th>
                      <th className="py-2 pr-4 text-right">新規入院</th>
                      <th className="py-2 pr-4 text-right">延べ入院日数</th>
                      <th className="py-2 pr-4 text-right">病床利用率</th>
                      <th className="py-2 pr-4 text-right">平均在院日数</th>
                      <th className="py-2 text-right">総病床数</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const los =
                        r.newAdmissions > 0 ? r.inpatientDays / r.newAdmissions : 0;
                      return (
                        <tr key={r.year} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-2 pr-4 font-medium">{r.year}年度</td>
                          <td className="py-2 pr-4 text-right">{r.newAdmissions.toLocaleString()}</td>
                          <td className="py-2 pr-4 text-right">{r.inpatientDays.toLocaleString()}</td>
                          <td className="py-2 pr-4 text-right">
                            {r.bedUtilizationRate != null
                              ? `${r.bedUtilizationRate.toFixed(1)}%`
                              : "-"}
                          </td>
                          <td className="py-2 pr-4 text-right">
                            {los > 0 ? `${los.toFixed(1)}日` : "-"}
                          </td>
                          <td className="py-2 text-right text-gray-600">
                            {r.totalBeds.toLocaleString()}床
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-3 text-[11px] text-gray-400">
              ※ 外来患者数は病床機能報告の対象外のため本ダッシュボードでは未対応 (別データソースを調査中)
            </p>
          </div>
        );
      })()}

      {/* 病棟別詳細（病床機能報告 様式1 由来） */}
      {(() => {
        const wards = latestYear ? detail.yearlyData[latestYear]?.wards : undefined;
        if (!wards || wards.length === 0) return null;
        return (
          <div className="mb-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-start justify-between gap-2">
              <div>
                <h3 className="text-lg font-semibold">病棟別詳細</h3>
                <p className="mt-0.5 text-xs text-gray-500">
                  病床機能報告 様式1 より、病棟ごとの病床数・算定入院料
                </p>
              </div>
              <span className="text-xs text-gray-400">{latestYear}年度</span>
            </div>
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
                  {wards.map((ward, i) => (
                    <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-2 pr-4">{ward.wardName}</td>
                      <td className="py-2 pr-4">
                        <span
                          className="inline-block rounded px-2 py-0.5 text-xs font-medium text-white"
                          style={{
                            backgroundColor:
                              FUNCTION_COLORS[ward.functionType as FunctionType] || "#9ca3af",
                          }}
                        >
                          {FUNCTION_LABELS[ward.functionType as FunctionType] || ward.functionType}
                        </span>
                      </td>
                      <td className="py-2 pr-4">
                        <span
                          className="inline-block rounded px-2 py-0.5 text-xs font-medium text-white"
                          style={{
                            backgroundColor:
                              FUNCTION_COLORS[ward.futureFunctionType as FunctionType] || "#9ca3af",
                          }}
                        >
                          {FUNCTION_LABELS[ward.futureFunctionType as FunctionType] ||
                            ward.futureFunctionType}
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-right">{ward.beds.toLocaleString()}</td>
                      <td className="py-2 text-xs text-gray-500">
                        {/^\d+$/.test(ward.admissionFee) ? "-" : ward.admissionFee}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[11px] text-gray-400">
              ※ 「精神病棟入院基本料」「認知症治療病棟入院料」「精神療養病棟入院料」等が算定入院料欄に表示されます。病床機能報告に参加していない精神科専門病院は本表示の対象外です。
            </p>
          </div>
        );
      })()}

      {/* 地域の将来人口 + 精神疾患 入院患者数推計 — 所属構想区域の集計 */}
      <div className="mb-6">
        <FuturePopulationPanel
          areaCode={planningAreaCode || undefined}
          prefCode={String(detail.prefecture).padStart(2, "0")}
          diseaseCategory="psychiatric"
        />
      </div>

      {/* 都道府県の精神科医療データ */}
      {prefData && (
        <>
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-gray-800">
              {prefData.prefName}の精神科医療の状況
              <span className="ml-2 text-sm font-normal text-gray-400">630調査</span>
            </h3>
            <p className="text-xs text-gray-400 mt-1">
              施設別データは非公開のため、所在都道府県の統計を表示しています
            </p>
          </div>

          {/* 都道府県KPI */}
          <div className="mb-6 grid gap-4 sm:grid-cols-4">
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-gray-500">県内精神科病院</p>
              <p className="text-lg font-bold">{prefData.overview.hospitals}施設</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-gray-500">県内精神病床</p>
              <p className="text-lg font-bold">{prefData.overview.beds.toLocaleString()}床</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-gray-500">県内在院患者</p>
              <p className="text-lg font-bold">{admTypes?.total.toLocaleString()}人</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-gray-500">1年以上入院率</p>
              <p className="text-lg font-bold">
                {((prefData.lengthOfStay.over1year / admTotal) * 100).toFixed(1)}%
              </p>
            </div>
          </div>

          {/* 入院形態バー */}
          <div className="mb-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h4 className="mb-3 font-semibold">入院形態の内訳</h4>
            <div className="flex h-8 w-full overflow-hidden rounded-full">
              {admTypes && admTotal > 0 && (
                <>
                  <div
                    className="bg-green-500"
                    style={{ width: `${(admTypes.voluntary / admTotal) * 100}%` }}
                    title={`任意入院 ${admTypes.voluntary.toLocaleString()}人`}
                  />
                  <div
                    className="bg-orange-500"
                    style={{ width: `${(admTypes.medicalProtection / admTotal) * 100}%` }}
                    title={`医療保護入院 ${admTypes.medicalProtection.toLocaleString()}人`}
                  />
                  <div
                    className="bg-red-500"
                    style={{ width: `${(admTypes.involuntary / admTotal) * 100}%` }}
                    title={`措置入院 ${admTypes.involuntary.toLocaleString()}人`}
                  />
                </>
              )}
            </div>
            <div className="mt-2 flex gap-6 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500" />
                任意 {admTypes ? ((admTypes.voluntary / admTotal) * 100).toFixed(1) : 0}%
                ({admTypes?.voluntary.toLocaleString()})
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-orange-500" />
                医療保護 {admTypes ? ((admTypes.medicalProtection / admTotal) * 100).toFixed(1) : 0}%
                ({admTypes?.medicalProtection.toLocaleString()})
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" />
                措置 {admTypes ? ((admTypes.involuntary / admTotal) * 100).toFixed(1) : 0}%
                ({admTypes?.involuntary.toLocaleString()})
              </span>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* 疾患別 */}
            <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
              <h4 className="mb-4 font-semibold">在院患者の疾患構成</h4>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={diseaseData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={95}
                    dataKey="value"
                    nameKey="name"
                    isAnimationActive={false}
                  >
                    {diseaseData.map((_, i) => (
                      <Cell key={i} fill={DISEASE_COLORS[i % DISEASE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => value.toLocaleString() + "人"} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* 在院期間×年齢 */}
            <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
              <h4 className="mb-4 font-semibold">在院期間別患者数（年齢別）</h4>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={losAgeData} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="period" />
                  <YAxis tickFormatter={(v: number) => v.toLocaleString()} />
                  <Tooltip formatter={(value: number) => value.toLocaleString() + "人"} />
                  <Legend />
                  <Bar dataKey="65歳未満" stackId="a" fill="#3b82f6" isAnimationActive={false} />
                  <Bar dataKey="65歳以上" stackId="a" fill="#f59e0b" isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}

      {/* ===== 都道府県内シェア ===== */}
      {prefData && (
        <div className="mt-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="mb-1 text-lg font-semibold">都道府県内シェア</h3>
          <p className="mb-4 text-xs text-gray-400">
            {prefData.prefName}内の精神科医療におけるポジション
          </p>
          <div className="grid gap-4 sm:grid-cols-4">
            <div>
              <p className="text-xs text-gray-500">精神病床シェア</p>
              <p className="text-lg font-bold">
                {prefData.overview.beds > 0
                  ? ((psychiatricBeds / prefData.overview.beds) * 100).toFixed(2)
                  : 0}%
              </p>
              <p className="text-xs text-gray-400">
                {psychiatricBeds.toLocaleString()} / {prefData.overview.beds.toLocaleString()}床
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">県内精神科病院数</p>
              <p className="text-lg font-bold">{prefData.overview.hospitals}施設</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">県内病床利用率</p>
              <p className="text-lg font-bold">
                {prefData.facility && prefData.facility.beds > 0
                  ? ((prefData.facility.inpatients / prefData.facility.beds) * 100).toFixed(1)
                  : "-"}%
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">保護室・施錠可能個室</p>
              <p className="text-lg font-bold">
                {prefData.facility?.protectionRooms.toLocaleString() || "-"}室
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ===== 職員配置（都道府県） ===== */}
      {prefData?.facility && (
        <div className="mt-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="mb-1 text-lg font-semibold">精神科医療の職員配置</h3>
          <p className="mb-4 text-xs text-gray-400">
            {prefData.prefName}内の精神科病院合計（630調査）
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                  <th className="pb-2 pr-4">職種</th>
                  <th className="pb-2 pr-4 text-right">常勤</th>
                  <th className="pb-2 pr-4 text-right">非常勤</th>
                  <th className="pb-2 text-right">合計</th>
                </tr>
              </thead>
              <tbody>
                {STAFF_630_LABELS.map(([label, ftKey, ptKey]) => {
                  const fac = prefData.facility!;
                  const ft = (fac as unknown as Record<string, number>)[ftKey] || 0;
                  const pt = ptKey ? (fac as unknown as Record<string, number>)[ptKey] || 0 : 0;
                  const total = ft + pt;
                  const isIndent = label.startsWith("うち");
                  return (
                    <tr key={ftKey} className="border-b border-gray-100">
                      <td className={`py-2 pr-4 ${isIndent ? "pl-4 text-gray-500" : "font-medium"}`}>
                        {label}
                      </td>
                      <td className="py-2 pr-4 text-right">{ft.toLocaleString()}</td>
                      <td className="py-2 pr-4 text-right">{ptKey ? pt.toLocaleString() : "-"}</td>
                      <td className="py-2 text-right font-semibold">{ptKey ? total.toLocaleString() : "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===== 周辺精神科病院マップ ===== */}
      {mapHospitals.length > 1 && (
        <div className="mt-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="mb-1 text-lg font-semibold">周辺精神科病院マップ</h3>
          <p className="mb-4 text-xs text-gray-400">
            {prefData?.prefName || PREFECTURE_NAMES[detail?.prefecture || ""] || ""}内の精神科病院
            {mapHospitals.length}施設（濃青 = 当院、薄青 = 他院）
          </p>
          <HospitalMap hospitals={mapHospitals} selfCode={code} />
        </div>
      )}

      <p className="mt-6 text-xs text-gray-400">
        データ出典：厚生労働省「精神保健福祉資料（630調査）」令和7年度 / 医療情報ネット オープンデータ
      </p>
    </div>
  );
}
