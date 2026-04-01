"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { fetchHospitalIndex, fetch630Summary, PREFECTURE_NAMES, PREFECTURE_LIST } from "@/lib/data";

interface PsychHospital {
  code: string;
  name: string;
  prefecture: string;
  areaCode: string;
  areaName: string;
  totalBeds: number;
  psychiatricBeds: number;
}

interface PrefData {
  prefCode: string;
  prefName: string;
  overview: { hospitals: number; beds: number; psychiatricOnlyHospitals: number; psychiatricOnlyBeds: number };
  admissionTypes: { involuntary: number; medicalProtection: number; voluntary: number; total: number; openWard: number; closedWard: number };
  diseases: Record<string, number>;
  lengthOfStay: { under3months: number; months3to12: number; over1year: number };
}

interface SummaryData {
  national: PrefData;
  prefectures: Record<string, PrefData>;
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

const ADMISSION_COLORS = {
  voluntary: "#22c55e",
  medicalProtection: "#f97316",
  involuntary: "#ef4444",
};

const PAGE_SIZE = 50;

export default function PsychiatricPage() {
  const [hospitals, setHospitals] = useState<PsychHospital[]>([]);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPref, setSelectedPref] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(0);

  useEffect(() => {
    Promise.all([fetchHospitalIndex(), fetch630Summary()]).then(([idx, sum]) => {
      const psych = idx
        .filter((h: PsychHospital) => (h.psychiatricBeds || 0) > 0)
        .map((h: PsychHospital) => ({
          code: h.code,
          name: h.name,
          prefecture: h.prefecture,
          areaCode: h.areaCode,
          areaName: h.areaName,
          totalBeds: h.totalBeds,
          psychiatricBeds: h.psychiatricBeds || 0,
        }))
        .sort((a: PsychHospital, b: PsychHospital) => b.psychiatricBeds - a.psychiatricBeds);
      setHospitals(psych);
      setSummary(sum);
      setLoading(false);
    });
  }, []);

  const filtered = useMemo(() => {
    let list = hospitals;
    if (selectedPref !== "all") {
      list = list.filter((h) => h.prefecture === selectedPref);
    }
    if (searchQuery.length >= 2) {
      const q = searchQuery.toLowerCase();
      list = list.filter((h) => h.name.toLowerCase().includes(q));
    }
    return list;
  }, [hospitals, selectedPref, searchQuery]);

  useEffect(() => { setPage(0); }, [selectedPref, searchQuery]);

  const currentPrefData = useMemo(() => {
    if (!summary) return null;
    if (selectedPref === "all") return summary.national;
    return summary.prefectures[selectedPref] || null;
  }, [summary, selectedPref]);

  // 疾患別データ
  const diseaseChartData = useMemo(() => {
    if (!currentPrefData?.diseases) return [];
    const d = currentPrefData.diseases;
    const keys = ["F2_schizophrenia", "F0_dementia", "F3_mood", "F1_substance", "F4_neurotic", "F7_intellectual"];
    const otherTotal = d.total - keys.reduce((s, k) => s + (d[k] || 0), 0);
    return [
      ...keys.map((k) => ({ name: DISEASE_LABELS[k] || k, value: d[k] || 0 })),
      { name: "その他", value: Math.max(0, otherTotal) },
    ].filter((item) => item.value > 0);
  }, [currentPrefData]);

  // 入院形態データ
  const admissionChartData = useMemo(() => {
    if (!currentPrefData?.admissionTypes) return [];
    const a = currentPrefData.admissionTypes;
    return [
      { name: "任意入院", value: a.voluntary, color: ADMISSION_COLORS.voluntary },
      { name: "医療保護入院", value: a.medicalProtection, color: ADMISSION_COLORS.medicalProtection },
      { name: "措置入院", value: a.involuntary, color: ADMISSION_COLORS.involuntary },
    ].filter((item) => item.value > 0);
  }, [currentPrefData]);

  // 在院期間データ
  const losChartData = useMemo(() => {
    if (!currentPrefData?.lengthOfStay) return [];
    const l = currentPrefData.lengthOfStay;
    return [
      { name: "3ヶ月未満", value: l.under3months },
      { name: "3〜12ヶ月", value: l.months3to12 },
      { name: "1年以上", value: l.over1year },
    ];
  }, [currentPrefData]);

  // 都道府県別病床数ランキング
  const prefRanking = useMemo(() => {
    if (!summary) return [];
    return Object.entries(summary.prefectures)
      .map(([code, d]) => ({
        code,
        name: d.prefName,
        beds: d.overview.beds,
        hospitals: d.overview.hospitals,
        inpatients: d.admissionTypes.total,
      }))
      .sort((a, b) => b.beds - a.beds);
  }, [summary]);

  const pageCount = Math.ceil(filtered.length / PAGE_SIZE);
  const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8">
        <p className="text-gray-500">データを読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-amber-900">精神科医療</h1>
        <p className="mt-1 text-sm text-gray-500">
          630調査（精神保健福祉資料）に基づく精神科医療の現状
        </p>
      </div>

      {/* 都道府県選択 */}
      <div className="mb-6">
        <select
          value={selectedPref}
          onChange={(e) => setSelectedPref(e.target.value)}
          className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm"
        >
          <option value="all">全国</option>
          {PREFECTURE_LIST.map(([code, name]) => (
            <option key={code} value={code}>{name}</option>
          ))}
        </select>
      </div>

