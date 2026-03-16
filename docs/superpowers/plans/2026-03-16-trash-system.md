# Trash System Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the toast-undo deletion pattern with a soft-delete trash system per page, with manual permanent delete.

**Architecture:** Add `deleted_at` column to 4 tables (team_members, titles, salary_data_points, scenario_groups). Existing delete commands become soft-deletes. Each page gets a trash toggle in the list header to view/restore/permanently-delete trashed items. Remove `usePendingDelete` hook entirely.

**Tech Stack:** Rust/SQLite (backend), React/TypeScript (frontend), existing shadcn/ui components

---

## File Structure

**Create:**
- `src-tauri/migrations/019_soft_delete.sql` — migration adding `deleted_at` columns

**Modify:**
- `src-tauri/src/db.rs` — register migration 19
- `src-tauri/src/commands.rs` — change delete commands to soft-delete, add restore/permanent-delete/get-trash commands, add `deleted_at IS NULL` filters to all relevant queries
- `src-tauri/src/lib.rs` — register new commands
- `src/lib/db.ts` — add new invoke wrappers for restore/permanent-delete
- `src/lib/types.ts` — add `deleted_at` to relevant types (if needed for trash display)
- `src/pages/TeamMembers.tsx` — replace `usePendingDelete` with trash toggle, restore/permanent-delete
- `src/pages/Titles.tsx` — same
- `src/pages/SalaryPlanner.tsx` — same
- `src/components/team/MemberList.tsx` — add trash toggle button, trash mode styling
- `src/components/titles/TitleList.tsx` — same
- `src/components/salary/DataPointList.tsx` — same
- `src/App.tsx` — remove `pendingDeleteRegistry` import and lock handler cleanup

**Delete:**
- `src/hooks/usePendingDelete.ts` — no longer needed

---

## Chunk 1: Backend — Migration & Soft Delete Commands

### Task 1: Add migration for `deleted_at` columns

**Files:**
- Create: `src-tauri/migrations/019_soft_delete.sql`
- Modify: `src-tauri/src/db.rs`

- [ ] **Step 1: Create migration file**

```sql
ALTER TABLE team_members ADD COLUMN deleted_at TEXT;
ALTER TABLE titles ADD COLUMN deleted_at TEXT;
ALTER TABLE salary_data_points ADD COLUMN deleted_at TEXT;
ALTER TABLE scenario_groups ADD COLUMN deleted_at TEXT;
```

- [ ] **Step 2: Register migration in db.rs**

After the `version < 18` block, add:

```rust
if version < 19 {
    let migration_sql = include_str!("../migrations/019_soft_delete.sql");
    conn.execute_batch(migration_sql)?;
    conn.pragma_update(None, "user_version", 19)?;
}
```

- [ ] **Step 3: Build to verify migration compiles**

Run: `cd src-tauri && cargo build`
Expected: Compiles successfully

- [ ] **Step 4: Commit**

```bash
git add src-tauri/migrations/019_soft_delete.sql src-tauri/src/db.rs
git commit -m "feat: add soft-delete migration with deleted_at columns"
```

### Task 2: Convert delete commands to soft-delete

**Files:**
- Modify: `src-tauri/src/commands.rs`

Convert the 4 delete commands from hard-delete to soft-delete by setting `deleted_at` instead of `DELETE FROM`.

- [ ] **Step 1: Convert `delete_team_member`**

Change the SQL from `DELETE FROM team_members WHERE id = ?1` to:
```rust
conn.execute(
    "UPDATE team_members SET deleted_at = datetime('now') WHERE id = ?1",
    params![id],
).map_err(|e| e.to_string())?;
```

**Important:** Remove the picture file cleanup — pictures should be kept until permanent delete.

- [ ] **Step 2: Convert `delete_title`**

Keep the member-count validation (check against non-deleted members). Change the validation query to:
```sql
SELECT COUNT(*) FROM team_members WHERE title_id = ?1 AND deleted_at IS NULL
```

