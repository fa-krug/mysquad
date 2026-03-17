# Reports Modal Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move report configuration into a modal dialog, make the detail panel read-only, and add "Salary Over Time" as a selectable report block.

**Architecture:** Expand `ReportEditDialog` into a full `ReportModal` that handles name, toggles, and block management. Strip config UI from `ReportDetail` making it read-only with a gear button. Add `salary_over_time` block type to both backend and frontend.

**Tech Stack:** React, TypeScript, Tauri commands (Rust), shadcn/ui Dialog, existing block system

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src-tauri/src/commands.rs` | Modify | Add `build_salary_over_time` builder, wire it into `get_report_block_data` match |
| `src/lib/types.ts` | Modify | Add `SalaryOverTimePoint[]` to `ReportBlockDataPayload` union |
| `src/components/reports/blocks/BlockRenderer.tsx` | Modify | Add `salary_over_time` to `BLOCK_LABELS` and switch case |
| `src/components/reports/ReportModal.tsx` | Create | New modal with name, toggles, block add/remove/reorder |
| `src/components/reports/ReportDetail.tsx` | Modify | Remove config UI, make read-only, add gear button |
| `src/components/reports/ReportEditDialog.tsx` | Delete | Replaced by `ReportModal` |
| `src/pages/Reports.tsx` | Modify | Replace `SalaryOverTimeChart` fallback with empty state, wire up `ReportModal` |
| `src/components/reports/AddBlockMenu.tsx` | Keep | Reused inside `ReportModal` |

---

## Chunk 1: Backend — salary_over_time block type

### Task 1: Add `build_salary_over_time` to the backend

**Files:**
- Modify: `src-tauri/src/commands.rs:3001-3010` (match block in `get_report_block_data`)
- Modify: `src-tauri/src/commands.rs` (add new builder function after `build_upcoming_birthdays`)

- [ ] **Step 1: Add `build_salary_over_time` function**

Add after `build_upcoming_birthdays` (after line ~3230 in `commands.rs`):

```rust
fn build_salary_over_time(conn: &rusqlite::Connection) -> Result<serde_json::Value, String> {
    let mut dp_stmt = conn
        .prepare(
            "SELECT id, name FROM salary_data_points WHERE scenario_group_id IS NULL AND deleted_at IS NULL ORDER BY id",
        )
        .map_err(|e| e.to_string())?;

    let data_points: Vec<(i64, String)> = dp_stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let mut member_stmt = conn
        .prepare(
            "SELECT sdpm.member_id, m.first_name, m.last_name, m.left_date,
                    COALESCE(SUM(sp.amount * sp.frequency), 0) as annual_total
             FROM salary_data_point_members sdpm
             JOIN team_members m ON m.id = sdpm.member_id
             LEFT JOIN salary_parts sp ON sp.data_point_member_id = sdpm.id
             WHERE sdpm.data_point_id = ?1 AND sdpm.is_active = 1
             GROUP BY sdpm.member_id
             ORDER BY m.last_name, m.first_name",
        )
        .map_err(|e| e.to_string())?;

    let mut points = Vec::new();
    for (dp_id, dp_name) in data_points {
        let members: Vec<serde_json::Value> = member_stmt
            .query_map(params![dp_id], |row| {
                Ok(serde_json::json!({
                    "member_id": row.get::<_, i64>(0)?,
                    "first_name": row.get::<_, String>(1)?,
                    "last_name": row.get::<_, String>(2)?,
                    "left_date": row.get::<_, Option<String>>(3)?,
                    "annual_total": row.get::<_, i64>(4)?
                }))
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;

        points.push(serde_json::json!({
            "data_point_id": dp_id,
            "data_point_name": dp_name,
            "members": members
        }));
    }

    Ok(serde_json::json!(points))
}
```

- [ ] **Step 2: Wire into `get_report_block_data` match**

In `get_report_block_data` (line ~3009), add the new arm before the wildcard:

```rust
            "upcoming_birthdays" => build_upcoming_birthdays(conn)?,
            "salary_over_time" => build_salary_over_time(conn)?,
            _ => serde_json::json!({}),
```

- [ ] **Step 3: Verify it compiles**

Run: `cd src-tauri && cargo build`
Expected: compiles without errors

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands.rs
git commit -m "feat: add salary_over_time report block type to backend"
```

---

## Chunk 2: Frontend — salary_over_time block rendering

### Task 2: Add salary_over_time to frontend types and BlockRenderer

**Files:**
- Modify: `src/lib/types.ts:177-184`
- Modify: `src/components/reports/blocks/BlockRenderer.tsx`

- [ ] **Step 1: Add `SalaryOverTimePoint[]` to `ReportBlockDataPayload`**

In `src/lib/types.ts`, update the union type (line 177-184):

```typescript
export type ReportBlockDataPayload =
  | TeamOverviewData
  | MemberStatusesData
  | OpenEscalationsData
  | ProjectStatusData
  | SalarySummaryData
  | OneOnOneCoverageData
  | UpcomingBirthdaysData
  | SalaryOverTimePoint[];
```

- [ ] **Step 2: Add salary_over_time to BLOCK_LABELS**

In `src/components/reports/blocks/BlockRenderer.tsx`, update `BLOCK_LABELS` (line 20-28):

```typescript
export const BLOCK_LABELS: Record<string, string> = {
  team_overview: "Team Overview",
  member_statuses: "Member Statuses",
  open_escalations: "Open Escalations",
  project_status: "Project Status",
  salary_summary: "Salary Summary",
  one_on_one_coverage: "1:1 Coverage",
  upcoming_birthdays: "Upcoming Birthdays",
  salary_over_time: "Salary Over Time",
};
```

- [ ] **Step 3: Add salary_over_time case to BlockRenderer switch**

Add the import at the top of `BlockRenderer.tsx`:

```typescript
import { SalaryOverTimeChart } from "@/components/salary/SalaryOverTimeChart";
import type { SalaryOverTimePoint } from "@/lib/types";
```

Add case in the switch (before `default`):

```typescript
      case "salary_over_time":
        return <SalaryOverTimeChart data={block.data as SalaryOverTimePoint[]} />;
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: no TypeScript errors

- [ ] **Step 5: Commit**

```bash
git add src/lib/types.ts src/components/reports/blocks/BlockRenderer.tsx
git commit -m "feat: add salary_over_time block type to frontend"
```

---

## Chunk 3: ReportModal — replace ReportEditDialog

### Task 3: Create ReportModal component

**Files:**
- Create: `src/components/reports/ReportModal.tsx`
- Delete: `src/components/reports/ReportEditDialog.tsx`

- [ ] **Step 1: Create `ReportModal.tsx`**

Create `src/components/reports/ReportModal.tsx`:

```typescript
import { useState, useEffect, useRef, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { X, GripVertical } from "lucide-react";
import { useAutoSave } from "@/hooks/useAutoSave";
import {
  updateReport,
  getReportBlocks,
  addReportBlock,
  removeReportBlock,
  reorderReportBlocks,
} from "@/lib/db";
import { required } from "@/lib/validators";
import { showError } from "@/lib/toast";
import { BLOCK_LABELS } from "./blocks/BlockRenderer";
import { AddBlockMenu } from "./AddBlockMenu";
import type { Report, ReportBlock } from "@/lib/types";

interface ReportModalProps {
  report: Report;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReportChange: (report: Report) => void;
}

export function ReportModal({
  report,
  open,
  onOpenChange,
  onReportChange,
}: ReportModalProps) {
  const nameRef = useRef<HTMLInputElement>(null);
  const [local, setLocal] = useState(report);
  const [blocks, setBlocks] = useState<ReportBlock[]>([]);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const { save: saveName, error: nameError } = useAutoSave({
    onSave: async (val) => {
      await updateReport(report.id, "name", val);
      const updated = { ...local, name: val ?? "" };
      setLocal(updated);
      onReportChange(updated);
    },
    validate: required("Report name"),
  });

  const loadBlocks = useCallback(async () => {
    try {
      const b = await getReportBlocks(report.id);
      setBlocks(b);
    } catch {
      showError("Failed to load blocks");
    }
  }, [report.id]);

  useEffect(() => {
    setLocal(report);
  }, [report]);

  useEffect(() => {
    if (open) {
      loadBlocks();
      setTimeout(() => {
        nameRef.current?.focus();
        nameRef.current?.select();
      }, 100);
    }
  }, [open, loadBlocks]);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value;
    setLocal((prev) => ({ ...prev, name: newVal }));
    saveName(newVal === "" ? null : newVal);
  };

  const handleToggle = async (
    field: "collect_statuses" | "include_stakeholders" | "include_projects",
    checked: boolean,
  ) => {
    const value = checked ? "1" : "0";
    try {
      await updateReport(report.id, field, value);
      const updated = { ...local, [field]: checked };
      setLocal(updated);
      onReportChange(updated);
    } catch {
      showError("Failed to update setting");
    }
  };

  const handleAddBlock = async (blockType: string) => {
    try {
      await addReportBlock(report.id, blockType);
      await loadBlocks();
    } catch {
      showError("Failed to add block");
    }
  };

  const handleRemoveBlock = async (blockId: number) => {
    try {
      await removeReportBlock(blockId);
      setBlocks((prev) => prev.filter((b) => b.id !== blockId));
    } catch {
      showError("Failed to remove block");
    }
  };

  const handleDragStart = (idx: number) => {
    setDragIdx(idx);
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;
    const reordered = [...blocks];
    const [moved] = reordered.splice(dragIdx, 1);
    reordered.splice(idx, 0, moved);
    setBlocks(reordered);
    setDragIdx(idx);
  };

  const handleDragEnd = async () => {
    setDragIdx(null);
    try {
      await reorderReportBlocks(
        report.id,
        blocks.map((b) => b.id),
      );
    } catch {
      showError("Failed to reorder blocks");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Configure Report</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Name */}
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Report Name</Label>
            <Input
              ref={nameRef}
              value={local.name}
              onChange={handleNameChange}
              aria-invalid={!!nameError || undefined}
            />
            <div className="h-3 text-xs">
              {nameError && (
                <span className="text-destructive truncate">{nameError}</span>
              )}
            </div>
          </div>

          {/* Toggles */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Collect member statuses</Label>
              <Switch
                checked={local.collect_statuses}
                onCheckedChange={(c) => handleToggle("collect_statuses", c)}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-sm">Include stakeholders</Label>
              <Switch
                checked={local.include_stakeholders}
                onCheckedChange={(c) => handleToggle("include_stakeholders", c)}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-sm">Include projects</Label>
              <Switch
                checked={local.include_projects}
                onCheckedChange={(c) => handleToggle("include_projects", c)}
              />
            </div>
          </div>

          {/* Blocks */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Blocks</Label>
              <AddBlockMenu
                existingBlockTypes={blocks.map((b) => b.block_type)}
                onAdd={handleAddBlock}
              />
            </div>

            {blocks.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">
                No blocks yet. Add blocks to build your report.
              </p>
            ) : (
              <ul className="space-y-1">
                {blocks.map((block, idx) => (
                  <li
                    key={block.id}
                    draggable
                    onDragStart={() => handleDragStart(idx)}
                    onDragOver={(e) => handleDragOver(e, idx)}
                    onDragEnd={handleDragEnd}
                    className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                      dragIdx === idx ? "opacity-50" : ""
                    }`}
                  >
                    <GripVertical className="size-4 text-muted-foreground cursor-grab shrink-0" />
                    <span className="flex-1">
                      {BLOCK_LABELS[block.block_type] ?? block.block_type}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6 text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() => handleRemoveBlock(block.id)}
                    >
                      <X className="size-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: no errors (component isn't wired up yet but should compile)

- [ ] **Step 3: Commit**

```bash
git add src/components/reports/ReportModal.tsx
git commit -m "feat: create ReportModal component with name, toggles, and block management"
```

---

## Chunk 4: Wire up Reports page and make detail read-only

### Task 4: Update Reports.tsx — replace fallback, wire modal

**Files:**
- Modify: `src/pages/Reports.tsx`

- [ ] **Step 1: Update Reports.tsx**

Replace the entire file content. Key changes:
- Remove `SalaryOverTimeChart` lazy import and `salaryOverTime` state
- Remove `getSalaryOverTime` from initial load
- Replace `ReportEditDialog` with `ReportModal`
- Replace `SalaryOverTimeChart` fallback with empty state
- On create: open modal immediately for the new report

```typescript
import { useState, useEffect, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { ReportList } from "@/components/reports/ReportList";
import { ReportDetail } from "@/components/reports/ReportDetail";
import { ReportModal } from "@/components/reports/ReportModal";
import { getReports, createReport, deleteReport } from "@/lib/db";
import { showSuccess, showError } from "@/lib/toast";
import type { Report } from "@/lib/types";

export function Reports() {
  const location = useLocation();
  const [reports, setReports] = useState<Report[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const loadReports = useCallback(async () => {
    const r = await getReports();
    setReports(r);
    return r;
  }, []);

  useEffect(() => {
    let cancelled = false;
    getReports()
      .then((r) => {
        if (!cancelled) setReports(r);
      })
      .catch(() => showError("Failed to load reports"))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const state = location.state;
    if (!state) return;
    window.history.replaceState({}, "");

    if (state.action === "create" || state.action === "create-report") {
      handleCreate();
    } else if (state.action === "delete" && selectedId !== null) {
      handleDelete(selectedId);
    }
  }, [location.state]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const created = await createReport();
      await loadReports();
      setSelectedId(created.id);
      setEditingId(created.id);
      showSuccess("Report created");
    } catch {
      showError("Failed to create report");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (selectedId === id) setSelectedId(null);
    if (editingId === id) setEditingId(null);
    await deleteReport(id);
    await loadReports();
  };

  const handleReportChange = (updated: Report) => {
    setReports((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  };

  const selectedReport = reports.find((r) => r.id === selectedId) ?? null;
  const editingReport = reports.find((r) => r.id === editingId) ?? null;

  return (
    <div className="flex h-full">
      <ReportList
        reports={reports}
        selectedId={selectedId}
        loading={loading}
        creating={creating}
        onSelect={(id) => setSelectedId(id)}
        onCreate={handleCreate}
        onDelete={handleDelete}
        onEdit={(id) => setEditingId(id)}
      />
      <div className="flex-1 overflow-auto">
        {selectedReport ? (
          <ReportDetail
            key={`${selectedReport.id}-${selectedReport.collect_statuses}-${selectedReport.include_stakeholders}-${selectedReport.include_projects}`}
            report={selectedReport}
            onEdit={() => setEditingId(selectedReport.id)}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-muted-foreground">Select a report</p>
          </div>
        )}
      </div>

      {editingReport && (
        <ReportModal
          report={editingReport}
          open={editingId !== null}
          onOpenChange={(open) => {
            if (!open) setEditingId(null);
          }}
          onReportChange={handleReportChange}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/Reports.tsx
git commit -m "feat: replace SalaryOverTimeChart fallback with empty state, wire ReportModal"
```

### Task 5: Make ReportDetail read-only

**Files:**
- Modify: `src/components/reports/ReportDetail.tsx`

- [ ] **Step 1: Update ReportDetail to be read-only**

Replace the entire file. Key changes:
- Remove `AddBlockMenu` import and usage
- Remove `handleAdd` and `handleRemove` functions
- Add `onEdit` prop and gear button in header
- Blocks render without remove buttons (pass a no-op or update BlockCard)
- Keep PDF export

```typescript
import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { getReportBlockData } from "@/lib/db";
import type { Report, ReportBlockData } from "@/lib/types";
import { Download, Settings } from "lucide-react";
import { showSuccess, showError } from "@/lib/toast";
import { BlockRenderer } from "./blocks/BlockRenderer";

interface ReportDetailProps {
  report: Report;
  onEdit: () => void;
}

async function generatePdf(name: string, blocks: ReportBlockData[]) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF();
  const margin = 20;
  let y = 20;

  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(name, margin, y);
  y += 6;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(120);
  doc.text(new Date().toLocaleDateString(), margin, y);
  doc.setTextColor(0);
  y += 10;

  if (blocks.length === 0) {
    doc.setFontSize(11);
    doc.text("No blocks added to this report.", margin, y);
  }

  doc.save(`${name.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`);
  showSuccess("PDF exported");
}

export function ReportDetail({ report, onEdit }: ReportDetailProps) {
  const [blocks, setBlocks] = useState<ReportBlockData[]>([]);
  const [loading, setLoading] = useState(true);

  const loadBlocks = useCallback(async () => {
    try {
      const data = await getReportBlockData(report.id);
      setBlocks(data);
    } catch {
      showError("Failed to load report blocks");
    } finally {
      setLoading(false);
    }
  }, [report.id]);

  useEffect(() => {
    loadBlocks();
  }, [loadBlocks]);

  if (loading) {
    return (
      <div className="max-w-2xl p-6 space-y-4">
        {[1, 2].map((i) => (
          <div key={i} className="h-32 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-2xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{report.name}</h2>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={onEdit}
          >
            <Settings className="size-4" />
            Configure
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => {
              generatePdf(report.name, blocks).catch(() =>
                showError("Export failed"),
              );
            }}
          >
            <Download className="size-4" />
            Download PDF
          </Button>
        </div>
      </div>

      {blocks.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No blocks added yet. Click "Configure" to build your report.
        </p>
      ) : (
        <div className="space-y-4">
          {blocks.map((block) => (
            <BlockRenderer key={block.id} block={block} />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Update BlockRenderer to make `onRemove` optional**

In `src/components/reports/blocks/BlockRenderer.tsx`, update the interface and usage:

```typescript
interface BlockRendererProps {
  block: ReportBlockData;
  onRemove?: (id: number) => void;
}

export function BlockRenderer({ block, onRemove }: BlockRendererProps) {
  // ... content switch stays the same ...

  return (
    <BlockCard title={title} onRemove={onRemove ? () => onRemove(block.id) : undefined}>
      {content}
    </BlockCard>
  );
}
```

- [ ] **Step 4: Update BlockCard to make `onRemove` optional**

In `src/components/reports/blocks/BlockCard.tsx`:

```typescript
interface BlockCardProps {
  title: string;
  onRemove?: () => void;
  children: React.ReactNode;
}

export function BlockCard({ title, onRemove, children }: BlockCardProps) {
  return (
    <div className="rounded-lg border bg-background">
      <div className="flex items-center justify-between border-b px-4 py-2">
        <h3 className="text-sm font-medium">{title}</h3>
        {onRemove && (
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground hover:text-destructive"
            onClick={onRemove}
          >
            <X className="size-3.5" />
          </Button>
        )}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}
```

- [ ] **Step 5: Delete `ReportEditDialog.tsx`**

```bash
rm src/components/reports/ReportEditDialog.tsx
```

- [ ] **Step 6: Verify full build**

Run: `npm run build`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/components/reports/ReportDetail.tsx src/components/reports/blocks/BlockRenderer.tsx src/components/reports/blocks/BlockCard.tsx
git rm src/components/reports/ReportEditDialog.tsx
git commit -m "feat: make ReportDetail read-only with configure button, remove ReportEditDialog"
```

---

## Chunk 5: Manual testing checklist

### Task 6: End-to-end verification

- [ ] **Step 1: Run dev server**

Run: `npm run tauri dev`

- [ ] **Step 2: Verify empty state**

Navigate to Reports. With no report selected, confirm "Select a report" centered message appears (no more salary-over-time chart fallback).

- [ ] **Step 3: Verify create flow**

Click "+" to create a report. Modal should open immediately with name focused. Type a name, add blocks (including "Salary Over Time"), close modal. Report detail should show rendered blocks.

- [ ] **Step 4: Verify edit flow**

Click pencil icon on a report in the list, or click "Configure" button in the detail header. Modal opens with current name, toggles, and blocks. Add/remove/reorder blocks. Close modal. Detail view updates.

- [ ] **Step 5: Verify salary-over-time block**

Add "Salary Over Time" block to a report. It should render the same line chart with member salary trends.

- [ ] **Step 6: Verify PDF export still works**

Click "Download PDF" in the detail view. PDF should generate and download.

- [ ] **Step 7: Commit any fixes and push**

```bash
git push
```
