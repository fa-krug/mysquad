import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Label } from "@/components/ui/label";
import type { SalaryDataPointSummary } from "@/lib/types";

interface DataPointFormFieldsProps {
  name: string;
  budget: string;
  previousDpId: string;
  otherDataPoints: SalaryDataPointSummary[];
  errors: Record<string, string | null>;
  onNameChange: (value: string) => void;
  onBudgetChange: (value: string) => void;
  onPreviousChange: (value: string) => void;
  namePlaceholder?: string;
  showCompareTo?: boolean;
}

export function DataPointFormFields({
  name,
  budget,
  previousDpId,
  otherDataPoints,
  errors,
  onNameChange,
  onBudgetChange,
  onPreviousChange,
  namePlaceholder,
  showCompareTo = true,
}: DataPointFormFieldsProps) {
  return (
    <>
      <div className="flex flex-col gap-1">
        <Label>Name</Label>
        <Input
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder={namePlaceholder}
          aria-invalid={!!errors.name || undefined}
        />
        <div className="h-3 text-xs">
          {errors.name && <span className="text-destructive">{errors.name}</span>}
        </div>
      </div>
      {showCompareTo && (
        <div className="flex flex-col gap-1.5">
          <Label>Compare to</Label>
          <select
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring dark:bg-input/30"
            value={previousDpId}
            onChange={(e) => onPreviousChange(e.target.value)}
          >
            <option value="">None</option>
            {otherDataPoints.map((dp) => (
              <option key={dp.id} value={String(dp.id)}>
                {dp.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="flex flex-col gap-1">
        <Label>Budget</Label>
        <MoneyInput
          min="0"
          value={budget}
          onChange={(e) => onBudgetChange(e.target.value)}
          placeholder="Annual budget"
          aria-invalid={!!errors.budget || undefined}
        />
        <div className="h-3 text-xs">
          {errors.budget && <span className="text-destructive">{errors.budget}</span>}
        </div>
      </div>
    </>
  );
}
