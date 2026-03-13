import { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { formatCents } from "@/lib/salary-utils";
import type { SalaryOverTimePoint } from "@/lib/types";

const COLORS = [
  "#3b82f6",
  "#ef4444",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#84cc16",
  "#f97316",
  "#6366f1",
  "#14b8a6",
  "#e11d48",
  "#0ea5e9",
  "#a855f7",
  "#22c55e",
];

interface SalaryOverTimeChartProps {
  data: SalaryOverTimePoint[];
}

export function SalaryOverTimeChart({ data }: SalaryOverTimeChartProps) {
  const { chartData, memberKeys } = useMemo(() => {
    const memberMap = new Map<number, { name: string; left: boolean }>();

    for (const point of data) {
      for (const m of point.members) {
        memberMap.set(m.member_id, {
          name: `${m.last_name}, ${m.first_name}`,
          left: m.left_date !== null,
        });
      }
    }

    const keys = Array.from(memberMap.entries()).map(([id, info]) => ({
      id,
      dataKey: `member_${id}`,
      name: info.name,
      left: info.left,
    }));

    const chartData = data.map((point) => {
      const row: Record<string, string | number | undefined> = {
        name: point.data_point_name,
      };
      for (const m of point.members) {
        row[`member_${m.member_id}`] = m.annual_total / 100;
      }
      return row;
    });

    return { chartData, memberKeys: keys };
  }, [data]);

  if (data.length === 0 || memberKeys.length === 0) {
    return <p className="text-sm text-muted-foreground">No salary data points available.</p>;
  }

  return (
    <div>
      <h3 className="text-sm font-semibold mb-4">Salary Over Time</h3>
      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <XAxis dataKey="name" tick={{ fontSize: 12, fill: "currentColor" }} />
          <YAxis
            tickFormatter={(v: number) => `€${(v / 1000).toFixed(0)}k`}
            tick={{ fill: "currentColor" }}
          />
          <Tooltip
            formatter={(value) => formatCents((value as number) * 100)}
            contentStyle={{
              backgroundColor: "var(--popover)",
              border: "1px solid var(--border)",
            }}
            labelStyle={{ color: "var(--popover-foreground)" }}
            itemStyle={{ color: "var(--popover-foreground)" }}
          />
          <Legend />
          {memberKeys.map((mk, i) => (
            <Line
              key={mk.id}
              type="monotone"
              dataKey={mk.dataKey}
              name={mk.name}
              stroke={COLORS[i % COLORS.length]}
              strokeDasharray={mk.left ? "5 5" : undefined}
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
