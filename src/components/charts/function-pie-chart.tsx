"use client";

import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";
import { FUNCTION_COLORS, FUNCTION_LABELS } from "@/types";
import type { FunctionType } from "@/types";

interface FunctionPieChartProps {
  data: Record<FunctionType, number>;
  height?: number;
}

export function FunctionPieChart({ data, height = 300 }: FunctionPieChartProps) {
  const chartData = (Object.keys(FUNCTION_LABELS) as FunctionType[]).map(
    (key) => ({
      name: FUNCTION_LABELS[key],
      value: data[key] || 0,
      key,
    })
  );

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={100}
          paddingAngle={2}
          dataKey="value"
          label={({ name, percent }) =>
            `${name} ${(percent * 100).toFixed(1)}%`
          }
          labelLine={false}
        >
          {chartData.map((entry) => (
            <Cell
              key={entry.key}
              fill={FUNCTION_COLORS[entry.key]}
            />
          ))}
        </Pie>
        <Tooltip
          formatter={(value: number) => [`${value.toLocaleString()}床`]}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
