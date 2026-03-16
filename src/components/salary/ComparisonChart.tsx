import { useCallback, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, LabelList, ResponsiveContainer } from "recharts";
import { annualTotal, formatCents, formatDeltaPercent } from "@/lib/salary-utils";
import type { SalaryDataPointMember, SalaryPart } from "@/lib/types";
import { TooltipPortal } from "./TooltipPortal";

interface ComparisonChartProps {
  members: SalaryDataPointMember[];
  previousData: Record<number, SalaryPart[] | null>; // keyed by member_id
}

export function ComparisonChart({ members, previousData }: ComparisonChartProps) {
  const [chartEl, setChartEl] = useState<HTMLDivElement | null>(null);
  const chartCallbackRef = useCallback((node: HTMLDivElement | null) => setChartEl(node), []);
  const active = members
    .filter((m) => m.is_active)
    .sort(
      (a, b) => a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name),
    );
  if (active.length === 0) return null;

  const data = active.map((m) => {
    const current = annualTotal(m.parts) / 100;
    const prevParts = previousData[m.member_id];
    const previous = prevParts ? annualTotal(prevParts) / 100 : null;
    const delta = previous !== null ? current - previous : null;
    const deltaPct = previous !== null && previous > 0 ? (delta! / previous) * 100 : null;
    const deltaLabel =
      prevParts == null
        ? "New"
        : delta !== null
          ? `${delta > 0 ? "+" : ""}${formatCents(delta * 100)} (${formatDeltaPercent(deltaPct!)})`
          : "";
    return {
      name: `${m.last_name}, ${m.first_name}`,
      current,
      previous: previous ?? 0,
      delta,
      deltaPct,
      isNew: prevParts == null,
      deltaLabel,
    };
  });

  const hasAnyPrevious = data.some((d) => !d.isNew);
  if (!hasAnyPrevious) return null;

  return (
    <div className="relative">
      <h4 className="text-sm font-semibold mb-2">Comparison vs Previous</h4>
      <div ref={chartCallbackRef}>
        <ResponsiveContainer width="100%" height={active.length * 50 + 40}>
          <BarChart
            data={data}
            layout="vertical"
            margin={{ left: 120, right: 140, top: 5, bottom: 5 }}
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
              isAnimationActive={false}
              content={({ active: isActive, payload, coordinate, label }) => {
                if (!isActive || !payload?.length) return null;
                return (
                  <TooltipPortal active={isActive} coordinate={coordinate} chartElement={chartEl}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
                    {payload.map((p, i) => (
                      <div key={i} style={{ color: p.color }}>
                        {p.name}: {formatCents((p.value as number) * 100)}
                      </div>
                    ))}
                  </TooltipPortal>
                );
              }}
              cursor={{ fill: "currentColor", opacity: 0.1 }}
            />
            <Bar
              dataKey="previous"
              fill="#94a3b8"
              radius={[0, 4, 4, 0]}
              name="Previous"
              activeBar={false}
            />
            <Bar
              dataKey="current"
              fill="#3b82f6"
              radius={[0, 4, 4, 0]}
              name="Current"
              activeBar={false}
            >
              <LabelList
                dataKey="deltaLabel"
                position="right"
                content={({ x, y, width, height, value, index }) => {
                  const d = data[index as number];
                  const color = d.isNew
                    ? "#94a3b8"
                    : d.delta! > 0
                      ? "#16a34a"
                      : d.delta! < 0
                        ? "#dc2626"
                        : "#94a3b8";
                  return (
                    <text
                      x={(x as number) + (width as number) + 4}
                      y={(y as number) + (height as number) / 2}
                      fill={color}
                      fontSize={11}
                      dominantBaseline="central"
                    >
                      {value}
                    </text>
                  );
                }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
