"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { FUNCTION_COLORS, FUNCTION_LABELS } from "@/types";
import type { FunctionType } from "@/types";

interface FunctionBarChartProps {
  data: {
    label: string;
    high_acute: number;
    acute: number;
    recovery: number;
    chronic: number;
  }[];
  height?: number;
}

export function FunctionBarChart({ data, height = 400 }: FunctionBarChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="label" />
        <YAxis tickFormatter={(v: number) => `${(v / 10000).toFixed(0)}万`} />
        <Tooltip
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
        {(Object.keys(FUNCTION_COLORS) as FunctionType[]).map((key) => (
          <Bar
            key={key}
            dataKey={key}
            stackId="a"
            fill={FUNCTION_COLORS[key]}
            name={key}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
