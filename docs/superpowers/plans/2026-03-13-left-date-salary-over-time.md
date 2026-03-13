# Left Date & Salary Over Time Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "left the company" tracking for team members and a salary-over-time line chart in the Reports page.

**Architecture:** New DB migration adds `left_date` column. Backend gets a new `get_salary_over_time` command. Frontend filters former employees from active views, adds a collapsible "Former" section in MemberList, and renders a Recharts LineChart in the Reports page empty state.

**Tech Stack:** Rust/SQLite (backend), React 19/TypeScript/Recharts (frontend), shadcn/ui components

---

## Chunk 1: Backend — Migration, Struct, and Query Changes

### Task 1: Add migration `010_left_date.sql`

**Files:**
- Create: `src-tauri/migrations/010_left_date.sql`

- [ ] **Step 1: Create migration file**

```sql
ALTER TABLE team_members ADD COLUMN left_date TEXT;
```

- [ ] **Step 2: Register migration in `db.rs`**

In `src-tauri/src/db.rs`, after the `version < 9` block (line 83), add:

```rust
    if version < 10 {
        let migration_sql = include_str!("../migrations/010_left_date.sql");
        conn.execute_batch(migration_sql)?;
        conn.pragma_update(None, "user_version", 10)?;
    }
```

- [ ] **Step 3: Update schema version test**

In `src-tauri/src/db.rs`, update `test_schema_version_tracking` (line 129) to expect version `10`:

```rust
assert_eq!(version, 10);
```

Also update `test_migration_v2_salary_data_points` (line 193) to expect version `10`.

- [ ] **Step 4: Run Rust tests**

Run: `cd src-tauri && cargo test`
Expected: All tests pass, including migration tests.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/migrations/010_left_date.sql src-tauri/src/db.rs
git commit -m "feat: add migration 010 for left_date column"
```

---

### Task 2: Update TeamMember struct and queries in `commands.rs`

**Files:**
- Modify: `src-tauri/src/commands.rs:76-89` (TeamMember struct)
- Modify: `src-tauri/src/commands.rs:97-100` (SELECT query)
- Modify: `src-tauri/src/commands.rs:127-154` (query_map row mapping)
- Modify: `src-tauri/src/commands.rs:173-192` (create_team_member return)
- Modify: `src-tauri/src/commands.rs:204-217` (update_team_member allowed fields)

- [ ] **Step 1: Add `left_date` to TeamMember struct**

In the `TeamMember` struct (line 88, after `exclude_from_salary`), add:

```rust
    pub left_date: Option<String>,
```

- [ ] **Step 2: Add `left_date` to the SELECT query**

In the `get_team_members` SQL (line 100), after `m.exclude_from_salary,` add `m.left_date,` so it becomes:

```
m.exclude_from_salary, m.left_date,
```

- [ ] **Step 3: Update row mapping indices**

The new `m.left_date` is now at index 15 (after `exclude_from_salary` at 14). The promo fields shift to indices 16, 17, 18. Update the `query_map` closure:

```rust
            let title_id: Option<i64> = row.get(9)?;
            let title_name: Option<String> = row.get(10)?;
            let promoted_title_id: Option<i64> = row.get(16)?;
            let promoted_title_name: Option<String> = row.get(17)?;
            let promo_data_point_id: Option<i64> = row.get(18)?;
```

And in the TeamMember construction, add after `exclude_from_salary: row.get(14)?,`:

```rust
                left_date: row.get(15)?,
```

- [ ] **Step 4: Update `create_team_member` return value**

In `create_team_member` (line 192), add after `exclude_from_salary: false,`:

```rust
        left_date: None,
```

- [ ] **Step 5: Add `left_date` to update allowlist**

In `update_team_member` (line 204-217), add `"left_date"` to the `allowed` array:

```rust
    let allowed = [
        "first_name",
        "last_name",
        "email",
        "personal_email",
        "personal_phone",
        "address_street",
        "address_city",
        "address_zip",
        "title_id",
        "start_date",
        "notes",
        "exclude_from_salary",
        "left_date",
    ];
```

- [ ] **Step 6: Run Rust tests**

Run: `cd src-tauri && cargo test`
Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/commands.rs
git commit -m "feat: add left_date field to TeamMember struct and queries"
```

---

### Task 3: Add `get_salary_over_time` Rust command

**Files:**
- Modify: `src-tauri/src/commands.rs` (add structs + command at end of salary section)
- Modify: `src-tauri/src/lib.rs:102` (register command)

