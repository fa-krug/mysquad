import { useCallback, useMemo, useState, useEffect } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { formatCents } from "@/lib/salary-utils";
import type { SalaryOverTimePoint } from "@/lib/types";
import { TooltipPortal } from "./TooltipPortal";

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

interface MemberKey {
  id: number;
  dataKey: string;
  name: string;
  left: boolean;
}

interface PinnedMember {
  dataKey: string;
  coordinate: { x: number; y: number };
}

interface SalaryOverTimeChartProps {
  data: SalaryOverTimePoint[];
}

export function SalaryOverTimeChart({ data }: SalaryOverTimeChartProps) {
  const [chartEl, setChartEl] = useState<HTMLDivElement | null>(null);
  const chartCallbackRef = useCallback((node: HTMLDivElement | null) => setChartEl(node), []);
  const [hoveredMember, setHoveredMember] = useState<string | null>(null);
  const [pinned, setPinned] = useState<PinnedMember | null>(null);

  // Click outside to dismiss pinned tooltip
  useEffect(() => {
    if (!pinned) return;
    const handler = (e: MouseEvent) => {
      if (chartEl && !chartEl.contains(e.target as Node)) {
        setPinned(null);
      }
    };
    const id = setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener("mousedown", handler);
    };
  }, [pinned, chartEl]);

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

  const activeMemberKey = pinned?.dataKey ?? hoveredMember;

  const renderMemberTooltip = (dataKey: string, keys: MemberKey[]) => {
    const mk = keys.find((k) => k.dataKey === dataKey);
    if (!mk) return null;
    const color = COLORS[keys.indexOf(mk) % COLORS.length];
    const history = chartData
      .filter((row) => row[dataKey] != null)
      .map((row) => ({
        label: row.name as string,
        value: row[dataKey] as number,
      }));
    return (
      <>
        <div style={{ fontWeight: 600, marginBottom: 4, color }}>{mk.name}</div>
        {history.map((h, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span style={{ color: "var(--muted-foreground, #888)" }}>{h.label}</span>
            <span style={{ fontWeight: 500 }}>{formatCents(h.value * 100)}</span>
          </div>
        ))}
      </>
    );
  };

  return (
    <div>
      <h3 className="text-sm font-semibold mb-4">Salary Over Time</h3>
      <div ref={chartCallbackRef}>
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <XAxis dataKey="name" tick={{ fontSize: 12, fill: "currentColor" }} />
            <YAxis
              tickFormatter={(v: number) => `€${(v / 1000).toFixed(0)}k`}
              tick={{ fill: "currentColor" }}
            />
            <Tooltip
              isAnimationActive={false}
              content={({ active: isActive, coordinate }) => {
                if (pinned) return null;
                if (!isActive || !hoveredMember) return null;
                const mk = memberKeys.find((k) => k.dataKey === hoveredMember);
                if (!mk) return null;
                return (
                  <TooltipPortal active={isActive} coordinate={coordinate} chartElement={chartEl}>
                    {renderMemberTooltip(hoveredMember, memberKeys)}
                  </TooltipPortal>
                );
              }}
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
                strokeWidth={activeMemberKey === mk.dataKey ? 3 : activeMemberKey ? 1 : 2}
                strokeOpacity={activeMemberKey && activeMemberKey !== mk.dataKey ? 0.3 : 1}
                dot={{ r: 3 }}
                activeDot={{
                  r: 5,
                  onMouseEnter: () => setHoveredMember(mk.dataKey),
                  onMouseLeave: () => setHoveredMember(null),
                  onClick: (_: unknown, e: React.MouseEvent) => {
                    const rect = chartEl?.getBoundingClientRect();
                    if (!rect) return;
                    const coordinate = {
                      x: e.clientX - rect.left,
                      y: e.clientY - rect.top,
                    };
                    setPinned((prev) =>
                      prev?.dataKey === mk.dataKey ? null : { dataKey: mk.dataKey, coordinate },
                    );
                  },
                }}
                connectNulls={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      {pinned && (
        <TooltipPortal active coordinate={pinned.coordinate} chartElement={chartEl}>
          {renderMemberTooltip(pinned.dataKey, memberKeys)}
        </TooltipPortal>
      )}
    </div>
  );
}
