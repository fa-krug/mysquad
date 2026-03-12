import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  Cell,
  ResponsiveContainer,
} from "recharts";
import {
  annualTotal,
  rangeFitColor,
  getRangeForMember,
  formatCents,
  budgetTotals,
} from "@/lib/salary-utils";
import type { SalaryDataPointMember, SalaryRange } from "@/lib/types";

const fillColors = { green: "#16a34a", yellow: "#ca8a04", red: "#dc2626", none: "#94a3b8" };

interface SalaryBarChartProps {
  members: SalaryDataPointMember[];
  ranges: SalaryRange[];
  budget: number | null;
}

export function SalaryBarChart({ members, ranges, budget }: SalaryBarChartProps) {
  const active = members.filter((m) => m.is_active);
  if (active.length === 0) return null;

  const data = active.map((m) => {
    const total = annualTotal(m.parts);
    const range = getRangeForMember(m, ranges);
    const fit = rangeFitColor(total, range);
    return {
      name: `${m.last_name}, ${m.first_name}`,
      total: total / 100,
      fit,
      isPromoted: m.is_promoted,
    };
  });

  const { headcount } = budgetTotals(members);
  const avgPerHead = budget && headcount > 0 ? budget / 100 / headcount : null;

  return (
    <div>
      <h4 className="text-sm font-semibold mb-2">Salary Overview</h4>
      <ResponsiveContainer width="100%" height={active.length * 40 + 40}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ left: 120, right: 20, top: 5, bottom: 5 }}
        >
          <XAxis type="number" tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
          <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12 }} />
          <Tooltip formatter={(value) => formatCents((value as number) * 100)} />
          <Bar dataKey="total" radius={[0, 4, 4, 0]}>
            {data.map((entry, i) => (
              <Cell
                key={i}
                fill={fillColors[entry.fit]}
                opacity={entry.isPromoted ? 0.5 : 1}
                strokeDasharray={entry.isPromoted ? "4 2" : undefined}
                stroke={entry.isPromoted ? fillColors[entry.fit] : undefined}
              />
            ))}
          </Bar>
          {avgPerHead && (
            <ReferenceLine
              x={avgPerHead}
              stroke="#6366f1"
              strokeDasharray="3 3"
              label={{ value: "Avg", position: "top", fontSize: 11 }}
            />
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
