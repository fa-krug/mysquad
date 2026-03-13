# UX4: Undo for Destructive Actions — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace confirmation dialogs with undo toasts for top-level item deletion — faster, less disruptive, and consistent with sub-item immediate-delete behavior.

**Architecture:** Frontend-only soft delete. Items are hidden from UI immediately, a sonner toast with "Undo" action is shown for 5 seconds, and the real backend delete fires only when the toast auto-closes. A global `pendingDeleteRegistry` (modeled after `flushRegistry` in `useAutoSave.ts`) lets `App.tsx` cancel all pending deletes on lock.

**Tech Stack:** React hooks, sonner toast library (already installed via UX1)

**Spec:** `docs/superpowers/specs/2026-03-13-ux4-undo-destructive-actions-design.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/hooks/usePendingDelete.ts` | Hook + global registry for pending deletes |
| Modify | `src/App.tsx` | Cancel pending deletes on lock |
| Modify | `src/pages/TeamMembers.tsx` | Use undo pattern instead of immediate delete |
| Modify | `src/pages/Projects.tsx` | Use undo pattern instead of immediate delete |
| Modify | `src/pages/Titles.tsx` | Use undo pattern (keep validation, remove AlertDialog) |
| Modify | `src/pages/Reports.tsx` | Use undo pattern instead of immediate delete |
| Modify | `src/pages/SalaryPlanner.tsx` | Use undo pattern, remove AlertDialog |
| Modify | `src/components/team/MemberList.tsx` | Remove AlertDialog, simplify delete button |
| Modify | `src/components/projects/ProjectList.tsx` | Remove AlertDialog, simplify delete button |
| Modify | `src/components/titles/TitleList.tsx` | Remove AlertDialog, simplify delete button |
| Modify | `src/components/reports/ReportList.tsx` | Remove AlertDialog, simplify delete button |
| Modify | `src/components/salary/DataPointList.tsx` | Remove `deletingId` prop from interface |

---

## Chunk 1: Core Hook + Lock Integration

### Task 1: Create usePendingDelete hook

**Files:**
- Create: `src/hooks/usePendingDelete.ts`

- [ ] **Step 1: Create the hook file**

```typescript
import { useState, useCallback, useRef, useEffect } from "react";
import { toast } from "sonner";

// Global registry so App.tsx can cancel all pending deletes on lock
export const pendingDeleteRegistry: Set<() => void> = new Set();

interface ScheduleDeleteOptions {
  id: number;
  label: string;
  onConfirm: () => Promise<void>;
  onUndo?: () => void;  // Optional callback for callers that need to restore selection or other state
}

export function usePendingDelete() {
  const [pendingIds, setPendingIds] = useState<Set<number>>(new Set());
  const timersRef = useRef<Map<number, { toastId: string | number }>>(new Map());

  const cancelAll = useCallback(() => {
    for (const [, entry] of timersRef.current) {
      toast.dismiss(entry.toastId);
    }
    timersRef.current.clear();
    setPendingIds(new Set());
  }, []);

  // Register/unregister with global registry
  useEffect(() => {
    pendingDeleteRegistry.add(cancelAll);
    return () => {
      pendingDeleteRegistry.delete(cancelAll);
      // Cleanup on unmount: cancel all pending
      cancelAll();
    };
  }, [cancelAll]);

  const scheduleDelete = useCallback(
    ({ id, label, onConfirm, onUndo: onUndoCallback }: ScheduleDeleteOptions) => {
      // If already pending, ignore
      if (timersRef.current.has(id)) return;

      setPendingIds((prev) => new Set(prev).add(id));

      const execute = async () => {
        // Guard: if undo already removed the entry, don't execute
        if (!timersRef.current.has(id)) return;
        timersRef.current.delete(id);
        setPendingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        try {
          await onConfirm();
        } catch {
          toast.error(`Failed to delete ${label}`);
        }
      };

      const undo = () => {
        // Remove entry first so onDismiss/onAutoClose callbacks become no-ops
        timersRef.current.delete(id);
        setPendingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        onUndoCallback?.();
      };

      const toastId = toast(`${label} deleted`, {
        action: { label: "Undo", onClick: () => undo() },
        duration: 5000,
        onAutoClose: () => execute(),
        onDismiss: () => execute(),  // Manual dismiss (X button) also confirms delete
      });

      timersRef.current.set(id, { toastId: toastId as string | number });
    },
    [],
  );

  return { scheduleDelete, pendingIds };
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd /Users/skrug/PycharmProjects/mysquad && npx tsc --noEmit src/hooks/usePendingDelete.ts 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add src/hooks/usePendingDelete.ts
git commit -m "feat(ux4): add usePendingDelete hook with global registry"
```