Change the delete to:
```rust
conn.execute(
    "UPDATE titles SET deleted_at = datetime('now') WHERE id = ?1",
    params![id],
).map_err(|e| e.to_string())?;
```

- [ ] **Step 3: Convert `delete_salary_data_point`**

Change to:
```rust
conn.execute(
    "UPDATE salary_data_points SET deleted_at = datetime('now') WHERE id = ?1",
    params![id],
).map_err(|e| e.to_string())?;
```

- [ ] **Step 4: Convert `delete_scenario_group`**

Change to:
```rust
conn.execute(
    "UPDATE scenario_groups SET deleted_at = datetime('now') WHERE id = ?1",
    params![id],
).map_err(|e| e.to_string())?;
```

Also soft-delete child salary_data_points:
```rust
conn.execute(
    "UPDATE salary_data_points SET deleted_at = datetime('now') WHERE scenario_group_id = ?1",
    params![id],
).map_err(|e| e.to_string())?;
```

- [ ] **Step 5: Build to verify**

Run: `cd src-tauri && cargo build`
Expected: Compiles successfully

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/commands.rs
git commit -m "feat: convert delete commands to soft-delete"
```

### Task 3: Add `deleted_at IS NULL` filters to all read queries

**Files:**
- Modify: `src-tauri/src/commands.rs`

Every query that reads from `team_members`, `titles`, `salary_data_points`, or `scenario_groups` needs to exclude soft-deleted rows. The key queries to update:

- [ ] **Step 1: Filter `get_team_members`**

Add `WHERE m.deleted_at IS NULL` to the query at ~line 107, before `ORDER BY`. Also filter the lead join: `LEFT JOIN team_members lead ON m.lead_id = lead.id AND lead.deleted_at IS NULL`.

- [ ] **Step 2: Filter `get_titles`**

Change the query to:
```sql
SELECT t.id, t.name, COUNT(m.id) as member_count
FROM titles t
LEFT JOIN team_members m ON m.title_id = t.id AND m.deleted_at IS NULL
WHERE t.deleted_at IS NULL
GROUP BY t.id ORDER BY t.name ASC
```

- [ ] **Step 3: Filter `get_salary_data_points`**

Add `AND deleted_at IS NULL` to the normal data points query:
```sql
WHERE scenario_group_id IS NULL AND deleted_at IS NULL
```

Add `WHERE deleted_at IS NULL` to the scenario_groups query.

Add `AND deleted_at IS NULL` to the child scenario query.

- [ ] **Step 4: Filter `get_salary_data_point` detail query**

The detail query at ~line 1225 reads a single data point by ID. This one should NOT filter by `deleted_at` — we need to be able to view trashed items to restore them.

- [ ] **Step 5: Filter remaining queries that reference these tables**

Audit all other queries. Key ones:
- `create_salary_data_point` — the sub-query finding the latest data point for `previous_data_point_id` should filter `AND deleted_at IS NULL`
- `get_previous_member_data` — the sub-query for previous data points should filter `AND deleted_at IS NULL`
- `get_salary_over_time` — should filter `AND sdp.deleted_at IS NULL`
- `global_search` — should filter `AND m.deleted_at IS NULL` for team_members, `AND deleted_at IS NULL` for titles
- Member count queries used in report blocks should filter deleted members
- `create_salary_data_point` sub-query `SELECT id FROM salary_data_points WHERE scenario_group_id IS NULL ORDER BY id DESC LIMIT 1` → add `AND deleted_at IS NULL`

- [ ] **Step 6: Build and run tests**

Run: `cd src-tauri && cargo build && cargo test`
Expected: Compiles and tests pass

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/commands.rs
git commit -m "feat: filter soft-deleted rows from all read queries"
```

### Task 4: Add restore and permanent-delete commands

**Files:**
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add restore commands**

