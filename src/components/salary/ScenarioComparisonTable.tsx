import { formatCents } from "@/lib/salary-utils";
import { cn } from "@/lib/utils";
import type { ScenarioSummary } from "@/lib/types";

interface ScenarioComparisonTableProps {
  summaries: ScenarioSummary[];
  currentDataPointId: number;
  budget: number | null;
  previousTotal: number | null;
  previousBudget: number | null;
  previousHeadcount: number | null;
  anyPresented: boolean;
}

export function ScenarioComparisonTable({
  summaries,
  currentDataPointId,
  budget,
  previousTotal,
  previousBudget,
  previousHeadcount,
  anyPresented,
}: ScenarioComparisonTableProps) {
  if (summaries.length === 0) return null;

  return (
    <div className="rounded-lg border border-purple-200 dark:border-purple-800/50 bg-purple-50/30 dark:bg-purple-950/10 p-4">
      <h3 className="text-sm font-semibold mb-3 text-purple-700 dark:text-purple-300">
        Scenario Comparison
      </h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-muted-foreground">
            <th className="px-2 py-1 text-left font-medium">Scenario</th>
            <th className="px-2 py-1 text-right font-medium">Total Cost</th>
            {!anyPresented && <th className="px-2 py-1 text-right font-medium">Budget</th>}
            <th className="px-2 py-1 text-right font-medium">Delta</th>
            <th className="px-2 py-1 text-right font-medium">Headcount</th>
          </tr>
        </thead>
        <tbody>
          {!anyPresented && previousTotal != null && (
            <tr className="text-xs text-muted-foreground border-b">
              <td className="px-2 py-1.5 italic">Previous</td>
              <td className="px-2 py-1.5 text-right">{formatCents(previousTotal)}</td>
              <td className="px-2 py-1.5 text-right">
                {previousBudget != null ? formatCents(previousBudget) : "—"}
              </td>
              <td className="px-2 py-1.5 text-right">—</td>
              <td className="px-2 py-1.5 text-right">{previousHeadcount ?? "—"}</td>
            </tr>
          )}
          {summaries.map((s) => {
            const delta = previousTotal != null ? s.total_salary - previousTotal : null;
            const deltaPct =
              previousTotal && previousTotal > 0 ? (delta! / previousTotal) * 100 : null;
            const budgetDiff = budget != null ? s.total_salary - budget : null;
            return (
              <tr
                key={s.data_point_id}
                className={cn(
                  s.data_point_id === currentDataPointId &&
                    "bg-purple-100/50 dark:bg-purple-900/20 font-medium",
                )}
              >
                <td className="px-2 py-1.5">{s.data_point_name}</td>
                <td className="px-2 py-1.5 text-right">{formatCents(s.total_salary)}</td>
                {!anyPresented && (
                  <td className="px-2 py-1.5 text-right">
                    {budget != null ? formatCents(budget) : "—"}
                    {budgetDiff != null && (
                      <span
                        className={cn(
                          "ml-1 text-xs",
                          budgetDiff > 0 ? "text-red-600" : "text-green-600",
                        )}
                      >
                        ({budgetDiff > 0 ? "+" : ""}
                        {formatCents(budgetDiff)})
                      </span>
                    )}
                  </td>
                )}
                <td className="px-2 py-1.5 text-right">
                  {delta != null ? (
                    <span className={delta > 0 ? "text-red-600" : "text-green-600"}>
                      {delta > 0 ? "+" : ""}
                      {formatCents(delta)}
                      {deltaPct != null && (
                        <span className="ml-1 text-xs">
                          ({deltaPct > 0 ? "+" : ""}
                          {deltaPct.toFixed(1)}%)
                        </span>
                      )}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-2 py-1.5 text-right">{s.headcount}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
