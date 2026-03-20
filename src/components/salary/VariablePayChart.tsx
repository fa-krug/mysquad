import { useCallback, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, LabelList, ResponsiveContainer } from "recharts";
import { annualTotal, variableTotal, formatCents } from "@/lib/salary-utils";
import type { SalaryDataPointMember } from "@/lib/types";
import { TooltipPortal } from "./TooltipPortal";
import { useStickyTooltip } from "@/hooks/useStickyTooltip";

interface ChartEntry {
  name: string;
  fixed: number;
  variable: number;
  varPct: string;
}

interface VariablePayChartProps {
  members: SalaryDataPointMember[];
}

export function VariablePayChart({ members }: VariablePayChartProps) {
  const [chartEl, setChartEl] = useState<HTMLDivElement | null>(null);
  const chartCallbackRef = useCallback((node: HTMLDivElement | null) => setChartEl(node), []);
  const { pinned, pin } = useStickyTooltip<ChartEntry>(chartEl);

  const active = members
    .filter((m) => m.is_active)
    .sort(
      (a, b) => a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name),
    );
  if (active.length === 0) return null;

  const data: ChartEntry[] = active.map((m) => {
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

  const renderTooltipContent = (entry: ChartEntry) => (
    <>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{entry.name}</div>
      <div style={{ color: "#3b82f6" }}>Fixed: {formatCents(entry.fixed * 100)}</div>
      <div style={{ color: "#93c5fd" }}>Variable: {formatCents(entry.variable * 100)}</div>
    </>
  );

  return (
    <div className="relative">
      <h4 className="text-sm font-semibold mb-2">Variable Pay Breakdown</h4>
      <div ref={chartCallbackRef}>
        <ResponsiveContainer width="100%" height={active.length * 40 + 40}>
          <BarChart
            data={data}
            layout="vertical"
            margin={{ left: 120, right: 60, top: 5, bottom: 5 }}
            onClick={(state) => {
              const idx = state?.activeTooltipIndex;
              if (idx != null && data[idx as number] && state.activeCoordinate) {
                const entry = data[idx as number];
                pin(entry.name, entry, state.activeCoordinate);
              }
            }}
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
                if (pinned) return null;
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
      {pinned && (
        <TooltipPortal active coordinate={pinned.coordinate} chartElement={chartEl}>
          {renderTooltipContent(pinned.entry)}
        </TooltipPortal>
      )}
    </div>
  );
}
