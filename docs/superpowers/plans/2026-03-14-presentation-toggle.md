# Presentation Toggle Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-member `is_presented` toggle on salary data points so that during negotiations only selected members are visible and budget is hidden.

**Architecture:** New `is_presented` column on `salary_data_point_members` (default 0). When any member has `is_presented = 1`, the frontend filters to only show those members and hides all budget-related UI. Follows the exact same pattern as existing `is_active` and `is_promoted` flags.

**Tech Stack:** Rust/SQLite (migration + command handler), React/TypeScript (filtering + UI toggle)

---

## Chunk 1: Backend — Migration, Struct, Query, Update Handler

### Task 1: Add database migration

**Files:**
- Create: `src-tauri/migrations/012_presentation_toggle.sql`
- Modify: `src-tauri/src/db.rs:92-96`

- [ ] **Step 1: Create migration file**

```sql
ALTER TABLE salary_data_point_members ADD COLUMN is_presented INTEGER NOT NULL DEFAULT 0;
```

- [ ] **Step 2: Register migration in db.rs**

Add after the `version < 11` block (line 96 in `src-tauri/src/db.rs`):

```rust
    if version < 12 {
        let migration_sql = include_str!("../migrations/012_presentation_toggle.sql");
        conn.execute_batch(migration_sql)?;
        conn.pragma_update(None, "user_version", 12)?;
    }
```

- [ ] **Step 3: Run `cargo build` to verify compilation**

Run: `cd src-tauri && cargo build`
Expected: compiles without errors

- [ ] **Step 4: Commit**

```bash
git add src-tauri/migrations/012_presentation_toggle.sql src-tauri/src/db.rs
git commit -m "feat: add is_presented column migration"
```

### Task 2: Update Rust struct and SELECT query

**Files:**
- Modify: `src-tauri/src/commands.rs:992-1004` (struct)
- Modify: `src-tauri/src/commands.rs:1172-1198` (SELECT + row mapping)

- [ ] **Step 1: Add `is_presented` field to `SalaryDataPointMember` struct**

In `src-tauri/src/commands.rs`, add after `promoted_title_name` (line 1002):

```rust
    pub is_presented: bool,
```

So the struct becomes:
```rust
pub struct SalaryDataPointMember {
    pub id: i64,
    pub member_id: i64,
    pub first_name: String,
    pub last_name: String,
    pub title_id: Option<i64>,
    pub title_name: Option<String>,
    pub is_active: bool,
    pub is_promoted: bool,
    pub promoted_title_id: Option<i64>,
    pub promoted_title_name: Option<String>,
    pub is_presented: bool,
    pub parts: Vec<SalaryPart>,
}
```

- [ ] **Step 2: Add `sdpm.is_presented` to the SELECT query**

In the `get_salary_data_point` function (line 1172-1174), update the SELECT to include `sdpm.is_presented`:

```sql
SELECT sdpm.id, sdpm.member_id, m.first_name, m.last_name,
       m.title_id, t.name as title_name, sdpm.is_active, sdpm.is_promoted,
       sdpm.promoted_title_id, pt.name as promoted_title_name, sdpm.is_presented
```

- [ ] **Step 3: Update the row mapping**

Update the query_map closure (line 1186-1198) to read the new column at index 10:

```rust
Ok(SalaryDataPointMember {
    id: row.get(0)?,
    member_id: row.get(1)?,
    first_name: row.get(2)?,
    last_name: row.get(3)?,
    title_id: row.get(4)?,
    title_name: row.get(5)?,
    is_active: row.get(6)?,
    is_promoted: row.get(7)?,
    promoted_title_id: row.get(8)?,
    promoted_title_name: row.get(9)?,
    is_presented: row.get(10)?,
    parts: Vec::new(),
})
```

- [ ] **Step 4: Add `is_presented` to allowed fields in `update_salary_data_point_member`**

In `src-tauri/src/commands.rs` line 1470, update:

