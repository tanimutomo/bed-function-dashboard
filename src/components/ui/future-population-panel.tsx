"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  fetchPopulationFuture,
  fetchPopulationFutureAreas,
  PREFECTURE_NAMES,
  type PopulationFutureData,
  type PopulationFutureAreasData,
  type PopulationFutureYear,
} from "@/lib/data";
import {
  fetchUtilizationRates,
  forecastPatients,
  type UtilizationRates,
} from "@/lib/patient-forecast";

interface FuturePopulationPanelProps {
  /** 都道府県コード (2桁ゼロパディング)。areaCode と排他。 */
  prefCode?: string;
  /** 構想区域コード。こちらが指定されれば都道府県より優先。 */
  areaCode?: string;
  /** 表示するタイトル（省略時は自動生成） */
  title?: string;
  /** 推計患者数に使う疾患カテゴリ（デフォルト: "overall" = 全疾患） */
  diseaseCategory?: string;
}

function pct(base: number, end: number): number {
  return base > 0 ? ((end - base) / base) * 100 : 0;
}

function formatPct(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

/**
 * 地域の将来人口を簡易表示するパネル。
 * 都道府県レベルのIPSS推計をそのまま引き当てる。
 * データが無い場合は全国値へのリンクのみ表示。
 * 受療率データが利用可能であれば、推計入院患者数も同時表示。
 */
export function FuturePopulationPanel({ prefCode, areaCode, title, diseaseCategory = "overall" }: FuturePopulationPanelProps) {
  const [data, setData] = useState<PopulationFutureData | null>(null);
  const [areaData, setAreaData] = useState<PopulationFutureAreasData | null>(null);
  const [rates, setRates] = useState<UtilizationRates | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // areaCode 指定時は area データも読む
    const fetchers: Promise<unknown>[] = [
      fetchPopulationFuture(),
      fetchUtilizationRates(),
    ];
    if (areaCode) {
      fetchers.push(fetchPopulationFutureAreas());
    }
    Promise.all(fetchers)
      .then((results) => {
        setData(results[0] as PopulationFutureData);
        setRates(results[1] as UtilizationRates);
        if (areaCode) {
          setAreaData(results[2] as PopulationFutureAreasData);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [areaCode]);

  if (loading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-gray-400">将来推計人口を読み込み中...</p>
      </div>
    );
  }

  // areaCode 指定時は構想区域データ、そうでなければ都道府県データを使う
  let scopedYears: Record<string, PopulationFutureYear> = {};
  let scopedName = "";
  let scopeLabel = "";
  let scopeNote = "";
  if (areaCode && areaData) {
    const area = areaData.areas[areaCode];
    if (area) {
      scopedYears = area.years;
      scopedName = area.name;
      const prefName = PREFECTURE_NAMES[area.prefecture] ?? "";
      scopeLabel = `${prefName}${prefName ? " / " : ""}${area.name}構想区域`;
      scopeNote = `IPSS 令和5年推計（${area.municipalities.length}市区町村の合算）`;
    }
  } else if (prefCode) {
    const pref = data?.prefectures[prefCode];
    if (pref) {
      scopedYears = pref.years;
      scopedName = PREFECTURE_NAMES[prefCode] ?? pref.name;
      scopeLabel = scopedName;
      scopeNote = "IPSS 令和5年推計";
    }
  }

  const years = Object.keys(scopedYears).sort();
  const isAreaScope = !!(areaCode && areaData?.areas[areaCode]);
  const defaultHeading = isAreaScope
    ? `${scopedName || "構想区域"}構想区域の将来人口（医療需要の前提）`
    : `${scopedName || "地域"}の将来人口（医療需要の前提）`;
  const heading = title ?? defaultHeading;

  // /population ページへの遷移URL (現在のスコープ・疾病カテゴリを引き継ぐ)
  const populationHref = (() => {
    const params = new URLSearchParams();
    if (isAreaScope && areaCode) params.set("scope", `area:${areaCode}`);
    else if (prefCode) params.set("scope", `pref:${prefCode}`);
    if (diseaseCategory && diseaseCategory !== "overall") {
      params.set("disease", diseaseCategory);
    }
    const qs = params.toString();
    return qs ? `/population?${qs}` : "/population";
  })();

  if (years.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-lg font-semibold">{heading}</h2>
        <p className="text-sm text-gray-500">
          この{areaCode ? "構想区域" : "都道府県"}の将来推計人口は未取り込みです。
          <Link href="/population" className="ml-1 text-blue-600 hover:underline">
            全国の推計を見る →
          </Link>
        </p>
        <p className="mt-2 text-xs text-gray-400">
          取り込み手順は <code className="rounded bg-gray-100 px-1">scripts/preprocess_ipss{areaCode ? "_areas" : ""}.py</code> を参照
        </p>
      </div>
    );
  }

  const baseYear = years[0];
  const endYear = years[years.length - 1];
  const base: PopulationFutureYear = scopedYears[baseYear];
  const end: PopulationFutureYear = scopedYears[endYear];

  const totalChange = pct(base.total, end.total);
  const over75Change = pct(base.over75 ?? 0, end.over75 ?? 0);
  const workingChange = pct(base.age15_64, end.age15_64);

  // 推計入院患者数（受療率データが利用可能な場合のみ）
  let patientForecastBase: number | null = null;
  let patientForecastEnd: number | null = null;
  let patientChange: number | null = null;
  let diseaseLabel: string | null = null;
  if (rates) {
    const activeRates =
      diseaseCategory === "overall"
        ? rates.overall
        : rates.diseases[diseaseCategory];
    if (activeRates) {
      diseaseLabel = diseaseCategory === "overall" ? "全疾病" : rates.diseases[diseaseCategory]?.label ?? "";
      patientForecastBase = forecastPatients(base, activeRates).inpatient;
      patientForecastEnd = forecastPatients(end, activeRates).inpatient;
      patientChange = pct(patientForecastBase, patientForecastEnd);
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold">{heading}</h2>
          <p className="mt-1 text-xs text-gray-400">
            {scopeLabel && <span className="mr-1">{scopeLabel} /</span>}
            {scopeNote} / {baseYear}→{endYear}年
          </p>
        </div>
        <Link
          href={populationHref}
          className="text-xs text-blue-600 hover:underline"
        >
          詳細を見る →
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <MetricBox
          label="総人口"
          endValue={end.total}
          change={totalChange}
        />
        <MetricBox
          label="75歳以上人口"
          endValue={end.over75 ?? 0}
          change={over75Change}
          accent
          description="医療需要への直接インパクト"
        />
        <MetricBox
          label="生産年齢人口"
          endValue={end.age15_64}
          change={workingChange}
          description="医療人材の供給基盤"
        />
        <MetricBox
          label="高齢化率"
          endValue={end.agingRate}
          suffix="%"
          description={
            end.over75Rate != null
              ? `うち75歳以上 ${end.over75Rate.toFixed(1)}%`
              : undefined
          }
        />
      </div>

      {patientForecastEnd != null && patientForecastBase != null && patientChange != null && (
        <div className="mt-4 rounded-md border border-blue-200 bg-blue-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs text-blue-900">
                推計入院患者数（1日あたり）
                {diseaseLabel && diseaseLabel !== "全疾病" && (
                  <span className="ml-1 text-blue-700">/ {diseaseLabel}</span>
                )}
              </p>
              <p className="mt-1 text-xl font-bold text-blue-900">
                {Math.round(patientForecastEnd).toLocaleString()}
                <span className="ml-1 text-sm font-normal text-blue-700">人</span>
                <span className="ml-2 text-xs text-blue-600">
                  ({baseYear}年 {Math.round(patientForecastBase).toLocaleString()}人 → {endYear}年 {formatPct(patientChange)}%)
                </span>
              </p>
            </div>
            <Link
              href={populationHref}
              className="text-xs text-blue-700 underline hover:text-blue-900"
            >
              推計ロジックを見る →
            </Link>
          </div>
          <p className="mt-2 text-[11px] text-blue-700">
            IPSS推計人口 × 令和5年患者調査の年齢階級別受療率で算出
          </p>
        </div>
      )}

      <p className="mt-3 text-xs text-gray-400">
        ※ 75歳以上は一人当たり入院受療率が他年齢層より顕著に高く、病床需要の中核指標です。
      </p>
    </div>
  );
}

interface MetricBoxProps {
  label: string;
  endValue: number;
  change?: number;
  accent?: boolean;
  suffix?: string;
  description?: string;
}

function MetricBox({ label, endValue, change, accent, suffix, description }: MetricBoxProps) {
  return (
    <div
      className={`rounded-md border p-3 ${
        accent ? "border-red-200 bg-red-50" : "border-gray-200 bg-gray-50"
      }`}
    >
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-gray-900">
        {suffix === "%" ? endValue.toFixed(1) : endValue.toLocaleString()}
        {suffix && <span className="ml-0.5 text-sm text-gray-500">{suffix}</span>}
      </p>
      {change != null && (
        <p
          className={`mt-0.5 text-xs ${
            change > 0 ? "text-red-600" : change < 0 ? "text-blue-600" : "text-gray-500"
          }`}
        >
          基準年比 {formatPct(change)}
        </p>
      )}
      {description && (
        <p className="mt-1 text-[11px] text-gray-400">{description}</p>
      )}
    </div>
  );
}