### Task 2: Integrate pending delete cancellation on lock

**Files:**
- Modify: `src/App.tsx:1-2,13,26-29`

- [ ] **Step 1: Add import for pendingDeleteRegistry**

In `src/App.tsx`, add the import alongside the existing `flushRegistry` import:

```typescript
// After the existing line:
import { flushRegistry } from "./hooks/useAutoSave";
// Add:
import { pendingDeleteRegistry } from "./hooks/usePendingDelete";
```

- [ ] **Step 2: Cancel pending deletes in handleLock**

In `src/App.tsx`, modify `handleLock` to cancel pending deletes before flushing saves:

```typescript
  const handleLock = useCallback(async () => {
    // Cancel pending deletes first (restore items, don't delete)
    for (const cancel of pendingDeleteRegistry) cancel();
    await Promise.all([...flushRegistry].map((flush) => flush()));
    await lockDb();
    setUnlocked(false);
  }, []);
```

- [ ] **Step 3: Verify the app compiles**

Run: `cd /Users/skrug/PycharmProjects/mysquad && npm run build 2>&1 | tail -5`

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat(ux4): cancel pending deletes on app lock"
```

---

## Chunk 2: Migrate TeamMembers and MemberList

### Task 3: Replace TeamMembers delete with undo pattern

**Files:**
- Modify: `src/pages/TeamMembers.tsx`
- Modify: `src/components/team/MemberList.tsx`

- [ ] **Step 1: Update TeamMembers.tsx**

Replace the delete handler to use `usePendingDelete`. The key changes:
1. Import `usePendingDelete`
2. Remove `deletingId` state (no longer needed — items just vanish from list)
3. Replace `handleDelete` with `scheduleDelete`
4. Filter `pendingIds` out of the rendered members list

Full updated `src/pages/TeamMembers.tsx`:

```typescript
import { useState, useEffect, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { MemberList } from "@/components/team/MemberList";
import { MemberDetail } from "@/components/team/MemberDetail";
import { getTeamMembers, createTeamMember, deleteTeamMember, getPicturesDirPath } from "@/lib/db";
import { showSuccess, showError } from "@/lib/toast";
import { usePendingDelete } from "@/hooks/usePendingDelete";
import type { TeamMember } from "@/lib/types";

export function TeamMembers() {
  const location = useLocation();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [picturesDir, setPicturesDir] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { scheduleDelete, pendingIds } = usePendingDelete();

  useEffect(() => {
    getPicturesDirPath().then(setPicturesDir).catch(() => showError("Failed to load pictures directory"));
  }, []);

  const loadMembers = useCallback(async () => {
    const data = await getTeamMembers();
    setMembers(data);
  }, []);

  useEffect(() => {
    let cancelled = false;
    getTeamMembers()
      .then((data) => {
        if (!cancelled) setMembers(data);
      })
      .catch(() => {
        if (!cancelled) showError("Failed to load team members");
      })
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

    if (state.action === "create" || state.action === "create-member") {
      handleCreate();
    } else if (state.action === "delete" && selectedId !== null) {
      handleDelete(selectedId);
    } else if (typeof state.memberId === "number") {
      setSelectedId(state.memberId);
    }
  }, [location.state]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const member = await createTeamMember();
      await loadMembers();
      setSelectedId(member.id);
      showSuccess("Team member created");
    } catch {
      showError("Failed to create team member");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = (id: number) => {
    const member = members.find((m) => m.id === id);
    if (!member) return;
    if (selectedId === id) setSelectedId(null);
    scheduleDelete({
      id,
      label: member.first_name || member.last_name
        ? `${member.first_name ?? ""} ${member.last_name ?? ""}`.trim()
        : "Team member",
      onConfirm: async () => {
        await deleteTeamMember(id);
        await loadMembers();
      },
    });
  };

  const handleMemberChange = (field: string, value: string | null) => {
    setMembers((prev) => prev.map((m) => (m.id === selectedId ? { ...m, [field]: value } : m)));
  };

  const visibleMembers = members.filter((m) => !pendingIds.has(m.id));
  const selectedMember = visibleMembers.find((m) => m.id === selectedId) ?? null;

  return (
    <div className="flex h-full">
      <MemberList
        members={visibleMembers}
        selectedId={selectedId}
        loading={loading}
        creating={creating}
        onSelect={setSelectedId}
        onCreate={handleCreate}
        onDelete={handleDelete}
        picturesDir={picturesDir}
      />
      <div className="flex-1 overflow-auto">
        {selectedMember ? (
          <MemberDetail
            key={selectedMember.id}
            member={selectedMember}
            onMemberChange={handleMemberChange}
            picturesDir={picturesDir}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            Select a team member to view details
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Simplify MemberList — remove AlertDialog**

In `src/components/team/MemberList.tsx`:
1. Remove all AlertDialog imports
2. Remove `pendingDeleteId` state
3. Remove `deletingId` prop
4. Replace the AlertDialog-wrapped delete button with a simple delete button that calls `onDelete(member.id)` directly

The delete button in each list item should become:

```tsx
<Button
  variant="ghost"
  size="icon"
  className="h-6 w-6 opacity-0 group-hover:opacity-100 shrink-0"
  onClick={(e) => {
    e.stopPropagation();
    onDelete(member.id);
  }}
>
  <Trash2 className="h-3.5 w-3.5" />
</Button>
```

Remove the `deletingId` prop from the component's props interface. Remove the AlertDialog wrapping and all related state (`pendingDeleteId`, `pendingMember`).

- [ ] **Step 3: Verify the app compiles**

Run: `cd /Users/skrug/PycharmProjects/mysquad && npm run build 2>&1 | tail -5`

- [ ] **Step 4: Commit**

```bash
git add src/pages/TeamMembers.tsx src/components/team/MemberList.tsx
git commit -m "feat(ux4): replace team member delete confirmation with undo toast"
```

---

## Chunk 3: Migrate Projects and ProjectList

### Task 4: Replace Projects delete with undo pattern

**Files:**
- Modify: `src/pages/Projects.tsx`
- Modify: `src/components/projects/ProjectList.tsx`

- [ ] **Step 1: Update Projects.tsx**

Same pattern as TeamMembers. Replace the delete handler:
1. Import `usePendingDelete`
2. Remove `deletingId` state
3. Replace `handleDelete`:

```typescript
import { usePendingDelete } from "@/hooks/usePendingDelete";

// Inside component, replace deletingId with:
const { scheduleDelete, pendingIds } = usePendingDelete();

// Replace handleDelete:
const handleDelete = (id: number) => {
  const project = projects.find((p) => p.id === id);
  if (!project) return;
  if (selectedId === id) setSelectedId(null);
  scheduleDelete({
    id,
    label: project.name || "Project",
    onConfirm: async () => {
      await deleteProject(id);
      await loadProjects();
    },
  });
};

// Filter visible:
const visibleProjects = projects.filter((p) => !pendingIds.has(p.id));
const selectedProject = visibleProjects.find((p) => p.id === selectedId) ?? null;
```

Pass `visibleProjects` to `ProjectList` instead of `projects`. Remove `deletingId` prop.

- [ ] **Step 2: Simplify ProjectList — remove AlertDialog**

In `src/components/projects/ProjectList.tsx`:
1. Remove all AlertDialog imports
2. Remove `pendingDeleteId` state and `deletingId` prop
3. Replace AlertDialog-wrapped delete button with simple button calling `onDelete(project.id)` directly

- [ ] **Step 3: Verify the app compiles**

Run: `cd /Users/skrug/PycharmProjects/mysquad && npm run build 2>&1 | tail -5`

- [ ] **Step 4: Commit**

```bash
git add src/pages/Projects.tsx src/components/projects/ProjectList.tsx
git commit -m "feat(ux4): replace project delete confirmation with undo toast"
```

---

## Chunk 4: Migrate Titles and TitleList

### Task 5: Replace Titles delete with undo pattern (keep validation)

**Files:**
- Modify: `src/pages/Titles.tsx`
- Modify: `src/components/titles/TitleList.tsx`

- [ ] **Step 1: Update Titles.tsx**

Titles has a validation constraint: deletion should fail if members are assigned. The backend already enforces this and throws an error. Keep that — the `onConfirm` will call `deleteTitle(id)` which will throw if members are assigned, and `usePendingDelete` catches that and shows an error toast.

However, there's a subtlety: we hide the item immediately before confirming. If the backend rejects the delete, the item is already hidden. We need to re-show it. Modify `handleDelete` to check for assigned members BEFORE scheduling the delete:

```typescript
import { usePendingDelete } from "@/hooks/usePendingDelete";

// Inside component:
const { scheduleDelete, pendingIds } = usePendingDelete();

// Replace handleDelete:
const handleDelete = (id: number) => {
  const title = titles.find((t) => t.id === id);
  if (!title) return;

  // Check if any members use this title before scheduling
  const assignedMembers = members.filter((m) => m.title_id === id);
  if (assignedMembers.length > 0) {
    showError(`Cannot delete "${title.name}" — ${assignedMembers.length} member(s) assigned`);
    return;
  }

  if (selectedId === id) setSelectedId(null);
  scheduleDelete({
    id,
    label: title.name || "Title",
    onConfirm: async () => {
      await deleteTitle(id);
      await loadTitles();
    },
  });
};

// Filter visible:
const visibleTitles = titles.filter((t) => !pendingIds.has(t.id));
const selectedTitle = visibleTitles.find((t) => t.id === selectedId) ?? null;
```

Remove `deletingId` state. Pass `visibleTitles` to `TitleList`. Remove `deletingId` prop.

- [ ] **Step 2: Simplify TitleList — remove AlertDialog**

In `src/components/titles/TitleList.tsx`:
1. Remove all AlertDialog imports
2. Remove `pendingDeleteId` state, `pendingTitle` derived value, and `deletingId` prop
3. Replace AlertDialog-wrapped delete button with simple button calling `onDelete(title.id)` directly

- [ ] **Step 3: Verify the app compiles**

Run: `cd /Users/skrug/PycharmProjects/mysquad && npm run build 2>&1 | tail -5`

- [ ] **Step 4: Commit**

```bash
git add src/pages/Titles.tsx src/components/titles/TitleList.tsx
git commit -m "feat(ux4): replace title delete confirmation with undo toast (keep validation)"
```

---

## Chunk 5: Migrate Reports and ReportList

### Task 6: Replace Reports delete with undo pattern

**Files:**
- Modify: `src/pages/Reports.tsx`
- Modify: `src/components/reports/ReportList.tsx`

- [ ] **Step 1: Update Reports.tsx**

```typescript
import { usePendingDelete } from "@/hooks/usePendingDelete";

// Inside component:
const { scheduleDelete, pendingIds } = usePendingDelete();

// Replace handleDelete:
const handleDelete = (id: number) => {
  const report = reports.find((r) => r.id === id);
  if (!report) return;
  if (selectedId === id) setSelectedId(null);
  if (editingId === id) setEditingId(null);
  scheduleDelete({
    id,
    label: report.name || "Report",
    onConfirm: async () => {
      await deleteReport(id);
      await loadReports();
    },
  });
};

// Filter visible:
const visibleReports = reports.filter((r) => !pendingIds.has(r.id));
const selectedReport = visibleReports.find((r) => r.id === selectedId) ?? null;
```

Remove `deletingId` state. Pass `visibleReports` to `ReportList`. Remove `deletingId` prop.

- [ ] **Step 2: Simplify ReportList — remove AlertDialog**

In `src/components/reports/ReportList.tsx`:
1. Remove all AlertDialog imports
2. Remove `pendingDeleteId` state and `deletingId` prop
3. Replace AlertDialog-wrapped delete button with simple button calling `onDelete(report.id)` directly

- [ ] **Step 3: Verify the app compiles**

Run: `cd /Users/skrug/PycharmProjects/mysquad && npm run build 2>&1 | tail -5`

- [ ] **Step 4: Commit**

```bash
git add src/pages/Reports.tsx src/components/reports/ReportList.tsx
git commit -m "feat(ux4): replace report delete confirmation with undo toast"
```

---

## Chunk 6: Migrate SalaryPlanner

### Task 7: Replace SalaryPlanner delete with undo pattern

**Files:**
- Modify: `src/pages/SalaryPlanner.tsx`

- [ ] **Step 1: Update SalaryPlanner.tsx**

SalaryPlanner currently has its own `pendingDeleteId` state and an AlertDialog. Replace with `usePendingDelete`.

1. Import `usePendingDelete`
2. Remove `pendingDeleteId` state, `deletingId` state, `confirmDelete` function
3. Remove the entire `<AlertDialog>` block (lines 237-257)
4. Remove AlertDialog imports (lines 7-15)
5. Replace `handleDelete`:

```typescript
import { usePendingDelete } from "@/hooks/usePendingDelete";

// Inside component:
const { scheduleDelete, pendingIds } = usePendingDelete();

// Replace handleDelete:
function handleDelete(id: number) {
  const dp = dataPoints.find((d) => d.id === id);
  if (!dp) return;
  const wasSelected = selectedId === id;
  scheduleDelete({
    id,
    label: dp.name || "Data point",
    onConfirm: async () => {
      await deleteSalaryDataPoint(id);
      const dps = await loadDataPoints();
      if (wasSelected) {
        setSelectedId(dps.length > 0 ? dps[0].id : null);
        setDetail(null);
      }
    },
    onUndo: wasSelected
      ? () => {
          setSelectedId(id);
          // Detail will reload via the selectedId useEffect
        }
      : undefined,
  });
  // Deselect immediately if this was selected
  if (wasSelected) {
    const remaining = dataPoints.filter((d) => d.id !== id && !pendingIds.has(d.id));
    setSelectedId(remaining.length > 0 ? remaining[0].id : null);
    setDetail(null);
  }
}

// Filter visible:
const visibleDataPoints = dataPoints.filter((d) => !pendingIds.has(d.id));
```

Pass `visibleDataPoints` to `DataPointList` instead of `dataPoints`. Remove `deletingId` prop.

Also clean up `DataPointList.tsx` props interface: remove the `deletingId` prop since it's no longer passed from `SalaryPlanner`.

- [ ] **Step 2: Verify the app compiles**

Run: `cd /Users/skrug/PycharmProjects/mysquad && npm run build 2>&1 | tail -5`

- [ ] **Step 3: Commit**

```bash
git add src/pages/SalaryPlanner.tsx src/components/salary/DataPointList.tsx
git commit -m "feat(ux4): replace salary data point delete confirmation with undo toast"
```

---

## Chunk 7: Manual Testing

### Task 8: End-to-end verification

- [ ] **Step 1: Start the dev server**

Run: `cd /Users/skrug/PycharmProjects/mysquad && npm run dev`

- [ ] **Step 2: Test each page's delete → undo flow**

For each page (Team Members, Projects, Titles, Reports, Salary Planner):
1. Click delete on an item — verify item disappears immediately and toast appears
2. Click "Undo" on the toast — verify item reappears
3. Click delete again and wait 5 seconds — verify item is permanently deleted
4. For Titles: try deleting a title with assigned members — verify error toast appears and item stays

- [ ] **Step 3: Test lock cancellation**

1. Schedule a delete (click delete on any item)
2. While toast is showing, trigger lock (blur the window if auto-lock is set, or use system sleep)
3. Unlock — verify the item was NOT deleted (pending deletes cancelled on lock)

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix(ux4): address issues found during manual testing"
```
