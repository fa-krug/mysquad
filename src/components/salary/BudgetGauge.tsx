import { formatCents, formatDeltaPercent } from "@/lib/salary-utils";
import { cn } from "@/lib/utils";

interface BudgetGaugeProps {
  totalSalary: number; // cents, non-promoted only
  budget: number | null; // cents
}

export function BudgetGauge({ totalSalary, budget }: BudgetGaugeProps) {
  if (budget === null || budget === 0) return null;

  const diff = totalSalary - budget;
  const diffPct = (diff / budget) * 100;
  const usage = (totalSalary / budget) * 100;
  const isOver = diff > 0;

  return (
    <div>
      <h4 className="text-sm font-semibold mb-2">Budget</h4>
      <div className="rounded-lg border border-border p-4">
        <div className="mb-3 h-3 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              isOver ? "bg-red-500" : "bg-green-500",
            )}
            style={{ width: `${Math.min(usage, 100)}%` }}
          />
        </div>
        <div className="flex justify-between text-sm">
          <div>
            <span className="text-muted-foreground">Total: </span>
            <span className="font-medium">{formatCents(totalSalary)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Budget: </span>
            <span className="font-medium">{formatCents(budget)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Diff: </span>
            <span className={cn("font-medium", isOver ? "text-red-600" : "text-green-600")}>
              {diff > 0 ? "+" : ""}
              {formatCents(diff)} ({formatDeltaPercent(diffPct)})
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
