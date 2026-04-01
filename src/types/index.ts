/** 医療機能区分 */
export type FunctionType =
  | "high_acute" // 高度急性期
  | "acute" // 急性期
  | "recovery" // 回復期
  | "chronic"; // 慢性期

export const FUNCTION_LABELS: Record<FunctionType, string> = {
  high_acute: "高度急性期",
  acute: "急性期",
  recovery: "回復期",
  chronic: "慢性期",
};

export const FUNCTION_COLORS: Record<FunctionType, string> = {
  high_acute: "#ef4444",
  acute: "#f97316",
  recovery: "#22c55e",
  chronic: "#3b82f6",
};

/** 年度 */
export type FiscalYear = string; // e.g. "2019", "2020", ...

/** 構想区域 */
export interface Area {
  code: string;
  name: string;
  prefecture: string;
  prefectureCode: string;
}

/** 全国/都道府県集計データ */
export interface NationalSummary {
  year: FiscalYear;
  totalBeds: number;
  bedsByFunction: Record<FunctionType, number>;
  utilizationRate: number; // 病床利用率
  totalHospitals: number;
  totalClinics: number;
}

/** 構想区域別集計 */
export interface AreaSummary {
  areaCode: string;
  areaName: string;
  prefecture: string;
  year: FiscalYear;
  bedsByFunction: Record<FunctionType, number>;
  requiredBeds?: Record<FunctionType, number>; // 必要病床数（あれば）
  totalBeds: number;
  utilizationRate: number;
  hospitals: HospitalSummary[];
}

/** 病院サマリー */
export interface HospitalSummary {
  code: string;
  name: string;
  areaCode: string;
  areaName: string;
  prefecture: string;
  totalBeds: number;
  bedsByFunction: Record<FunctionType, number>;
  utilizationRate: number;
  emergencyTransports: number; // 救急車搬送件数
  surgeries: number; // 全身麻酔手術件数
  deliveries: number; // 分娩件数
  chemotherapy: number; // 化学療法件数
  radiotherapy: number; // 放射線治療件数
  tpa: number; // t-PA件数
  avgStayDays: number; // 平均在棟日数
  doctorsPerBed: number; // 医師配置密度
  nursesPerBed: number; // 看護師配置密度
}

/** 病院個別詳細（5年分） */
export interface HospitalDetail {
  code: string;
  name: string;
  address: string;
  areaCode: string;
  areaName: string;
  prefecture: string;
  yearlyData: Record<FiscalYear, HospitalYearData>;
}

export interface HospitalYearData {
  totalBeds: number;
  bedsByFunction: Record<FunctionType, number>;
  futureFunctionBeds?: Record<FunctionType, number>; // 6年後の予定
  utilizationRate: number;
  emergencyTransports: number;
  surgeries: number;
  deliveries: number;
  chemotherapy: number;
  radiotherapy: number;
  tpa: number;
  heartLungSurgeries: number;
  dialysis: number;
  rehabilitation: number;
  avgStayDays: number;
  doctors: number;
  nurses: number;
  wards: WardData[];
}

export interface WardData {
  wardName: string;
  functionType: FunctionType;
  futureFunctionType?: FunctionType;
  beds: number;
  admissionFee: string; // 算定入院料
  utilizationRate: number;
}

/** ランキングエントリ */
export interface RankingEntry {
  rank: number;
  hospitalCode: string;
  hospitalName: string;
  areaCode: string;
  areaName: string;
  prefecture: string;
  value: number;
}

/** ランキング指標 */
export type RankingMetric =
  | "surgeriesGA"
  | "emergencyTransports"
  | "chemotherapy"
  | "radiotherapy"
  | "tpa";

export const RANKING_METRIC_LABELS: Record<RankingMetric, string> = {
  surgeriesGA: "全身麻酔手術件数",
  emergencyTransports: "救急車搬送受入件数",
  chemotherapy: "化学療法件数",
  radiotherapy: "放射線治療件数",
  tpa: "t-PA件数",
};
