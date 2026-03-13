import { BarChart, Bar, XAxis, YAxis, Tooltip, LabelList, ResponsiveContainer } from "recharts";
import { annualTotal, variableTotal, formatCents } from "@/lib/salary-utils";
import type { SalaryDataPointMember } from "@/lib/types";

interface VariablePayChartProps {
  members: SalaryDataPointMember[];
}

export function VariablePayChart({ members }: VariablePayChartProps) {
  const active = members
    .filter((m) => m.is_active)
    .sort(
      (a, b) => a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name),
    );
  if (active.length === 0) return null;

  const data = active.map((m) => {
    const total = annualTotal(m.parts);
    const variable = variableTotal(m.parts);
    const fixed = total - variable;
    const varPct = total > 0 ? ((variable / total) * 100).toFixed(1) : "0";
    return {
      name: `${m.last_name}, ${m.first_name}`,
      fixed: fixed / 100,
      variable: variable / 100,
      varPct,
    };
  });

  return (
    <div>
      <h4 className="text-sm font-semibold mb-2">Variable Pay Breakdown</h4>
      <ResponsiveContainer width="100%" height={active.length * 40 + 40}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ left: 120, right: 60, top: 5, bottom: 5 }}
        >
          <XAxis
            type="number"
            tickFormatter={(v: number) => `€${(v / 1000).toFixed(0)}k`}
            tick={{ fill: "currentColor" }}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={110}
            tick={{ fontSize: 12, fill: "currentColor" }}
          />
          <Tooltip
            formatter={(value) => formatCents((value as number) * 100)}
            contentStyle={{ backgroundColor: "var(--popover)", border: "1px solid var(--border)" }}
            labelStyle={{ color: "var(--popover-foreground)" }}
            itemStyle={{ color: "var(--popover-foreground)" }}
            cursor={{ fill: "currentColor", opacity: 0.1 }}
          />
          <Bar
            dataKey="fixed"
            stackId="salary"
            fill="#3b82f6"
            radius={[0, 0, 0, 0]}
            name="Fixed"
            activeBar={false}
          />
          <Bar
            dataKey="variable"
            stackId="salary"
            fill="#93c5fd"
            radius={[0, 4, 4, 0]}
            name="Variable"
            activeBar={false}
          >
            <LabelList
              dataKey="varPct"
              position="right"
              formatter={(v) => `${v}%`}
              style={{ fill: "currentColor", fontSize: 11 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
