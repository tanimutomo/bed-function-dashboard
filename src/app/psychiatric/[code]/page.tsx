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
import { fetchHospitalDetail, fetch630Summary, PREFECTURE_NAMES } from "@/lib/data";

interface PrefData {
  prefCode: string;
  prefName: string;
  overview: { hospitals: number; beds: number };
  admissionTypes: { involuntary: number; medicalProtection: number; voluntary: number; total: number; openWard: number; closedWard: number };
  diseases: Record<string, number>;
  lengthOfStay: { under3months: number; months3to12: number; over1year: number; under3months_u65: number; under3months_o65: number; months3to12_u65: number; months3to12_o65: number; over1year_u65: number; over1year_o65: number };
  facility?: { protectionRooms: number; involuntaryPatients: number; medicalProtectionPatients: number };
}

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
    yearlyData: Record<string, { totalBeds: number; psychiatricBeds?: number }>;
  } | null>(null);
  const [prefData, setPrefData] = useState<PrefData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!code) return;
    Promise.all([
      fetchHospitalDetail(code).catch(() => null),
      fetch630Summary(),
    ]).then(([d, summary]) => {
      setDetail(d);
      if (d?.prefecture) {
        const pref = String(d.prefecture).padStart(2, "0");
        setPrefData(summary.prefectures[pref] || null);
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

      <p className="mt-6 text-xs text-gray-400">
        データ出典：厚生労働省「精神保健福祉資料（630調査）」令和7年度 / 医療情報ネット オープンデータ
      </p>
    </div>
  );
}
