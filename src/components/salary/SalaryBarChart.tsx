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

interface ChartEntry {
  name: string;
  total: number;
  fit: keyof typeof fillColors;
  isPromoted: boolean;
  rangeMin: number | null;
  rangeMax: number | null;
  titleName: string | null;
}

/** Custom bar shape that also renders the title salary range bracket behind the bar */
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

  // x is the pixel position of value 0, width maps to entry.total
  const pxPerUnit = entry.total > 0 ? width / entry.total : 0;

  let rangeX = 0;
  let rangeW = 0;
  if (rangeMin !== null && rangeMax !== null && pxPerUnit > 0) {
    rangeX = x + rangeMin * pxPerUnit;
    rangeW = (rangeMax - rangeMin) * pxPerUnit;
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
    </g>
  );
}

interface SalaryBarChartProps {
  members: SalaryDataPointMember[];
  ranges: SalaryRange[];
  budget: number | null;
}

export function SalaryBarChart({ members, ranges, budget }: SalaryBarChartProps) {
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
    return {
      name: `${m.last_name}, ${m.first_name}`,
      total: total / 100,
      fit,
      isPromoted: m.is_promoted,
      rangeMin: range ? range.min_salary / 100 : null,
      rangeMax: range ? range.max_salary / 100 : null,
      titleName: m.promoted_title_name ?? m.title_name,
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
            formatter={(_value, _name, props) => {
              const entry = props.payload as ChartEntry;
              const salary = formatCents(entry.total * 100);
              if (entry.rangeMin !== null && entry.rangeMax !== null) {
                return `${salary}  (range: ${formatCents(entry.rangeMin * 100)} – ${formatCents(entry.rangeMax * 100)})`;
              }
              return salary;
            }}
            contentStyle={{ backgroundColor: "var(--popover)", border: "1px solid var(--border)" }}
            labelStyle={{ color: "var(--popover-foreground)" }}
            itemStyle={{ color: "var(--popover-foreground)" }}
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
  );
}
