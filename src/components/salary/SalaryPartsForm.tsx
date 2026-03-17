import { MoneyInput } from "@/components/ui/money-input";
import type { Title } from "@/lib/types";

interface SalaryPartsFormProps {
  titles: Title[];
  ranges: Record<number, { min: string; max: string }>;
  onRangeChange: (titleId: number, field: "min" | "max", value: string) => void;
}

export function SalaryPartsForm({ titles, ranges, onRangeChange }: SalaryPartsFormProps) {
  return (
    <>
      {titles.map((title) => (
        <div key={title.id} className="flex items-center gap-2">
          <span className="flex-1 min-w-0 truncate text-sm" title={title.name}>
            {title.name}
          </span>
          <MoneyInput
            min="0"
            className="w-24 sm:w-32"
            placeholder="Min"
            value={ranges[title.id]?.min ?? ""}
            onChange={(e) => onRangeChange(title.id, "min", e.target.value)}
          />
          <span className="text-xs text-muted-foreground">–</span>
          <MoneyInput
            min="0"
            className="w-24 sm:w-32"
            placeholder="Max"
            value={ranges[title.id]?.max ?? ""}
            onChange={(e) => onRangeChange(title.id, "max", e.target.value)}
          />
        </div>
      ))}
    </>
  );
}
