import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { SalaryDataPointSummary } from "@/lib/types";

interface DataPointCreateDialogProps {
  open: boolean;
  onClose: () => void;
  name: string;
  budget: string;
  previousDpId: string;
  otherDataPoints: SalaryDataPointSummary[];
  errors: Record<string, string | null>;
  isScenario: boolean;
  scenarioCount: number;
  saving: boolean;
  onNameChange: (value: string) => void;
  onBudgetChange: (value: string) => void;
  onPreviousChange: (value: string) => void;
  onIsScenarioChange: (value: boolean) => void;
  onScenarioCountChange: (value: number) => void;
  onSave: () => void;
}

export function DataPointCreateDialog({
  open,
  onClose,
  name,
  budget,
  previousDpId,
  otherDataPoints,
  errors,
  isScenario,
  scenarioCount,
  saving,
  onNameChange,
  onBudgetChange,
  onPreviousChange,
  onIsScenarioChange,
  onScenarioCountChange,
  onSave,
}: DataPointCreateDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New Data Point</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="flex items-center justify-between">
            <Label>Create as Scenario Group</Label>
            <Switch checked={isScenario} onCheckedChange={onIsScenarioChange} />
          </div>
          {isScenario ? (
            <>
              <div className="flex flex-col gap-1">
                <Label>Name</Label>
                <Input
                  value={name}
                  onChange={(e) => onNameChange(e.target.value)}
                  placeholder="Scenario group name"
                  aria-invalid={!!errors.name || undefined}
                />
                <div className="h-3 text-xs">
                  {errors.name && <span className="text-destructive">{errors.name}</span>}
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Compare to</Label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring dark:bg-input/30"
                  value={previousDpId}
                  onChange={(e) => onPreviousChange(e.target.value)}
                >
                  <option value="">None (empty scenarios)</option>
                  {otherDataPoints.map((dp) => (
                    <option key={dp.id} value={String(dp.id)}>
                      {dp.name}
                    </option>
                  ))}
                </select>
              </div>
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
              <div className="flex flex-col gap-1.5">
                <Label>Number of Scenarios</Label>
                <Input
                  type="number"
                  min={2}
                  value={scenarioCount}
                  onChange={(e) =>
                    onScenarioCountChange(Math.max(2, parseInt(e.target.value) || 2))
                  }
                />
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <Label>Name</Label>
                <Input
                  value={name}
                  onChange={(e) => onNameChange(e.target.value)}
                  placeholder="Data point name"
                  aria-invalid={!!errors.name || undefined}
                />
                <div className="h-3 text-xs">
                  {errors.name && <span className="text-destructive">{errors.name}</span>}
                </div>
              </div>
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
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={saving}>
            {saving ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
