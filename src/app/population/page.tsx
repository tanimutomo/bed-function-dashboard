"use client";

import { useEffect, useMemo, useState } from "react";
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
  fetchPopulationFuture,
  PREFECTURE_LIST,
  PREFECTURE_NAMES,
  type PopulationFutureData,
  type PopulationFutureYear,
} from "@/lib/data";
import {
  fetchUtilizationRates,
  forecastPatientSeries,
  type UtilizationRates,
} from "@/lib/patient-forecast";

type Scope = "national" | string;

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
  const [data, setData] = useState<PopulationFutureData | null>(null);
  const [rates, setRates] = useState<UtilizationRates | null>(null);
  const [scope, setScope] = useState<Scope>("national");
  const [forecastKind, setForecastKind] = useState<"inpatient" | "outpatient">("inpatient");
  const [forecastCategory, setForecastCategory] = useState<string>("overall");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchPopulationFuture(), fetchUtilizationRates()])
      .then(([d, r]) => {
        setData(d);
        setRates(r);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const selected = useMemo(() => {
    if (!data) return null;
    if (scope === "national") {
      return {
        name: "全国",
        years: data.national.years,
      };
    }
    const pref = data.prefectures[scope];
    if (!pref) return null;
    return pref;
  }, [data, scope]);

  const trendPoints = useMemo(() => {
    if (!selected) return [];
    return toTrendPoints(selected.years);
  }, [selected]);

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

  const showSkeleton = scope !== "national" && trendPoints.length === 0;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">人口動態・将来推計</h1>
          <p className="mt-1 text-sm text-gray-500">
            {data.source}
          </p>
          <p className="mt-0.5 text-xs text-gray-400">
            基準年 {data.baseYear} 年 / 推計期間 {years[0] ?? "-"}〜
            {years[years.length - 1] ?? "-"} 年
          </p>
        </div>
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="national">全国</option>
          {availablePrefs.map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
      </div>

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
              {scope !== "national" && ` - ${PREFECTURE_NAMES[scope]}`}
            </h2>
            <PopulationTrendChart data={trendPoints} height={420} />
            <p className="mt-3 text-xs text-gray-400">
              ※ 年齢区分は「0〜14歳」「15〜64歳」「65〜74歳（前期高齢）」「75歳以上（後期高齢）」。
              75歳以上は一人当たり入院受療率が他の年齢層より顕著に高く、病床需要の中核指標です。
            </p>
          </div>

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
                      {scope !== "national" && ` - ${PREFECTURE_NAMES[scope]}`}
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

          {/* 年次テーブル */}
          <div className="mt-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold">年次別推計値</h2>
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
    </div>
  );
}
