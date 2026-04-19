"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
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
import { KpiCard } from "@/components/ui/kpi-card";
import {
  PopulationTrendChart,
  type PopulationTrendPoint,
} from "@/components/charts/population-trend-chart";
import {
  PatientForecastChart,
  type PatientForecastPoint,
} from "@/components/charts/patient-forecast-chart";
import {
  DemandIndexChart,
  type DemandIndexPoint,
} from "@/components/charts/demand-index-chart";
import {
  fetchPopulationFuture,
  fetchPopulationFutureAreas,
  fetchJmapIndex,
  fetchMedicalResources,
  fetchKaigoResources,
  fetchNationalSummary,
  fetchPrefectureSummary,
  fetchHospitalReport,
  fetch630Summary,
  PREFECTURE_LIST,
  PREFECTURE_NAMES,
  type PopulationFutureData,
  type PopulationFutureAreasData,
  type PopulationFutureYear,
  type JmapIndexData,
  type MedicalResourcesData,
  type MedicalResourceEntry,
  type KaigoResourcesData,
  type KaigoResourceEntry,
  type HospitalReportEntry,
} from "@/lib/data";
import {
  fetchUtilizationRates,
  forecastPatientSeries,
  type UtilizationRates,
} from "@/lib/patient-forecast";
import type { NationalSummary } from "@/types";

type Tab = "dashboard" | "psychiatric";

// 精神科ページから流用
interface PsychPrefData {
  prefCode: string;
  prefName: string;
  overview: { hospitals: number; beds: number; psychiatricOnlyHospitals: number; psychiatricOnlyBeds: number };
  admissionTypes: { involuntary: number; medicalProtection: number; voluntary: number; total: number; openWard: number; closedWard: number };
  diseases: Record<string, number>;
  lengthOfStay: { under3months: number; months3to12: number; over1year: number };
}
interface PsychSummary {
  national: PsychPrefData;
  prefectures: Record<string, PsychPrefData>;
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

/** scope は "national" / "pref:<code>" / "area:<code>" 形式 */
type Scope = string;

function toTrendPoints(years: Record<string, PopulationFutureYear>): PopulationTrendPoint[] {
  return Object.entries(years)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([year, y]) => {
      const over75 = y.over75 ?? 0;
      const over65to74 = Math.max(0, y.over65 - over75);
      return {
        year,
        under15: y.under15,
        age15_64: y.age15_64,
        over65to74,
        over75,
      };
    });
}

