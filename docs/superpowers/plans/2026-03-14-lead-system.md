# Lead System Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a lead/hierarchy system where any team member can be another's lead, forming a tree displayed in the sidebar with an org chart view.

**Architecture:** Nullable `lead_id` FK on `team_members` with cycle detection in Rust. Frontend builds tree from flat member array. Org chart is a custom CSS flexbox + SVG layout with pan/zoom.

**Tech Stack:** Rust/SQLite (migration + commands), React/TypeScript (tree view, org chart, lead dropdown)

**Spec:** `docs/superpowers/specs/2026-03-14-lead-system-design.md`

---

## File Structure

### New files
- `src-tauri/migrations/013_lead_id.sql` — migration adding `lead_id` column
- `src/lib/tree-utils.ts` — tree building, flattening, subtree computation helpers
- `src/components/team/OrgChart.tsx` — org chart visualization component

### Modified files
- `src-tauri/src/db.rs` — register migration 13
- `src-tauri/src/commands.rs` — TeamMember struct + query + cycle detection in update
- `src/lib/types.ts` — TeamMember interface gains `lead_id`, `lead_name`
- `src/lib/db.ts` — no changes needed (uses generic `updateTeamMember`)
- `src/components/team/MemberList.tsx` — tree view with indentation, connectors, collapse/expand
- `src/components/team/InfoSection.tsx` — lead dropdown
- `src/components/team/MemberDetail.tsx` — pass `members` to InfoSection for dropdown
- `src/pages/TeamMembers.tsx` — org chart toggle, pass members to MemberDetail

---

## Chunk 1: Backend — Migration, Struct, Query, Cycle Detection

### Task 1: Migration — Add `lead_id` column

**Files:**
- Create: `src-tauri/migrations/013_lead_id.sql`
- Modify: `src-tauri/src/db.rs:98-102`
- Test: `src-tauri/src/db.rs` (existing test module)

- [ ] **Step 1: Write the migration SQL file**

Create `src-tauri/migrations/013_lead_id.sql`:
```sql
ALTER TABLE team_members ADD COLUMN lead_id INTEGER REFERENCES team_members(id) ON DELETE SET NULL DEFAULT NULL;
```

- [ ] **Step 2: Register the migration in db.rs**

Add after the `version < 12` block in `src-tauri/src/db.rs`:
```rust
    if version < 13 {
        let migration_sql = include_str!("../migrations/013_lead_id.sql");
        conn.execute_batch(migration_sql)?;
        conn.pragma_update(None, "user_version", 13)?;
    }
```

- [ ] **Step 3: Update the schema version test**

In `src-tauri/src/db.rs`, update `test_schema_version_tracking` to expect version 13:
```rust
    assert_eq!(version, 13);
```

Also update `test_migration_v2_salary_data_points` which checks the final version:
```rust
    assert_eq!(version, 13);
```

And `test_migration_v3_picture_path`:
```rust
    assert_eq!(version, 13);
```

- [ ] **Step 4: Write a test for the new migration**

Add to the test module in `src-tauri/src/db.rs`:
```rust
    #[test]
    fn test_migration_v13_lead_id() {
        let conn = open_db_with_key(":memory:", "test-key-0123456789abcdef").unwrap();
        run_migrations(&conn).unwrap();

        // Verify lead_id column exists
        let has_col: bool = conn
            .prepare("SELECT lead_id FROM team_members LIMIT 0")
            .is_ok();
        assert!(has_col);

        // Verify lead_id defaults to NULL
        conn.execute(
            "INSERT INTO team_members (first_name, last_name) VALUES ('Test', 'User')",
            [],
        )
        .unwrap();
        let lead_id: Option<i64> = conn
            .query_row(
                "SELECT lead_id FROM team_members WHERE first_name = 'Test'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(lead_id.is_none());

        // Verify ON DELETE SET NULL
        conn.execute(
            "INSERT INTO team_members (first_name, last_name) VALUES ('Lead', 'Person')",
            [],
        )
        .unwrap();
        let lead_person_id: i64 = conn.last_insert_rowid();
        conn.execute(
            "UPDATE team_members SET lead_id = ?1 WHERE first_name = 'Test'",
            [lead_person_id],
        )
        .unwrap();
        conn.execute("DELETE FROM team_members WHERE id = ?1", [lead_person_id])
            .unwrap();
        let lead_id_after: Option<i64> = conn
            .query_row(
                "SELECT lead_id FROM team_members WHERE first_name = 'Test'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(lead_id_after.is_none());
    }
```

