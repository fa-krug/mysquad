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
import { MoneyInput } from "@/components/ui/money-input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import {
  updateSalaryDataPoint,
  updateSalaryDataPointMember,
  updateSalaryRange,
  getSalaryDataPoint,
  exportDataPointSalaries,
  importDataPointSalaries,
  createSalaryDataPoint,
  createScenarioGroup,
  updateScenarioGroup,
  updateScenarioGroupRange,
  addScenario,
  removeScenario,
} from "@/lib/db";
import { save, open as openFile } from "@tauri-apps/plugin-dialog";
import type {
  SalaryDataPointDetail,
  SalaryDataPointSummary,
  SalaryListItem,
  ScenarioGroup,
  Title,
} from "@/lib/types";

interface DataPointModalProps {
  dataPointId: number | null;
  titles: Title[];
  dataPoints: SalaryListItem[];
  isNew: boolean;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  editingGroup: ScenarioGroup | null;
}

export function DataPointModal({
  dataPointId,
  titles,
  dataPoints,
  isNew,
  open,
  onClose,
  onSaved,
  editingGroup,
}: DataPointModalProps) {
  const [detail, setDetail] = useState<SalaryDataPointDetail | null>(null);
  const [name, setName] = useState("");
  const [budget, setBudget] = useState("");
  const [previousDpId, setPreviousDpId] = useState("");
  const [ranges, setRanges] = useState<Record<number, { min: string; max: string }>>({});
  const [memberStates, setMemberStates] = useState<
    Record<number, { active: boolean; promoted: boolean; promotedTitleId: string }>
  >({});
  const [saving, setSaving] = useState(false);
  const [salaryMessage, setSalaryMessage] = useState<string | null>(null);
  const [salaryError, setSalaryError] = useState(false);
  const [isScenario, setIsScenario] = useState(false);
  const [scenarioCount, setScenarioCount] = useState(2);

  // Extract normal data points from SalaryListItem[] for the "Compare to" dropdown
  const normalDataPoints = dataPoints
    .filter(
      (item): item is { type: "data_point"; data_point: SalaryDataPointSummary } =>
        item.type === "data_point",
    )
    .map((item) => item.data_point);
  const otherDataPoints = normalDataPoints.filter((dp) => dp.id !== dataPointId);

  function applyDetail(d: SalaryDataPointDetail) {
    setDetail(d);
    setName(d.name);
    setBudget(d.budget != null ? String(Math.round(d.budget / 100)) : "");
    setPreviousDpId(d.previous_data_point_id != null ? String(d.previous_data_point_id) : "");
    const rangeMap: Record<number, { min: string; max: string }> = {};
    d.ranges.forEach((r) => {
      rangeMap[r.title_id] = {
        min: String(Math.round(r.min_salary / 100)),
        max: String(Math.round(r.max_salary / 100)),
      };
    });
    setRanges(rangeMap);
    const mStates: Record<number, { active: boolean; promoted: boolean; promotedTitleId: string }> =
      {};
    d.members.forEach((m) => {
      mStates[m.id] = {
        active: m.is_active,
        promoted: m.is_promoted,
        promotedTitleId: m.promoted_title_id != null ? String(m.promoted_title_id) : "",
      };
    });
    setMemberStates(mStates);
  }

  // Reset scenario state when modal opens
  useEffect(() => {
    if (open) {
      setIsScenario(false);
      setScenarioCount(2);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !dataPointId) return;
    getSalaryDataPoint(dataPointId).then((d) => {
      if (isNew) {
        // For new data points, load structure but don't prefill values
        setDetail(d);
        setName(d.name);
        setBudget("");
        setPreviousDpId("");
        setRanges({});
        const mStates: Record<
          number,
          { active: boolean; promoted: boolean; promotedTitleId: string }
        > = {};
        d.members.forEach((m) => {
          mStates[m.id] = { active: true, promoted: false, promotedTitleId: "" };
        });
        setMemberStates(mStates);
      } else {
        applyDetail(d);
      }
    });
  }, [open, dataPointId]);

  useEffect(() => {
    if (!open || !editingGroup) return;
    setName(editingGroup.name);
    setBudget(editingGroup.budget != null ? String(Math.round(editingGroup.budget / 100)) : "");
    // Load group ranges from first child's detail (get_salary_data_point returns group ranges for scenario children)
    if (editingGroup.children.length > 0) {
      getSalaryDataPoint(editingGroup.children[0].id).then((d) => {
        const rangeMap: Record<number, { min: string; max: string }> = {};
        d.ranges.forEach((r) => {
          rangeMap[r.title_id] = {
            min: String(Math.round(r.min_salary / 100)),
            max: String(Math.round(r.max_salary / 100)),
          };
        });
        setRanges(rangeMap);
      });
    } else {
      setRanges({});
    }
  }, [open, editingGroup]);

  async function handlePreviousChange(newPrevId: string) {
    setPreviousDpId(newPrevId);
    // On create: fill form values from the selected previous DP
    if (isNew && newPrevId && detail) {
      const prevDetail = await getSalaryDataPoint(Number(newPrevId));
      setBudget(prevDetail.budget != null ? String(Math.round(prevDetail.budget / 100)) : "");
      const rangeMap: Record<number, { min: string; max: string }> = {};
      prevDetail.ranges.forEach((r) => {
        rangeMap[r.title_id] = {
          min: String(Math.round(r.min_salary / 100)),
          max: String(Math.round(r.max_salary / 100)),
        };
      });
      setRanges(rangeMap);
      // Update member states from previous DP where members match
      const prevMemberMap = new Map(prevDetail.members.map((m) => [m.member_id, m]));
      const mStates: Record<
        number,
        { active: boolean; promoted: boolean; promotedTitleId: string }
      > = {};
      detail.members.forEach((m) => {
        const prev = prevMemberMap.get(m.member_id);
        if (prev) {
          mStates[m.id] = {
            active: prev.is_active,
            promoted: prev.is_promoted,
            promotedTitleId: prev.promoted_title_id != null ? String(prev.promoted_title_id) : "",
          };
        } else {
          mStates[m.id] = {
            active: m.is_active,
            promoted: m.is_promoted,
            promotedTitleId: m.promoted_title_id != null ? String(m.promoted_title_id) : "",
          };
        }
      });
      setMemberStates(mStates);
    }
  }

  async function handleExportSalaries() {
    if (!dataPointId) return;
    setSalaryMessage(null);
    setSalaryError(false);
    try {
      const filePath = await save({
        defaultPath: `${name || "salaries"}.json`,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!filePath) return;
      await exportDataPointSalaries(dataPointId, filePath);
      setSalaryMessage("Salaries exported");
      setTimeout(() => setSalaryMessage(null), 3000);
    } catch (err) {
      setSalaryMessage(err instanceof Error ? err.message : String(err));
      setSalaryError(true);
    }
  }

  async function handleImportSalaries() {
    if (!dataPointId) return;
    setSalaryMessage(null);
    setSalaryError(false);
    try {
      const filePath = await openFile({
        filters: [{ name: "JSON", extensions: ["json"] }],
        multiple: false,
      });
      if (!filePath) return;
      const msg = await importDataPointSalaries(dataPointId, filePath);
      setSalaryMessage(msg);
      setTimeout(() => setSalaryMessage(null), 5000);
    } catch (err) {
      setSalaryMessage(err instanceof Error ? err.message : String(err));
      setSalaryError(true);
    }
  }

  async function handleGroupSave() {
    if (!editingGroup) return;
    setSaving(true);
    try {
      if (name !== editingGroup.name) {
        await updateScenarioGroup(editingGroup.id, "name", name);
      }
      const budgetCents = budget === "" ? null : String(Math.round(parseFloat(budget) * 100));
      const oldBudget = editingGroup.budget != null ? String(editingGroup.budget) : null;
      if (budgetCents !== oldBudget) {
        await updateScenarioGroup(editingGroup.id, "budget", budgetCents);
      }
      for (const title of titles) {
        const r = ranges[title.id];
        if (!r) continue;
        const minCents = r.min === "" ? 0 : Math.round(parseFloat(r.min) * 100);
        const maxCents = r.max === "" ? 0 : Math.round(parseFloat(r.max) * 100);
        if (minCents > 0 || maxCents > 0) {
          await updateScenarioGroupRange(editingGroup.id, title.id, minCents, maxCents);
        }
      }
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

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
      // Save previous_data_point_id
      const newPrevId = previousDpId === "" ? null : previousDpId;
      const oldPrevId =
        detail.previous_data_point_id != null ? String(detail.previous_data_point_id) : null;
      if (newPrevId !== oldPrevId) {
        await updateSalaryDataPoint(detail.id, "previous_data_point_id", newPrevId);
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
        const oldPromotedTitleId =
          member.promoted_title_id != null ? String(member.promoted_title_id) : "";
        if (state.promotedTitleId !== oldPromotedTitleId) {
          await updateSalaryDataPointMember(
            member.id,
            "promoted_title_id",
            state.promotedTitleId === "" ? null : state.promotedTitleId,
          );
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

  if (editingGroup) {
    return (
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>Edit Scenario Group</DialogTitle>
          </DialogHeader>
          <ScrollArea className="flex-1 pr-4">
            <div className="flex flex-col gap-4 py-2">
              <div className="flex flex-col gap-1.5">
                <Label>Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Budget</Label>
                <MoneyInput
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
                  <span className="flex-1 min-w-0 truncate text-sm" title={title.name}>
                    {title.name}
                  </span>
                  <MoneyInput
                    min="0"
                    className="w-24 sm:w-32"
                    placeholder="Min"
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
                  <MoneyInput
                    min="0"
                    className="w-24 sm:w-32"
                    placeholder="Max"
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
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">
                  Scenarios ({editingGroup.children.length})
                </h3>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={editingGroup.children.length <= 2}
                    onClick={async () => {
                      if (editingGroup.children.length <= 2) return;
                      const lastChild = editingGroup.children[editingGroup.children.length - 1];
                      await removeScenario(lastChild.id);
                      onSaved();
                      onClose();
                    }}
                  >
                    −
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      await addScenario(editingGroup.id);
                      onSaved();
                      onClose();
                    }}
                  >
                    +
                  </Button>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                {editingGroup.children.map((c) => c.name).join(", ")}
              </div>
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleGroupSave} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // Pure create mode: no pre-created data point, show simplified form
  if (isNew && !dataPointId && !editingGroup) {
    async function handleCreateSave() {
      setSaving(true);
      try {
        if (isScenario) {
          await createScenarioGroup(previousDpId ? Number(previousDpId) : null, scenarioCount);
        } else {
          const dp = await createSalaryDataPoint();
          if (name && name !== dp.name) {
            await updateSalaryDataPoint(dp.id, "name", name);
          }
          const budgetCents = budget === "" ? null : String(Math.round(parseFloat(budget) * 100));
          if (budgetCents) {
            await updateSalaryDataPoint(dp.id, "budget", budgetCents);
          }
          if (previousDpId) {
            await updateSalaryDataPoint(dp.id, "previous_data_point_id", previousDpId);
          }
        }
        onSaved();
        onClose();
      } finally {
        setSaving(false);
      }
    }

    return (
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New Data Point</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex items-center justify-between">
              <Label>Create as Scenario Group</Label>
              <Switch checked={isScenario} onCheckedChange={setIsScenario} />
            </div>
            {isScenario ? (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label>Branch from</Label>
                  <select
                    className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring dark:bg-input/30"
                    value={previousDpId}
                    onChange={(e) => setPreviousDpId(e.target.value)}
                  >
                    <option value="">None (empty scenarios)</option>
                    {otherDataPoints.map((dp) => (
                      <option key={dp.id} value={String(dp.id)}>
                        {dp.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Number of Scenarios</Label>
                  <Input
                    type="number"
                    min={2}
                    value={scenarioCount}
                    onChange={(e) => setScenarioCount(Math.max(2, parseInt(e.target.value) || 2))}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Name and budget are auto-generated. You can edit them after creation.
                </p>
              </>
            ) : (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label>Name</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Data point name"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Compare to</Label>
                  <select
                    className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring dark:bg-input/30"
                    value={previousDpId}
                    onChange={(e) => setPreviousDpId(e.target.value)}
                  >
                    <option value="">None</option>
                    {otherDataPoints.map((dp) => (
                      <option key={dp.id} value={String(dp.id)}>
                        {dp.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Budget</Label>
                  <MoneyInput
                    min="0"
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    placeholder="Annual budget"
                  />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleCreateSave} disabled={saving}>
              {saving ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  if (!detail) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>{isNew ? "New Data Point" : "Edit Data Point"}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="flex-1 pr-4">
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Compare to</Label>
              <select
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring dark:bg-input/30"
                value={previousDpId}
                onChange={(e) => handlePreviousChange(e.target.value)}
              >
                <option value="">None</option>
                {otherDataPoints.map((dp) => (
                  <option key={dp.id} value={String(dp.id)}>
                    {dp.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Budget</Label>
              <MoneyInput
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
                <span className="flex-1 min-w-0 truncate text-sm" title={title.name}>
                  {title.name}
                </span>
                <MoneyInput
                  min="0"
                  className="w-24 sm:w-32"
                  placeholder="Min"
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
                <MoneyInput
                  min="0"
                  className="w-24 sm:w-32"
                  placeholder="Max"
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
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExportSalaries}
                className="rounded-md border border-input px-2.5 py-1 text-xs transition-colors hover:bg-muted"
              >
                Export Salaries
              </button>
              <button
                type="button"
                onClick={handleImportSalaries}
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

            {detail.members.map((member) => {
              const state = memberStates[member.id] ?? {
                active: member.is_active,
                promoted: member.is_promoted,
                promotedTitleId:
                  member.promoted_title_id != null ? String(member.promoted_title_id) : "",
              };
              return (
                <div key={member.id} className="flex flex-col gap-1.5">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    <span className="w-36 sm:w-48 shrink-0 truncate">
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
                            [member.id]: {
                              ...prev[member.id],
                              promoted: !!checked,
                              promotedTitleId: checked
                                ? (prev[member.id]?.promotedTitleId ?? "")
                                : "",
                            },
                          }))
                        }
                      />
                      <span>Promoted</span>
                    </label>
                  </div>
                  {state.promoted && (
                    <div className="sm:ml-48 sm:pl-4 pl-6">
                      <select
                        className="h-7 w-48 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring dark:bg-input/30"
                        value={state.promotedTitleId}
                        onChange={(e) =>
                          setMemberStates((prev) => ({
                            ...prev,
                            [member.id]: { ...prev[member.id], promotedTitleId: e.target.value },
                          }))
                        }
                      >
                        <option value="">Select new title…</option>
                        {titles.map((t) => (
                          <option key={t.id} value={String(t.id)}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
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
