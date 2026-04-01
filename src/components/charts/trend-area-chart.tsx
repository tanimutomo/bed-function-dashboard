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
import { FUNCTION_COLORS, FUNCTION_LABELS } from "@/types";
import type { FunctionType } from "@/types";

interface TrendAreaChartProps {
  data: {
    year: string;
    high_acute: number;
    acute: number;
    recovery: number;
    chronic: number;
  }[];
  height?: number;
}

export function TrendAreaChart({ data, height = 400 }: TrendAreaChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="year" tickFormatter={(v: string) => `${v}年度`} />
        <YAxis tickFormatter={(v: number) => `${(v / 10000).toFixed(0)}万`} />
        <Tooltip
          labelFormatter={(label: string) => `${label}年度`}
          formatter={(value: number, name: string) => [
            `${value.toLocaleString()}床`,
            FUNCTION_LABELS[name as FunctionType] || name,
          ]}
        />
        <Legend
          formatter={(value: string) =>
            FUNCTION_LABELS[value as FunctionType] || value
          }
        />
        {(Object.keys(FUNCTION_COLORS) as FunctionType[]).reverse().map((key) => (
          <Area
            key={key}
            type="monotone"
            dataKey={key}
            stackId="1"
            stroke={FUNCTION_COLORS[key]}
            fill={FUNCTION_COLORS[key]}
            fillOpacity={0.8}
            name={key}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