```rust
#[tauri::command(rename_all = "snake_case")]
pub fn restore_team_member(db: State<AppDb>, id: i64) -> Result<(), String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute("UPDATE team_members SET deleted_at = NULL WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn restore_title(db: State<AppDb>, id: i64) -> Result<(), String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute("UPDATE titles SET deleted_at = NULL WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn restore_salary_data_point(db: State<AppDb>, id: i64) -> Result<(), String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute("UPDATE salary_data_points SET deleted_at = NULL WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn restore_scenario_group(db: State<AppDb>, id: i64) -> Result<(), String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute("UPDATE scenario_groups SET deleted_at = NULL WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    // Also restore child data points
    conn.execute("UPDATE salary_data_points SET deleted_at = NULL WHERE scenario_group_id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
```

- [ ] **Step 2: Add permanent delete commands**

```rust
#[tauri::command(rename_all = "snake_case")]
pub fn permanent_delete_team_member(db: State<AppDb>, id: i64) -> Result<(), String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute("DELETE FROM team_members WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    // Clean up picture file
    if let Ok(pictures_dir) = get_pictures_dir() {
        let file_path = pictures_dir.join(format!("{}.jpg", id));
        let _ = std::fs::remove_file(file_path);
    }
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn permanent_delete_title(db: State<AppDb>, id: i64) -> Result<(), String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute("DELETE FROM titles WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn permanent_delete_salary_data_point(db: State<AppDb>, id: i64) -> Result<(), String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute("DELETE FROM salary_data_points WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn permanent_delete_scenario_group(db: State<AppDb>, id: i64) -> Result<(), String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute("DELETE FROM scenario_groups WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
```

- [ ] **Step 3: Add get-trash commands for each entity type**

Each page needs to fetch its own trashed items:

```rust
#[tauri::command(rename_all = "snake_case")]
pub fn get_trashed_team_members(db: State<AppDb>) -> Result<Vec<TeamMember>, String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    // Same query as get_team_members but WHERE m.deleted_at IS NOT NULL
    // ... (use same SELECT columns, change WHERE clause)
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_trashed_titles(db: State<AppDb>) -> Result<Vec<Title>, String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    let mut stmt = conn.prepare(
        "SELECT t.id, t.name, 0 as member_count FROM titles t WHERE t.deleted_at IS NOT NULL ORDER BY t.deleted_at DESC"
    ).map_err(|e| e.to_string())?;
    let titles = stmt.query_map([], |row| {
        Ok(Title { id: row.get(0)?, name: row.get(1)?, member_count: row.get(2)? })
    }).map_err(|e| e.to_string())?
    .collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    Ok(titles)
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_trashed_salary_data_points(db: State<AppDb>) -> Result<Vec<SalaryListItem>, String> {
    // Return trashed standalone data points and trashed scenario groups
    // Same structure as get_salary_data_points but with deleted_at IS NOT NULL
}
```

- [ ] **Step 4: Register all new commands in `lib.rs`**

Add to the `invoke_handler` block:
```rust
commands::restore_team_member,
commands::restore_title,
commands::restore_salary_data_point,
commands::restore_scenario_group,
commands::permanent_delete_team_member,
commands::permanent_delete_title,
commands::permanent_delete_salary_data_point,
commands::permanent_delete_scenario_group,
commands::get_trashed_team_members,
commands::get_trashed_titles,
commands::get_trashed_salary_data_points,
```

- [ ] **Step 5: Build and test**

Run: `cd src-tauri && cargo build && cargo test`
Expected: Compiles and tests pass

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat: add restore, permanent-delete, and get-trash commands"
```

---

## Chunk 2: Frontend — DB Layer, Remove Undo, Wire Up Trash

### Task 5: Add frontend invoke wrappers

**Files:**
- Modify: `src/lib/db.ts`

- [ ] **Step 1: Add restore, permanent-delete, and get-trash invoke wrappers**

```typescript
// Trash - Team Members
export const getTrashedTeamMembers = () => invoke<TeamMember[]>("get_trashed_team_members");
export const restoreTeamMember = (id: number) => invoke<void>("restore_team_member", { id });
export const permanentDeleteTeamMember = (id: number) => invoke<void>("permanent_delete_team_member", { id });

