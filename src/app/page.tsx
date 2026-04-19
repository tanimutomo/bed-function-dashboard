"use client";

import { useEffect, useState, useMemo } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { KpiCard } from "@/components/ui/kpi-card";
import { FunctionBarChart } from "@/components/charts/function-bar-chart";
import { FunctionPieChart } from "@/components/charts/function-pie-chart";
import { fetchNationalSummary, fetchPrefectureSummary, fetchPopulation, fetchHospitalReport, PREFECTURE_NAMES } from "@/lib/data";
import type { PopulationData, HospitalReportEntry } from "@/lib/data";
import type { NationalSummary, FunctionType } from "@/types";
import { FUNCTION_LABELS, FUNCTION_COLORS } from "@/types";

const JapanMap = dynamic(() => import("@/components/map/japan-map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[500px] items-center justify-center rounded-lg bg-gray-50">
      <p className="text-gray-400">地図を読み込み中...</p>
    </div>
  ),
});

export default function HomePage() {
  const [national, setNational] = useState<NationalSummary[]>([]);
  const [prefData, setPrefData] = useState<Record<string, NationalSummary[]>>({});
  const [selectedYear, setSelectedYear] = useState<string>("");
  const [mapMetric, setMapMetric] = useState<"recoveryRate" | "acuteRate" | "agingRate" | "utilizationRate" | "bedsPerCapita">("recoveryRate");
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
        // 病床機能データがある最新年度をデフォルトに
        const validYears = nat.filter(
          (d) => d.totalBeds > 0 && Object.values(d.bedsByFunction).some((v) => v > 0)
        );
        if (validYears.length > 0) {
          setSelectedYear(validYears[validYears.length - 1].year);
        }
        setLoading(false);
      }
    );
  }, []);

  // 地図用の都道府県データ（hookはearly returnの前に配置）
  const mapPrefData = useMemo(() => {
    const result: Record<string, { totalBeds: number; recoveryRate: number; acuteRate: number; agingRate: number; utilizationRate: number; bedsPerCapita: number }> = {};
    // 病院報告から利用率を取得（選択年度に近い年のデータ）
    const hrYears = Object.keys(hospReport).sort();
    const hrYear = hrYears.find(y => y === selectedYear) || hrYears[hrYears.length - 1];
    const hrData = hrYear ? hospReport[hrYear]?.prefectures : {};

    Object.entries(prefData).forEach(([code, years]) => {
      const yearData = years.find((y) => y.year === selectedYear) || years[years.length - 1];
      if (!yearData || yearData.totalBeds === 0) return;
      const total = yearData.totalBeds;
      const pop = popData[code];
      const hr = hrData?.[code];
      result[code] = {
        totalBeds: total,
        recoveryRate: (yearData.bedsByFunction.recovery / total) * 100,
        acuteRate:
          ((yearData.bedsByFunction.high_acute + yearData.bedsByFunction.acute) / total) * 100,
        agingRate: pop ? pop.agingRate : 0,
        utilizationRate: hr?.totalUtilization ?? 0,
        bedsPerCapita: pop && pop.totalPopulation > 0 ? (total / pop.totalPopulation) * 10000 : 0,
      };
    });
    return result;
  }, [prefData, selectedYear, popData, hospReport]);

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8">
        <p className="text-gray-500">データを読み込み中...</p>
      </div>
    );
  }

  const availableYears = national.filter(
    (d) => d.totalBeds > 0 && Object.values(d.bedsByFunction).some((v) => v > 0)
  );
  const selected = national.find((d) => d.year === selectedYear) || national[national.length - 1];
  if (!selected) return null;

  const totalBeds = selected.totalBeds;
  const acuteBeds = selected.bedsByFunction.high_acute + selected.bedsByFunction.acute;
  const acuteRate = ((acuteBeds / totalBeds) * 100).toFixed(1);

  // 都道府県別データを棒グラフ用に変換（選択年度）
  const prefBarData = Object.entries(prefData)
    .map(([code, years]) => {
      const yearData = years.find((y) => y.year === selectedYear) || years[years.length - 1];
      if (!yearData) return null;
      return {
        label: PREFECTURE_NAMES[code] || code,
        ...yearData.bedsByFunction,
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
      {/* ヒーロー */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
          病床機能報告ダッシュボード
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          厚労省オープンデータから、病床機能・人口動態・医療リソースを組み合わせて地域の医療を可視化
        </p>
      </div>

      {/* 何から見ますか? セクション (4カード) */}
      <section className="mb-10">
        <h2 className="mb-4 text-base font-semibold text-gray-700">何から見ますか?</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <HubCard
            title="自病院を調べる"
            description="病院カルテで診療実績・病床機能・職員構成を確認"
            icon="🏥"
            primaryHref="/hospital"
            primaryLabel="病院カルテ"
            subLinks={[{ href: "/ranking", label: "診療実績ランキング" }]}
            color="blue"
          />
          <HubCard
            title="地域の状況を知る"
            description="構想区域ごとの病床構成、他病院との比較、医療アクセス"
            icon="📍"
            primaryHref="/area"
            primaryLabel="構想区域"
            subLinks={[
              { href: "/", label: "全国俯瞰（下にスクロール）", isScroll: true },
            ]}
            color="blue"
          />
          <HubCard
            title="将来を予測する"
            description="2050年までの推計人口・患者数・医療介護需要指数"
            icon="🔮"
            primaryHref="/population"
            primaryLabel="人口動態・将来推計"
            subLinks={[{ href: "/trend", label: "経年トレンド" }]}
            color="blue"
          />
          <HubCard
            title="精神科を見る"
            description="630調査に基づく精神科医療の現状、病院別カルテ"
            icon="🧠"
            primaryHref="/psychiatric"
            primaryLabel="精神科ダッシュボード"
            subLinks={[{ href: "/psychiatric/hospitals", label: "精神科病院一覧" }]}
            color="amber"
          />
        </div>
      </section>

      {/* 全国俯瞰 */}
      <div id="overview" className="mb-6 flex items-center justify-between border-t border-gray-200 pt-8">
        <div>
          <h2 className="text-2xl font-bold">全国俯瞰</h2>
          <p className="mt-1 text-sm text-gray-500">
            {selected.year}年度 病床機能報告データ（{selected.totalHospitals.toLocaleString()}病院）
          </p>
        </div>
        <select
          value={selectedYear}
          onChange={(e) => setSelectedYear(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
        >
          {availableYears.map((d) => (
            <option key={d.year} value={d.year}>
              {d.year}年度
            </option>
          ))}
        </select>
      </div>

      {/* KPIカード */}
      <div className="grid gap-4 sm:grid-cols-4">
        <KpiCard label="総病床数" value={totalBeds} unit="床" />
        <KpiCard label="報告病院数" value={selected.totalHospitals} unit="施設" />
        <KpiCard
          label="急性期病床割合"
          value={acuteRate}
          unit="%"
          description="高度急性期 + 急性期"
        />
        <KpiCard
          label="回復期病床数"
          value={selected.bedsByFunction.recovery}
          unit="床"
        />
      </div>

      {/* 機能別内訳 */}
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">機能別病床数（全国）</h2>
          <FunctionPieChart data={selected.bedsByFunction} height={280} />
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
            {(Object.keys(FUNCTION_LABELS) as FunctionType[]).map((key) => (
              <div key={key} className="flex items-center gap-2">
                <span
                  className="inline-block h-3 w-3 rounded-full"
                  style={{ backgroundColor: FUNCTION_COLORS[key] }}
                />
                <span className="text-gray-600">{FUNCTION_LABELS[key]}</span>
                <span className="font-medium">
                  {selected.bedsByFunction[key].toLocaleString()}床
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

      {/* 都道府県別ヒートマップ */}
      <div className="mt-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">都道府県別ヒートマップ</h2>
          <div className="flex gap-2">
            {([
              ["recoveryRate", "回復期比率"],
              ["acuteRate", "急性期比率"],
              ["agingRate", "高齢化率"],
              ["utilizationRate", "病床利用率"],
              ["bedsPerCapita", "人口あたり病床数"],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setMapMetric(key)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  mapMetric === key
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <JapanMap
          prefectureData={mapPrefData}
          height={500}
          colorMetric={mapMetric}
        />
        <div className="mt-3 flex items-center justify-center gap-1 text-xs text-gray-500">
          <span>低い</span>
          {["#2563eb", "#60a5fa", "#a5f3fc", "#fde68a", "#fb923c", "#dc2626"].map((c) => (
            <span key={c} className="inline-block h-3 w-4 rounded" style={{ backgroundColor: c }} />
          ))}
          <span>高い</span>
        </div>
      </div>
    </div>
  );
}

interface HubCardProps {
  title: string;
  description: string;
  icon: string;
  primaryHref: string;
  primaryLabel: string;
  subLinks?: { href: string; label: string; isScroll?: boolean }[];
  color: "blue" | "amber";
}

function HubCard({
  title,
  description,
  icon,
  primaryHref,
  primaryLabel,
  subLinks,
  color,
}: HubCardProps) {
  const isAccent = color === "amber";
  const border = isAccent ? "border-amber-200 hover:border-amber-400" : "border-gray-200 hover:border-blue-400";
  const bg = isAccent ? "bg-amber-50" : "bg-white";
  const primaryText = isAccent ? "text-amber-700" : "text-blue-700";
  const primaryBg = isAccent
    ? "bg-amber-100 hover:bg-amber-200 text-amber-800"
    : "bg-blue-50 hover:bg-blue-100 text-blue-700";

  return (
    <div
      className={`group relative flex flex-col rounded-lg border ${border} ${bg} p-5 shadow-sm transition`}
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl" aria-hidden>
          {icon}
        </span>
        <div className="flex-1">
          <h3 className={`font-semibold ${primaryText}`}>{title}</h3>
          <p className="mt-1 text-xs leading-relaxed text-gray-600">{description}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-1.5">
        <Link
          href={primaryHref}
          className={`inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium ${primaryBg}`}
        >
          {primaryLabel} →
        </Link>
        {subLinks?.map((l) =>
          l.isScroll ? (
            <a
              key={l.label}
              href={"#overview"}
              className="text-center text-[11px] text-gray-500 underline hover:text-gray-700"
            >
              {l.label}
            </a>
          ) : (
            <Link
              key={l.href}
              href={l.href}
              className="text-center text-[11px] text-gray-500 underline hover:text-gray-700"
            >
              {l.label}
            </Link>
          ),
        )}
      </div>
    </div>
  );
}