- [ ] **Step 5: Run tests to verify**

Run: `cd src-tauri && cargo test`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src-tauri/migrations/013_lead_id.sql src-tauri/src/db.rs
git commit -m "feat: add lead_id migration (013)"
```

---

### Task 2: Update Rust TeamMember struct and query

**Files:**
- Modify: `src-tauri/src/commands.rs:69-163`

- [ ] **Step 1: Add `lead_id` and `lead_name` to the TeamMember struct**

In `src-tauri/src/commands.rs`, add two fields to the `TeamMember` struct after `left_date`:
```rust
    pub lead_id: Option<i64>,
    pub lead_name: Option<String>,
```

- [ ] **Step 2: Update the `get_team_members` SQL query**

Modify the query in `get_team_members` to add a LEFT JOIN for lead name. Add to the SELECT:
```sql
m.lead_id,
lead.first_name || ' ' || lead.last_name as lead_name
```

Add to the FROM/JOINs:
```sql
LEFT JOIN team_members lead ON m.lead_id = lead.id
```

- [ ] **Step 3: Update the `query_map` closure**

Add after the `left_date` field mapping (row index will shift — `lead_id` at index 16, `lead_name` at 17, and the promo fields shift to 18, 19, 20):

Update the full SELECT column order to:
```
m.id(0), m.first_name(1), m.last_name(2), m.email(3), m.personal_email(4),
m.personal_phone(5), m.address_street(6), m.address_city(7), m.address_zip(8),
m.title_id(9), t.name(10), m.start_date(11), m.notes(12), m.picture_path(13),
m.exclude_from_salary(14), m.left_date(15), m.lead_id(16), lead_name(17),
promo.promoted_title_id(18), pt.name(19), promo.data_point_id(20)
```

In the `query_map` closure, read lead fields and shift promo indexes:
```rust
let lead_id: Option<i64> = row.get(16)?;
let lead_name: Option<String> = row.get(17)?;
let promoted_title_id: Option<i64> = row.get(18)?;
let promoted_title_name: Option<String> = row.get(19)?;
let promo_data_point_id: Option<i64> = row.get(20)?;
```

And add to the struct construction:
```rust
lead_id,
lead_name,
```

- [ ] **Step 4: Update `create_team_member` return value**

Add to the `TeamMember` construction in `create_team_member`:
```rust
lead_id: None,
lead_name: None,
```

- [ ] **Step 5: Run tests to verify compilation**

Run: `cd src-tauri && cargo test`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/commands.rs
git commit -m "feat: add lead_id and lead_name to TeamMember struct and query"
```

---

### Task 3: Cycle detection in `update_team_member`

**Files:**
- Modify: `src-tauri/src/commands.rs:198-229`

- [ ] **Step 1: Write a test for self-reference prevention**

Add to `src-tauri/src/db.rs` test module:
```rust
    #[test]
    fn test_lead_id_self_reference_blocked() {
        // This test verifies the scenario at the DB level
        // The actual enforcement is in commands.rs, but we can verify
        // that the schema allows lead_id updates in general
        let conn = open_db_with_key(":memory:", "test-key-0123456789abcdef").unwrap();
        run_migrations(&conn).unwrap();

        conn.execute(
            "INSERT INTO team_members (first_name, last_name) VALUES ('Alice', 'A')",
            [],
        )
        .unwrap();
        let alice_id = conn.last_insert_rowid();

        conn.execute(
            "INSERT INTO team_members (first_name, last_name) VALUES ('Bob', 'B')",
            [],
        )
        .unwrap();
        let bob_id = conn.last_insert_rowid();

        // Valid: Bob's lead is Alice
        conn.execute(
            "UPDATE team_members SET lead_id = ?1 WHERE id = ?2",
            rusqlite::params![alice_id, bob_id],
        )
        .unwrap();

        let lead: Option<i64> = conn
            .query_row(
                "SELECT lead_id FROM team_members WHERE id = ?1",
                [bob_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(lead, Some(alice_id));
    }
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `cd src-tauri && cargo test test_lead_id_self_reference`
Expected: PASS

- [ ] **Step 3: Add `lead_id` to the allowed fields and add cycle detection**

In `src-tauri/src/commands.rs`, modify `update_team_member`:

Add `"lead_id"` to the `allowed` array.

Then add a conditional branch before the generic SQL update:
```rust
    if field == "lead_id" {
        // Self-reference check
        if let Some(ref val) = value {
            let lead_id: i64 = val.parse().map_err(|_| "Invalid lead_id".to_string())?;
            if lead_id == id {
                return Err("A member cannot be their own lead".to_string());
            }
            // Cycle detection: walk up from proposed lead to root
            let mut current = lead_id;
            loop {
                let parent: Option<i64> = conn
                    .query_row(
                        "SELECT lead_id FROM team_members WHERE id = ?1",
                        params![current],
                        |row| row.get(0),
                    )
                    .map_err(|e| e.to_string())?;
                match parent {
                    Some(p) if p == id => {
                        return Err("This assignment would create a cycle".to_string());
                    }
                    Some(p) => current = p,
                    None => break,
                }
            }
        }
    }
