import { SalaryBarChart } from "./SalaryBarChart";
import { VariablePayChart } from "./VariablePayChart";
import { ComparisonChart } from "./ComparisonChart";
import { BudgetGauge } from "./BudgetGauge";
import { SalaryOverTimeChart } from "./SalaryOverTimeChart";
import { budgetTotals } from "@/lib/salary-utils";
import type { SalaryDataPointDetail, SalaryPart, SalaryOverTimePoint } from "@/lib/types";

interface SalaryAnalyticsProps {
  detail: SalaryDataPointDetail;
  previousData: Record<number, SalaryPart[] | null>;
  anyPresented: boolean;
  showRangesInPresentation: boolean;
  salaryLineage: SalaryOverTimePoint[];
}

export function SalaryAnalytics({
  detail,
  previousData,
  anyPresented,
  showRangesInPresentation,
  salaryLineage,
}: SalaryAnalyticsProps) {
  const { total } = budgetTotals(detail.members);
  const effectiveBudget = anyPresented ? null : detail.budget;
  const hideRanges = anyPresented && !showRangesInPresentation;

  return (
    <div className="flex flex-col gap-6">
      {!anyPresented && <BudgetGauge totalSalary={total} budget={detail.budget} />}
      <SalaryBarChart
        members={detail.members}
        ranges={hideRanges ? [] : detail.ranges}
        budget={effectiveBudget}
      />
      <VariablePayChart members={detail.members} />
      <ComparisonChart members={detail.members} previousData={previousData} />
      {salaryLineage.length >= 2 && <SalaryOverTimeChart data={salaryLineage} />}
    </div>
  );
}
