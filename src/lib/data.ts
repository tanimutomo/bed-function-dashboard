import type { NationalSummary, Area, RankingEntry } from "@/types";

const BASE_PATH = "/data";

export async function fetchNationalSummary(): Promise<NationalSummary[]> {
  const res = await fetch(`${BASE_PATH}/summary/national.json`);
  return res.json();
}

export async function fetchPrefectureSummary(): Promise<
  Record<string, NationalSummary[]>
> {
  const res = await fetch(`${BASE_PATH}/summary/prefectures.json`);
  const data: Record<string, NationalSummary[]> = await res.json();
  // キーをゼロパディングして統一（データ側が "3" → "03" に変換）
  const normalized: Record<string, NationalSummary[]> = {};
  for (const [key, value] of Object.entries(data)) {
    normalized[key.padStart(2, "0")] = value;
  }
  return normalized;
}

export async function fetchAreaIndex(): Promise<Area[]> {
  const res = await fetch(`${BASE_PATH}/areas/index.json`);
  const data: Area[] = await res.json();
  return data.map((a) => ({ ...a, prefecture: a.prefecture.padStart(2, "0") }));
}

export async function fetchAreaDetail(areaCode: string) {
  const res = await fetch(`${BASE_PATH}/areas/${areaCode}.json`);
  return res.json();
}

export async function fetchHospitalIndex(): Promise<
  { code: string; name: string; areaCode: string; areaName: string; prefecture: string; totalBeds: number; bedsByFunction: Record<string, number>; recoveryRelatedBeds: number; psychiatricBeds: number; lat?: number; lng?: number }[]
> {
  const res = await fetch(`${BASE_PATH}/hospitals/index.json`);
  const data = await res.json();
  return data.map((h: { prefecture: string; [key: string]: unknown }) => ({
    ...h,
    prefecture: h.prefecture.padStart(2, "0"),
  }));
}

export async function fetchHospitalDetail(code: string) {
  const res = await fetch(`${BASE_PATH}/hospitals/${code}.json`);
  const data = await res.json();
  if (data.prefecture) {
    data.prefecture = String(data.prefecture).padStart(2, "0");
  }
  return data;
}

export async function fetchRanking(year: string) {
  const res = await fetch(`${BASE_PATH}/ranking/${year}.json`);
  return res.json();
}

export async function fetch630Summary() {
  const res = await fetch(`${BASE_PATH}/psychiatric/630_summary.json`);
  return res.json();
}

export interface PopulationData {
  totalPopulation: number;
  populationUnder15: number;
  population15to64: number;
  population65over: number;
  agingRate: number;
}

export async function fetchPopulation(): Promise<{
  censusYear: string;
  prefectures: Record<string, PopulationData>;
}> {
  const res = await fetch(`${BASE_PATH}/summary/population.json`);
  const data = await res.json();
  // キーをゼロパディング
  const normalized: Record<string, PopulationData> = {};
  for (const [key, value] of Object.entries(data.prefectures)) {
    normalized[key.padStart(2, "0")] = value as PopulationData;
  }
  return { censusYear: data.censusYear, prefectures: normalized };
}

export interface HospitalReportEntry {
  totalUtilization: number | null;
  generalUtilization: number | null;
  therapyUtilization: number | null;
  psychiatricUtilization: number | null;
  totalAvgStay: number | null;
  generalAvgStay: number | null;
  therapyAvgStay: number | null;
}

export async function fetchHospitalReport(): Promise<{
  source: string;
  years: Record<string, {
    national: HospitalReportEntry;
    prefectures: Record<string, HospitalReportEntry>;
  }>;
}> {
  const res = await fetch(`${BASE_PATH}/summary/hospital_report.json`);
  return res.json();
}

export async function fetchPopulationAreas(): Promise<{
  censusYear: string;
  areas: Record<string, PopulationData>;
}> {
  const res = await fetch(`${BASE_PATH}/summary/population_areas.json`);
  return res.json();
}

/** 都道府県コード→名称（ソート済み配列） */
export const PREFECTURE_LIST: [string, string][] = [
  ["01", "北海道"], ["02", "青森県"], ["03", "岩手県"], ["04", "宮城県"], ["05", "秋田県"],
  ["06", "山形県"], ["07", "福島県"], ["08", "茨城県"], ["09", "栃木県"], ["10", "群馬県"],
  ["11", "埼玉県"], ["12", "千葉県"], ["13", "東京都"], ["14", "神奈川県"], ["15", "新潟県"],
  ["16", "富山県"], ["17", "石川県"], ["18", "福井県"], ["19", "山梨県"], ["20", "長野県"],
  ["21", "岐阜県"], ["22", "静岡県"], ["23", "愛知県"], ["24", "三重県"], ["25", "滋賀県"],
  ["26", "京都府"], ["27", "大阪府"], ["28", "兵庫県"], ["29", "奈良県"], ["30", "和歌山県"],
  ["31", "鳥取県"], ["32", "島根県"], ["33", "岡山県"], ["34", "広島県"], ["35", "山口県"],
  ["36", "徳島県"], ["37", "香川県"], ["38", "愛媛県"], ["39", "高知県"], ["40", "福岡県"],
  ["41", "佐賀県"], ["42", "長崎県"], ["43", "熊本県"], ["44", "大分県"], ["45", "宮崎県"],
  ["46", "鹿児島県"], ["47", "沖縄県"],
];

/** 都道府県コード→名称マップ */
export const PREFECTURE_NAMES: Record<string, string> = Object.fromEntries(PREFECTURE_LIST);
