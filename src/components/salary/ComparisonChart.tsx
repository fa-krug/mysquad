import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { annualTotal, formatCents, formatDeltaPercent } from "@/lib/salary-utils";
import type { SalaryDataPointMember, SalaryPart } from "@/lib/types";

interface ComparisonChartProps {
  members: SalaryDataPointMember[];
  previousData: Record<number, SalaryPart[] | null>; // keyed by member_id
}

export function ComparisonChart({ members, previousData }: ComparisonChartProps) {
  const active = members.filter((m) => m.is_active);
  if (active.length === 0) return null;

  const data = active.map((m) => {
    const current = annualTotal(m.parts) / 100;
    const prevParts = previousData[m.member_id];
    const previous = prevParts ? annualTotal(prevParts) / 100 : null;
    const delta = previous !== null ? current - previous : null;
    const deltaPct = previous !== null && previous > 0 ? ((delta! / previous) * 100) : null;
    return {
      name: `${m.last_name}, ${m.first_name}`,
      current,
      previous: previous ?? 0,
      delta,
      deltaPct,
      isNew: prevParts === null,
    };
  });

  const hasAnyPrevious = data.some((d) => !d.isNew);
  if (!hasAnyPrevious) return null;

  return (
    <div>
      <h4 className="text-sm font-semibold mb-2">Comparison vs Previous</h4>
      <ResponsiveContainer width="100%" height={active.length * 50 + 40}>
        <BarChart data={data} layout="vertical" margin={{ left: 120, right: 80, top: 5, bottom: 5 }}>
          <XAxis type="number" tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
          <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12 }} />
          <Tooltip formatter={(value: number) => formatCents(value * 100)} />
          <Bar dataKey="previous" fill="#cbd5e1" radius={[0, 4, 4, 0]} name="Previous" />
          <Bar dataKey="current" fill="#3b82f6" radius={[0, 4, 4, 0]} name="Current" />
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs px-2">
        {data.map((d) => (
          <span
            key={d.name}
            className={d.isNew ? "text-muted-foreground" : d.delta! > 0 ? "text-green-600" : d.delta! < 0 ? "text-red-600" : "text-muted-foreground"}
          >
            {d.name}: {d.isNew ? "New" : `${d.delta! > 0 ? "+" : ""}${formatCents(d.delta! * 100)} (${formatDeltaPercent(d.deltaPct!)})`}
          </span>
        ))}
      </div>
    </div>
  );
}
