import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { annualTotal, variableTotal, formatCents } from "@/lib/salary-utils";
import type { SalaryDataPointMember } from "@/lib/types";

interface VariablePayChartProps {
  members: SalaryDataPointMember[];
}

export function VariablePayChart({ members }: VariablePayChartProps) {
  const active = members.filter((m) => m.is_active);
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
          <XAxis type="number" tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
          <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12 }} />
          <Tooltip formatter={(value) => formatCents((value as number) * 100)} />
          <Bar dataKey="fixed" stackId="salary" fill="#3b82f6" radius={[0, 0, 0, 0]} name="Fixed" />
          <Bar
            dataKey="variable"
            stackId="salary"
            fill="#93c5fd"
            radius={[0, 4, 4, 0]}
            name="Variable"
          />
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground px-2">
        {data.map((d) => (
          <span key={d.name}>
            {d.name}: {d.varPct}% variable
          </span>
        ))}
      </div>
    </div>
  );
}
