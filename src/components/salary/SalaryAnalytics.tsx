import { SalaryBarChart } from "./SalaryBarChart";
import { VariablePayChart } from "./VariablePayChart";
import { ComparisonChart } from "./ComparisonChart";
import { BudgetGauge } from "./BudgetGauge";
import { budgetTotals } from "@/lib/salary-utils";
import type { SalaryDataPointDetail, SalaryPart } from "@/lib/types";

interface SalaryAnalyticsProps {
  detail: SalaryDataPointDetail;
  previousData: Record<number, SalaryPart[] | null>;
  anyPresented: boolean;
}

export function SalaryAnalytics({ detail, previousData, anyPresented }: SalaryAnalyticsProps) {
  const { total } = budgetTotals(detail.members);
  const effectiveBudget = anyPresented ? null : detail.budget;

  return (
    <div className="flex flex-col gap-6">
      {!anyPresented && <BudgetGauge totalSalary={total} budget={detail.budget} />}
      <SalaryBarChart members={detail.members} ranges={detail.ranges} budget={effectiveBudget} />
      <VariablePayChart members={detail.members} />
      <ComparisonChart members={detail.members} previousData={previousData} />
    </div>
  );
}
