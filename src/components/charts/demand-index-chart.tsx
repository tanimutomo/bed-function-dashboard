"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

export interface DemandIndexPoint {
  year: string;
  medicalIndex: number;
  nursingCareIndex: number;
}

interface DemandIndexChartProps {
  data: DemandIndexPoint[];
  height?: number;
}

/**
 * 医療需要・介護需要指数のトレンドを折れ線で表示。
 * 2020年=100の基準線を表示し、以降の増減を視覚化する。
 */
export function DemandIndexChart({ data, height = 320 }: DemandIndexChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="year" tickFormatter={(v: string) => `${v}年`} />
        <YAxis
          domain={[
            (dataMin: number) => Math.max(0, Math.floor((dataMin - 10) / 10) * 10),
            (dataMax: number) => Math.ceil((dataMax + 10) / 10) * 10,
          ]}
          tickFormatter={(v: number) => `${v}`}
        />
        <Tooltip
          labelFormatter={(label: string) => `${label}年`}
          formatter={(value: number, name: string) => {
            const label = name === "medicalIndex" ? "医療需要指数" : "介護需要指数";
            return [`${value.toFixed(1)}`, label];
          }}
        />
        <Legend
          formatter={(v: string) =>
            v === "medicalIndex" ? "医療需要指数" : "介護需要指数"
          }
        />
        <ReferenceLine y={100} stroke="#9ca3af" strokeDasharray="4 4" label={{ value: "基準(2020=100)", position: "insideBottomRight", fontSize: 11, fill: "#6b7280" }} />
        <Line
          type="monotone"
          dataKey="medicalIndex"
          stroke="#2563eb"
          strokeWidth={2.5}
          name="medicalIndex"
          dot={{ r: 4 }}
        />
        <Line
          type="monotone"
          dataKey="nursingCareIndex"
          stroke="#dc2626"
          strokeWidth={2.5}
          name="nursingCareIndex"
          dot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
