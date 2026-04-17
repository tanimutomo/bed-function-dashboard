"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

export interface PatientForecastPoint {
  year: string;
  under15: number;
  age15_64: number;
  age65_74: number;
  over75: number;
}

interface PatientForecastChartProps {
  data: PatientForecastPoint[];
  height?: number;
  /** 入院 or 外来 */
  kind?: "inpatient" | "outpatient";
}

const COLORS = {
  under15: "#93c5fd",   // 薄青
  age15_64: "#60a5fa",  // 青
  age65_74: "#fb923c",  // オレンジ
  over75: "#dc2626",    // 赤（医療需要の核心）
};

const LABELS: Record<keyof typeof COLORS, string> = {
  under15: "0〜14歳",
  age15_64: "15〜64歳",
  age65_74: "65〜74歳",
  over75: "75歳以上",
};

export function PatientForecastChart({ data, height = 360, kind = "inpatient" }: PatientForecastChartProps) {
  const keys = ["under15", "age15_64", "age65_74", "over75"] as const;
  const unitLabel = kind === "inpatient" ? "入院患者数" : "外来患者数";

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="year" tickFormatter={(v: string) => `${v}年`} />
        <YAxis tickFormatter={(v: number) => v >= 10000 ? `${(v / 10000).toFixed(1)}万` : `${v.toLocaleString()}`} />
        <Tooltip
          labelFormatter={(label: string) => `${label}年 / ${unitLabel}（1日あたり推計）`}
          formatter={(value: number, name: string) => [
            `${Math.round(value).toLocaleString()}人`,
            LABELS[name as keyof typeof LABELS] || name,
          ]}
        />
        <Legend formatter={(v: string) => LABELS[v as keyof typeof LABELS] || v} />
        {keys.map((key) => (
          <Area
            key={key}
            type="monotone"
            dataKey={key}
            stackId="1"
            stroke={COLORS[key]}
            fill={COLORS[key]}
            fillOpacity={0.8}
            name={key}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