- [ ] **Step 1: Add response structs**

Add near the salary command section (after the existing salary structs):

```rust
#[derive(Serialize)]
pub struct SalaryOverTimeMember {
    pub member_id: i64,
    pub first_name: String,
    pub last_name: String,
    pub left_date: Option<String>,
    pub annual_total: i64,
}

#[derive(Serialize)]
pub struct SalaryOverTimePoint {
    pub data_point_id: i64,
    pub data_point_name: String,
    pub members: Vec<SalaryOverTimeMember>,
}
```

- [ ] **Step 2: Add the command**

```rust
#[tauri::command(rename_all = "snake_case")]
pub fn get_salary_over_time(db: State<AppDb>) -> Result<Vec<SalaryOverTimePoint>, String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;

    // Get all data points ordered by id
    let mut dp_stmt = conn
        .prepare("SELECT id, name FROM salary_data_points ORDER BY id")
        .map_err(|e| e.to_string())?;

    let data_points: Vec<(i64, String)> = dp_stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    // For each data point, get active members with their annual totals
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

    let mut result = Vec::new();
    for (dp_id, dp_name) in data_points {
        let members = member_stmt
            .query_map(params![dp_id], |row| {
                Ok(SalaryOverTimeMember {
                    member_id: row.get(0)?,
                    first_name: row.get(1)?,
                    last_name: row.get(2)?,
                    left_date: row.get(3)?,
                    annual_total: row.get(4)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;

        result.push(SalaryOverTimePoint {
            data_point_id: dp_id,
            data_point_name: dp_name,
            members,
        });
    }

    Ok(result)
}
```

- [ ] **Step 3: Register command in `lib.rs`**

In `src-tauri/src/lib.rs`, add `commands::get_salary_over_time,` to the `generate_handler!` macro (after `commands::get_previous_member_data,` on line 86):

```rust
            commands::get_salary_over_time,
```

- [ ] **Step 4: Run Rust tests**

Run: `cd src-tauri && cargo test`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat: add get_salary_over_time command"
```

---

## Chunk 2: Frontend Types, DB Layer, and TeamMember UI

### Task 4: Update TypeScript types and db.ts

**Files:**
- Modify: `src/lib/types.ts:1-20` (TeamMember interface)
- Modify: `src/lib/types.ts` (add new interfaces at end)
- Modify: `src/lib/db.ts` (add import + invoke)

- [ ] **Step 1: Add `left_date` to TeamMember**

In `src/lib/types.ts`, add after `exclude_from_salary: boolean;` (line 19):

```typescript
  left_date: string | null;
```

- [ ] **Step 2: Add new interfaces**

At the end of `src/lib/types.ts`:

```typescript
export interface SalaryOverTimeMember {
  member_id: number;
  first_name: string;
  last_name: string;
  left_date: string | null;
  annual_total: number;
}

export interface SalaryOverTimePoint {
  data_point_id: number;
  data_point_name: string;
  members: SalaryOverTimeMember[];
}
```

- [ ] **Step 3: Add `getSalaryOverTime` to db.ts**

In `src/lib/db.ts`, add `SalaryOverTimePoint` to the type import:

```typescript
import type {
  TeamMember,
  Child,
  CheckableItem,
  Title,
  SalaryDataPointSummary,
  SalaryDataPointDetail,
  SalaryPart,
  Project,
  ProjectMember,
  ProjectStatusItem,
  Report,
  ReportDetail,
  SalaryOverTimePoint,
} from "./types";
```

Then add after the `getPreviousMemberData` function (line 119):

```typescript
export const getSalaryOverTime = () => invoke<SalaryOverTimePoint[]>("get_salary_over_time");
```

- [ ] **Step 4: Verify frontend builds**

Run: `npm run build`
Expected: Build succeeds (or has pre-existing errors only).

- [ ] **Step 5: Commit**

```bash
git add src/lib/types.ts src/lib/db.ts
git commit -m "feat: add left_date type field and salary-over-time invoke"
```

---

### Task 5: Add leave date field to InfoSection

**Files:**
- Modify: `src/components/team/InfoSection.tsx:191-197` (after Start Date picker)

- [ ] **Step 1: Add leave date picker**

In `src/components/team/InfoSection.tsx`, after the Start Date `AutoSaveDatePicker` block (line 197), add:

```tsx
      {/* Leave date */}
      <AutoSaveDatePicker
        key={`left_date-${member.id}`}
        label="Leave Date"
        initialValue={member.left_date}
        onSave={makeOnSave("left_date")}
      />