// Trash - Titles
export const getTrashedTitles = () => invoke<Title[]>("get_trashed_titles");
export const restoreTitle = (id: number) => invoke<void>("restore_title", { id });
export const permanentDeleteTitle = (id: number) => invoke<void>("permanent_delete_title", { id });

// Trash - Salary
export const getTrashedSalaryDataPoints = () => invoke<SalaryListItem[]>("get_trashed_salary_data_points");
export const restoreSalaryDataPoint = (id: number) => invoke<void>("restore_salary_data_point", { id });
export const permanentDeleteSalaryDataPoint = (id: number) => invoke<void>("permanent_delete_salary_data_point", { id });
export const restoreScenarioGroup = (id: number) => invoke<void>("restore_scenario_group", { id });
export const permanentDeleteScenarioGroup = (id: number) => invoke<void>("permanent_delete_scenario_group", { id });
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/db.ts
git commit -m "feat: add frontend invoke wrappers for trash operations"
```

### Task 6: Remove `usePendingDelete` and clean up App.tsx

**Files:**
- Delete: `src/hooks/usePendingDelete.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Remove `pendingDeleteRegistry` from App.tsx lock handler**

In `App.tsx`, remove the import of `pendingDeleteRegistry` and the line `for (const cancel of pendingDeleteRegistry) cancel();` from `handleLock`.

- [ ] **Step 2: Delete `usePendingDelete.ts`**

Remove the file entirely.

- [ ] **Step 3: Build to check for remaining references**