```rust
let allowed = ["is_active", "is_promoted", "promoted_title_id", "is_presented"];
```

- [ ] **Step 5: Run `cargo build` to verify compilation**

Run: `cd src-tauri && cargo build`
Expected: compiles without errors

- [ ] **Step 6: Run Rust tests**

Run: `cd src-tauri && cargo test`
Expected: all tests pass

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/commands.rs
git commit -m "feat: add is_presented to Rust struct, query, and update handler"
```

### Task 3: Ensure `is_presented` is NOT copied when creating new data points

When copying members from a previous data point to a new one, `is_presented` should reset to 0 (the default). The existing INSERT...SELECT statements at lines 1347, 1755, and 1938 explicitly list columns — they do NOT copy `is_presented` because it's not in the column list. The DEFAULT 0 on the column handles this automatically.

**No code change needed.** Just verify:

- [ ] **Step 1: Verify INSERT...SELECT statements don't include is_presented**

Check lines 1347, 1755, and 1938 in `commands.rs`. They list `is_active, is_promoted, promoted_title_id` — `is_presented` is excluded, so new data points get the default value of 0. Correct behavior.

---

## Chunk 2: Frontend — TypeScript Type + Filtering Logic

### Task 4: Add `is_presented` to TypeScript type

**Files:**
- Modify: `src/lib/types.ts:129-141`

- [ ] **Step 1: Add `is_presented` to `SalaryDataPointMember` interface**

In `src/lib/types.ts`, add after `promoted_title_name` (line 139):

```typescript
  is_presented: boolean;
