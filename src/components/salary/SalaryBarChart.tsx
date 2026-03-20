import { useState, useCallback, useEffect } from "react";
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
import type { SalaryDataPointMember, SalaryRange, SalaryPart } from "@/lib/types";
import { TooltipPortal } from "./TooltipPortal";
import { useStickyTooltip } from "@/hooks/useStickyTooltip";

const fillColors = { green: "#16a34a", yellow: "#ca8a04", red: "#dc2626", none: "#94a3b8" };

// Module-level ref for communicating hovered part from bar shape to tooltip
let hoveredPartName: string | null = null;
let setHoveredPartExternal: ((name: string | null) => void) | null = null;

interface PartSegment {
  name: string;
  annual: number; // in display units (euros), not cents
}

interface ChartEntry {
  name: string;
  total: number;
  fit: keyof typeof fillColors;
  isPromoted: boolean;
  rangeMin: number | null;
  rangeMax: number | null;
  titleName: string | null;
  parts: PartSegment[];
}

/** Custom bar shape that renders salary range bracket + per-part segments */
function BarWithRange(props: Record<string, unknown>) {
  const { x, y, width, height, fill, opacity, strokeDasharray, stroke } = props as {
    x: number;
    y: number;
    width: number;
    height: number;
    fill: string;
    opacity: number;
    strokeDasharray?: string;
    stroke?: string;
  };
  const entry = (props as { payload: ChartEntry }).payload;

  const rangeMin = entry.rangeMin;
  const rangeMax = entry.rangeMax;

  const pxPerUnit = entry.total > 0 ? width / entry.total : 0;

  let rangeX = 0;
  let rangeW = 0;
  if (rangeMin !== null && rangeMax !== null && pxPerUnit > 0) {
    rangeX = x + rangeMin * pxPerUnit;
    rangeW = (rangeMax - rangeMin) * pxPerUnit;
  }

  // Build part segments
  const segments: { xStart: number; w: number; opacity: number }[] = [];
  if (entry.parts.length > 1 && entry.total > 0) {
    let offset = 0;
    entry.parts.forEach((part, i) => {
      const w = part.annual * pxPerUnit;
      segments.push({
        xStart: x + offset,
        w,
        opacity: (opacity ?? 1) * (i % 2 === 0 ? 1 : 0.75),
      });
      offset += w;
    });
  }

  return (
    <g>
      {rangeW > 0 && (
        <rect
          x={rangeX}
          y={y + 1}
          width={rangeW}
          height={height - 2}
          fill="currentColor"
          opacity={0.08}
          rx={3}
        />
      )}
      {segments.length > 0 ? (
        segments.map((seg, i) => (
          <rect
            key={i}
            x={seg.xStart}
            y={y}
            width={Math.max(0, seg.w)}
            height={height}
            fill={fill}
            opacity={
              hoveredPartName === null
                ? seg.opacity
                : hoveredPartName === entry.parts[i]?.name
                  ? (opacity ?? 1)
                  : (opacity ?? 1) * 0.35
            }
            rx={i === 0 ? 4 : 0}
            ry={i === 0 ? 4 : 0}
            style={{ cursor: "pointer" }}
            onMouseEnter={() => setHoveredPartExternal?.(entry.parts[i]?.name ?? null)}
            onMouseLeave={() => setHoveredPartExternal?.(null)}
          />
        ))
      ) : (
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          fill={fill}
          opacity={opacity}
          rx={4}
          ry={4}
          strokeDasharray={strokeDasharray}
          stroke={stroke}
        />
      )}
      {/* Round the right end of the last segment */}
      {segments.length > 0 && (
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          fill="none"
          rx={4}
          ry={4}
          stroke={stroke}
          strokeDasharray={strokeDasharray}
        />
      )}
    </g>
  );
}

interface SalaryBarChartProps {
  members: SalaryDataPointMember[];
  ranges: SalaryRange[];
  budget: number | null;
}