Run: `npm run build`
Expected: Build errors in TeamMembers.tsx, Titles.tsx, SalaryPlanner.tsx (expected — we'll fix these next)

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove usePendingDelete hook and pendingDeleteRegistry"
```

### Task 7: Update TeamMembers page with trash toggle

**Files:**
- Modify: `src/pages/TeamMembers.tsx`
- Modify: `src/components/team/MemberList.tsx`

- [ ] **Step 1: Update TeamMembers.tsx**

Replace `usePendingDelete` pattern with trash state:

1. Remove `usePendingDelete` import and usage
2. Add state: `const [showTrash, setShowTrash] = useState(false);`
3. Add state: `const [trashedMembers, setTrashedMembers] = useState<TeamMember[]>([]);`
4. Add `loadTrashedMembers` callback that calls `getTrashedTeamMembers()`
5. When `showTrash` changes to true, load trashed members
6. Change `handleDelete` to simply call `deleteTeamMember(id)`, clear selection if needed, then reload
7. Add `handleRestore` that calls `restoreTeamMember(id)`, reloads both lists
8. Add `handlePermanentDelete` that uses an `AlertDialog` confirmation, then calls `permanentDeleteTeamMember(id)`, reloads trash
9. Remove `visibleMembers` (was filtering by `pendingIds`) — use `members` directly
10. Pass `showTrash`, `onToggleTrash`, trash-related handlers to `MemberList`
11. When `showTrash` is true, pass `trashedMembers` instead of `members` to `MemberList`
12. When `showTrash` is true, show empty state "Select a trashed member to restore or permanently delete" instead of member detail

- [ ] **Step 2: Update MemberList.tsx**

Add props: `showTrash`, `onToggleTrash`, `trashCount`, `onRestore`, `onPermanentDelete`

1. Add a `Trash2` icon button in the header next to the add button. When active, highlight with `bg-muted`. Show trash count as a small badge if > 0.
2. When `showTrash` is true, hide the add button
3. When `showTrash` is true, show restore (`RotateCcw`) and permanent-delete (`Trash2`) buttons on hover instead of the normal delete button
4. When `showTrash` is true, render items with `opacity-60` styling

- [ ] **Step 3: Build and test manually**

Run: `npm run build`
Expected: Compiles (Titles and SalaryPlanner may still have errors)

- [ ] **Step 4: Commit**

```bash
git add src/pages/TeamMembers.tsx src/components/team/MemberList.tsx
git commit -m "feat: add trash toggle to Team Members page"
```

### Task 8: Update Titles page with trash toggle

**Files:**
- Modify: `src/pages/Titles.tsx`
- Modify: `src/components/titles/TitleList.tsx`

- [ ] **Step 1: Update Titles.tsx**

Same pattern as TeamMembers:
1. Remove `usePendingDelete` import and usage
2. Add `showTrash`/`trashedTitles` state
3. Change `handleDelete` to call `deleteTitle(id)` directly (keep the member-assigned validation)
4. Add `handleRestore`/`handlePermanentDelete`
5. Remove `visibleTitles` filtering — use `titles` directly
6. Pass trash props to `TitleList`
7. When `showTrash`, show trash empty state in detail panel

- [ ] **Step 2: Update TitleList.tsx**

Same pattern as MemberList: add trash toggle button, restore/permanent-delete buttons, muted styling.

- [ ] **Step 3: Build and test**

Run: `npm run build`
Expected: Compiles (SalaryPlanner may still have errors)

- [ ] **Step 4: Commit**

```bash
git add src/pages/Titles.tsx src/components/titles/TitleList.tsx
git commit -m "feat: add trash toggle to Titles page"
```

### Task 9: Update SalaryPlanner page with trash toggle

**Files:**
- Modify: `src/pages/SalaryPlanner.tsx`
- Modify: `src/components/salary/DataPointList.tsx`

- [ ] **Step 1: Update SalaryPlanner.tsx**

Same pattern:
1. Remove `usePendingDelete` import and usage
2. Add `showTrash`/`trashedItems` state
3. Change `handleDelete` to call `deleteSalaryDataPoint(id)` directly, reload, select next
4. Change `handleDeleteGroup` to call `deleteScenarioGroup(id)` directly
5. Add `handleRestore`/`handlePermanentDelete` for both data points and scenario groups
6. Remove `visibleItems` filtering — use `listItems` directly
7. Pass trash props to `DataPointList`
8. When `showTrash`, show trash empty state in detail panel

- [ ] **Step 2: Update DataPointList.tsx**

Add trash toggle button in header. When in trash mode:
- Hide add button
- Show restore and permanent-delete buttons on each item
- Muted styling
- For scenario groups in trash, show the group as a single restorable/deletable item (don't expand children)

- [ ] **Step 3: Full build**

Run: `npm run build`
Expected: Compiles successfully with no errors

- [ ] **Step 4: Commit**

```bash
git add src/pages/SalaryPlanner.tsx src/components/salary/DataPointList.tsx
git commit -m "feat: add trash toggle to Salary Planner page"
```

### Task 10: Final cleanup and verification

**Files:**
- Verify all files

- [ ] **Step 1: Verify `usePendingDelete.ts` is deleted and no references remain**

Run: `grep -r "usePendingDelete\|pendingDeleteRegistry\|pendingIds\|scheduleDelete" src/`
Expected: No matches

- [ ] **Step 2: Full build**

Run: `npm run build && cd src-tauri && cargo build && cargo test`
Expected: All pass

- [ ] **Step 3: Manual test checklist**

- Delete a team member → disappears from list, appears in trash
- Toggle trash on → see deleted member with restore/permanent-delete buttons
- Restore → member reappears in normal list
- Permanent delete → confirmation dialog → gone forever
- Same flow for titles (with member-assigned validation still working)
- Same flow for salary data points and scenario groups
- Salary parts still delete immediately (no trash)

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: final cleanup for trash system"
```