```

So it becomes:
```typescript
export interface SalaryDataPointMember {
  id: number;
  member_id: number;
  first_name: string;
  last_name: string;
  title_id: number | null;
  title_name: string | null;
  is_active: boolean;
  is_promoted: boolean;
  promoted_title_id: number | null;
  promoted_title_name: string | null;
  is_presented: boolean;
  parts: SalaryPart[];
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add is_presented to SalaryDataPointMember type"
```

### Task 5: Add presentation filtering in SalaryPlanner

**Files:**
- Modify: `src/pages/SalaryPlanner.tsx`

This is the core filtering logic. When any member has `is_presented = true`, only those members are shown everywhere and budget is hidden.

- [ ] **Step 1: Add `anyPresented` and `presentedMembers` derived state**

After the existing `sortedMembers` memo (line 299-305), add:

```typescript
const anyPresented = useMemo(
  () => detail?.members.some((m) => m.is_presented) ?? false,
  [detail],
);
const presentedMembers = useMemo(
  () =>
    anyPresented
      ? sortedMembers.filter((m) => m.is_presented)
      : sortedMembers,
  [sortedMembers, anyPresented],
);
```

- [ ] **Step 2: Add `filteredDetail` for analytics**

After the `presentedMembers` memo, add:

```typescript
const filteredDetail = useMemo(() => {
  if (!detail) return null;
  if (!anyPresented) return detail;
  return { ...detail, members: detail.members.filter((m) => m.is_presented) };
}, [detail, anyPresented]);
```

- [ ] **Step 3: Add `filteredPreviousData` for comparison charts**

After `filteredDetail`, add:

```typescript
const filteredPreviousData = useMemo(() => {
  if (!anyPresented) return previousData;
  const visibleMemberIds = new Set(presentedMembers.map((m) => m.member_id));
  return Object.fromEntries(
    Object.entries(previousData).filter(([id]) => visibleMemberIds.has(Number(id))),
  );
}, [previousData, presentedMembers, anyPresented]);
```

- [ ] **Step 4: Add `filteredPreviousTotal` scoped to visible members**

Replace the existing `previousTotal` memo (lines 315-326) with one that uses `filteredPreviousData`:

```typescript
const previousTotal = useMemo(() => {
  if (!filteredPreviousData || Object.keys(filteredPreviousData).length === 0) return null;
  let total = 0;
  for (const parts of Object.values(filteredPreviousData)) {
    if (parts) {
      for (const p of parts) {
        total += p.amount * p.frequency;
      }
    }
  }
  return total;
}, [filteredPreviousData]);
```

- [ ] **Step 5: Update `activeMembers` to use filtered detail for analytics visibility**

The existing `activeMembers` memo (line 298) gates whether the analytics panel renders. In presentation mode, this should be based on filtered members, not all members. Update it:

```typescript
const activeMembers = useMemo(
  () => (filteredDetail?.members ?? []).filter((m) => m.is_active),
  [filteredDetail],
);
```

Note: move this memo AFTER `filteredDetail` is defined.

- [ ] **Step 6: Replace `sortedMembers` with `presentedMembers` in the member card loop**

In the JSX (line 373), change `sortedMembers.map` to `presentedMembers.map`:

```tsx
{presentedMembers.length === 0 ? (
  <p className="text-sm text-muted-foreground">No members in this data point.</p>
) : (
  presentedMembers.map((member) => (
```

- [ ] **Step 7: Pass `anyPresented` to MemberSalaryCard to hide scenario comparisons**

Update the `MemberSalaryCard` usage (line 374-385) to pass `anyPresented`:

```tsx
<MemberSalaryCard
  key={member.id}
  member={member}
  ranges={detail.ranges}
  onAddPart={handleAddPart}
  onDeletePart={handleDeletePart}
  onChanged={handlePartChanged}
  anyPresented={anyPresented}
  scenarioComparison={
    detail.scenario_group_id ? memberComparisons[member.member_id] : undefined
  }
/>
```

- [ ] **Step 8: Pass `filteredDetail` and `filteredPreviousData` to SalaryAnalytics**

Update the `SalaryAnalytics` usage (line 393) to pass filtered data and `anyPresented`:

```tsx
<SalaryAnalytics
  detail={filteredDetail!}
  previousData={filteredPreviousData}
  anyPresented={anyPresented}
/>
```

- [ ] **Step 9: Pass `anyPresented` to ScenarioComparisonTable**

Update the `ScenarioComparisonTable` usage (line 360-365):

```tsx
<ScenarioComparisonTable
  summaries={scenarioSummaries}
  currentDataPointId={detail.id}
  budget={detail.budget}
  previousTotal={previousTotal}
  anyPresented={anyPresented}
/>
```

- [ ] **Step 10: Add imports needed for the presentation feature**

Add these to the existing imports in `SalaryPlanner.tsx`:

```typescript
// Add to the existing import from "@/lib/db" (line 12-24):
import {
  // ... existing imports ...
  updateSalaryDataPointMember,
} from "@/lib/db";

// Add new imports:
import { EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
```

- [ ] **Step 11: Add "Clear presentation" button in the header**

In the sticky header area (line 355-357), add a button to clear all presented flags:

```tsx
<div className="sticky top-0 z-10 bg-background px-6 pt-6 pb-2">
  <div className="flex items-center justify-between">
    <h1 className="text-2xl font-bold">{detail.name}</h1>
    {anyPresented && (
      <Button
        variant="outline"
        size="sm"
        onClick={async () => {
          await Promise.all(
            detail.members
              .filter((m) => m.is_presented)
              .map((m) =>
                updateSalaryDataPointMember(m.id, "is_presented", "0"),
              ),
          );
          await loadDetailOnly(selectedId!);
        }}
      >
        <EyeOff className="h-4 w-4 mr-1" />
        Clear presentation
      </Button>
    )}
  </div>
</div>
```

Add to the imports at top of file:
- `updateSalaryDataPointMember` from `@/lib/db`
- `EyeOff` from `lucide-react`
- `Button` from `@/components/ui/button`

- [ ] **Step 11: Verify TypeScript compiles**

Run: `npm run build`
Expected: May have type errors in child components (expected — we'll fix those in the next tasks)

- [ ] **Step 12: Commit**

```bash
git add src/pages/SalaryPlanner.tsx
git commit -m "feat: add presentation filtering logic to SalaryPlanner"
```

---

## Chunk 3: Frontend — Component Updates

### Task 6: Add eye toggle to MemberSalaryCard

**Files:**
- Modify: `src/components/salary/MemberSalaryCard.tsx`

- [ ] **Step 1: Update props interface**

Add `anyPresented` and `onTogglePresented` to the interface (line 16-23):

```typescript
interface MemberSalaryCardProps {
  member: SalaryDataPointMember;
  ranges: SalaryRange[];
  onAddPart: (dataPointMemberId: number) => void;
  onDeletePart: (partId: number) => void;
  onChanged: () => void;
  anyPresented: boolean;
  onTogglePresented: (id: number, value: boolean) => void;
  scenarioComparison?: ScenarioMemberComparison[];
}
```

- [ ] **Step 2: Add the toggle button in the header**

Import `Eye` from `lucide-react`. Add a toggle button before the annual total display. Update the destructured props and add the button in the header `div` (line 39), between the name/badges area and the salary total:

```tsx
export const MemberSalaryCard = memo(function MemberSalaryCard({
  member,
  ranges,
  onAddPart,
  onDeletePart,
  onChanged,
  anyPresented,
  onTogglePresented,
  scenarioComparison,
}: MemberSalaryCardProps) {
```

In the header div (line 39-68), add the eye button. Place it at the end of the left-side `flex items-center gap-2` div, after the Promoted badge:

```tsx
<Button
  variant="ghost"
  size="sm"
  className={cn(
    "h-6 w-6 p-0",
    member.is_presented
      ? "text-blue-600"
      : "text-muted-foreground opacity-0 group-hover/card:opacity-100",
  )}
  onClick={(e) => {
    e.stopPropagation();
    onTogglePresented(member.id, !member.is_presented);
  }}
>
  <Eye className="h-3.5 w-3.5" />
</Button>
```

Also add `group/card` to the outer card div className (line 38):

```tsx
<div className={cn("group/card rounded-lg border border-border p-4", !member.is_active && "opacity-60")}>
```

- [ ] **Step 3: Hide scenario comparison section when `anyPresented` is true**

Wrap the existing scenario comparison block (lines 102-116) with the `anyPresented` check:

```tsx
{!anyPresented && scenarioComparison && scenarioComparison.length > 0 && (
```

- [ ] **Step 4: Commit**

```bash
git add src/components/salary/MemberSalaryCard.tsx
git commit -m "feat: add presentation eye toggle to MemberSalaryCard"
```

### Task 7: Wire up onTogglePresented in SalaryPlanner

**Files:**
- Modify: `src/pages/SalaryPlanner.tsx`

- [ ] **Step 1: Add `handleTogglePresented` callback**

After `handlePartChanged` (line 289-291), add:

```typescript
const handleTogglePresented = useCallback(
  async (id: number, value: boolean) => {
    await updateSalaryDataPointMember(id, "is_presented", value ? "1" : "0");
    if (selectedId) await loadDetailOnly(selectedId);
  },
  [selectedId, loadDetailOnly],
);
```

- [ ] **Step 2: Pass `onTogglePresented` to MemberSalaryCard**

Update the `MemberSalaryCard` JSX to include the new prop:

```tsx
onTogglePresented={handleTogglePresented}
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/SalaryPlanner.tsx
git commit -m "feat: wire up presentation toggle handler"
```

### Task 8: Hide budget in SalaryAnalytics when presenting

**Files:**
- Modify: `src/components/salary/SalaryAnalytics.tsx`

- [ ] **Step 1: Add `anyPresented` prop and conditionally hide BudgetGauge + budget reference line**

`SalaryBarChart` shows a budget-based "Avg per head" reference line via its `budget` prop. Pass `null` for budget when presenting to hide both the BudgetGauge and the reference line:

```typescript
interface SalaryAnalyticsProps {
  detail: SalaryDataPointDetail;
  previousData: Record<number, SalaryPart[] | null>;
  anyPresented: boolean;
}

export function SalaryAnalytics({ detail, previousData, anyPresented }: SalaryAnalyticsProps) {
  const { total } = budgetTotals(detail.members);
  const effectiveBudget = anyPresented ? null : detail.budget;

  return (
    <div className="flex flex-col gap-6">
      {!anyPresented && <BudgetGauge totalSalary={total} budget={detail.budget} />}
      <SalaryBarChart members={detail.members} ranges={detail.ranges} budget={effectiveBudget} />
      <VariablePayChart members={detail.members} />
      <ComparisonChart members={detail.members} previousData={previousData} />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/salary/SalaryAnalytics.tsx
git commit -m "feat: hide budget gauge in presentation mode"
```

### Task 9: Hide budget columns in ScenarioComparisonTable when presenting

**Files:**
- Modify: `src/components/salary/ScenarioComparisonTable.tsx`

- [ ] **Step 1: Add `anyPresented` prop**

Update the interface (line 5-10):

```typescript
interface ScenarioComparisonTableProps {
  summaries: ScenarioSummary[];
  currentDataPointId: number;
  budget: number | null;
  previousTotal: number | null;
  anyPresented: boolean;
}
```

Update destructuring to include `anyPresented`:

```typescript
export function ScenarioComparisonTable({
  summaries,
  currentDataPointId,
  budget,
  previousTotal,
  anyPresented,
}: ScenarioComparisonTableProps) {
```

- [ ] **Step 2: Conditionally hide budget column header and previous row**

In the `<thead>` (lines 27-34), conditionally render the Budget column:

```tsx
<tr className="text-xs text-muted-foreground">
  <th className="px-2 py-1 text-left font-medium">Scenario</th>
  <th className="px-2 py-1 text-right font-medium">Total Cost</th>
  {!anyPresented && <th className="px-2 py-1 text-right font-medium">Budget</th>}
  <th className="px-2 py-1 text-right font-medium">Delta</th>
  <th className="px-2 py-1 text-right font-medium">Headcount</th>
</tr>
```

Conditionally hide the Previous row when presenting (line 36-44):

```tsx
{!anyPresented && previousTotal != null && (
```

- [ ] **Step 3: Conditionally hide budget cell in each row**

In the row map (lines 60-73), wrap the budget `<td>` with `!anyPresented`:

```tsx
{!anyPresented && (
  <td className="px-2 py-1.5 text-right">
    {budget != null ? formatCents(budget) : "—"}
    {budgetDiff != null && (
      <span
        className={cn(
          "ml-1 text-xs",
          budgetDiff > 0 ? "text-red-600" : "text-green-600",
        )}
      >
        ({budgetDiff > 0 ? "+" : ""}
        {formatCents(budgetDiff)})
      </span>
    )}
  </td>
)}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/salary/ScenarioComparisonTable.tsx
git commit -m "feat: hide budget column in scenario table during presentation"
```

### Task 10: Build verification and final commit

- [ ] **Step 1: Run TypeScript build**

Run: `npm run build`
Expected: no errors

- [ ] **Step 2: Run Rust tests**

Run: `cd src-tauri && cargo test`
Expected: all pass

- [ ] **Step 3: Manual smoke test**

Run: `npm run tauri dev`

Verify:
1. Open a data point — all members visible, budget shown (normal mode)
2. Click eye icon on a member — only that member visible, budget hidden
3. Click eye on another member — both visible, budget still hidden
4. Click "Clear presentation" button — returns to normal view
5. Scenario comparison table hides budget columns during presentation
6. Charts only show presented members
7. Create a new data point from one with presented members — new DP has all members with `is_presented = 0`