```

- [ ] **Step 2: Commit**

```bash
git add src/components/team/InfoSection.tsx
git commit -m "feat: add leave date picker to member info section"
```

---

### Task 6: Add "Left" badge to MemberDetail header

**Files:**
- Modify: `src/components/team/MemberDetail.tsx:139-147` (header area)

- [ ] **Step 1: Install Badge component and add import**

```bash
npx shadcn@latest add badge
```

Add to imports at top of `src/components/team/MemberDetail.tsx`:

```typescript
import { Badge } from "@/components/ui/badge";
```

- [ ] **Step 2: Add badge next to name**

Replace the header `<div>` block (lines 139-146):

```tsx
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">
                {member.first_name} {member.last_name}
              </h2>
              {member.left_date && (
                <Badge variant="secondary">Left</Badge>
              )}
            </div>
            {member.current_title_name && (
              <p className="text-sm text-muted-foreground">{member.current_title_name}</p>
            )}
          </div>
```

- [ ] **Step 3: Commit**

```bash
git add src/components/team/MemberDetail.tsx
git commit -m "feat: show Left badge on former employee detail"
```

---

### Task 7: Split MemberList into active/former with collapsible section

**Files:**
- Modify: `src/components/team/MemberList.tsx`

- [ ] **Step 1: Add collapsible imports**

First, install the collapsible component:

```bash
npx shadcn@latest add collapsible
```

Then add imports at top of `MemberList.tsx`:

```typescript
import { ChevronRight } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
```

- [ ] **Step 2: Split members into active and former**

Inside the `MemberList` component, after the `hoveredId` state (line 30), add:

```typescript
  const [formerOpen, setFormerOpen] = useState(false);
  const activeMembers = members.filter((m) => !m.left_date);
  const formerMembers = members.filter((m) => m.left_date);
```

- [ ] **Step 3: Extract member row renderer**

Add a helper function inside the component (after the `handleKeyDown` function):

```tsx
  const renderMemberRow = (member: TeamMember, isFormer = false) => (
    <li
      key={member.id}
      className={`group relative flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/50 ${
        selectedId === member.id ? "bg-muted" : ""
      } ${isFormer ? "opacity-60" : ""}`}
      onClick={() => onSelect(member.id)}
      onMouseEnter={() => setHoveredId(member.id)}
      onMouseLeave={() => setHoveredId(null)}
    >
      <MemberAvatar
        firstName={member.first_name}
        lastName={member.last_name}
        picturePath={member.picture_path}
        picturesDir={picturesDir}
        size="sm"
      />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">
          {member.last_name}, {member.first_name}
        </div>
        {member.current_title_name && (
          <div className="text-xs text-muted-foreground truncate">
            {member.current_title_name}
          </div>
        )}
      </div>

      {hoveredId === member.id && (
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
      )}
    </li>
  );
