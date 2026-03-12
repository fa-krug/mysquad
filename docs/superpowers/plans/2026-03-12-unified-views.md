# Unified Views Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Standardize all split-page views to share the same layout structure, and convert Titles from single-page to split view.

**Architecture:** Three split views (Team Members, Titles, Salary Planner) will use identical Tailwind class patterns for list panels (w-64, h-12 header, ScrollArea) and detail panels (flex-1 overflow-auto, max-w-2xl p-6). No shared component extracted — consistency through identical class usage. Titles gets new TitleList and TitleDetail components. Cross-page navigation from Titles→Team Members via React Router state.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, shadcn/ui, React Router v6, Tauri invoke

**Spec:** `docs/superpowers/specs/2026-03-12-unified-views-design.md`

---

## Chunk 1: Standardize Existing Views

### Task 1: Standardize MemberList width and header

**Files:**
- Modify: `src/components/team/MemberList.tsx:31-38`

- [ ] **Step 1: Update MemberList width and header**

Change `w-[250px]` to `w-64`, standardize header to `h-12`, and update header font to `font-semibold`:

```tsx
// Line 31: change
<div className="w-[250px] border-r flex flex-col h-full">
// to
<div className="w-64 shrink-0 border-r flex flex-col h-full">

// Line 33: change
<div className="flex items-center justify-between px-3 py-2 border-b">
// to
<div className="flex items-center justify-between px-3 h-12 border-b">

// Line 34: change
<span className="text-sm font-medium">Team Members</span>
// to
<span className="text-sm font-semibold">Team Members</span>
```

- [ ] **Step 2: Run dev server and verify Team Members page**

Run: `npm run dev`
Expected: Team Members list panel is slightly wider (256px vs 250px), header is consistent height. No visual breakage.

- [ ] **Step 3: Commit**

```bash
git add src/components/team/MemberList.tsx
git commit -m "style: standardize MemberList width to w-64 and header to h-12"
```

---

### Task 2: Add overflow-auto to TeamMembers detail wrapper and support cross-page navigation

**Files:**
- Modify: `src/pages/TeamMembers.tsx:1-68`

- [ ] **Step 1: Add overflow-auto to detail wrapper and read location state**

```tsx
// Add import at top (line 1):
import { useState, useEffect, useCallback } from "react";
import { useLocation } from "react-router-dom";

// After line 9 (const [selectedId, ...]):
const location = useLocation();

// Add effect after existing useEffect (after line 24):
useEffect(() => {
  const memberId = location.state?.memberId;
  if (typeof memberId === "number") {
    setSelectedId(memberId);
    // Clear the state so refreshing doesn't re-select
    window.history.replaceState({}, "");
  }
}, [location.state]);

// Line 53: change
<div className="flex-1">
// to
<div className="flex-1 overflow-auto">
```

- [ ] **Step 2: Verify Team Members page still works**

Run: `npm run dev`
Expected: Page loads normally. Detail panel scrolls when content overflows.

- [ ] **Step 3: Commit**

```bash
git add src/pages/TeamMembers.tsx
git commit -m "feat: add overflow-auto to detail panel, support cross-page member selection"
```

---

### Task 3: Standardize Salary Planner list panel styles

**Files:**
- Modify: `src/components/salary/DataPointList.tsx:26-47`

- [ ] **Step 1: Standardize DataPointList header and selection styles**

```tsx
// Line 27: change
<div className="flex items-center justify-between border-b px-4 py-3">
// to
<div className="flex items-center justify-between border-b px-3 h-12">

// Line 29: change button size
<Button variant="ghost" size="icon" onClick={onCreate} title="New Data Point">
// to
<Button variant="ghost" size="icon-sm" onClick={onCreate} title="New Data Point">

// Lines 44-46: change selection and hover styles
"group flex cursor-pointer items-center justify-between rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent",
selectedId === dp.id && "bg-accent text-accent-foreground",
// to
"group flex cursor-pointer items-center justify-between rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted/50",
selectedId === dp.id && "bg-muted",
```

- [ ] **Step 2: Verify Salary Planner list looks correct**

Run: `npm run dev`
Expected: Salary Planner list header matches Team Members height. Selection uses muted background instead of accent.

- [ ] **Step 3: Commit**

```bash
git add src/components/salary/DataPointList.tsx
git commit -m "style: standardize DataPointList header and selection styles"
```

---

