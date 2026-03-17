import { useState, useEffect } from "react";
import { showError } from "@/lib/toast";
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
  updateScenarioGroupMember,
  addScenario,
  removeScenario,
  addMemberToDataPoint,
  removeMemberFromDataPoint,
  getTeamMembers,
} from "@/lib/db";
import { save, open as openFile } from "@tauri-apps/plugin-dialog";
import { required, positiveNumber } from "@/lib/validators";
import type {
  SalaryDataPointDetail,
  SalaryDataPointSummary,
  SalaryListItem,
  ScenarioGroup,
  TeamMember,
  Title,
} from "@/lib/types";
import type { MemberState } from "@/components/salary/DataPointMemberList";
import { ScenarioGroupEditDialog } from "@/components/salary/ScenarioGroupEditDialog";
import { DataPointCreateDialog } from "@/components/salary/DataPointCreateDialog";
import { DataPointEditDialog } from "@/components/salary/DataPointEditDialog";

interface DataPointModalProps {
  dataPointId: number | null;
  titles: Title[];
  dataPoints: SalaryListItem[];
  isNew: boolean;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  onGroupRefresh?: (groupId: number) => Promise<void>;
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
  onGroupRefresh,
  editingGroup,
}: DataPointModalProps) {
  const [detail, setDetail] = useState<SalaryDataPointDetail | null>(null);
  const [name, setName] = useState("");
  const [budget, setBudget] = useState("");
  const [previousDpId, setPreviousDpId] = useState("");
  const [ranges, setRanges] = useState<Record<number, { min: string; max: string }>>({});
  const [memberStates, setMemberStates] = useState<Record<number, MemberState>>({});
  const [saving, setSaving] = useState(false);
  const [salaryMessage, setSalaryMessage] = useState<string | null>(null);
  const [salaryError, setSalaryError] = useState(false);
  const [isScenario, setIsScenario] = useState(false);
  const [scenarioCount, setScenarioCount] = useState(2);
  const [scenarioNames, setScenarioNames] = useState<Record<number, string>>({});
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [allMembers, setAllMembers] = useState<TeamMember[]>([]);

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
    const mStates: Record<number, MemberState> = {};
    d.members.forEach((m) => {
      mStates[m.id] = {
        active: m.is_active,
        promoted: m.is_promoted,
        promotedTitleId: m.promoted_title_id != null ? String(m.promoted_title_id) : "",
      };
    });
    setMemberStates(mStates);
  }

  // Reset scenario state and errors when modal opens; load all team members
  useEffect(() => {
    if (open) {
      setIsScenario(false);
      setScenarioCount(2);
      setErrors({});
      getTeamMembers().then(setAllMembers);
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
        const mStates: Record<number, MemberState> = {};
        d.members.forEach((m) => {
          mStates[m.id] = { active: true, promoted: false, promotedTitleId: "" };
        });
        setMemberStates(mStates);
      } else {
        applyDetail(d);
      }
    });
  }, [open, dataPointId, isNew]);

  useEffect(() => {
    if (!open || !editingGroup) return;
    setName(editingGroup.name);
    setBudget(editingGroup.budget != null ? String(Math.round(editingGroup.budget / 100)) : "");
    setPreviousDpId(
      editingGroup.previous_data_point_id != null
        ? String(editingGroup.previous_data_point_id)
        : "",
    );
    const names: Record<number, string> = {};
    editingGroup.children.forEach((c) => {
      names[c.id] = c.name;
    });
    setScenarioNames(names);
    // Load group ranges and member states from first child's detail
    if (editingGroup.children.length > 0) {
      getSalaryDataPoint(editingGroup.children[0].id).then((d) => {
        setDetail(d);
        const rangeMap: Record<number, { min: string; max: string }> = {};
        d.ranges.forEach((r) => {
          rangeMap[r.title_id] = {
            min: String(Math.round(r.min_salary / 100)),
            max: String(Math.round(r.max_salary / 100)),
          };
        });
        setRanges(rangeMap);
        const mStates: Record<number, MemberState> = {};
        d.members.forEach((m) => {
          mStates[m.id] = {
            active: m.is_active,
            promoted: m.is_promoted,
            promotedTitleId: m.promoted_title_id != null ? String(m.promoted_title_id) : "",
          };
        });
        setMemberStates(mStates);
      });
    } else {
      setRanges({});
      setDetail(null);
      setMemberStates({});
    }
  }, [open, editingGroup]);

  // --- Shared callbacks ---

  function validateName(val: string): string | null {
    return required("Name")(val || null);
  }

  function validateBudget(val: string): string | null {
    return positiveNumber(val || null);
  }

  function handleNameChange(value: string) {
    setName(value);
    setErrors((prev) => ({ ...prev, name: validateName(value) }));
  }

  function handleBudgetChange(value: string) {
    setBudget(value);
    setErrors((prev) => ({ ...prev, budget: validateBudget(value) }));
  }

  function handleRangeChange(titleId: number, field: "min" | "max", value: string) {
    setRanges((prev) => ({
      ...prev,
      [titleId]: {
        min: field === "min" ? value : (prev[titleId]?.min ?? ""),
        max: field === "max" ? value : (prev[titleId]?.max ?? ""),
      },
    }));
  }

  function handleToggleActive(memberId: number, checked: boolean) {
    setMemberStates((prev) => ({
      ...prev,
      [memberId]: { ...prev[memberId], active: checked },
    }));
  }

  function handleTogglePromoted(memberId: number, checked: boolean) {
    setMemberStates((prev) => ({
      ...prev,
      [memberId]: {
        ...prev[memberId],
        promoted: checked,
        promotedTitleId: checked ? (prev[memberId]?.promotedTitleId ?? "") : "",
      },
    }));
  }

  function handleChangePromotedTitle(memberId: number, titleId: string) {
    setMemberStates((prev) => ({
      ...prev,
      [memberId]: { ...prev[memberId], promotedTitleId: titleId },
    }));
  }

  // --- Create mode handlers ---

  async function handleCreatePreviousChange(newPrevId: string) {
    setPreviousDpId(newPrevId);
    if (isScenario && newPrevId) {
      const prevDetail = await getSalaryDataPoint(Number(newPrevId));
      if (prevDetail.budget != null) {
        setBudget(String(Math.round(prevDetail.budget / 100)));
      }
    }
  }

  async function handleCreateSave() {
    const nameErr = validateName(name);
    const budgetErr = validateBudget(budget);
    setErrors({ name: nameErr, budget: budgetErr });
    if (nameErr || budgetErr) return;
    setSaving(true);
    try {
      if (isScenario) {
        const group = await createScenarioGroup(
          previousDpId ? Number(previousDpId) : null,
          scenarioCount,
        );
        await updateScenarioGroup(group.id, "name", name);
        const budgetCents = String(Math.round(parseFloat(budget) * 100));
        await updateScenarioGroup(group.id, "budget", budgetCents);
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

  // --- Edit mode handlers ---

  async function handleEditPreviousChange(newPrevId: string) {
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
      const mStates: Record<number, MemberState> = {};
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

  async function handleEditRemoveMember(_memberId: number, memberMemberId: number) {
    if (!detail) return;
    await removeMemberFromDataPoint(detail.id, memberMemberId);
    const d = await getSalaryDataPoint(detail.id);
    applyDetail(d);
  }

  async function handleEditAddMember(memberId: number) {
    if (!detail) return;
    await addMemberToDataPoint(detail.id, memberId);
    const d = await getSalaryDataPoint(detail.id);
    applyDetail(d);
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

  async function handleSave() {
    if (!detail) return;
    const nameErr = validateName(name);
    const budgetErr = validateBudget(budget);
    setErrors({ name: nameErr, budget: budgetErr });
    if (nameErr || budgetErr) return;
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

  // --- Group edit handlers ---

  async function handleGroupRemoveMember(_memberId: number, memberMemberId: number) {
    if (!editingGroup) return;
    await removeMemberFromDataPoint(editingGroup.children[0].id, memberMemberId);
    if (onGroupRefresh) await onGroupRefresh(editingGroup.id);
  }

  async function handleGroupAddMember(memberId: number) {
    if (!editingGroup) return;
    await addMemberToDataPoint(editingGroup.children[0].id, memberId);
    if (onGroupRefresh) await onGroupRefresh(editingGroup.id);
  }

  async function handleAddScenario() {
    if (!editingGroup) return;
    await addScenario(editingGroup.id);
    if (onGroupRefresh) await onGroupRefresh(editingGroup.id);
  }

  async function handleRemoveScenario() {
    if (!editingGroup || editingGroup.children.length <= 2) return;
    const lastChild = editingGroup.children[editingGroup.children.length - 1];
    await removeScenario(lastChild.id);
    if (onGroupRefresh) await onGroupRefresh(editingGroup.id);
  }

  async function handleGroupSave() {
    if (!editingGroup) return;
    const nameErr = validateName(name);
    const budgetErr = validateBudget(budget);
    setErrors({ name: nameErr, budget: budgetErr });
    if (nameErr || budgetErr) return;
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
      const newPrevId = previousDpId === "" ? null : previousDpId;
      const oldPrevId =
        editingGroup.previous_data_point_id != null
          ? String(editingGroup.previous_data_point_id)
          : null;
      if (newPrevId !== oldPrevId) {
        await updateScenarioGroup(editingGroup.id, "previous_data_point_id", newPrevId);
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
      // Save scenario child names
      for (const child of editingGroup.children) {
        const newName = scenarioNames[child.id];
        if (newName !== undefined && newName !== child.name) {
          await updateSalaryDataPoint(child.id, "name", newName);
        }
      }
      // Save member active/promoted states at the group level (propagates to all children)
      if (detail) {
        for (const member of detail.members) {
          const state = memberStates[member.id];
          if (!state) continue;
          if (state.active !== member.is_active) {
            await updateScenarioGroupMember(
              editingGroup.id,
              member.member_id,
              "is_active",
              state.active ? "1" : "0",
            );
          }
          if (state.promoted !== member.is_promoted) {
            await updateScenarioGroupMember(
              editingGroup.id,
              member.member_id,
              "is_promoted",
              state.promoted ? "1" : "0",
            );
          }
          const oldPromotedTitleId =
            member.promoted_title_id != null ? String(member.promoted_title_id) : "";
          if (state.promotedTitleId !== oldPromotedTitleId) {
            await updateScenarioGroupMember(
              editingGroup.id,
              member.member_id,
              "promoted_title_id",
              state.promotedTitleId === "" ? null : state.promotedTitleId,
            );
          }
        }
      }
      await onSaved();
      onClose();
    } catch (err) {
      console.error("Failed to save scenario group:", err);
      showError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  // --- Render ---

  if (editingGroup) {
    return (
      <ScenarioGroupEditDialog
        open={open}
        onClose={onClose}
        editingGroup={editingGroup}
        name={name}
        budget={budget}
        previousDpId={previousDpId}
        otherDataPoints={otherDataPoints}
        errors={errors}
        ranges={ranges}
        memberStates={memberStates}
        detail={detail}
        titles={titles}
        allMembers={allMembers}
        scenarioNames={scenarioNames}
        saving={saving}
        onNameChange={handleNameChange}
        onBudgetChange={handleBudgetChange}
        onPreviousChange={(v) => setPreviousDpId(v)}
        onRangeChange={handleRangeChange}
        onToggleActive={handleToggleActive}
        onTogglePromoted={handleTogglePromoted}
        onChangePromotedTitle={handleChangePromotedTitle}
        onRemoveMember={handleGroupRemoveMember}
        onAddMember={handleGroupAddMember}
        onScenarioNameChange={(childId, value) =>
          setScenarioNames((prev) => ({ ...prev, [childId]: value }))
        }
        onAddScenario={handleAddScenario}
        onRemoveScenario={handleRemoveScenario}
        onSave={handleGroupSave}
      />
    );
  }

  // Pure create mode: no pre-created data point, show simplified form
  if (isNew && !dataPointId && !editingGroup) {
    return (
      <DataPointCreateDialog
        open={open}
        onClose={onClose}
        name={name}
        budget={budget}
        previousDpId={previousDpId}
        otherDataPoints={otherDataPoints}
        errors={errors}
        isScenario={isScenario}
        scenarioCount={scenarioCount}
        saving={saving}
        onNameChange={handleNameChange}
        onBudgetChange={handleBudgetChange}
        onPreviousChange={handleCreatePreviousChange}
        onIsScenarioChange={setIsScenario}
        onScenarioCountChange={setScenarioCount}
        onSave={handleCreateSave}
      />
    );
  }

  if (!detail) return null;

  return (
    <DataPointEditDialog
      open={open}
      onClose={onClose}
      isNew={isNew}
      detail={detail}
      name={name}
      budget={budget}
      previousDpId={previousDpId}
      otherDataPoints={otherDataPoints}
      errors={errors}
      ranges={ranges}
      memberStates={memberStates}
      titles={titles}
      allMembers={allMembers}
      saving={saving}
      salaryMessage={salaryMessage}
      salaryError={salaryError}
      onNameChange={handleNameChange}
      onBudgetChange={handleBudgetChange}
      onPreviousChange={handleEditPreviousChange}
      onRangeChange={handleRangeChange}
      onToggleActive={handleToggleActive}
      onTogglePromoted={handleTogglePromoted}
      onChangePromotedTitle={handleChangePromotedTitle}
      onRemoveMember={handleEditRemoveMember}
      onAddMember={handleEditAddMember}
      onExportSalaries={handleExportSalaries}
      onImportSalaries={handleImportSalaries}
      onSave={handleSave}
    />
  );
}

export default DataPointModal;