export function SalaryBarChart({ members, ranges, budget }: SalaryBarChartProps) {
  const [chartEl, setChartEl] = useState<HTMLDivElement | null>(null);
  const chartCallbackRef = useCallback((node: HTMLDivElement | null) => setChartEl(node), []);
  const [hoveredPart, setHoveredPart] = useState<string | null>(null);
  const handleSetHoveredPart = useCallback((name: string | null) => {
    hoveredPartName = name;
    setHoveredPart(name);
  }, []);
  useEffect(() => {
    setHoveredPartExternal = handleSetHoveredPart;
    return () => {
      setHoveredPartExternal = null;
    };
  }, [handleSetHoveredPart]);

  const { pinned, pin } = useStickyTooltip<ChartEntry>(chartEl);

  const active = members
    .filter((m) => m.is_active)
    .sort(
      (a, b) => a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name),
    );
  if (active.length === 0) return null;

  const data: ChartEntry[] = active.map((m) => {
    const total = annualTotal(m.parts);
    const range = getRangeForMember(m, ranges);
    const fit = rangeFitColor(total, range);
    const parts: PartSegment[] = m.parts
      .filter((p) => p.amount > 0)
      .map((p: SalaryPart) => ({
        name: p.name || "Untitled",
        annual: (p.amount * p.frequency) / 100,
      }));
    return {
      name: `${m.last_name}, ${m.first_name}`,
      total: total / 100,
      fit,
      isPromoted: m.is_promoted,
      rangeMin: range ? range.min_salary / 100 : null,
      rangeMax: range ? range.max_salary / 100 : null,
      titleName: m.promoted_title_name ?? m.title_name,
      parts,
    };
  });

  const { headcount } = budgetTotals(members);
  const avgPerHead = budget && headcount > 0 ? budget / 100 / headcount : null;

  const renderTooltipContent = (entry: ChartEntry) => (
    <>
      <div style={{ fontWeight: 600, marginBottom: entry.parts.length > 1 ? 4 : 0 }}>
        {entry.name}: {formatCents(entry.total * 100)}
      </div>
      {entry.parts.length > 1 &&
        entry.parts.map((p, i) => (
          <div
            key={i}
            style={{
              opacity: hoveredPart === null ? 0.75 : hoveredPart === p.name ? 1 : 0.4,
              fontWeight: hoveredPart === p.name ? 600 : 400,
            }}
          >
            {hoveredPart === p.name ? "→ " : ""}
            {p.name}: {formatCents(p.annual * 100)}
          </div>
        ))}
      {entry.rangeMin !== null && entry.rangeMax !== null && (
        <div style={{ opacity: 0.6, marginTop: 2 }}>
          Range: {formatCents(entry.rangeMin * 100)} – {formatCents(entry.rangeMax * 100)}
        </div>
      )}
    </>
  );

  return (
    <div className="relative">
      <h4 className="text-sm font-semibold mb-2">Salary Overview</h4>
      <div ref={chartCallbackRef}>
        <ResponsiveContainer width="100%" height={active.length * 40 + 40}>
          <BarChart
            data={data}
            layout="vertical"
            margin={{ left: 120, right: 20, top: 5, bottom: 5 }}
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
              content={({ active: isActive, payload, coordinate }) => {
                if (pinned) return null;
                if (!isActive || !payload?.[0]) return null;
                const entry = payload[0].payload as ChartEntry;
                return (
                  <TooltipPortal active={isActive} coordinate={coordinate} chartElement={chartEl}>
                    {renderTooltipContent(entry)}
                  </TooltipPortal>
                );
              }}
              cursor={{ fill: "currentColor", opacity: 0.1 }}
            />
            <Bar
              dataKey="total"
              activeBar={false}
              shape={(props) => {
                const p = props as unknown as Record<string, unknown>;
                const entry = (p as unknown as { payload: ChartEntry }).payload;
                return (
                  <BarWithRange
                    {...p}
                    opacity={entry.isPromoted ? 0.5 : 1}
                    strokeDasharray={entry.isPromoted ? "4 2" : undefined}
                    stroke={entry.isPromoted ? fillColors[entry.fit] : undefined}
                  />
                );
              }}
            >
              {data.map((entry, i) => (
                <Cell key={i} fill={fillColors[entry.fit]} />
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
      {pinned && (
        <TooltipPortal active coordinate={pinned.coordinate} chartElement={chartEl}>
          {renderTooltipContent(pinned.entry)}
        </TooltipPortal>
      )}
    </div>
  );
}