### Task 4: Add max-w-2xl to Salary Planner detail panel

**Files:**
- Modify: `src/pages/SalaryPlanner.tsx:149-200`

- [ ] **Step 1: Restructure the right panel**

Replace the entire right panel (lines 164-200) — from `<ScrollArea className="flex-1">` through its closing `</ScrollArea>` — with:

```tsx
<div className="flex-1 overflow-auto">
  {!detail ? (
    <div className="flex h-full items-center justify-center text-muted-foreground">
      Select a data point to view details
    </div>
  ) : (
    <div className="max-w-2xl p-6 space-y-6">
      <h1 className="text-2xl font-bold">{detail.name}</h1>

      {/* Member salary cards */}
      {activeMembers.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No active members in this data point.
        </p>
      ) : (
        activeMembers.map((member) => (
          <MemberSalaryCard
            key={member.id}
            member={member}
            ranges={detail.ranges}
            onAddPart={handleAddPart}
            onDeletePart={handleDeletePart}
            onChanged={handlePartChanged}
          />
        ))
      )}

      {/* Analytics */}
      {activeMembers.length > 0 && (
        <>
          <hr className="border-border" />
          <SalaryAnalytics detail={detail} previousData={previousData} />
        </>
      )}
    </div>
  )}
</div>
```

Also remove the `ScrollArea` import from line 6 (no longer used in this file).

- [ ] **Step 2: Verify Salary Planner detail panel**

Run: `npm run dev`
Expected: Detail content is constrained to max-w-2xl. Empty state is centered. Scrolling works.

- [ ] **Step 3: Commit**

```bash
git add src/pages/SalaryPlanner.tsx
git commit -m "style: standardize Salary Planner detail panel with max-w-2xl"
```

---

### Task 5: Replace window.confirm with AlertDialog in Salary Planner

**Files:**
- Modify: `src/pages/SalaryPlanner.tsx:1-212`

- [ ] **Step 1: Add AlertDialog state and imports**

Add imports at the top of the file:

```tsx
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
```

Add state after existing state declarations:

```tsx
const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
```

- [ ] **Step 2: Replace window.confirm in handleDelete**

Replace the `handleDelete` function:

```tsx
async function handleDelete(id: number) {
  setPendingDeleteId(id);
}

async function confirmDelete() {
  if (pendingDeleteId === null) return;
  const id = pendingDeleteId;
  setPendingDeleteId(null);
  await deleteSalaryDataPoint(id);
  const dps = await loadDataPoints();
  if (selectedId === id) {
    setSelectedId(dps.length > 0 ? dps[0].id : null);
    setDetail(null);
  }
}
```

- [ ] **Step 3: Add AlertDialog to the JSX**

Add before the closing `</div>` of the component (after the DataPointModal):

```tsx
<AlertDialog open={pendingDeleteId !== null} onOpenChange={(open) => { if (!open) setPendingDeleteId(null); }}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Delete Data Point</AlertDialogTitle>
      <AlertDialogDescription>
        Are you sure you want to delete this data point? This action cannot be undone.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel onClick={() => setPendingDeleteId(null)}>Cancel</AlertDialogCancel>
      <AlertDialogAction variant="destructive" onClick={confirmDelete}>Delete</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

- [ ] **Step 4: Verify delete confirmation works**

Run: `npm run dev`
Expected: Clicking delete on a data point shows AlertDialog. Cancel dismisses. Confirm deletes.

- [ ] **Step 5: Commit**

```bash
git add src/pages/SalaryPlanner.tsx
git commit -m "feat: replace window.confirm with AlertDialog for salary data point delete"
```

---

## Chunk 2: Convert Titles to Split View

### Task 6: Create TitleList component

**Files:**
- Create: `src/components/titles/TitleList.tsx`

- [ ] **Step 1: Create the TitleList component**

```tsx
import { useState } from "react";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import type { Title } from "@/lib/types";

