import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { DataPointFormFields } from "@/components/salary/DataPointFormFields";
import { SalaryPartsForm } from "@/components/salary/SalaryPartsForm";
import { DataPointMemberList } from "@/components/salary/DataPointMemberList";
import type { MemberState } from "@/components/salary/DataPointMemberList";
import type { SalaryDataPointDetail, SalaryDataPointSummary, TeamMember, Title } from "@/lib/types";

interface DataPointEditDialogProps {
  open: boolean;
  onClose: () => void;
  isNew: boolean;
  detail: SalaryDataPointDetail;
  name: string;
  budget: string;
  previousDpId: string;
  otherDataPoints: SalaryDataPointSummary[];
  errors: Record<string, string | null>;
  ranges: Record<number, { min: string; max: string }>;
  memberStates: Record<number, MemberState>;
  titles: Title[];
  allMembers: TeamMember[];
  saving: boolean;
  salaryMessage: string | null;
  salaryError: boolean;
  onNameChange: (value: string) => void;
  onBudgetChange: (value: string) => void;
  onPreviousChange: (value: string) => void;
  onRangeChange: (titleId: number, field: "min" | "max", value: string) => void;
  onToggleActive: (memberId: number, checked: boolean) => void;
  onTogglePromoted: (memberId: number, checked: boolean) => void;
  onChangePromotedTitle: (memberId: number, titleId: string) => void;
  onRemoveMember: (memberId: number, memberMemberId: number) => Promise<void>;
  onAddMember: (memberId: number) => Promise<void>;
  onExportSalaries: () => void;
  onImportSalaries: () => void;
  onSave: () => void;
}

export function DataPointEditDialog({
  open,
  onClose,
  isNew,
  detail,
  name,
  budget,
  previousDpId,
  otherDataPoints,
  errors,
  ranges,
  memberStates,
  titles,
  allMembers,
  saving,
  salaryMessage,
  salaryError,
  onNameChange,
  onBudgetChange,
  onPreviousChange,
  onRangeChange,
  onToggleActive,
  onTogglePromoted,
  onChangePromotedTitle,
  onRemoveMember,
  onAddMember,
  onExportSalaries,
  onImportSalaries,
  onSave,
}: DataPointEditDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{isNew ? "New Data Point" : "Edit Data Point"}</DialogTitle>
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

            <Separator />
            <h3 className="text-sm font-semibold">Team Members</h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onExportSalaries}
                className="rounded-md border border-input px-2.5 py-1 text-xs transition-colors hover:bg-muted"
              >
                Export Salaries
              </button>
              <button
                type="button"
                onClick={onImportSalaries}
                className="rounded-md border border-input px-2.5 py-1 text-xs transition-colors hover:bg-muted"
              >
                Import Salaries
              </button>
              {salaryMessage && (
                <span className={`text-xs ${salaryError ? "text-destructive" : "text-green-600"}`}>
                  {salaryMessage}
                </span>
              )}
            </div>

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