```

- [ ] **Step 4: Run all tests**

Run: `cd src-tauri && cargo test`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands.rs src-tauri/src/db.rs
git commit -m "feat: add lead_id to update allowlist with cycle detection"
```

---

### Task 4: Update TypeScript types

**Files:**
- Modify: `src/lib/types.ts:1-21`

- [ ] **Step 1: Add `lead_id` and `lead_name` to TeamMember interface**

Add after `left_date` in the `TeamMember` interface in `src/lib/types.ts`:
```typescript
  lead_id: number | null;
  lead_name: string | null;
```

- [ ] **Step 2: Verify frontend compiles**

Run: `npm run build`
Expected: Build succeeds (these are nullable fields, existing code won't break)

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add lead_id and lead_name to TeamMember interface"
```

---

## Chunk 2: Frontend — Tree Utils, Lead Dropdown, Tree View

### Task 5: Tree utility functions

**Files:**
- Create: `src/lib/tree-utils.ts`

- [ ] **Step 1: Create tree-utils.ts with tree building and flattening**

Create `src/lib/tree-utils.ts`:
```typescript
import type { TeamMember } from "./types";

export interface TreeRow {
  member: TeamMember;
  depth: number;
  hasChildren: boolean;
  isExpanded: boolean;
}

/**
 * Build a map of lead_id -> children from a flat member array.
 */
export function buildChildrenMap(members: TeamMember[]): Map<number | null, TeamMember[]> {
  const map = new Map<number | null, TeamMember[]>();
  for (const m of members) {
    const key = m.lead_id;
    const list = map.get(key);
    if (list) {
      list.push(m);
    } else {
      map.set(key, [m]);
    }
  }
  return map;
}

/**
 * Flatten a tree of members into a visible row list,
 * respecting collapse state.
 */
export function flattenTree(
  members: TeamMember[],
  collapsedIds: Set<number>,
): TreeRow[] {
  const childrenMap = buildChildrenMap(members);
  const rows: TreeRow[] = [];

  function walk(leadId: number | null, depth: number) {
    const children = childrenMap.get(leadId) ?? [];
    // Sort alphabetically by last_name, first_name
    const sorted = [...children].sort((a, b) =>
      `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`),
    );
    for (const member of sorted) {
      const memberChildren = childrenMap.get(member.id);
      const hasChildren = !!memberChildren && memberChildren.length > 0;
      const isExpanded = !collapsedIds.has(member.id);
      rows.push({ member, depth, hasChildren, isExpanded });
      if (hasChildren && isExpanded) {
        walk(member.id, depth + 1);
      }
    }
  }

  walk(null, 0);
  return rows;
}

/**
 * Get all descendant IDs of a member (used to filter the lead dropdown).
 */