      {/* KPI */}
      {currentPrefData && (
        <div className="mb-8 grid gap-4 sm:grid-cols-5">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 shadow-sm">
            <p className="text-xs text-amber-600">精神科病院数</p>
            <p className="text-xl font-bold text-amber-900">
              {currentPrefData.overview.hospitals.toLocaleString()}
            </p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 shadow-sm">
            <p className="text-xs text-amber-600">精神病床数</p>
            <p className="text-xl font-bold text-amber-900">
              {currentPrefData.overview.beds.toLocaleString()}床
            </p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 shadow-sm">
            <p className="text-xs text-amber-600">在院患者数</p>
            <p className="text-xl font-bold text-amber-900">
              {currentPrefData.admissionTypes.total.toLocaleString()}人
            </p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 shadow-sm">
            <p className="text-xs text-amber-600">病床利用率</p>
            <p className="text-xl font-bold text-amber-900">
              {currentPrefData.overview.beds > 0
                ? ((currentPrefData.admissionTypes.total / currentPrefData.overview.beds) * 100).toFixed(1)
                : 0}%
            </p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 shadow-sm">
            <p className="text-xs text-amber-600">1年以上入院</p>
            <p className="text-xl font-bold text-amber-900">
              {currentPrefData.admissionTypes.total > 0
                ? ((currentPrefData.lengthOfStay.over1year / currentPrefData.admissionTypes.total) * 100).toFixed(1)
                : 0}%
            </p>
          </div>
        </div>
      )}

      {/* チャートエリア */}
      <div className="mb-8 grid gap-6 lg:grid-cols-3">
        {/* 疾患別 */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold">疾患別構成</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={diseaseChartData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={90}
                dataKey="value"
                nameKey="name"
                isAnimationActive={false}
              >
                {diseaseChartData.map((_, i) => (
                  <Cell key={i} fill={DISEASE_COLORS[i % DISEASE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value: number) => value.toLocaleString() + "人"} />
              <Legend formatter={(value: string) => value} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* 入院形態 */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold">入院形態</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={admissionChartData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={90}
                dataKey="value"
                nameKey="name"
                isAnimationActive={false}
              >
                {admissionChartData.map((item, i) => (
                  <Cell key={i} fill={item.color} />
                ))}
              </Pie>
              <Tooltip formatter={(value: number) => value.toLocaleString() + "人"} />
              <Legend formatter={(value: string) => value} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* 在院期間 */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold">在院期間</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={losChartData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v: number) => v.toLocaleString()} />
              <Tooltip formatter={(value: number) => value.toLocaleString() + "人"} />
              <Bar dataKey="value" fill="#f59e0b" radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 都道府県別ランキング（全国表示時） */}
      {selectedPref === "all" && (
        <div className="mb-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold">都道府県別 精神病床数</h3>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart
              data={prefRanking.slice(0, 20)}
              margin={{ top: 5, right: 30, left: 50, bottom: 5 }}
              layout="vertical"
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis dataKey="name" type="category" width={60} tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(value: number, name: string) => [
                  value.toLocaleString() + (name === "beds" ? "床" : name === "inpatients" ? "人" : ""),
                  name === "beds" ? "病床数" : name === "inpatients" ? "在院患者" : name,
                ]}
              />
              <Legend formatter={(v: string) => (v === "beds" ? "病床数" : v === "inpatients" ? "在院患者" : v)} />
              <Bar dataKey="beds" fill="#f59e0b" name="beds" isAnimationActive={false} />
              <Bar dataKey="inpatients" fill="#d97706" name="inpatients" isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 病院一覧 */}
      <div className="rounded-lg border border-amber-200 bg-white shadow-sm">
        <div className="border-b border-amber-100 px-6 py-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-amber-900">
              精神科病院一覧（{filtered.length.toLocaleString()}施設）
            </h3>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="病院名で検索..."
              className="w-64 rounded-md border border-amber-300 px-3 py-1.5 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-amber-100 bg-amber-50 text-left text-amber-700">
                <th className="px-4 py-3">病院名</th>
                <th className="px-4 py-3">都道府県</th>
                <th className="px-4 py-3 text-right">精神病床</th>
                <th className="px-4 py-3 text-right">総病床数</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {pageItems.map((h) => (
                <tr key={h.code} className="border-b border-amber-50 hover:bg-amber-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/psychiatric/${h.code}`}
                      className="font-medium text-amber-700 hover:underline"
                    >
                      {h.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {PREFECTURE_NAMES[h.prefecture] || h.prefecture}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-amber-900">
                    {h.psychiatricBeds.toLocaleString()}床
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500">
                    {h.totalBeds.toLocaleString()}床
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/psychiatric/${h.code}`}
                      className="rounded bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100"
                    >
                      詳細 →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pageCount > 1 && (
          <div className="flex items-center justify-between border-t border-amber-100 px-4 py-3">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="rounded border border-amber-300 px-3 py-1 text-sm disabled:opacity-40"
            >
              前へ
            </button>
            <span className="text-sm text-gray-500">{page + 1} / {pageCount}</span>
            <button
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={page >= pageCount - 1}
              className="rounded border border-amber-300 px-3 py-1 text-sm disabled:opacity-40"
            >
              次へ
            </button>
          </div>
        )}
      </div>

      <p className="mt-4 text-xs text-gray-400">
        データ出典：厚生労働省「精神保健福祉資料（630調査）」令和7年度 / 医療情報ネット オープンデータ
      </p>
    </div>
  );
}