```

- [ ] **Step 4: Replace the list body**

Replace the non-virtual list rendering (the `else` branch at line 139, the `<ul>` with `members.map`) with:

```tsx
          <div>
            <ul className="py-1 outline-none" tabIndex={0} onKeyDown={handleKeyDown}>
              {activeMembers.map((member) => renderMemberRow(member))}
            </ul>

            {formerMembers.length > 0 && (
              <Collapsible open={formerOpen} onOpenChange={setFormerOpen}>
                <CollapsibleTrigger className="flex items-center gap-1 px-3 py-2 text-xs text-muted-foreground hover:text-foreground w-full">
                  <ChevronRight className={`h-3 w-3 transition-transform ${formerOpen ? "rotate-90" : ""}`} />
                  Former ({formerMembers.length})
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <ul className="py-1">
                    {formerMembers.map((member) => renderMemberRow(member, true))}
                  </ul>
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>
```

Also update the virtual list path: change `members.length` to `activeMembers.length` for the `useVirtualList` count, and update the virtual items to index into `activeMembers` instead of `members`. Then add the same collapsible section below the virtual list.

Update the `useVirtualList` call:

```typescript
  const { scrollRef, shouldVirtualize, virtualizer, totalSize, virtualItems } = useVirtualList({
    count: activeMembers.length,
    estimateSize: 40,
  });
```

Update the virtual row rendering to use `activeMembers`:

```typescript
              const member = activeMembers[virtualRow.index];
```

Update `handleKeyDown` to use `activeMembers`:

```typescript
    const ids = activeMembers.map((m) => m.id);
```

Update the empty state to check `activeMembers.length === 0 && formerMembers.length === 0`:

```tsx
        ) : activeMembers.length === 0 && formerMembers.length === 0 ? (
```

- [ ] **Step 5: Verify frontend builds**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/components/team/MemberList.tsx src/components/ui/collapsible.tsx
git commit -m "feat: split member list into active/former with collapsible"
```

---

## Chunk 3: Filter Former Employees from Other Pages

### Task 8: Filter former employees in TitleDetail

**Files:**
- Modify: `src/components/titles/TitleDetail.tsx:43`

- [ ] **Step 1: Add left_date filter**

In `TitleDetail.tsx`, update the `titleMembers` filter (line 43) to also exclude former employees:

```typescript
  const titleMembers = members.filter(
    (m) => !m.left_date && (m.current_title_id ?? m.title_id) === title.id,
  );
```

- [ ] **Step 2: Commit**

```bash
git add src/components/titles/TitleDetail.tsx
git commit -m "feat: exclude former employees from title detail"
```

---

### Task 9: Exclude former employees from new salary data points

**Files:**
- Modify: `src-tauri/src/commands.rs:1211` (copy-from-previous path)
- Modify: `src-tauri/src/commands.rs:1259` (first-data-point path)

The SalaryPlanner works with `SalaryDataPointMember` objects — historical snapshots. Existing data points keep their members. But `create_salary_data_point` has two code paths that insert members, and both need to exclude former employees.

- [ ] **Step 1: Update copy-from-previous path**

In `commands.rs` line 1211, change:

```sql
WHERE sdpm.data_point_id = ?2 AND m.exclude_from_salary = 0
```

to:

```sql
WHERE sdpm.data_point_id = ?2 AND m.exclude_from_salary = 0 AND m.left_date IS NULL
```

- [ ] **Step 2: Update first-data-point path**

In `commands.rs` line 1259, change:

```sql
SELECT ?1, id, 1, 0 FROM team_members WHERE exclude_from_salary = 0
```

to:

```sql
SELECT ?1, id, 1, 0 FROM team_members WHERE exclude_from_salary = 0 AND left_date IS NULL
```

- [ ] **Step 3: Run Rust tests**

Run: `cd src-tauri && cargo test`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands.rs
git commit -m "feat: exclude former employees from new salary data points"
```

---

### Task 10: Filter former employees from project member selection

**Files:**
- Modify: `src/components/projects/ProjectDetail.tsx:104`

- [ ] **Step 1: Add `left_date` filter to available members**

In `src/components/projects/ProjectDetail.tsx` line 104, change:

```typescript
  const availableMembers = allTeamMembers.filter((m) => !assignedIds.has(m.id));
```

to:

```typescript
  const availableMembers = allTeamMembers.filter((m) => !m.left_date && !assignedIds.has(m.id));
```

- [ ] **Step 2: Commit**

```bash
git add src/components/projects/ProjectDetail.tsx
git commit -m "feat: exclude former employees from project member selection"
```

---

## Chunk 4: Salary Over Time Chart in Reports

### Task 11: Create SalaryOverTimeChart component

**Files:**
- Create: `src/components/salary/SalaryOverTimeChart.tsx`

- [ ] **Step 1: Create the chart component**

```tsx
import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { formatCents } from "@/lib/salary-utils";
import type { SalaryOverTimePoint } from "@/lib/types";

// Predefined color palette for member lines
const COLORS = [
  "#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6",
  "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1",
  "#14b8a6", "#e11d48", "#0ea5e9", "#a855f7", "#22c55e",
];

interface SalaryOverTimeChartProps {
  data: SalaryOverTimePoint[];
}

export function SalaryOverTimeChart({ data }: SalaryOverTimeChartProps) {
  // Build a map of all unique members across all data points
  const { chartData, memberKeys } = useMemo(() => {
    const memberMap = new Map<number, { name: string; left: boolean }>();

    for (const point of data) {
      for (const m of point.members) {
        if (!memberMap.has(m.member_id)) {
          memberMap.set(m.member_id, {
            name: `${m.last_name}, ${m.first_name}`,
            left: m.left_date !== null,
          });
        } else {
          // Update left status from latest data
          memberMap.set(m.member_id, {
            ...memberMap.get(m.member_id)!,
            left: m.left_date !== null,
          });
        }
      }
    }

    const keys = Array.from(memberMap.entries()).map(([id, info]) => ({
      id,
      dataKey: `member_${id}`,
      name: info.name,
      left: info.left,
    }));

    const chartData = data.map((point) => {
      const row: Record<string, string | number | undefined> = {
        name: point.data_point_name,
      };
      for (const m of point.members) {
        row[`member_${m.member_id}`] = m.annual_total / 100; // cents to euros
      }
      return row;
    });

    return { chartData, memberKeys: keys };
  }, [data]);

  if (data.length === 0 || memberKeys.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No salary data points available.
      </p>
    );
  }

  return (
    <div>
      <h3 className="text-sm font-semibold mb-4">Salary Over Time</h3>
      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <XAxis
            dataKey="name"
            tick={{ fontSize: 12, fill: "currentColor" }}
          />
          <YAxis
            tickFormatter={(v: number) => `€${(v / 1000).toFixed(0)}k`}
            tick={{ fill: "currentColor" }}
          />
          <Tooltip
            formatter={(value: number) => formatCents(value * 100)}
            contentStyle={{
              backgroundColor: "var(--popover)",
              border: "1px solid var(--border)",
            }}
            labelStyle={{ color: "var(--popover-foreground)" }}
            itemStyle={{ color: "var(--popover-foreground)" }}
          />
          <Legend />
          {memberKeys.map((mk, i) => (
            <Line
              key={mk.id}
              type="monotone"
              dataKey={mk.dataKey}
              name={mk.name}
              stroke={COLORS[i % COLORS.length]}
              strokeDasharray={mk.left ? "5 5" : undefined}
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 2: Verify frontend builds**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/salary/SalaryOverTimeChart.tsx
git commit -m "feat: add SalaryOverTimeChart component"
```

---

### Task 12: Integrate chart into Reports page

**Files:**
- Modify: `src/pages/Reports.tsx:1-9` (imports)
- Modify: `src/pages/Reports.tsx:114-117` (empty state)

- [ ] **Step 1: Add imports and state**

Add to imports in `Reports.tsx`:

```typescript
import { lazy, Suspense } from "react";
import { getSalaryOverTime } from "@/lib/db";
import type { SalaryOverTimePoint } from "@/lib/types";

const SalaryOverTimeChart = lazy(() =>
  import("@/components/salary/SalaryOverTimeChart").then((m) => ({
    default: m.SalaryOverTimeChart,
  })),
);
```

- [ ] **Step 2: Add state and data loading**

Inside the `Reports` component, add state after the existing state declarations:

```typescript
  const [salaryOverTime, setSalaryOverTime] = useState<SalaryOverTimePoint[]>([]);
```

In the existing `useEffect` that loads reports (lines 26-41), add `getSalaryOverTime()` to the load. Use `Promise.allSettled` so a failure in one doesn't block the other:

```typescript
  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([getReports(), getSalaryOverTime()])
      .then(([reportsResult, sotResult]) => {
        if (cancelled) return;
        if (reportsResult.status === "fulfilled") setReports(reportsResult.value);
        else showError("Failed to load reports");
        if (sotResult.status === "fulfilled") setSalaryOverTime(sotResult.value);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
```

- [ ] **Step 3: Replace empty state with chart**

Replace the empty state div (lines 114-117):

```tsx
        ) : (
          <div className="max-w-4xl p-6">
            <Suspense fallback={<div className="h-96 animate-pulse rounded bg-muted" />}>
              <SalaryOverTimeChart data={salaryOverTime} />
            </Suspense>
          </div>
        )}
```

- [ ] **Step 4: Verify frontend builds**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Reports.tsx
git commit -m "feat: show salary-over-time chart in Reports empty state"
```

---

## Chunk 5: Final Verification

### Task 13: Full build and manual test

- [ ] **Step 1: Build Rust backend**

Run: `cd src-tauri && cargo build`
Expected: Build succeeds.

- [ ] **Step 2: Build frontend**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Run Rust tests**

Run: `cd src-tauri && cargo test`
Expected: All tests pass.

- [ ] **Step 4: Manual smoke test**

Run: `npm run tauri dev`

Test checklist:
- [ ] Open Team Members — verify list shows only active members
- [ ] Set a leave date on a member — verify "Left" badge appears
- [ ] Verify "Former" collapsible section appears in member list
- [ ] Open Titles — verify former employee is not listed under their title
- [ ] Open Reports — verify salary-over-time chart renders when no report selected
- [ ] Verify chart shows lines for each member across data points
- [ ] Verify former employees show dashed lines in chart
- [ ] Select a report — verify report detail still works
- [ ] Deselect report — verify chart reappears