interface TitleListProps {
  titles: Title[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onCreate: () => void;
  onDelete: (id: number) => void;
}

export function TitleList({ titles, selectedId, onSelect, onCreate, onDelete }: TitleListProps) {
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

  const pendingTitle = titles.find((t) => t.id === pendingDeleteId);

  return (
    <div className="w-64 shrink-0 border-r flex flex-col h-full">
      <div className="flex items-center justify-between px-3 h-12 border-b">
        <span className="text-sm font-semibold">Titles</span>
        <Button variant="ghost" size="icon-sm" onClick={onCreate} title="Add title">
          <PlusIcon />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        {titles.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">
            No titles yet
          </div>
        ) : (
          <ul className="py-1">
            {titles.map((title) => (
              <li
                key={title.id}
                className={`group relative flex items-start px-3 py-2 cursor-pointer hover:bg-muted/50 ${
                  selectedId === title.id ? "bg-muted" : ""
                }`}
                onClick={() => onSelect(title.id)}
                onMouseEnter={() => setHoveredId(title.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{title.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {title.member_count} {title.member_count === 1 ? "member" : "members"}
                  </div>
                </div>

                {hoveredId === title.id && (
                  <button
                    className="ml-1 shrink-0 p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPendingDeleteId(title.id);
                    }}
                    title="Delete title"
                  >
                    <Trash2Icon className="size-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>

      <AlertDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => { if (!open) setPendingDeleteId(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Title</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{pendingTitle?.name}</strong>?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingDeleteId(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (pendingDeleteId !== null) {
                  onDelete(pendingDeleteId);
                  setPendingDeleteId(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
```

- [ ] **Step 2: Verify file compiles**

Run: `npm run build`
Expected: No TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/titles/TitleList.tsx
git commit -m "feat: create TitleList component for split view"
```

---

### Task 7: Create TitleDetail component

**Files:**
- Create: `src/components/titles/TitleDetail.tsx`

- [ ] **Step 1: Create the TitleDetail component**

The `useAutoSave` hook API is: `useAutoSave({ onSave }) => { save, flush, saving, saved, error }`. It does NOT manage value state — use `useState` separately and call `save(value)` on change. Follow the pattern from `InfoSection.tsx`.

```tsx
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import type { Title, TeamMember } from "@/lib/types";
import { useAutoSave } from "@/hooks/useAutoSave";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface TitleDetailProps {
  title: Title;
  members: TeamMember[];
  onTitleChange: (field: string, value: string) => void;
  focusName?: boolean;
}

export function TitleDetail({ title, members, onTitleChange, focusName }: TitleDetailProps) {
  const navigate = useNavigate();
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(title.name);
  const { save: saveName, saving, saved, error } = useAutoSave({
    onSave: async (val) => {
      onTitleChange("name", val ?? "");
    },
  });

  useEffect(() => {
    if (focusName && nameRef.current) {
      nameRef.current.focus();
      nameRef.current.select();
    }
  }, [focusName]);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value;
    setName(newVal);
    saveName(newVal === "" ? null : newVal);
  };

  const titleMembers = members.filter((m) => m.title_id === title.id);

  return (
    <div className="max-w-2xl p-6 space-y-6">
      <div className="flex flex-col gap-1">
        <Label className="text-xs text-muted-foreground">Title Name</Label>
        <Input
          ref={nameRef}
          value={name}
          onChange={handleNameChange}
        />
        <div className="h-3 text-xs">
          {saving && <span className="text-muted-foreground">Saving…</span>}
          {saved && !saving && <span className="text-green-600">Saved</span>}
          {error && <span className="text-destructive truncate">{error}</span>}
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium">
          Members ({titleMembers.length})
        </h3>
        {titleMembers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No members with this title</p>
        ) : (
          <ul className="space-y-1">
            {titleMembers.map((member) => (
              <li
                key={member.id}
                className="flex items-center px-3 py-2 rounded-md cursor-pointer hover:bg-muted/50 text-sm"
                onClick={() => navigate("/", { state: { memberId: member.id } })}
              >
                <span>
                  {member.last_name}, {member.first_name}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify file compiles**

Run: `npm run build`
Expected: No TypeScript errors. (If `useAutoSave` has a different API, check `src/hooks/useAutoSave.ts` and adjust.)

- [ ] **Step 3: Commit**

```bash
git add src/components/titles/TitleDetail.tsx
git commit -m "feat: create TitleDetail component for split view"
```

---

### Task 8: Rewrite Titles page as split view

**Files:**
- Modify: `src/pages/Titles.tsx` (full rewrite)

- [ ] **Step 1: Rewrite Titles.tsx**

```tsx
import { useState, useEffect, useCallback } from "react";
import { TitleList } from "@/components/titles/TitleList";
import { TitleDetail } from "@/components/titles/TitleDetail";
import { getTitles, createTitle, updateTitle, deleteTitle, getTeamMembers } from "@/lib/db";
import type { Title, TeamMember } from "@/lib/types";

export function Titles() {
  const [titles, setTitles] = useState<Title[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [focusName, setFocusName] = useState(false);

  const loadTitles = useCallback(async () => {
    const [t, m] = await Promise.all([getTitles(), getTeamMembers()]);
    setTitles(t);
    setMembers(m);
    return t;
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getTitles(), getTeamMembers()]).then(([t, m]) => {
      if (!cancelled) {
        setTitles(t);
        setMembers(m);
      }
    });
    return () => { cancelled = true; };
  }, []);

  const handleCreate = async () => {
    const created = await createTitle("New Title");
    await loadTitles();
    setSelectedId(created.id);
    setFocusName(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteTitle(id);
      if (selectedId === id) setSelectedId(null);
      await loadTitles();
    } catch (e) {
      // Title with members can't be deleted — error from backend
      alert(e instanceof Error ? e.message : String(e));
    }
  };

  const handleTitleChange = async (field: string, value: string) => {
    if (selectedId === null) return;
    if (field === "name") {
      await updateTitle(selectedId, value);
      setTitles((prev) =>
        prev.map((t) => (t.id === selectedId ? { ...t, name: value } : t)),
      );
    }
  };

  const selectedTitle = titles.find((t) => t.id === selectedId) ?? null;

  return (
    <div className="flex h-full">
      <TitleList
        titles={titles}
        selectedId={selectedId}
        onSelect={(id) => { setSelectedId(id); setFocusName(false); }}
        onCreate={handleCreate}
        onDelete={handleDelete}
      />
      <div className="flex-1 overflow-auto">
        {selectedTitle ? (
          <TitleDetail
            key={selectedTitle.id}
            title={selectedTitle}
            members={members}
            onTitleChange={handleTitleChange}
            focusName={focusName}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            Select a title to view details
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify Titles page works end-to-end**

Run: `npm run dev`

Test:
1. Navigate to Titles — see split view with list on left
2. Click a title — see detail with name input and member list
3. Click [+] — creates "New Title", selects it, focuses name input
4. Edit the name — auto-saves
5. Hover a title, click delete — AlertDialog appears
6. Try deleting a title with members — see error message
7. Click a member in the detail — navigates to Team Members with that member selected

- [ ] **Step 3: Commit**

```bash
git add src/pages/Titles.tsx
git commit -m "feat: convert Titles page to split view layout"
```

---

## Chunk 3: Final Verification and Cleanup

### Task 9: Run full build and verify all pages

- [ ] **Step 1: Run TypeScript check and build**

Run: `npm run build`
Expected: No errors.

- [ ] **Step 2: Run Rust tests**

Run: `cd src-tauri && cargo test`
Expected: All tests pass.

- [ ] **Step 3: Manual verification of all pages**

Run: `npm run tauri dev`

Verify each page:
1. **Team Members:** List panel w-64, h-12 header, detail has overflow-auto, empty state centered
2. **Titles:** Split view, w-64 list, h-12 header, AlertDialog delete, editable name with auto-save, member list with navigation
3. **Salary Planner:** h-12 header, bg-muted selection, max-w-2xl detail, AlertDialog delete, edit button still works
4. **Settings:** Unchanged, still works

- [ ] **Step 4: Commit any final adjustments**

If any tweaks were needed during verification, commit them:

```bash
git add -A
git commit -m "fix: final adjustments from unified views verification"
```

---

### Task 10: Document the unified view pattern

- [ ] **Step 1: Add view pattern documentation to CLAUDE.md**

Add a new section under "### Key patterns" in CLAUDE.md:

```markdown
- **Split view pattern**: Team Members, Titles, and Salary Planner all use the same split layout:
  - List panel: `w-64 shrink-0 border-r`, header `h-12` with title + add button, `ScrollArea` body
  - Selection: `bg-muted` selected, `hover:bg-muted/50` hover
  - Detail panel: `flex-1 overflow-auto` wrapper, `max-w-2xl p-6 space-y-6` content
  - Empty state: centered `text-muted-foreground` message
  - Top-level delete: `AlertDialog` confirmation; sub-item delete: immediate
  - Settings is the only single-page view (`max-w-lg p-6`)
```

- [ ] **Step 2: Commit documentation**

```bash
git add CLAUDE.md
git commit -m "docs: document unified split view pattern in CLAUDE.md"
```
