import { SalaryBarChart } from "./SalaryBarChart";
import { VariablePayChart } from "./VariablePayChart";
import { ComparisonChart } from "./ComparisonChart";
import { BudgetGauge } from "./BudgetGauge";
import { budgetTotals } from "@/lib/salary-utils";
import type { SalaryDataPointDetail, SalaryPart } from "@/lib/types";

interface SalaryAnalyticsProps {
  detail: SalaryDataPointDetail;
  previousData: Record<number, SalaryPart[] | null>;
}

export function SalaryAnalytics({ detail, previousData }: SalaryAnalyticsProps) {
  const { total } = budgetTotals(detail.members);

  return (
    <div className="flex flex-col gap-6">
      <BudgetGauge totalSalary={total} budget={detail.budget} />
      <SalaryBarChart members={detail.members} ranges={detail.ranges} budget={detail.budget} />
      <VariablePayChart members={detail.members} />
      <ComparisonChart members={detail.members} previousData={previousData} />
    </div>
  );
}
