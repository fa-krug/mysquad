import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { DataPointFormFields } from "@/components/salary/DataPointFormFields";
import { SalaryPartsForm } from "@/components/salary/SalaryPartsForm";
import { DataPointMemberList } from "@/components/salary/DataPointMemberList";
import type { MemberState } from "@/components/salary/DataPointMemberList";
import type {
  SalaryDataPointDetail,
  SalaryDataPointSummary,
  ScenarioGroup,
  TeamMember,
  Title,
} from "@/lib/types";

interface ScenarioGroupEditDialogProps {
  open: boolean;
  onClose: () => void;
  editingGroup: ScenarioGroup;
  name: string;
  budget: string;
  previousDpId: string;
  otherDataPoints: SalaryDataPointSummary[];
  errors: Record<string, string | null>;
  ranges: Record<number, { min: string; max: string }>;
  memberStates: Record<number, MemberState>;
  detail: SalaryDataPointDetail | null;
  titles: Title[];
  allMembers: TeamMember[];
  scenarioNames: Record<number, string>;
  saving: boolean;
  onNameChange: (value: string) => void;
  onBudgetChange: (value: string) => void;
  onPreviousChange: (value: string) => void;
  onRangeChange: (titleId: number, field: "min" | "max", value: string) => void;
  onToggleActive: (memberId: number, checked: boolean) => void;
  onTogglePromoted: (memberId: number, checked: boolean) => void;
  onChangePromotedTitle: (memberId: number, titleId: string) => void;
  onRemoveMember: (memberId: number, memberMemberId: number) => Promise<void>;
  onAddMember: (memberId: number) => Promise<void>;
  onScenarioNameChange: (childId: number, value: string) => void;
  onAddScenario: () => Promise<void>;
  onRemoveScenario: () => Promise<void>;
  onSave: () => void;
}

export function ScenarioGroupEditDialog({
  open,
  onClose,
  editingGroup,
  name,
  budget,
  previousDpId,
  otherDataPoints,
  errors,
  ranges,
  memberStates,
  detail,
  titles,
  allMembers,
  scenarioNames,
  saving,
  onNameChange,
  onBudgetChange,
  onPreviousChange,
  onRangeChange,
  onToggleActive,
  onTogglePromoted,
  onChangePromotedTitle,
  onRemoveMember,
  onAddMember,
  onScenarioNameChange,
  onAddScenario,
  onRemoveScenario,
  onSave,
}: ScenarioGroupEditDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Edit Scenario Group</DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto pr-4">
          <div className="flex flex-col gap-4 py-2">
            <DataPointFormFields
              name={name}
              budget={budget}
              previousDpId={previousDpId}
              otherDataPoints={otherDataPoints}
              errors={errors}
              onNameChange={onNameChange}
              onBudgetChange={onBudgetChange}
              onPreviousChange={onPreviousChange}
            />
            <Separator />
            <h3 className="text-sm font-semibold">Salary Ranges per Title</h3>
            <SalaryPartsForm titles={titles} ranges={ranges} onRangeChange={onRangeChange} />
            {detail && (
              <>
                <Separator />
                <h3 className="text-sm font-semibold">Team Members</h3>
                <DataPointMemberList
                  members={detail.members}
                  memberStates={memberStates}
                  allMembers={allMembers}
                  titles={titles}
                  onToggleActive={onToggleActive}
                  onTogglePromoted={onTogglePromoted}
                  onChangePromotedTitle={onChangePromotedTitle}
                  onRemoveMember={onRemoveMember}
                  onAddMember={onAddMember}
                />
              </>
            )}
            <Separator />
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Scenarios ({editingGroup.children.length})</h3>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={editingGroup.children.length <= 2}
                  onClick={onRemoveScenario}
                >
                  −
                </Button>
                <Button variant="outline" size="sm" onClick={onAddScenario}>
                  +
                </Button>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              {editingGroup.children.map((c) => (
                <Input
                  key={c.id}
                  value={scenarioNames[c.id] ?? c.name}
                  onChange={(e) => onScenarioNameChange(c.id, e.target.value)}
                  className="h-8 text-sm"
                />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
