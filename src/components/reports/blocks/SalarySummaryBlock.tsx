import type { SalarySummaryData } from "@/lib/types";

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function SalarySummaryBlock({ data }: { data: SalarySummaryData }) {
  if (!data.data_point_name) {
    return <p className="text-sm text-muted-foreground">No salary data available.</p>;
  }

  const utilization =
    data.budget && data.budget > 0 ? Math.round((data.total_salary / data.budget) * 100) : null;

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">Based on: {data.data_point_name}</div>
      <div className="flex gap-6">
        <div>
          <div className="text-2xl font-bold">{formatCurrency(data.total_salary)}</div>
          <div className="text-xs text-muted-foreground">Total Annual Salary</div>
        </div>
        <div>
          <div className="text-2xl font-bold">{data.headcount}</div>
          <div className="text-xs text-muted-foreground">Headcount</div>
        </div>
      </div>
      {data.budget != null && data.budget > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Budget</span>
            <span>
              {formatCurrency(data.budget)} ({utilization}% used)
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                utilization! > 100 ? "bg-destructive" : "bg-primary"
              }`}
              style={{ width: `${Math.min(utilization!, 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