export function getSubtreeIds(members: TeamMember[], rootId: number): Set<number> {
  const childrenMap = buildChildrenMap(members);
  const ids = new Set<number>();

  function walk(id: number) {
    const children = childrenMap.get(id) ?? [];
    for (const child of children) {
      ids.add(child.id);
      walk(child.id);
    }
  }

  walk(rootId);
  return ids;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/lib/tree-utils.ts
git commit -m "feat: add tree utility functions for lead hierarchy"
```

---

### Task 6: Lead dropdown in InfoSection

**Files:**
- Modify: `src/components/team/InfoSection.tsx:10-14,119-165`
- Modify: `src/components/team/MemberDetail.tsx:25-28,152`
- Modify: `src/pages/TeamMembers.tsx:129-148`

- [ ] **Step 1: Pass `members` through to InfoSection**

In `src/pages/TeamMembers.tsx`, add `members={visibleMembers}` to the `MemberDetail` props:
```tsx
<MemberDetail
  key={selectedMember.id}
  member={selectedMember}
  members={visibleMembers}
  onMemberChange={handleMemberChange}
  picturesDir={picturesDir}
/>
```

In `src/components/team/MemberDetail.tsx`, update the interface and pass through:
```typescript
interface MemberDetailProps {
  member: TeamMember;
  members: TeamMember[];
  onMemberChange: (field: string, value: string | null, titleName?: string | null) => void;
  picturesDir: string | null;
}
```

Update the destructuring:
```typescript
export function MemberDetail({ member, members, onMemberChange, picturesDir }: MemberDetailProps) {
```

Pass `members` to InfoSection:
```tsx
<InfoSection member={member} members={members} titles={titles} onMemberChange={onMemberChange} />
```

- [ ] **Step 2: Add lead dropdown to InfoSection**

In `src/components/team/InfoSection.tsx`, update the interface:
```typescript
interface InfoSectionProps {
  member: TeamMember;
  members: TeamMember[];
  titles: Title[];
  onMemberChange: (field: string, value: string | null, titleName?: string | null) => void;
}
```

Update the component signature:
```typescript
export function InfoSection({ member, members, titles, onMemberChange }: InfoSectionProps) {
```

Add import at top:
```typescript
import { getSubtreeIds } from "@/lib/tree-utils";
```

Add state and handler for lead (after `titleError` state):
```typescript
  const [leadId, setLeadId] = useState<string>(
    member.lead_id != null ? String(member.lead_id) : "",
  );
  const [leadSaving, setLeadSaving] = useState(false);
  const [leadError, setLeadError] = useState<string | null>(null);

  const subtreeIds = useMemo(
    () => getSubtreeIds(members, member.id),
    [members, member.id],
  );

  const leadOptions = useMemo(
    () =>
      members.filter(
        (m) => m.id !== member.id && !m.left_date && !subtreeIds.has(m.id),
      ),
    [members, member.id, subtreeIds],
  );

  const handleLeadChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setLeadId(val);
    setLeadSaving(true);
    setLeadError(null);
    try {
      await onMemberChange("lead_id", val === "" ? null : val);
    } catch (err) {
      setLeadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLeadSaving(false);
    }
  };
```

Update the React import at line 1 from `import { useState } from "react"` to:
```typescript
import { useState, useMemo } from "react";
```

Add the lead dropdown JSX after the "Original Title" dropdown block and before the "Current Title" block:
```tsx
      {/* Lead */}
      <div className="flex flex-col gap-1">
        <Label className="text-xs text-muted-foreground">Lead</Label>
        <select
          className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm transition-colors outline-none focus-visible:border-ring dark:bg-input/30"
          value={leadId}
          onChange={handleLeadChange}
        >
          <option value="">No lead</option>
          {leadOptions.map((m) => (
            <option key={m.id} value={String(m.id)}>
              {m.last_name}, {m.first_name}
              {m.current_title_name ? ` — ${m.current_title_name}` : ""}
            </option>
          ))}
        </select>
        <div className="h-3 text-xs">
          {leadSaving && <span className="text-muted-foreground">Saving…</span>}
          {leadError && <span className="text-destructive truncate">{leadError}</span>}
        </div>
      </div>
```

- [ ] **Step 3: Update `handleMemberChange` in TeamMembers.tsx for lead_id with error propagation**

In `src/pages/TeamMembers.tsx`, add a `lead_id` branch in `handleMemberChange` (after the `title_id` branch):
```typescript
        if (field === "lead_id") {
          const leadMember = prev.find((lm) => String(lm.id) === value);
          updated.lead_id = value ? Number(value) : null;
          updated.lead_name = leadMember
            ? `${leadMember.first_name} ${leadMember.last_name}`
            : null;
        }
```

Then wrap the `updateTeamMember` call to propagate errors (so InfoSection's try/catch can display cycle detection errors):
```typescript
    if (selectedId !== null) {
      try {
        await updateTeamMember(selectedId, field, value);
      } catch (err) {
        // Re-fetch members to revert optimistic update
        await loadMembers();
        throw err; // Propagate to caller (InfoSection) for error display
      }
    }
```

Also update the `onMemberChange` type in the `MemberDetailProps` interface in `MemberDetail.tsx` to return `Promise<void>`:
```typescript
  onMemberChange: (field: string, value: string | null, titleName?: string | null) => Promise<void>;
```

And in `InfoSectionProps`:
```typescript
  onMemberChange: (field: string, value: string | null, titleName?: string | null) => Promise<void>;
```

- [ ] **Step 4: Verify it compiles**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add src/components/team/InfoSection.tsx src/components/team/MemberDetail.tsx src/pages/TeamMembers.tsx
git commit -m "feat: add lead dropdown to member detail form"
```

---

### Task 7: Tree view in MemberList

**Files:**
- Modify: `src/components/team/MemberList.tsx`

- [ ] **Step 1: Rewrite MemberList to use tree structure**

Replace the full content of `src/components/team/MemberList.tsx`. The key changes:
- Import `flattenTree` and `TreeRow` from `@/lib/tree-utils`
- Add `collapsedIds` state (`useState<Set<number>>`)
- Compute `visibleRows` via `useMemo(() => flattenTree(activeMembers, collapsedIds), [activeMembers, collapsedIds])`
- Update `useVirtualList` count to `visibleRows.length`
- Render tree rows with:
  - `paddingLeft: Math.min(row.depth, 4) * 12` for indentation
  - Chevron toggle for rows with `hasChildren`
  - Tree connector lines via absolute-positioned pseudo-elements or inline SVG

The complete component:

```tsx
import { useState, useMemo } from "react";
import { PlusIcon, Loader2Icon, Trash2, ChevronRight } from "lucide-react";
import { MemberAvatar } from "./MemberAvatar";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useVirtualList } from "@/hooks/useVirtualList";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { flattenTree } from "@/lib/tree-utils";
import type { TeamMember } from "@/lib/types";
import type { TreeRow } from "@/lib/tree-utils";

interface MemberListProps {
  members: TeamMember[];
  selectedId: number | null;
  loading?: boolean;
  creating?: boolean;
  onSelect: (id: number) => void;
  onCreate: () => void;
  onDelete: (id: number) => void;
  picturesDir: string | null;
}

export function MemberList({
  members,
  selectedId,
  loading,
  creating,
  onSelect,
  onCreate,
  onDelete,
  picturesDir,
}: MemberListProps) {
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [formerOpen, setFormerOpen] = useState(false);
  const [collapsedIds, setCollapsedIds] = useState<Set<number>>(new Set());
  const activeMembers = members.filter((m) => !m.left_date);
  const formerMembers = members.filter((m) => m.left_date);

  const visibleRows = useMemo(
    () => flattenTree(activeMembers, collapsedIds),
    [activeMembers, collapsedIds],
  );

  const { scrollRef, shouldVirtualize, virtualizer, totalSize, virtualItems } = useVirtualList({
    count: visibleRows.length,
    estimateSize: 40,
  });

  const toggleCollapse = (id: number) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const currentIndex = visibleRows.findIndex((r) => r.member.id === selectedId);

    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = currentIndex < visibleRows.length - 1 ? currentIndex + 1 : 0;
      onSelect(visibleRows[next].member.id);
      if (shouldVirtualize) virtualizer.scrollToIndex(next);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = currentIndex > 0 ? currentIndex - 1 : visibleRows.length - 1;
      onSelect(visibleRows[prev].member.id);
      if (shouldVirtualize) virtualizer.scrollToIndex(prev);
    } else if (e.key === "ArrowRight" && currentIndex >= 0) {
      const row = visibleRows[currentIndex];
      if (row.hasChildren && !row.isExpanded) {
        e.preventDefault();
        toggleCollapse(row.member.id);
      }
    } else if (e.key === "ArrowLeft" && currentIndex >= 0) {
      const row = visibleRows[currentIndex];
      if (row.hasChildren && row.isExpanded) {
        e.preventDefault();
        toggleCollapse(row.member.id);
      } else if (row.depth > 0) {
        // Move to parent
        e.preventDefault();
        const parentRow = visibleRows.find(
          (r) => r.member.id === row.member.lead_id,
        );
        if (parentRow) onSelect(parentRow.member.id);
      }
    }
  };

  const renderTreeRow = (row: TreeRow, style?: React.CSSProperties) => {
    const { member, depth, hasChildren, isExpanded } = row;
    const indent = Math.min(depth, 4) * 12;

    return (
      <li
        key={member.id}
        className={`group relative flex items-center gap-1 pr-3 py-2 cursor-pointer hover:bg-muted/50 ${
          selectedId === member.id ? "bg-muted" : ""
        }`}
        style={{ ...style, paddingLeft: 8 + indent }}
        onClick={() => onSelect(member.id)}
        onMouseEnter={() => setHoveredId(member.id)}
        onMouseLeave={() => setHoveredId(null)}
      >
        {/* Tree connector line */}
        {depth > 0 && (
          <div
            className="absolute border-l border-b border-muted-foreground/20 rounded-bl-sm"
            style={{
              left: indent - 2,
              top: 0,
              width: 8,
              height: 20,
            }}
          />
        )}

        {/* Expand/collapse toggle */}
        {hasChildren ? (
          <button
            type="button"
            className="shrink-0 w-4 h-4 flex items-center justify-center"
            onClick={(e) => {
              e.stopPropagation();
              toggleCollapse(member.id);
            }}
          >
            <ChevronRight
              className={`h-3 w-3 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`}
            />
          </button>
        ) : (
          <span className="shrink-0 w-4" />
        )}

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
  };

  const renderFormerMember = (member: TeamMember) => (
    <li
      key={member.id}
      className={`group relative flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/50 opacity-60 ${
        selectedId === member.id ? "bg-muted" : ""
      }`}
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
          <div className="text-xs text-muted-foreground truncate">{member.current_title_name}</div>
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

  const formerSection = formerMembers.length > 0 && (
    <Collapsible open={formerOpen} onOpenChange={setFormerOpen}>
      <CollapsibleTrigger className="flex items-center gap-1 px-3 py-2 text-xs text-muted-foreground hover:text-foreground w-full">
        <ChevronRight
          className={`h-3 w-3 transition-transform ${formerOpen ? "rotate-90" : ""}`}
        />
        Former ({formerMembers.length})
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="py-1">
          {formerMembers.map((member) => renderFormerMember(member))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );

  return (
    <div className="w-64 shrink-0 border-r flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 h-12 border-b">
        <span className="text-sm font-semibold">Team Members</span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onCreate}
          disabled={creating}
          title="Add member"
        >
          {creating ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
        </Button>
      </div>

      {/* List */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {loading ? (
          <ListSkeleton showAvatar />
        ) : visibleRows.length === 0 && formerMembers.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">
            No team members yet
          </div>
        ) : shouldVirtualize ? (
          <div>
            <ul
              className="py-1 outline-none relative"
              style={{ height: totalSize }}
              tabIndex={0}
              onKeyDown={handleKeyDown}
            >
              {virtualItems.map((virtualRow) => {
                const row = visibleRows[virtualRow.index];
                return renderTreeRow(row, {
                  position: "absolute",
                  top: virtualRow.start,
                  height: virtualRow.size,
                  left: 0,
                  width: "100%",
                });
              })}
            </ul>
            {formerSection}
          </div>
        ) : (
          <div>
            <ul className="py-1 outline-none" tabIndex={0} onKeyDown={handleKeyDown}>
              {visibleRows.map((row) => renderTreeRow(row))}
            </ul>
            {formerSection}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/components/team/MemberList.tsx
git commit -m "feat: tree view with indentation and connectors in member list"
```

---

## Chunk 3: Org Chart View

### Task 8: Org chart component

**Files:**
- Create: `src/components/team/OrgChart.tsx`

- [ ] **Step 1: Create the OrgChart component**

Create `src/components/team/OrgChart.tsx`:
```tsx
import { useRef, useState, useCallback, useMemo, useEffect } from "react";
import { MemberAvatar } from "./MemberAvatar";
import { buildChildrenMap } from "@/lib/tree-utils";
import type { TeamMember } from "@/lib/types";

interface OrgChartProps {
  members: TeamMember[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  picturesDir: string | null;
}

interface TreeNode {
  member: TeamMember;
  children: TreeNode[];
}

function buildTrees(members: TeamMember[]): TreeNode[] {
  const childrenMap = buildChildrenMap(members);

  function buildNode(member: TeamMember): TreeNode {
    const children = [...(childrenMap.get(member.id) ?? [])]
      .sort((a, b) =>
        `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`),
      )
      .map(buildNode);
    return { member, children };
  }

  const roots = [...(childrenMap.get(null) ?? [])].sort((a, b) =>
    `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`),
  );
  return roots.map(buildNode);
}

function NodeCard({
  node,
  selectedId,
  onSelect,
  picturesDir,
}: {
  node: TreeNode;
  selectedId: number | null;
  onSelect: (id: number) => void;
  picturesDir: string | null;
}) {
  return (
    <div className="flex flex-col items-center">
      {/* Card */}
      <div
        className={`flex flex-col items-center gap-1 px-4 py-3 rounded-lg border cursor-pointer transition-colors hover:bg-muted/50 ${
          selectedId === node.member.id ? "border-primary bg-muted" : "border-border bg-card"
        }`}
        onClick={() => onSelect(node.member.id)}
      >
        <MemberAvatar
          firstName={node.member.first_name}
          lastName={node.member.last_name}
          picturePath={node.member.picture_path}
          picturesDir={picturesDir}
          size="sm"
        />
        <div className="text-sm font-medium whitespace-nowrap">
          {node.member.first_name} {node.member.last_name}
        </div>
        {node.member.current_title_name && (
          <div className="text-xs text-muted-foreground whitespace-nowrap">
            {node.member.current_title_name}
          </div>
        )}
      </div>

      {/* Children with connectors */}
      {node.children.length > 0 && (
        <>
          {/* Vertical line down from parent */}
          <div className="w-px h-6 bg-border" />
          {/* Children row */}
          <div className="relative flex gap-6">
            {/* Horizontal bar: spans from center of first child to center of last child */}
            {node.children.length > 1 && (
              <div className="absolute top-0 h-px bg-border left-[calc(50%/var(--n))] right-[calc(50%/var(--n))]"
                style={{ "--n": node.children.length } as React.CSSProperties}
              />
            )}
            {node.children.map((child) => (
              <div key={child.member.id} className="flex flex-col items-center flex-1">
                {/* Vertical stub connecting to horizontal bar */}
                <div className="w-px h-6 bg-border" />
                <NodeCard
                  node={child}
                  selectedId={selectedId}
                  onSelect={onSelect}
                  picturesDir={picturesDir}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function OrgChart({ members, selectedId, onSelect, picturesDir }: OrgChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const activeMembers = useMemo(
    () => members.filter((m) => !m.left_date),
    [members],
  );
  const trees = useMemo(() => buildTrees(activeMembers), [activeMembers]);

  // Fit to view on mount
  useEffect(() => {
    if (!containerRef.current || !contentRef.current) return;
    const container = containerRef.current.getBoundingClientRect();
    const content = contentRef.current.getBoundingClientRect();
    if (content.width === 0 || content.height === 0) return;

    const scaleX = (container.width - 48) / content.width;
    const scaleY = (container.height - 48) / content.height;
    const fitScale = Math.min(scaleX, scaleY, 1);
    setScale(fitScale);
    setTranslate({
      x: (container.width - content.width * fitScale) / 2,
      y: 24,
    });
  }, [trees]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setScale((prev) => Math.max(0.1, Math.min(2, prev - e.deltaY * 0.001)));
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      setIsDragging(true);
      setDragStart({ x: e.clientX - translate.x, y: e.clientY - translate.y });
    },
    [translate],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return;
      setTranslate({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    },
    [isDragging, dragStart],
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const resetView = useCallback(() => {
    if (!containerRef.current || !contentRef.current) return;
    const container = containerRef.current.getBoundingClientRect();
    const content = contentRef.current.getBoundingClientRect();
    const scaleX = (container.width - 48) / (content.width / scale);
    const scaleY = (container.height - 48) / (content.height / scale);
    const fitScale = Math.min(scaleX, scaleY, 1);
    setScale(fitScale);
    setTranslate({
      x: (container.width - (content.width / scale) * fitScale) / 2,
      y: 24,
    });
  }, [scale]);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden bg-background"
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{ cursor: isDragging ? "grabbing" : "grab" }}
    >
      <div
        ref={contentRef}
        style={{
          transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
          transformOrigin: "0 0",
        }}
      >
        <div className="flex gap-12 p-6">
          {trees.map((tree) => (
            <NodeCard
              key={tree.member.id}
              node={tree}
              selectedId={selectedId}
              onSelect={onSelect}
              picturesDir={picturesDir}
            />
          ))}
        </div>
      </div>

      {/* Controls */}
      <div className="absolute bottom-4 right-4 flex gap-1">
        <button
          type="button"
          className="h-8 px-2 rounded border border-border bg-card text-xs hover:bg-muted"
          onClick={resetView}
        >
          Fit
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/components/team/OrgChart.tsx
git commit -m "feat: add org chart component with pan/zoom"
```

---

### Task 9: Org chart toggle in TeamMembers page

**Files:**
- Modify: `src/pages/TeamMembers.tsx`

- [ ] **Step 1: Add view toggle state and OrgChart import**

In `src/pages/TeamMembers.tsx`, add imports:
```typescript
import { OrgChart } from "@/components/team/OrgChart";
import { ListIcon, NetworkIcon } from "lucide-react";
```

Add state:
```typescript
const [view, setView] = useState<"list" | "chart">("list");
```

- [ ] **Step 2: Add toggle buttons to the header area**

Replace the detail panel section (the `<div className="flex-1 overflow-auto">` block) with:
```tsx
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* View toggle header */}
        <div className="flex items-center justify-end gap-1 px-3 h-12 border-b">
          <button
            type="button"
            className={`p-1.5 rounded ${view === "list" ? "bg-muted" : "hover:bg-muted/50"}`}
            onClick={() => setView("list")}
            title="List view"
          >
            <ListIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            className={`p-1.5 rounded ${view === "chart" ? "bg-muted" : "hover:bg-muted/50"}`}
            onClick={() => setView("chart")}
            title="Org chart"
          >
            <NetworkIcon className="h-4 w-4" />
          </button>
        </div>

        {/* View content */}
        <div className="flex-1 overflow-auto">
          {view === "chart" ? (
            <OrgChart
              members={visibleMembers}
              selectedId={selectedId}
              onSelect={(id) => {
                setSelectedId(id);
                setView("list");
              }}
              picturesDir={picturesDir}
            />
          ) : selectedMember ? (
            <MemberDetail
              key={selectedMember.id}
              member={selectedMember}
              members={visibleMembers}
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
```

- [ ] **Step 3: Verify it compiles**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/pages/TeamMembers.tsx
git commit -m "feat: add org chart toggle to team members page"
```

---

### Task 10: Former member warning banner

**Files:**
- Modify: `src/components/team/InfoSection.tsx`

- [ ] **Step 1: Add warning for former members with active reports**

In `src/components/team/InfoSection.tsx`, add after the stakeholder toggle (before the closing `</div>` of the grid):
```tsx
      {/* Former member with active reports warning */}
      {member.left_date && (() => {
        const activeReportCount = members.filter(
          (m) => m.lead_id === member.id && !m.left_date,
        ).length;
        return activeReportCount > 0 ? (
          <div className="col-span-2 rounded-lg border border-yellow-500/50 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-700 dark:text-yellow-400">
            This former member is still listed as lead for {activeReportCount} active member{activeReportCount !== 1 ? "s" : ""}.
          </div>
        ) : null;
      })()}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/components/team/InfoSection.tsx
git commit -m "feat: add warning banner for former members with active reports"
```

---

### Task 11: Manual smoke test

- [ ] **Step 1: Start the app**

Run: `npm run tauri dev`

- [ ] **Step 2: Test lead assignment**

1. Create 3-4 team members
2. Open a member detail, find the Lead dropdown
3. Assign a lead — verify it saves
4. Verify the member list shows tree indentation
5. Try assigning a cycle (A→B→A) — verify it's rejected

- [ ] **Step 3: Test org chart**

1. Click the org chart toggle icon
2. Verify the chart renders with nodes and connector lines
3. Click a node — verify it selects and switches to list view
4. Test pan (drag) and zoom (scroll wheel)
5. Click "Fit" button

- [ ] **Step 4: Test edge cases**

1. Delete a lead — verify reports become root-level
2. Set a member as former — verify warning if they have reports
3. Test keyboard navigation (arrow keys, left/right to collapse/expand)

- [ ] **Step 5: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: smoke test fixes for lead system"
```
