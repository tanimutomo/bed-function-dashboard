/**
 * 将来患者数推計ロジック
 *
 * IPSS 令和5年推計人口 × 厚労省 令和5年患者調査 受療率 で推計患者数を算出。
 *
 * 年齢区分は IPSS 4区分 (under15, age15_64, over65, over75) に合わせて
 * utilization_rates.json 側も同じ粒度で正規化済み。
 * over65 = age65_74 + over75 として内部で分解して計算する。
 */

import type { PopulationFutureYear } from "@/lib/data";

export interface UtilizationAgeRates {
  under15: number;
  age15_64: number;
  age65_74: number;
  over65: number; // age65_74 + over75 (総計)
  over75: number;
}

export interface UtilizationRates {
  source: string;
  sourceUrl?: string;
  surveyYear: string;
  note?: string;
  populationReference: Record<string, number>;
  overall: {
    inpatient: UtilizationAgeRates;
    outpatient: UtilizationAgeRates;
  };
  diseases: Record<
    string,
    {
      label: string;
      inpatient: UtilizationAgeRates;
      outpatient: UtilizationAgeRates;
    }
  >;
}

export interface PatientForecast {
  /** 推計入院患者数（1日あたり、人） */
  inpatient: number;
  /** 推計外来患者数（1日あたり、人） */
  outpatient: number;
  /** 入院の年齢別内訳 */
  inpatientByAge: {
    under15: number;
    age15_64: number;
    age65_74: number;
    over75: number;
  };
  /** 外来の年齢別内訳 */
  outpatientByAge: {
    under15: number;
    age15_64: number;
    age65_74: number;
    over75: number;
  };
}

/**
 * ある年次の推計人口と受療率から、推計患者数（1日あたり）を算出。
 * 受療率は人口10万対なので /100000 で患者数に変換。
 */
export function forecastPatients(
  pop: PopulationFutureYear,
  rates: { inpatient: UtilizationAgeRates; outpatient: UtilizationAgeRates }
): PatientForecast {
  // 65-74歳 = 65歳以上 − 75歳以上
  const pop75 = pop.over75 ?? 0;
  const pop65_74 = Math.max(0, pop.over65 - pop75);

  const apply = (r: UtilizationAgeRates) => {
    const under15 = (pop.under15 * r.under15) / 100000;
    const age15_64 = (pop.age15_64 * r.age15_64) / 100000;
    const age65_74 = (pop65_74 * r.age65_74) / 100000;
    const over75 = (pop75 * r.over75) / 100000;
    return {
      under15,
      age15_64,
      age65_74,
      over75,
      total: under15 + age15_64 + age65_74 + over75,
    };
  };

  const inp = apply(rates.inpatient);
  const out = apply(rates.outpatient);

  return {
    inpatient: inp.total,
    outpatient: out.total,
    inpatientByAge: {
      under15: inp.under15,
      age15_64: inp.age15_64,
      age65_74: inp.age65_74,
      over75: inp.over75,
    },
    outpatientByAge: {
      under15: out.under15,
      age15_64: out.age15_64,
      age65_74: out.age65_74,
      over75: out.over75,
    },
  };
}

/**
 * 年次毎の推計人口マップから、年次毎の推計患者数マップを作る。
 */
export function forecastPatientSeries(
  popYears: Record<string, PopulationFutureYear>,
  rates: { inpatient: UtilizationAgeRates; outpatient: UtilizationAgeRates }
): Record<string, PatientForecast> {
  const out: Record<string, PatientForecast> = {};
  for (const [year, pop] of Object.entries(popYears)) {
    out[year] = forecastPatients(pop, rates);
  }
  return out;
}

export async function fetchUtilizationRates(): Promise<UtilizationRates> {
  const res = await fetch("/data/summary/utilization_rates.json");
  return res.json();
}
