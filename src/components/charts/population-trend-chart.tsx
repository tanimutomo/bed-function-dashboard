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

export interface PopulationTrendPoint {
  year: string;
  under15: number;
  age15_64: number;
  over65to74: number;
  over75: number;
}

interface PopulationTrendChartProps {
  data: PopulationTrendPoint[];
  height?: number;
}

const COLORS = {
  under15: "#93c5fd",      // 薄青: 年少
  age15_64: "#60a5fa",     // 青: 生産年齢
  over65to74: "#fb923c",   // オレンジ: 前期高齢
  over75: "#dc2626",       // 赤: 後期高齢（医療ニーズ特に高い）
};

const LABELS: Record<keyof typeof COLORS, string> = {
  under15: "0〜14歳",
  age15_64: "15〜64歳",
  over65to74: "65〜74歳",
  over75: "75歳以上",
};

export function PopulationTrendChart({ data, height = 400 }: PopulationTrendChartProps) {
  const keys = ["under15", "age15_64", "over65to74", "over75"] as const;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="year" tickFormatter={(v: string) => `${v}年`} />
        <YAxis tickFormatter={(v: number) => `${(v / 10000).toFixed(0)}万`} />
        <Tooltip
          labelFormatter={(label: string) => `${label}年`}
          formatter={(value: number, name: string) => [
            `${value.toLocaleString()}人`,
            LABELS[name as keyof typeof LABELS] || name,
          ]}
        />
        <Legend
          formatter={(value: string) =>
            LABELS[value as keyof typeof LABELS] || value
          }
        />
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
