import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAutoSave } from "@/hooks/useAutoSave";
import { updateReport } from "@/lib/db";
import { required } from "@/lib/validators";
import type { Report } from "@/lib/types";

interface ReportEditDialogProps {
  report: Report;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReportChange: (report: Report) => void;
}

export function ReportEditDialog({
  report,
  open,
  onOpenChange,
  onReportChange,
}: ReportEditDialogProps) {
  const nameRef = useRef<HTMLInputElement>(null);
  const [local, setLocal] = useState(report);

  const { save: saveName, error } = useAutoSave({
    onSave: async (val) => {
      await updateReport(report.id, "name", val);
      const updated = { ...local, name: val ?? "" };
      setLocal(updated);
      onReportChange(updated);
    },
    validate: required("Report name"),
  });

  useEffect(() => {
    setLocal(report);
  }, [report]);

  useEffect(() => {
    if (open) {
      setTimeout(() => {
        nameRef.current?.focus();
        nameRef.current?.select();
      }, 100);
    }
  }, [open]);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value;
    setLocal((prev) => ({ ...prev, name: newVal }));
    saveName(newVal === "" ? null : newVal);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Report</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Report Name</Label>
            <Input
              ref={nameRef}
              value={local.name}
              onChange={handleNameChange}
              aria-invalid={!!error || undefined}
            />
            <div className="h-3 text-xs">
              {error && <span className="text-destructive truncate">{error}</span>}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
