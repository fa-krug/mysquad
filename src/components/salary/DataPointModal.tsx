import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  updateSalaryDataPoint,
  updateSalaryDataPointMember,
  updateSalaryRange,
  getSalaryDataPoint,
} from "@/lib/db";
import type { SalaryDataPointDetail, Title } from "@/lib/types";

interface DataPointModalProps {
  dataPointId: number | null;
  titles: Title[];
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function DataPointModal({
  dataPointId,
  titles,
  open,
  onClose,
  onSaved,
}: DataPointModalProps) {
  const [detail, setDetail] = useState<SalaryDataPointDetail | null>(null);
  const [name, setName] = useState("");
  const [budget, setBudget] = useState("");
  const [ranges, setRanges] = useState<Record<number, { min: string; max: string }>>({});
  const [memberStates, setMemberStates] = useState<
    Record<number, { active: boolean; promoted: boolean }>
  >({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !dataPointId) return;
    getSalaryDataPoint(dataPointId).then((d) => {
      setDetail(d);
      setName(d.name);
      setBudget(d.budget != null ? String(Math.round(d.budget / 100)) : "");
      const rangeMap: Record<number, { min: string; max: string }> = {};
      d.ranges.forEach((r) => {
        rangeMap[r.title_id] = {
          min: String(Math.round(r.min_salary / 100)),
          max: String(Math.round(r.max_salary / 100)),
        };
      });
      setRanges(rangeMap);
      const mStates: Record<number, { active: boolean; promoted: boolean }> = {};
      d.members.forEach((m) => {
        mStates[m.id] = { active: m.is_active, promoted: m.is_promoted };
      });
      setMemberStates(mStates);
    });
  }, [open, dataPointId]);

  async function handleSave() {
    if (!detail) return;
    setSaving(true);
    try {
      if (name !== detail.name) {
        await updateSalaryDataPoint(detail.id, "name", name);
      }
      const budgetCents = budget === "" ? null : String(Math.round(parseFloat(budget) * 100));
      const oldBudget = detail.budget != null ? String(detail.budget) : null;
      if (budgetCents !== oldBudget) {
        await updateSalaryDataPoint(detail.id, "budget", budgetCents);
      }
      for (const member of detail.members) {
        const state = memberStates[member.id];
        if (!state) continue;
        if (state.active !== member.is_active) {
          await updateSalaryDataPointMember(member.id, "is_active", state.active ? "1" : "0");
        }
        if (state.promoted !== member.is_promoted) {
          await updateSalaryDataPointMember(member.id, "is_promoted", state.promoted ? "1" : "0");
        }
      }
      for (const title of titles) {
        const r = ranges[title.id];
        if (!r) continue;
        const minCents = r.min === "" ? 0 : Math.round(parseFloat(r.min) * 100);
        const maxCents = r.max === "" ? 0 : Math.round(parseFloat(r.max) * 100);
        if (minCents > 0 || maxCents > 0) {
          await updateSalaryRange(detail.id, title.id, minCents, maxCents);
        }
      }
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  if (!detail) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Edit Data Point</DialogTitle>
        </DialogHeader>
        <ScrollArea className="flex-1 pr-4">
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Budget ($)</Label>
              <Input
                type="number"
                min="0"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                placeholder="Annual budget"
              />
            </div>

            <Separator />
            <h3 className="text-sm font-semibold">Salary Ranges per Title</h3>
            {titles.map((title) => (
              <div key={title.id} className="flex items-center gap-2">
                <span className="w-32 truncate text-sm">{title.name}</span>
                <Input
                  type="number"
                  min="0"
                  className="w-28"
                  placeholder="Min $"
                  value={ranges[title.id]?.min ?? ""}
                  onChange={(e) =>
                    setRanges((prev) => ({
                      ...prev,
                      [title.id]: {
                        ...prev[title.id],
                        min: e.target.value,
                        max: prev[title.id]?.max ?? "",
                      },
                    }))
                  }
                />
                <span className="text-xs text-muted-foreground">–</span>
                <Input
                  type="number"
                  min="0"
                  className="w-28"
                  placeholder="Max $"
                  value={ranges[title.id]?.max ?? ""}
                  onChange={(e) =>
                    setRanges((prev) => ({
                      ...prev,
                      [title.id]: { min: prev[title.id]?.min ?? "", max: e.target.value },
                    }))
                  }
                />
              </div>
            ))}

            <Separator />
            <h3 className="text-sm font-semibold">Team Members</h3>
            {detail.members.map((member) => {
              const state = memberStates[member.id] ?? {
                active: member.is_active,
                promoted: member.is_promoted,
              };
              return (
                <div key={member.id} className="flex items-center gap-4 text-sm">
                  <span className="w-40 truncate">
                    {member.last_name}, {member.first_name}
                  </span>
                  <label className="flex items-center gap-1.5">
                    <Checkbox
                      checked={state.active}
                      onCheckedChange={(checked) =>
                        setMemberStates((prev) => ({
                          ...prev,
                          [member.id]: { ...prev[member.id], active: !!checked },
                        }))
                      }
                    />
                    <span>Active</span>
                  </label>
                  <label className="flex items-center gap-1.5">
                    <Checkbox
                      checked={state.promoted}
                      onCheckedChange={(checked) =>
                        setMemberStates((prev) => ({
                          ...prev,
                          [member.id]: { ...prev[member.id], promoted: !!checked },
                        }))
                      }
                    />
                    <span>Promoted</span>
                  </label>
                </div>
              );
            })}
          </div>
        </ScrollArea>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