function formatPct(value: number, digits = 1): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}`;
}

export default function PopulationPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-7xl px-4 py-8">
          <p className="text-gray-500">データを読み込み中...</p>
        </div>
      }
    >
      <PopulationPageInner />
    </Suspense>
  );
}

function PopulationPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  // URL query: ?scope=area:<code> or pref:<code> or national
  //            &disease=<category>
  //            &tab=dashboard | psychiatric
  const initialScope: Scope = searchParams.get("scope") ?? "national";
  const initialDisease = searchParams.get("disease") ?? "overall";
  const initialTab: Tab = searchParams.get("tab") === "psychiatric" ? "psychiatric" : "dashboard";

  const [data, setData] = useState<PopulationFutureData | null>(null);
  const [areaData, setAreaData] = useState<PopulationFutureAreasData | null>(null);
  const [rates, setRates] = useState<UtilizationRates | null>(null);
  const [jmap, setJmap] = useState<JmapIndexData | null>(null);
  const [resources, setResources] = useState<MedicalResourcesData | null>(null);
  const [kaigo, setKaigo] = useState<KaigoResourcesData | null>(null);
  // 経年トレンド用
  const [nationalBedSummary, setNationalBedSummary] = useState<NationalSummary[]>([]);
  const [prefBedSummary, setPrefBedSummary] = useState<Record<string, NationalSummary[]>>({});
  const [hospReport, setHospReport] = useState<
    Record<string, { national: HospitalReportEntry; prefectures: Record<string, HospitalReportEntry> }>
  >({});
  // 精神科用
  const [psychSummary, setPsychSummary] = useState<PsychSummary | null>(null);
  const [scope, setScope] = useState<Scope>(initialScope);
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  // area: scope の場合は、その構想区域の都道府県を初期フィルタにする
  const [areaPrefFilter, setAreaPrefFilter] = useState<string>("");
  const [forecastKind, setForecastKind] = useState<"inpatient" | "outpatient">("inpatient");
  const [forecastCategory, setForecastCategory] = useState<string>(initialDisease);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetchPopulationFuture(),
      fetchPopulationFutureAreas(),
      fetchUtilizationRates(),
      fetchJmapIndex().catch(() => null),
      fetchMedicalResources().catch(() => null),
      fetchKaigoResources().catch(() => null),
      fetchNationalSummary().catch(() => []),
      fetchPrefectureSummary().catch(() => ({})),
      fetchHospitalReport().catch(() => ({ source: "", years: {} })),
      fetch630Summary().catch(() => null),
    ])
      .then(([d, a, r, j, res, kai, natBeds, prefBeds, hr, psych]) => {
        setData(d);
        setAreaData(a);
        setRates(r);
        setJmap(j);
        setResources(res);
        setKaigo(kai);
        setNationalBedSummary(natBeds);
        setPrefBedSummary(prefBeds);
        setHospReport(hr.years ?? {});
        setPsychSummary(psych);
        // area スコープの場合は、対応する都道府県をフィルタに設定
        if (initialScope.startsWith("area:")) {
          const code = initialScope.slice(5);
          const pref = a.areas[code]?.prefecture;
          if (pref) setAreaPrefFilter(pref);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
    // 依存は空配列: 初期化は1度だけ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // タブ切替時にURL同期
  const switchTab = (tab: Tab) => {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams.toString());
    if (tab === "psychiatric") params.set("tab", "psychiatric");
    else params.delete("tab");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const selected = useMemo(() => {
    if (!data) return null;
    if (scope === "national") {
      return { name: "全国", years: data.national.years };
    }
    if (scope.startsWith("pref:")) {
      const code = scope.slice(5);
      const pref = data.prefectures[code];
      return pref ?? null;
    }
    if (scope.startsWith("area:") && areaData) {
      const code = scope.slice(5);
      const area = areaData.areas[code];
      if (!area) return null;
      const prefName = PREFECTURE_NAMES[area.prefecture] ?? "";
      return {
        name: `${prefName} ${area.name}構想区域`,
        years: area.years,
      };
    }
    return null;
  }, [data, areaData, scope]);

  const trendPoints = useMemo(() => {
    if (!selected) return [];
    return toTrendPoints(selected.years);
  }, [selected]);

  // 医療リソース (都道府県/全国のみ)
  const resourceEntry: MedicalResourceEntry | null = useMemo(() => {
    if (!resources) return null;
    if (scope === "national") return resources.national;
    if (scope.startsWith("pref:")) {
      return resources.prefectures[scope.slice(5)] ?? null;
    }
    if (scope.startsWith("area:") && areaData) {
      // 構想区域スコープ時は所属都道府県のリソースを参考表示
      const code = scope.slice(5);
      const pref = areaData.areas[code]?.prefecture;
      if (pref) return resources.prefectures[pref] ?? null;
    }
    return null;
  }, [resources, scope, areaData]);
  const resourceScopeIsArea = scope.startsWith("area:");

  // 介護リソース (都道府県単位のみ。構想区域時は所属都道府県の値を流用)
  const kaigoEntry: KaigoResourceEntry | null = useMemo(() => {
    if (!kaigo) return null;
    if (scope === "national") return kaigo.national;
    if (scope.startsWith("pref:")) {
      return kaigo.prefectures[scope.slice(5)] ?? null;
    }
    if (scope.startsWith("area:") && areaData) {
      const code = scope.slice(5);
      const pref = areaData.areas[code]?.prefecture;
      if (pref) return kaigo.prefectures[pref] ?? null;
    }
    return null;
  }, [kaigo, scope, areaData]);

  // 経年トレンド用: スコープに応じた都道府県コード or null(全国)
  const trendPrefCode: string | null = useMemo(() => {
    if (scope === "national") return null;
    if (scope.startsWith("pref:")) return scope.slice(5);
    if (scope.startsWith("area:") && areaData) {
      const code = scope.slice(5);
      const pref = areaData.areas[code]?.prefecture;
      return pref ?? null;
    }
    return null;
  }, [scope, areaData]);

  // 精神科データ (都道府県 or 全国)
  const psychData: PsychPrefData | null = useMemo(() => {
    if (!psychSummary) return null;
    if (!trendPrefCode) return psychSummary.national;
    return psychSummary.prefectures[trendPrefCode] ?? null;
  }, [psychSummary, trendPrefCode]);

  const psychDiseaseChart = useMemo(() => {
    if (!psychData?.diseases) return [];
    const d = psychData.diseases;
    const keys = ["F2_schizophrenia", "F0_dementia", "F3_mood", "F1_substance", "F4_neurotic", "F7_intellectual"];
    const otherTotal = (d.total || 0) - keys.reduce((s, k) => s + (d[k] || 0), 0);
    return [
      ...keys.map((k) => ({ name: DISEASE_LABELS[k] || k, value: d[k] || 0 })),
      { name: "その他", value: Math.max(0, otherTotal) },
    ].filter((i) => i.value > 0);
  }, [psychData]);

  const psychAdmissionChart = useMemo(() => {
    if (!psychData?.admissionTypes) return [];
    const a = psychData.admissionTypes;
    return [
      { name: "任意入院", value: a.voluntary, color: ADMISSION_COLORS.voluntary },
      { name: "医療保護入院", value: a.medicalProtection, color: ADMISSION_COLORS.medicalProtection },
      { name: "措置入院", value: a.involuntary, color: ADMISSION_COLORS.involuntary },
    ].filter((i) => i.value > 0);
  }, [psychData]);

  const psychLosChart = useMemo(() => {
    if (!psychData?.lengthOfStay) return [];
    const l = psychData.lengthOfStay;
    return [
      { name: "3ヶ月未満", value: l.under3months },
      { name: "3〜12ヶ月", value: l.months3to12 },
      { name: "1年以上", value: l.over1year },
    ];
  }, [psychData]);

  // 経年トレンド用データ: 病床機能の時系列
  const trendBedData = useMemo(() => {
    const raw = trendPrefCode ? (prefBedSummary[trendPrefCode] ?? []) : nationalBedSummary;
    return raw.filter(
      (d) => d.totalBeds > 0 && Object.values(d.bedsByFunction).some((v) => v > 0),
    );
  }, [trendPrefCode, nationalBedSummary, prefBedSummary]);

  // 都道府県・全国の75歳以上人口を取得（75+1千人あたりの介護施設数を計算するため）
  const over75PopForResources: number = useMemo(() => {
    if (!data) return 0;
    if (scope === "national") return data.national.years["2020"]?.over75 ?? 0;
    if (scope.startsWith("pref:")) {
      const code = scope.slice(5);
      return data.prefectures[code]?.years["2020"]?.over75 ?? 0;
    }
    if (scope.startsWith("area:") && areaData) {
      const code = scope.slice(5);
      const pref = areaData.areas[code]?.prefecture;
      if (pref) return data.prefectures[pref]?.years["2020"]?.over75 ?? 0;
    }
    return 0;
  }, [data, scope, areaData]);

  // JMAP 医療・介護需要予測指数
  const demandIndexPoints: DemandIndexPoint[] = useMemo(() => {
    if (!jmap) return [];
    let years: Record<string, { medicalIndex: number; nursingCareIndex: number }> | null = null;
    if (scope === "national") {
      years = jmap.national.years;
    } else if (scope.startsWith("pref:")) {
      const code = scope.slice(5);
      years = jmap.prefectures[code]?.years ?? null;
    } else if (scope.startsWith("area:")) {
      const code = scope.slice(5);
      years = jmap.areas[code]?.years ?? null;
    }
    if (!years) return [];
    return Object.entries(years)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([year, y]) => ({
        year,
        medicalIndex: y.medicalIndex,
        nursingCareIndex: y.nursingCareIndex,
      }));
  }, [jmap, scope]);

  // 将来患者数推計
  const forecastSeries = useMemo(() => {
    if (!selected || !rates) return null;
    const active =
      forecastCategory === "overall"
        ? rates.overall
        : rates.diseases[forecastCategory];
    if (!active) return null;
    return forecastPatientSeries(selected.years, active);
  }, [selected, rates, forecastCategory]);

  const forecastPoints: PatientForecastPoint[] = useMemo(() => {
    if (!forecastSeries) return [];
    return Object.entries(forecastSeries)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([year, f]) => {
        const byAge = forecastKind === "inpatient" ? f.inpatientByAge : f.outpatientByAge;
        return {
          year,
          under15: Math.round(byAge.under15),
          age15_64: Math.round(byAge.age15_64),
          age65_74: Math.round(byAge.age65_74),
          over75: Math.round(byAge.over75),
        };
      });
  }, [forecastSeries, forecastKind]);

  // 都道府県レベルでデータが揃っているものだけをセレクタに出す
  const availablePrefs = useMemo(() => {
    if (!data) return [];
    return PREFECTURE_LIST.filter(
      ([code]) => Object.keys(data.prefectures[code]?.years ?? {}).length > 0
    );
  }, [data]);

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8">
        <p className="text-gray-500">データを読み込み中...</p>
      </div>
    );
  }

  if (!data || !selected) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8">
        <p className="text-gray-500">将来推計人口データがありません。</p>
      </div>
    );
  }

  const years = Object.keys(selected.years).sort();
  const base = selected.years[years[0]];
  const end = selected.years[years[years.length - 1]];
  const hasData = !!base && !!end;

  // 変化率
  let totalChange = 0;
  let over75Change = 0;
  let workingAgeChange = 0;
  let endAgingRate = 0;
  let endOver75Rate = 0;

  if (hasData) {
    totalChange = base.total > 0 ? ((end.total - base.total) / base.total) * 100 : 0;
    const baseOver75 = base.over75 ?? 0;
    const endOver75 = end.over75 ?? 0;
    over75Change = baseOver75 > 0 ? ((endOver75 - baseOver75) / baseOver75) * 100 : 0;
    workingAgeChange =
      base.age15_64 > 0 ? ((end.age15_64 - base.age15_64) / base.age15_64) * 100 : 0;
    endAgingRate = end.agingRate;
    endOver75Rate = end.over75Rate ?? 0;
  }

  // 全国以外の選択かつトレンドポイントが空 = データ未取り込み
  const showSkeleton = scope !== "national" && trendPoints.length === 0;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">地域ダッシュボード</h1>
          <p className="mt-1 text-sm text-gray-500">
            都道府県または構想区域を選択して、人口動態・医療資源・将来推計・経年トレンドを一画面で確認
          </p>
          <p className="mt-0.5 text-xs text-gray-400">
            基準年 {data.baseYear} 年 / 推計期間 {years[0] ?? "-"}〜
            {years[years.length - 1] ?? "-"} 年
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* 都道府県セレクタ */}
          <select
            value={scope.startsWith("pref:") ? scope : scope === "national" ? "national" : ""}
            onChange={(e) => {
              setScope(e.target.value || "national");
              setAreaPrefFilter("");
            }}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="national">全国</option>
            {availablePrefs.map(([code, name]) => (
              <option key={code} value={`pref:${code}`}>
                {name}
              </option>
            ))}
          </select>

          {/* 構想区域セレクタ */}
          <select
            value={areaPrefFilter}
            onChange={(e) => {
              setAreaPrefFilter(e.target.value);
              if (!e.target.value) setScope("national");
            }}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">構想区域でみる…</option>
            {PREFECTURE_LIST.map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
          {areaPrefFilter && areaData && (
            <select
              value={scope.startsWith("area:") ? scope : ""}
              onChange={(e) => setScope(e.target.value || "national")}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">構想区域を選択</option>
              {Object.entries(areaData.areas)
                .filter(([, a]) => a.prefecture === areaPrefFilter)
                .sort((a, b) => a[1].name.localeCompare(b[1].name, "ja"))
                .map(([code, a]) => (
                  <option key={code} value={`area:${code}`}>
                    {a.name}
                  </option>
                ))}
            </select>
          )}
        </div>
      </div>

      {/* タブ切替 */}
      <div className="mb-6 flex items-end gap-1 border-b border-gray-200">
        <button
          onClick={() => switchTab("dashboard")}
          className={`rounded-t-md px-4 py-2 text-sm font-medium transition ${
            activeTab === "dashboard"
              ? "border-b-2 border-blue-600 bg-blue-50 text-blue-900"
              : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
          }`}
        >
          地域ダッシュボード
        </button>
        <button
          onClick={() => switchTab("psychiatric")}
          className={`rounded-t-md px-4 py-2 text-sm font-medium transition ${
            activeTab === "psychiatric"
              ? "border-b-2 border-blue-600 bg-blue-50 text-blue-900"
              : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
          }`}
        >
          精神科医療
          <span className="ml-1.5 text-[10px] text-gray-400">別データソース (630調査)</span>
        </button>
      </div>

      {activeTab === "dashboard" && (
        <>
      {/* 解説 */}
      <div className="mb-6 rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
        <p className="font-medium">なぜ人口動態が経営戦略に重要か</p>
        <p className="mt-1 text-blue-800">
          医療需要は年齢構成に強く依存します。特に
          <span className="font-semibold">75歳以上人口</span>
          は一人当たりの受療率（入院・外来）が顕著に高く、その増減が病床需要の中長期見通しに直結します。
          生産年齢人口（15〜64歳）の減少は一方で医療人材の確保難易度を上げる要因になります。
        </p>
      </div>

      {/* セクション目次 */}
      <nav className="mb-8 flex flex-wrap gap-2 rounded-md border border-gray-200 bg-gray-50 p-3 text-xs">
        <span className="mr-1 font-medium text-gray-500">セクション:</span>
        <a href="#section-demand" className="rounded bg-white px-2 py-1 text-gray-700 hover:bg-blue-50 hover:text-blue-700">
          🎯 需要と将来予測
        </a>
        <a href="#section-supply" className="rounded bg-white px-2 py-1 text-gray-700 hover:bg-blue-50 hover:text-blue-700">
          🏥 医療・介護リソース
        </a>
        <a href="#section-detail" className="rounded bg-white px-2 py-1 text-gray-700 hover:bg-blue-50 hover:text-blue-700">
          📊 詳細な年次データ
        </a>
        <a href="#section-history" className="rounded bg-white px-2 py-1 text-gray-700 hover:bg-blue-50 hover:text-blue-700">
          📈 経年の変化
        </a>
      </nav>

      {showSkeleton ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
          <p className="font-medium">都道府県別データはまだ取り込まれていません。</p>
          <p className="mt-2">
            次のいずれかを実行してください:
          </p>
          <ul className="mt-2 list-disc pl-6">
            <li>
              IPSS 公式サイトから「都道府県別 総人口・年齢3区分別」詳細表を
              <code className="mx-1 rounded bg-amber-100 px-1">data/raw/ipss/</code>
              に配置し、<code className="mx-1 rounded bg-amber-100 px-1">python scripts/preprocess_ipss.py</code>
              を実行
            </li>
            <li>
              または <code className="mx-1 rounded bg-amber-100 px-1">data/raw/ipss/ipss_manual.csv</code>
              （prefCode,year,total,under15,age15_64,over65,over75）を用意して同スクリプトを実行
            </li>
          </ul>
          <p className="mt-2 text-xs">
            全国データは IPSS 令和5年推計の公開集計値で事前シードしています。
          </p>
        </div>
      ) : (
        <>
          {/* ===== Section 1: 地域の需要と将来予測 ===== */}
          <div id="section-demand" className="mb-4 border-b-2 border-blue-500 pb-2">
            <h2 className="text-xl font-bold text-gray-900">
              🎯 地域の需要と将来予測
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              人口構成の変化と、それが生み出す医療需要・患者数の将来見通し
            </p>
          </div>

          {/* KPI */}
          <div className="mb-6 grid gap-4 sm:grid-cols-4">
            <KpiCard
              label={`総人口 ${years[years.length - 1]} 年`}
              value={end.total.toLocaleString()}
              unit="人"
              description={`${years[0]} 年比 ${formatPct(totalChange)}%`}
            />
            <KpiCard
              label={`75歳以上人口 ${years[years.length - 1]} 年`}
              value={(end.over75 ?? 0).toLocaleString()}
              unit="人"
              description={`${years[0]} 年比 ${formatPct(over75Change)}%（医療需要への直接的インパクト）`}
            />
            <KpiCard
              label={`生産年齢人口 ${years[years.length - 1]} 年`}
              value={end.age15_64.toLocaleString()}
              unit="人"
              description={`${years[0]} 年比 ${formatPct(workingAgeChange)}%（医療人材の供給基盤）`}
            />
            <KpiCard
              label={`高齢化率 ${years[years.length - 1]} 年`}
              value={endAgingRate.toFixed(1)}
              unit="%"
              description={`うち75歳以上 ${endOver75Rate.toFixed(1)}%`}
            />
          </div>

          {/* トレンドチャート */}
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold">
              人口構成の推移
              {scope !== "national" && selected && ` - ${selected.name}`}
            </h2>
            <PopulationTrendChart data={trendPoints} height={420} />
            <p className="mt-3 text-xs text-gray-400">
              ※ 年齢区分は「0〜14歳」「15〜64歳」「65〜74歳（前期高齢）」「75歳以上（後期高齢）」。
              75歳以上は一人当たり入院受療率が他の年齢層より顕著に高く、病床需要の中核指標です。
            </p>
          </div>

          {/* 医療・介護需要予測指数 (JMAP) */}
          {demandIndexPoints.length > 0 && (() => {
            const last = demandIndexPoints[demandIndexPoints.length - 1];
            const peakMed = demandIndexPoints.reduce((a, b) =>
              b.medicalIndex > a.medicalIndex ? b : a
            );
            const peakNur = demandIndexPoints.reduce((a, b) =>
              b.nursingCareIndex > a.nursingCareIndex ? b : a
            );
            return (
              <div className="mt-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-semibold">
                      医療・介護需要予測指数
                      {scope !== "national" && selected && ` - ${selected.name}`}
                    </h2>
                    <p className="mt-1 text-xs text-gray-400">
                      日本医師会 JMAP 方式（2020年=100）/ 年齢階級別の重み付けで医療・介護需要の相対変化を指数化
                    </p>
                  </div>
                </div>

                <div className="mb-4 grid gap-3 sm:grid-cols-4">
                  <div className="rounded-md border border-blue-200 bg-blue-50 p-3">
                    <p className="text-xs text-blue-900">{last.year}年 医療需要指数</p>
                    <p className="mt-1 text-2xl font-bold text-gray-900">
                      {last.medicalIndex.toFixed(1)}
                      <span className={`ml-2 text-sm ${last.medicalIndex > 100 ? "text-red-600" : "text-blue-600"}`}>
                        ({last.medicalIndex > 100 ? "+" : ""}{(last.medicalIndex - 100).toFixed(1)})
                      </span>
                    </p>
                    <p className="mt-0.5 text-[11px] text-blue-700">ピーク: {peakMed.year}年 {peakMed.medicalIndex.toFixed(1)}</p>
                  </div>
                  <div className="rounded-md border border-red-200 bg-red-50 p-3">
                    <p className="text-xs text-red-900">{last.year}年 介護需要指数</p>
                    <p className="mt-1 text-2xl font-bold text-gray-900">
                      {last.nursingCareIndex.toFixed(1)}
                      <span className={`ml-2 text-sm ${last.nursingCareIndex > 100 ? "text-red-600" : "text-blue-600"}`}>
                        ({last.nursingCareIndex > 100 ? "+" : ""}{(last.nursingCareIndex - 100).toFixed(1)})
                      </span>
                    </p>
                    <p className="mt-0.5 text-[11px] text-red-700">ピーク: {peakNur.year}年 {peakNur.nursingCareIndex.toFixed(1)}</p>
                  </div>
                  <div className="col-span-2 rounded-md border border-gray-200 bg-gray-50 p-3">
                    <p className="text-xs text-gray-500">算出式</p>
                    <p className="mt-1 text-[11px] text-gray-700 leading-relaxed">
                      医療需要 = 0-14×0.6 + 15-39×0.4 + 40-64×1.0 + 65-74×<span className="font-semibold">2.3</span> + 75+×<span className="font-semibold">3.9</span>
                    </p>
                    <p className="mt-0.5 text-[11px] text-gray-700 leading-relaxed">
                      介護需要 = 40-64×1.0 + 65-74×9.7 + 75+×<span className="font-semibold text-red-600">87.3</span>
                    </p>
                  </div>
                </div>

                <DemandIndexChart data={demandIndexPoints} height={340} />

                <p className="mt-3 text-xs text-gray-400">
                  ※ 医療需要は高齢化でゆるやかに上昇する一方、介護需要は75歳以上の急増で大きく伸びる傾向。
                  指数が100を下回る場合は、総人口減少が年齢構成変化を上回って需要そのものが縮小することを意味します。
                </p>
              </div>
            );
          })()}

          {/* 将来患者数推計 */}
          {rates && forecastPoints.length > 0 && (() => {
            const firstYear = forecastPoints[0];
            const lastYear = forecastPoints[forecastPoints.length - 1];
            const firstTotal = firstYear.under15 + firstYear.age15_64 + firstYear.age65_74 + firstYear.over75;
            const lastTotal = lastYear.under15 + lastYear.age15_64 + lastYear.age65_74 + lastYear.over75;
            const changePct = firstTotal > 0 ? ((lastTotal - firstTotal) / firstTotal) * 100 : 0;
            const over75Share = lastTotal > 0 ? (lastYear.over75 / lastTotal) * 100 : 0;
            return (
              <div className="mt-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">
                      将来患者数推計
                      {scope !== "national" && selected && ` - ${selected.name}`}
                    </h2>
                    <p className="mt-1 text-xs text-gray-400">
                      IPSS推計人口 × 令和5年患者調査の年齢階級別受療率で算出（1日あたり推計人数）
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {/* 入院/外来 切替 */}
                    <div className="flex rounded-md border border-gray-200 p-0.5">
                      {(["inpatient", "outpatient"] as const).map((k) => (
                        <button
                          key={k}
                          onClick={() => setForecastKind(k)}
                          className={`rounded px-3 py-1 text-xs font-medium transition ${
                            forecastKind === k
                              ? "bg-blue-600 text-white"
                              : "text-gray-600 hover:bg-gray-50"
                          }`}
                        >
                          {k === "inpatient" ? "入院" : "外来"}
                        </button>
                      ))}
                    </div>
                    {/* カテゴリ切替 */}
                    <select
                      value={forecastCategory}
                      onChange={(e) => setForecastCategory(e.target.value)}
                      className="rounded-md border border-gray-300 px-3 py-1 text-xs"
                    >
                      <option value="overall">全体</option>
                      {Object.entries(rates.diseases).map(([key, d]) => (
                        <option key={key} value={key}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* KPI */}
                <div className="mb-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                    <p className="text-xs text-gray-500">{lastYear.year}年 推計{forecastKind === "inpatient" ? "入院" : "外来"}患者数（1日）</p>
                    <p className="mt-1 text-xl font-bold text-gray-900">
                      {Math.round(lastTotal).toLocaleString()}
                      <span className="ml-1 text-sm font-normal text-gray-500">人</span>
                    </p>
                    <p className={`mt-0.5 text-xs ${changePct > 0 ? "text-red-600" : changePct < 0 ? "text-blue-600" : "text-gray-500"}`}>
                      {firstYear.year}年比 {formatPct(changePct)}%
                    </p>
                  </div>
                  <div className="rounded-md border border-red-200 bg-red-50 p-3">
                    <p className="text-xs text-gray-500">うち75歳以上（後期高齢）</p>
                    <p className="mt-1 text-xl font-bold text-gray-900">
                      {Math.round(lastYear.over75).toLocaleString()}
                      <span className="ml-1 text-sm font-normal text-gray-500">人</span>
                    </p>
                    <p className="mt-0.5 text-xs text-gray-600">
                      構成比 {over75Share.toFixed(1)}%
                    </p>
                  </div>
                  <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                    <p className="text-xs text-gray-500">使用受療率</p>
                    <p className="mt-1 text-sm text-gray-700">
                      {forecastCategory === "overall"
                        ? "全疾病合計（令和5年患者調査）"
                        : rates.diseases[forecastCategory]?.label ?? ""}
                    </p>
                    <p className="mt-0.5 text-[11px] text-gray-400">
                      年齢階級別 × 推計人口で算出
                    </p>
                  </div>
                </div>

                <PatientForecastChart data={forecastPoints} height={380} kind={forecastKind} />
                <p className="mt-3 text-xs text-gray-400">
                  ※ 受療率は全国値を使用（都道府県別受療率は年齢構成を除くと差分が小さいため）。
                  経営の粗い見通しとしては有用ですが、地域固有の病床構造や患者流出入は別途考慮が必要です。
                </p>
              </div>
            );
          })()}

          {/* ===== Section 2: 地域の医療・介護リソース (現状) ===== */}
          <div id="section-supply" className="mb-4 mt-14 border-b-2 border-blue-500 pb-2">
            <h2 className="text-xl font-bold text-gray-900">
              🏥 地域の医療・介護リソース（現状）
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              医師・医療施設・介護施設の供給量。需要に対して供給は足りているか、不足しているかの判定材料
            </p>
          </div>

          {/* 医療・介護リソース (現時点) */}
          {resourceEntry && (
            <div className="mt-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold">
                    医療・介護リソース
                    {scope !== "national" && selected && ` - ${resourceScopeIsArea && areaData && scope.startsWith("area:") ? (PREFECTURE_NAMES[areaData.areas[scope.slice(5)]?.prefecture ?? ""] ?? "") : selected.name}`}
                  </h2>
                  <p className="mt-1 text-xs text-gray-400">
                    医師・歯科医師・薬剤師 (R4 2022年末) / 医療施設 (R5 2023年)
                    {resourceScopeIsArea && " ※構想区域別データは無いため、所属都道府県の値を表示"}
                  </p>
                </div>
              </div>

              <div className="mb-4 rounded-md border border-blue-100 bg-blue-50 p-3 text-xs text-blue-900">
                <span className="font-medium">このセクションで見えるもの：</span>
                現時点の「医療の供給力」。医師や医療機関の <strong>人口10万対の密度</strong> を全国平均と比較し、
                医師確保の難易度、診療所アクセス、近隣病院との競合・連携ポテンシャルを把握します。
              </div>

              {/* 人的リソース */}
              <h3 className="mb-2 text-sm font-medium text-gray-700">人的リソース (人口10万対)</h3>
              <div className="mb-5 grid gap-3 sm:grid-cols-3">
                <ResourceBox
                  label="医師"
                  total={resourceEntry.personnel.physiciansTotal}
                  per100k={resourceEntry.personnelPer100k.physiciansPer100k}
                  national={resources?.national.personnelPer100k.physiciansPer100k ?? 0}
                  unit="人"
                />
                <ResourceBox
                  label="歯科医師"
                  total={resourceEntry.personnel.dentistsTotal}
                  per100k={resourceEntry.personnelPer100k.dentistsPer100k}
                  national={resources?.national.personnelPer100k.dentistsPer100k ?? 0}
                  unit="人"
                />
                <ResourceBox
                  label="薬剤師"
                  total={resourceEntry.personnel.pharmacistsTotal}
                  per100k={resourceEntry.personnelPer100k.pharmacistsPer100k}
                  national={resources?.national.personnelPer100k.pharmacistsPer100k ?? 0}
                  unit="人"
                />
              </div>

              {/* 施設 */}
              <h3 className="mb-2 text-sm font-medium text-gray-700">医療施設 (人口10万対)</h3>
              <div className="grid gap-3 sm:grid-cols-4">
                <ResourceBox
                  label="病院"
                  total={resourceEntry.facilities.hospital}
                  per100k={resourceEntry.facilitiesPer100k.hospitalPer100k}
                  national={resources?.national.facilitiesPer100k.hospitalPer100k ?? 0}
                  unit="施設"
                />
                <ResourceBox
                  label="精神科病院"
                  total={resourceEntry.facilities.psychiatricHospital}
                  per100k={resourceEntry.facilitiesPer100k.psychiatricHospitalPer100k}
                  national={resources?.national.facilitiesPer100k.psychiatricHospitalPer100k ?? 0}
                  unit="施設"
                />
                <ResourceBox
                  label="一般診療所"
                  total={resourceEntry.facilities.clinic}
                  per100k={resourceEntry.facilitiesPer100k.clinicPer100k}
                  national={resources?.national.facilitiesPer100k.clinicPer100k ?? 0}
                  unit="施設"
                />
                <ResourceBox
                  label="歯科診療所"
                  total={resourceEntry.facilities.dentalClinic}
                  per100k={resourceEntry.facilitiesPer100k.dentalClinicPer100k}
                  national={resources?.national.facilitiesPer100k.dentalClinicPer100k ?? 0}
                  unit="施設"
                />
              </div>

              <p className="mt-3 text-xs text-gray-400">
                ※ 全国値は <strong>人口10万対</strong> で比較。全国平均より低い値は青、高い値は赤で表示。
              </p>

              {/* 自動生成される示唆 */}
              {(() => {
                const insights = buildMedicalInsights(resourceEntry, resources?.national);
                if (insights.length === 0) return null;
                return (
                  <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-4">
                    <p className="mb-2 text-xs font-semibold text-amber-900">
                      💡 この地域の特徴
                    </p>
                    <ul className="space-y-1 text-xs text-amber-900">
                      {insights.map((ins, i) => (
                        <li key={i} className="flex gap-1.5">
                          <span>・</span>
                          <span>{ins}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })()}
            </div>
          )}

          {/* 介護リソース (令和5年 介護サービス施設・事業所調査) */}
          {kaigoEntry && kaigo && (() => {
            // 75+ 1千人あたりの施設数 (JMAP風指標)
            const nat75 = data.national.years["2020"]?.over75 ?? 0;
            const natPer1k = (metric: number) =>
              nat75 > 0 ? (metric / (nat75 / 1000)) : 0;
            const localPer1k = (metric: number) =>
              over75PopForResources > 0 ? (metric / (over75PopForResources / 1000)) : 0;

            return (
              <div className="mt-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-semibold">
                      介護保険施設 (入所系)
                      {scope !== "national" && selected && ` - ${resourceScopeIsArea && areaData && scope.startsWith("area:") ? (PREFECTURE_NAMES[areaData.areas[scope.slice(5)]?.prefecture ?? ""] ?? "") : selected.name}`}
                    </h2>
                    <p className="mt-1 text-xs text-gray-400">
                      {kaigo.source} / 施設数は75歳以上1千人あたりで全国平均と比較
                      {resourceScopeIsArea && " ※構想区域別データは無いため、所属都道府県の値を表示"}
                    </p>
                  </div>
                </div>

                <div className="mb-4 rounded-md border border-blue-100 bg-blue-50 p-3 text-xs text-blue-900">
                  <span className="font-medium">このセクションで見えるもの：</span>
                  <strong>退院後の受け皿</strong>の供給量。入所系介護保険施設が手薄な地域は、
                  医療上は退院可能でも行き先が無く、療養病床や長期入院で病床を埋める要因に。
                  75歳以上1千人あたりで比較することで高齢人口に対する実効供給を見ます。
                </div>

                <div className="grid gap-3 sm:grid-cols-4">
                  <KaigoBox
                    label="介護老人福祉施設 (特養)"
                    total={kaigoEntry.facilities.specialCare}
                    per1k={localPer1k(kaigoEntry.facilities.specialCare)}
                    national={natPer1k(kaigo.national.facilities.specialCare)}
                  />
                  <KaigoBox
                    label="介護老人保健施設 (老健)"
                    total={kaigoEntry.facilities.healthCare}
                    per1k={localPer1k(kaigoEntry.facilities.healthCare)}
                    national={natPer1k(kaigo.national.facilities.healthCare)}
                  />
                  <KaigoBox
                    label="介護医療院"
                    total={kaigoEntry.facilities.medicalCare}
                    per1k={localPer1k(kaigoEntry.facilities.medicalCare)}
                    national={natPer1k(kaigo.national.facilities.medicalCare)}
                  />
                  <KaigoBox
                    label="3施設合計"
                    total={kaigoEntry.facilities.total}
                    per1k={localPer1k(kaigoEntry.facilities.total)}
                    national={natPer1k(kaigo.national.facilities.total)}
                    highlight
                  />
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                    <p className="text-xs text-gray-500">特養 定員</p>
                    <p className="mt-1 text-xl font-bold text-gray-900">
                      {kaigoEntry.specialCareCapacity.toLocaleString()}
                      <span className="ml-1 text-sm font-normal text-gray-500">人</span>
                    </p>
                    <p className="mt-0.5 text-[11px] text-gray-500">
                      75歳以上1千人あたり {localPer1k(kaigoEntry.specialCareCapacity).toFixed(1)}人
                    </p>
                  </div>
                  <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                    <p className="text-xs text-gray-500">特養 従事者数</p>
                    <p className="mt-1 text-xl font-bold text-gray-900">
                      {kaigoEntry.staff.specialCare.toLocaleString()}
                      <span className="ml-1 text-sm font-normal text-gray-500">人</span>
                    </p>
                  </div>
                  <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                    <p className="text-xs text-gray-500">老健 従事者数</p>
                    <p className="mt-1 text-xl font-bold text-gray-900">
                      {kaigoEntry.staff.healthCare.toLocaleString()}
                      <span className="ml-1 text-sm font-normal text-gray-500">人</span>
                    </p>
                  </div>
                </div>

                <p className="mt-3 text-xs text-gray-400">
                  ※ 介護保険施設は医療需要の一部を代替する役割があり、供給量が少ない地域では病院の療養病床への需要が高まる傾向。
                  75歳以上1千人あたり施設数で全国平均と比較しています。
                </p>

                {/* 自動生成される示唆 */}
                {(() => {
                  const insights = buildKaigoInsights(
                    kaigoEntry,
                    kaigo.national,
                    nat75,
                    over75PopForResources,
                  );
                  if (insights.length === 0) return null;
                  return (
                    <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-4">
                      <p className="mb-2 text-xs font-semibold text-amber-900">
                        💡 この地域の特徴
                      </p>
                      <ul className="space-y-1 text-xs text-amber-900">
                        {insights.map((ins, i) => (
                          <li key={i} className="flex gap-1.5">
                            <span>・</span>
                            <span>{ins}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })()}
              </div>
            );
          })()}

          {/* ===== Section 4: 詳細な年次データ ===== */}
          <div id="section-detail" className="mb-4 mt-14 border-b-2 border-blue-500 pb-2">
            <h2 className="text-xl font-bold text-gray-900">
              📊 詳細な年次データ
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              各年次の推計人口の詳細値（チャートより細かい数値で確認したい場合に参照）
            </p>
          </div>

          {/* 年次テーブル */}
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold">年次別推計値</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-gray-500">
                    <th className="py-2 pr-4">年</th>
                    <th className="py-2 pr-4 text-right">総人口</th>
                    <th className="py-2 pr-4 text-right">0〜14歳</th>
                    <th className="py-2 pr-4 text-right">15〜64歳</th>
                    <th className="py-2 pr-4 text-right">65歳以上</th>
                    <th className="py-2 pr-4 text-right">うち75歳以上</th>
                    <th className="py-2 pr-4 text-right">高齢化率</th>
                    <th className="py-2 text-right">75歳以上比率</th>
                  </tr>
                </thead>
                <tbody>
                  {years.map((y) => {
                    const row = selected.years[y];
                    const prev = years.indexOf(y) > 0 ? selected.years[years[years.indexOf(y) - 1]] : null;
                    const diffStr = (cur: number, prevVal: number | undefined) => {
                      if (prevVal == null || prevVal === 0) return "";
                      const diff = cur - prevVal;
                      const rate = ((diff / prevVal) * 100).toFixed(1);
                      return diff > 0 ? ` (+${rate}%)` : ` (${rate}%)`;
                    };
                    return (
                      <tr key={y} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-2 pr-4 font-medium">{y}年</td>
                        <td className="py-2 pr-4 text-right">
                          {row.total.toLocaleString()}
                          {prev && (
                            <span className="text-xs text-gray-400">
                              {diffStr(row.total, prev.total)}
                            </span>
                          )}
                        </td>
                        <td className="py-2 pr-4 text-right">
                          {row.under15.toLocaleString()}
                        </td>
                        <td className="py-2 pr-4 text-right">
                          {row.age15_64.toLocaleString()}
                          {prev && (
                            <span className="text-xs text-gray-400">
                              {diffStr(row.age15_64, prev.age15_64)}
                            </span>
                          )}
                        </td>
                        <td className="py-2 pr-4 text-right">
                          {row.over65.toLocaleString()}
                        </td>
                        <td className="py-2 pr-4 text-right">
                          {(row.over75 ?? 0).toLocaleString()}
                          {prev && prev.over75 != null && (
                            <span className="text-xs text-gray-400">
                              {diffStr(row.over75 ?? 0, prev.over75)}
                            </span>
                          )}
                        </td>
                        <td className="py-2 pr-4 text-right">{row.agingRate.toFixed(1)}%</td>
                        <td className="py-2 text-right">
                          {row.over75Rate != null ? `${row.over75Rate.toFixed(1)}%` : "-"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ===== Section 3: 過去の変化 (経年トレンド) ===== */}
      {trendBedData.length > 0 && (
        <div id="section-history" className="mb-4 mt-14 border-b-2 border-blue-500 pb-2">
          <h2 className="text-xl font-bold text-gray-900">
            📈 過去の変化（経年トレンド）
          </h2>
          <p className="mt-0.5 text-xs text-gray-500">
            過去5〜10年で地域の病床機能や利用率がどう動いたか。地域医療構想の進捗を読むシグナル
          </p>
        </div>
      )}

      {/* 経年トレンド (病床機能・病床利用率) — 全国または都道府県単位 */}
      {trendBedData.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4">
            <h2 className="text-lg font-semibold">
              経年トレンド
              {scope !== "national" && selected && ` - ${scope.startsWith("area:") ? (areaData && scope.startsWith("area:") ? PREFECTURE_NAMES[areaData.areas[scope.slice(5)]?.prefecture ?? ""] ?? "" : selected.name) : selected.name}`}
            </h2>
            <p className="mt-1 text-xs text-gray-400">
              病床機能の時系列変化と病床利用率の推移（{scope.startsWith("area:") ? "都道府県単位データのみ表示" : "病床機能報告 / 病院報告"}）
            </p>
          </div>

          <div className="mb-4 rounded-md border border-blue-100 bg-blue-50 p-3 text-xs text-blue-900">
            <span className="font-medium">このセクションで見えるもの：</span>
            過去5年で地域の病床機能がどう動いたか。急性期の減少、回復期の増加は地域医療構想の進捗を示すシグナル。
          </div>

          {/* 病床機能推移 */}
          <h3 className="mb-2 text-sm font-medium text-gray-700">機能別病床数の推移</h3>
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
                {trendBedData.map((d, i) => {
                  const prev = i > 0 ? trendBedData[i - 1] : null;
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

          {/* 病床利用率推移 */}
          {Object.keys(hospReport).length > 0 && (
            <>
              <h3 className="mb-2 mt-6 text-sm font-medium text-gray-700">
                病床利用率・平均在院日数の推移
                <span className="ml-2 text-[11px] font-normal text-gray-400">(病院報告)</span>
              </h3>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-gray-500">
                      <th className="py-2 pr-4">年</th>
                      <th className="py-2 pr-4 text-right">利用率(全体)</th>
                      <th className="py-2 pr-4 text-right">一般</th>
                      <th className="py-2 pr-4 text-right">療養</th>
                      <th className="py-2 pr-4 text-right">精神</th>
                      <th className="py-2 pr-4 text-right">平均在院(全体)</th>
                      <th className="py-2 text-right">一般</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(hospReport)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([year, datum]) => {
                        const entry = trendPrefCode ? datum.prefectures[trendPrefCode] : datum.national;
                        if (!entry) return null;
                        return (
                          <tr key={year} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="py-2 pr-4 font-medium">{year}年</td>
                            <td className="py-2 pr-4 text-right">{entry.totalUtilization != null ? `${entry.totalUtilization}%` : "-"}</td>
                            <td className="py-2 pr-4 text-right">{entry.generalUtilization != null ? `${entry.generalUtilization}%` : "-"}</td>
                            <td className="py-2 pr-4 text-right">{entry.therapyUtilization != null ? `${entry.therapyUtilization}%` : "-"}</td>
                            <td className="py-2 pr-4 text-right">{entry.psychiatricUtilization != null ? `${entry.psychiatricUtilization}%` : "-"}</td>
                            <td className="py-2 pr-4 text-right">{entry.totalAvgStay != null ? `${entry.totalAvgStay}日` : "-"}</td>
                            <td className="py-2 text-right">{entry.generalAvgStay != null ? `${entry.generalAvgStay}日` : "-"}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <p className="mt-3 text-xs text-gray-400">
            ※ 一部の病院で令和4年度（2022）と令和6年度（2024）の報告値が同一となるケースが確認されています。厚生労働省が公開する元データに起因するもので、本ダッシュボードの加工によるものではありません。
          </p>
        </div>
      )}

      {/* 出典 */}
      <p className="mt-6 text-xs text-gray-400">
        出典:{" "}
        {data.sourceUrl ? (
          <a
            href={data.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-gray-600"
          >
            {data.source}
          </a>
        ) : (
          data.source
        )}
      </p>
        </>
      )}

      {/* 精神科医療タブ */}
      {activeTab === "psychiatric" && (
        <>
          <div className="mb-6 rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
            <span className="font-medium">このタブで見えるもの：</span>
            厚生労働省「精神保健福祉資料（630調査）」に基づく精神科医療の現状。
            病床機能報告(上タブのデータソース)とは別データセットのため独立タブ。都道府県単位での集計のみ。
          </div>

          {psychData && (
            <>
              <div className="mb-8 grid gap-4 sm:grid-cols-5">
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 shadow-sm">
                  <p className="text-xs text-amber-600">精神科病院数</p>
                  <p className="text-xl font-bold text-amber-900">{psychData.overview.hospitals.toLocaleString()}</p>
                </div>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 shadow-sm">
                  <p className="text-xs text-amber-600">精神病床数</p>
                  <p className="text-xl font-bold text-amber-900">{psychData.overview.beds.toLocaleString()}床</p>
                </div>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 shadow-sm">
                  <p className="text-xs text-amber-600">在院患者数</p>
                  <p className="text-xl font-bold text-amber-900">{psychData.admissionTypes.total.toLocaleString()}人</p>
                </div>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 shadow-sm">
                  <p className="text-xs text-amber-600">病床利用率</p>
                  <p className="text-xl font-bold text-amber-900">
                    {psychData.overview.beds > 0
                      ? ((psychData.admissionTypes.total / psychData.overview.beds) * 100).toFixed(1)
                      : 0}%
                  </p>
                </div>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 shadow-sm">
                  <p className="text-xs text-amber-600">1年以上入院</p>
                  <p className="text-xl font-bold text-amber-900">
                    {psychData.admissionTypes.total > 0
                      ? ((psychData.lengthOfStay.over1year / psychData.admissionTypes.total) * 100).toFixed(1)
                      : 0}%
                  </p>
                </div>
              </div>

              <div className="mb-8 grid gap-6 lg:grid-cols-3">
                <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                  <h3 className="mb-4 text-lg font-semibold">疾患別構成</h3>
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie data={psychDiseaseChart} cx="50%" cy="50%" innerRadius={50} outerRadius={90} dataKey="value" nameKey="name" isAnimationActive={false}>
                        {psychDiseaseChart.map((_, i) => (
                          <Cell key={i} fill={DISEASE_COLORS[i % DISEASE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number) => v.toLocaleString() + "人"} />
                      <Legend formatter={(v: string) => v} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                  <h3 className="mb-4 text-lg font-semibold">入院形態</h3>
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie data={psychAdmissionChart} cx="50%" cy="50%" innerRadius={50} outerRadius={90} dataKey="value" nameKey="name" isAnimationActive={false}>
                        {psychAdmissionChart.map((item, i) => (
                          <Cell key={i} fill={item.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number) => v.toLocaleString() + "人"} />
                      <Legend formatter={(v: string) => v} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                  <h3 className="mb-4 text-lg font-semibold">在院期間</h3>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={psychLosChart} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={(v: number) => v.toLocaleString()} />
                      <Tooltip formatter={(v: number) => v.toLocaleString() + "人"} />
                      <Bar dataKey="value" fill="#f59e0b" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <p className="text-xs text-gray-400">
                出典: 厚生労働省「精神保健福祉資料（630調査）」令和7年度
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}

interface ResourceBoxProps {
  label: string;
  total: number;
  per100k: number;
  national: number;
  unit: string;
}

function ResourceBox({ label, total, per100k, national, unit }: ResourceBoxProps) {
  const delta = national > 0 ? per100k - national : 0;
  const deltaPct = national > 0 ? ((per100k - national) / national) * 100 : 0;
  const aboveNatl = delta > 0;
  const belowNatl = delta < 0;
  const border = aboveNatl
    ? "border-red-200 bg-red-50"
    : belowNatl
      ? "border-blue-200 bg-blue-50"
      : "border-gray-200 bg-gray-50";
  const deltaCol = aboveNatl ? "text-red-600" : belowNatl ? "text-blue-600" : "text-gray-500";

  return (
    <div className={`rounded-md border p-3 ${border}`}>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-gray-900">
        {per100k.toFixed(1)}
        <span className="ml-1 text-xs font-normal text-gray-500">/10万人</span>
      </p>
      <p className="mt-0.5 text-[11px] text-gray-700">
        総数 {total.toLocaleString()}
        {unit}
      </p>
      {national > 0 && (
        <p className={`mt-0.5 text-[11px] ${deltaCol}`}>
          全国平均 {national.toFixed(1)} ({deltaPct > 0 ? "+" : ""}{deltaPct.toFixed(1)}%)
        </p>
      )}
    </div>
  );
}

interface KaigoBoxProps {
  label: string;
  total: number;
  per1k: number;
  national: number;
  highlight?: boolean;
}

function KaigoBox({ label, total, per1k, national, highlight }: KaigoBoxProps) {
  const delta = national > 0 ? per1k - national : 0;
  const deltaPct = national > 0 ? ((per1k - national) / national) * 100 : 0;
  const aboveNatl = delta > 0;
  const belowNatl = delta < 0;
  const border = highlight
    ? "border-amber-300 bg-amber-50"
    : aboveNatl
      ? "border-red-200 bg-red-50"
      : belowNatl
        ? "border-blue-200 bg-blue-50"
        : "border-gray-200 bg-gray-50";
  const deltaCol = aboveNatl ? "text-red-600" : belowNatl ? "text-blue-600" : "text-gray-500";
  return (
    <div className={`rounded-md border p-3 ${border}`}>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-gray-900">
        {per1k.toFixed(1)}
        <span className="ml-1 text-xs font-normal text-gray-500">/75+1千人</span>
      </p>
      <p className="mt-0.5 text-[11px] text-gray-700">
        総数 {total.toLocaleString()}施設
      </p>
      {national > 0 && (
        <p className={`mt-0.5 text-[11px] ${deltaCol}`}>
          全国平均 {national.toFixed(1)} ({deltaPct > 0 ? "+" : ""}{deltaPct.toFixed(1)}%)
        </p>
      )}
    </div>
  );
}


/**
 * 医療リソースの数値から自動的な示唆を生成。
 * 全国平均比で大きく乖離している指標のみ短文で言及する。
 */
function buildMedicalInsights(
  entry: MedicalResourceEntry,
  nationalEntry: MedicalResourceEntry | undefined,
): string[] {
  if (!nationalEntry) return [];
  const ins: string[] = [];

  const cmp = (local: number, natl: number) =>
    natl > 0 ? ((local - natl) / natl) * 100 : 0;

  const phy = cmp(
    entry.personnelPer100k.physiciansPer100k,
    nationalEntry.personnelPer100k.physiciansPer100k,
  );
  const hosp = cmp(
    entry.facilitiesPer100k.hospitalPer100k,
    nationalEntry.facilitiesPer100k.hospitalPer100k,
  );
  const clinic = cmp(
    entry.facilitiesPer100k.clinicPer100k,
    nationalEntry.facilitiesPer100k.clinicPer100k,
  );
  const psych = cmp(
    entry.facilitiesPer100k.psychiatricHospitalPer100k,
    nationalEntry.facilitiesPer100k.psychiatricHospitalPer100k,
  );

  // 医師密度
  if (phy <= -10) {
    ins.push(
      "医師密度（人口10万対）が全国平均より低い。医師確保で近隣地域と競合しやすく、" +
        "人件費・採用コストの上昇圧力に留意が必要。",
    );
  } else if (phy >= 10) {
    ins.push(
      "医師密度が全国平均より高い。採用環境は比較的恵まれる一方、" +
        "同業との患者シェア争いは激しくなる傾向。",
    );
  }

  // 病院密度 (人口10万対) - 都市圏は人口分母が大きく低めに出るため解釈を「1病院あたり診療圏」に寄せる
  if (hosp <= -20) {
    ins.push(
      "人口あたり病院数が少なく、1病院あたり診療圏人口が大きい。" +
        "近隣病院との機能分担と紹介・逆紹介ネットワークがより重要に。",
    );
  } else if (hosp >= 20) {
    ins.push(
      "人口あたり病院数が多く、分散型。機能特化による差別化とブランディングが効きやすい。",
    );
  }

  // 一般診療所密度 (プライマリケア)
  if (clinic <= -15) {
    ins.push(
      "一般診療所が全国平均より少ない。外来プライマリケア供給が手薄で、病院外来への流入が増える可能性。",
    );
  } else if (clinic >= 15) {
    ins.push(
      "一般診療所が豊富。病診連携の選択肢が多く、逆紹介・紹介患者の流れを設計しやすい。",
    );
  }

  // 精神科病院
  if (psych <= -25) {
    ins.push(
      "精神科病院密度が全国平均を大きく下回る。地域の精神医療資源が限られており、" +
        "連携先の距離・受け入れ余地を事前に把握しておくことが重要。",
    );
  } else if (psych >= 25) {
    ins.push(
      "精神科病院密度が高い。長期入院の受け皿として地域で大きな役割を担う構造と推測。",
    );
  }

  return ins;
}

/**
 * 介護保険施設の数値から自動的な示唆を生成。
 * 75歳以上1千人対で全国比 -15% 以下なら「供給不足」、+15% 以上なら「供給豊富」。
 */
function buildKaigoInsights(
  entry: KaigoResourceEntry,
  nationalEntry: KaigoResourceEntry,
  nationalOver75: number,
  localOver75: number,
): string[] {
  if (localOver75 <= 0 || nationalOver75 <= 0) return [];
  const ins: string[] = [];

  const localPer1k = (n: number) => n / (localOver75 / 1000);
  const natPer1k = (n: number) => n / (nationalOver75 / 1000);
  const cmp = (lo: number, na: number) => (na > 0 ? ((lo - na) / na) * 100 : 0);

  const total = cmp(
    localPer1k(entry.facilities.total),
    natPer1k(nationalEntry.facilities.total),
  );
  const tokuyo = cmp(
    localPer1k(entry.facilities.specialCare),
    natPer1k(nationalEntry.facilities.specialCare),
  );
  const iryoin = cmp(
    localPer1k(entry.facilities.medicalCare),
    natPer1k(nationalEntry.facilities.medicalCare),
  );

  if (total <= -15) {
    ins.push(
      "介護保険施設の供給量が全国平均より明確に少ない。" +
        "退院後の受け皿が限られ、退院支援調整の長期化や療養病床への需要圧が強まりやすい構造。",
    );
  } else if (total >= 15) {
    ins.push(
      "介護保険施設の供給量が全国平均より多め。" +
        "退院先の選択肢が豊富で、急性期病床の回転を上げやすい環境。",
    );
  }

  if (tokuyo <= -20) {
    ins.push("特に特養（介護老人福祉施設）が手薄 — 重度長期療養の受け皿が不足しやすく、療養病床・家族介護への依存が高まる傾向。");
  }

  if (iryoin <= -30) {
    ins.push("介護医療院が少ない — 医療ニーズのある要介護者の転棟先として病院の療養病床が使われる割合が高くなりやすい。");
  }

  return ins;
}
