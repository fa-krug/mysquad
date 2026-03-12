# Projects View Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Projects view with split-view layout, project CRUD, team member assignment, status items, and markdown notes.

**Architecture:** New migration (004) adds 3 tables. Rust commands follow existing patterns (field-level updates, Mutex-guarded connection). Frontend adds a `/projects` route with `ProjectList` + `ProjectDetail` components. `CheckableList` is generalized via a `BaseCheckableItem` base interface.

**Tech Stack:** Rust/SQLite (backend), React 19 + TypeScript (frontend), react-markdown (notes preview), shadcn/ui components, Tailwind CSS v4.

**Spec:** `docs/superpowers/specs/2026-03-13-projects-view-design.md`

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src-tauri/migrations/004_projects.sql` | Create | Schema: projects, project_members, project_status_items tables + trigger |
| `src-tauri/src/db.rs` | Modify | Add migration 004 to `run_migrations`, update version test |
| `src-tauri/src/commands.rs` | Modify | Add 11 project Tauri commands + 3 structs |
| `src-tauri/src/lib.rs` | Modify | Register 11 new commands in invoke_handler |
| `src/lib/types.ts` | Modify | Add BaseCheckableItem, Project, ProjectMember, ProjectStatusItem; refactor CheckableItem |
| `src/lib/db.ts` | Modify | Add ~11 project invoke() functions |
| `src/components/team/CheckableList.tsx` | Modify | Change props from CheckableItem to BaseCheckableItem |
| `src/pages/Projects.tsx` | Create | Page container: project list state, selectedId, CRUD handlers |
| `src/components/projects/ProjectList.tsx` | Create | Left panel: active/finished sections, selection, delete |
| `src/components/projects/ProjectDetail.tsx` | Create | Right panel: name, dates, members, status, notes |
| `src/components/layout/Sidebar.tsx` | Modify | Add Projects nav item |
| `src/App.tsx` | Modify | Add /projects route |

---

## Chunk 1: Backend (Migration + Rust Commands)

### Task 1: Create migration 004

**Files:**
- Create: `src-tauri/migrations/004_projects.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- Projects
CREATE TABLE projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL DEFAULT '',
    start_date TEXT NOT NULL DEFAULT (date('now')),
    end_date TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TRIGGER projects_updated_at
AFTER UPDATE ON projects
FOR EACH ROW
BEGIN
    UPDATE projects SET updated_at = datetime('now') WHERE id = OLD.id;
END;

-- Project members (junction table)
CREATE TABLE project_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    team_member_id INTEGER NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
    UNIQUE(project_id, team_member_id)
);

-- Project status items
CREATE TABLE project_status_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    checked INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

- [ ] **Step 2: Commit**

```bash
git add src-tauri/migrations/004_projects.sql
git commit -m "feat: add migration 004 for projects tables"
```

### Task 2: Register migration in db.rs

**Files:**
- Modify: `src-tauri/src/db.rs:40-47` (after migration 3 block)

- [ ] **Step 1: Add migration 004 block**

Add after the `version < 3` block in `run_migrations`:

```rust
    if version < 4 {
        let migration_sql = include_str!("../migrations/004_projects.sql");
        conn.execute_batch(migration_sql)?;
        conn.pragma_update(None, "user_version", 4)?;
    }
```

- [ ] **Step 2: Update the version assertion in `test_schema_version_tracking`**

Change `assert_eq!(version, 3)` to `assert_eq!(version, 4)` in the `test_schema_version_tracking` test.

- [ ] **Step 3: Update the version assertion in `test_migration_v2_salary_data_points`**

Change `assert_eq!(version, 3)` to `assert_eq!(version, 4)` at the end of `test_migration_v2_salary_data_points`.

- [ ] **Step 4: Update the version assertion in `test_migration_v3_picture_path`**

Change `assert_eq!(version, 3)` to `assert_eq!(version, 4)` in `test_migration_v3_picture_path`.

- [ ] **Step 5: Add migration v4 test**

Add at the end of the `tests` module:

```rust
    #[test]
    fn test_migration_v4_projects() {
        let conn = open_db_with_key(":memory:", "test-key-0123456789abcdef").unwrap();
        run_migrations(&conn).unwrap();

        // Verify projects table exists
        let count: i32 = conn.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='projects'",
            [], |row| row.get(0)
        ).unwrap();
        assert_eq!(count, 1);

        // Verify project_members table exists
        let count: i32 = conn.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='project_members'",
            [], |row| row.get(0)
        ).unwrap();
        assert_eq!(count, 1);

        // Verify project_status_items table exists
        let count: i32 = conn.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='project_status_items'",
            [], |row| row.get(0)
        ).unwrap();
        assert_eq!(count, 1);

        // Verify updated_at trigger works
        conn.execute("INSERT INTO projects (name) VALUES ('Test')", []).unwrap();
        let id: i64 = conn.last_insert_rowid();
        let before: String = conn.query_row(
            "SELECT updated_at FROM projects WHERE id = ?1", [id], |row| row.get(0)
        ).unwrap();
        conn.execute("UPDATE projects SET name = 'Updated' WHERE id = ?1", [id]).unwrap();
        let after: String = conn.query_row(
            "SELECT updated_at FROM projects WHERE id = ?1", [id], |row| row.get(0)
        ).unwrap();
        assert!(after >= before);

        // Verify cascade delete
        conn.execute(
            "INSERT INTO project_members (project_id, team_member_id) VALUES (?1, (SELECT id FROM team_members LIMIT 1))",
            [id]
        ).ok(); // May fail if no team_members, that's fine
        conn.execute("DELETE FROM projects WHERE id = ?1", [id]).unwrap();
    }
```

- [ ] **Step 6: Run Rust tests**

Run: `cd src-tauri && cargo test`
Expected: All tests pass including the new `test_migration_v4_projects`.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/db.rs
git commit -m "feat: register migration 004 and add project table tests"
```

### Task 3: Add project Rust commands — structs and CRUD

**Files:**
- Modify: `src-tauri/src/commands.rs` (add after the titles section, before settings)

- [ ] **Step 1: Add Project struct and CRUD commands**

Add a new `// ── Project commands ──` section with:

```rust
// ── Project commands ──

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Project {
    pub id: i64,
    pub name: String,
    pub start_date: String,
    pub end_date: Option<String>,
    pub notes: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[tauri::command]
pub fn get_projects(db: State<AppDb>) -> Result<Vec<Project>, String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    let mut stmt = conn
        .prepare(
            "SELECT id, name, start_date, end_date, notes, created_at, updated_at
             FROM projects
             ORDER BY end_date IS NOT NULL ASC, name ASC",
        )
        .map_err(|e| e.to_string())?;
    let projects = stmt
        .query_map([], |row| {
            Ok(Project {
                id: row.get(0)?,
                name: row.get(1)?,
                start_date: row.get(2)?,
                end_date: row.get(3)?,
                notes: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(projects)
}

#[tauri::command]
pub fn create_project(db: State<AppDb>) -> Result<Project, String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute("INSERT INTO projects (name) VALUES ('')", [])
        .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    let row = conn
        .query_row(
            "SELECT id, name, start_date, end_date, notes, created_at, updated_at FROM projects WHERE id = ?1",
            params![id],
            |row| {
                Ok(Project {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    start_date: row.get(2)?,
                    end_date: row.get(3)?,
                    notes: row.get(4)?,
                    created_at: row.get(5)?,
                    updated_at: row.get(6)?,
                })
            },
        )
        .map_err(|e| e.to_string())?;
    Ok(row)
}

#[tauri::command]
pub fn update_project(
    db: State<AppDb>,
    id: i64,
    field: String,
    value: Option<String>,
) -> Result<(), String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    let allowed = ["name", "end_date", "notes"];
    if !allowed.contains(&field.as_str()) {
        return Err(format!("Invalid field: {}", field));
    }
    let sql = format!("UPDATE projects SET {} = ?1 WHERE id = ?2", field);
    conn.execute(&sql, params![value, id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_project(db: State<AppDb>, id: i64) -> Result<(), String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute("DELETE FROM projects WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
```

- [ ] **Step 2: Run cargo check**

Run: `cd src-tauri && cargo check`
Expected: Compiles without errors.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/commands.rs
git commit -m "feat: add project CRUD Rust commands"
```

### Task 4: Add project member Rust commands

**Files:**
- Modify: `src-tauri/src/commands.rs` (append after delete_project)

- [ ] **Step 1: Add ProjectMember struct and commands**

```rust
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProjectMember {
    pub id: i64,
    pub project_id: i64,
    pub team_member_id: i64,
    pub first_name: String,
    pub last_name: String,
}

#[tauri::command]
pub fn get_project_members(db: State<AppDb>, project_id: i64) -> Result<Vec<ProjectMember>, String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    let mut stmt = conn
        .prepare(
            "SELECT pm.id, pm.project_id, pm.team_member_id, m.first_name, m.last_name
             FROM project_members pm
             JOIN team_members m ON m.id = pm.team_member_id
             WHERE pm.project_id = ?1
             ORDER BY m.last_name ASC, m.first_name ASC",
        )
        .map_err(|e| e.to_string())?;
    let members = stmt
        .query_map(params![project_id], |row| {
            Ok(ProjectMember {
                id: row.get(0)?,
                project_id: row.get(1)?,
                team_member_id: row.get(2)?,
                first_name: row.get(3)?,
                last_name: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(members)
}

#[tauri::command]
pub fn add_project_member(
    db: State<AppDb>,
    project_id: i64,
    team_member_id: i64,
) -> Result<ProjectMember, String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute(
        "INSERT INTO project_members (project_id, team_member_id) VALUES (?1, ?2)",
        params![project_id, team_member_id],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    let (first_name, last_name): (String, String) = conn
        .query_row(
            "SELECT first_name, last_name FROM team_members WHERE id = ?1",
            params![team_member_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| e.to_string())?;
    Ok(ProjectMember {
        id,
        project_id,
        team_member_id,
        first_name,
        last_name,
    })
}

#[tauri::command]
pub fn remove_project_member(db: State<AppDb>, id: i64) -> Result<(), String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute("DELETE FROM project_members WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
```

- [ ] **Step 2: Run cargo check**

Run: `cd src-tauri && cargo check`
Expected: Compiles without errors.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/commands.rs
git commit -m "feat: add project member Rust commands"
```

### Task 5: Add project status item Rust commands

**Files:**
- Modify: `src-tauri/src/commands.rs` (append after remove_project_member)

- [ ] **Step 1: Add ProjectStatusItem struct and commands**

```rust
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProjectStatusItem {
    pub id: i64,
    pub project_id: i64,
    pub text: String,
    pub checked: bool,
    pub created_at: String,
}

#[tauri::command]
pub fn get_project_status_items(
    db: State<AppDb>,
    project_id: i64,
) -> Result<Vec<ProjectStatusItem>, String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    let mut stmt = conn
        .prepare(
            "SELECT id, project_id, text, checked, created_at
             FROM project_status_items
             WHERE project_id = ?1
             ORDER BY checked ASC, CASE WHEN checked = 0 THEN created_at END ASC, CASE WHEN checked = 1 THEN created_at END DESC",
        )
        .map_err(|e| e.to_string())?;
    let items = stmt
        .query_map(params![project_id], |row| {
            Ok(ProjectStatusItem {
                id: row.get(0)?,
                project_id: row.get(1)?,
                text: row.get(2)?,
                checked: row.get(3)?,
                created_at: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(items)
}

#[tauri::command]
pub fn add_project_status_item(
    db: State<AppDb>,
    project_id: i64,
    text: String,
) -> Result<ProjectStatusItem, String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute(
        "INSERT INTO project_status_items (project_id, text) VALUES (?1, ?2)",
        params![project_id, text],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    let created_at: String = conn
        .query_row(
            "SELECT created_at FROM project_status_items WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(ProjectStatusItem {
        id,
        project_id,
        text,
        checked: false,
        created_at,
    })
}

#[tauri::command]
pub fn update_project_status_item(
    db: State<AppDb>,
    id: i64,
    text: Option<String>,
    checked: Option<bool>,
) -> Result<(), String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    if let Some(t) = text {
        conn.execute(
            "UPDATE project_status_items SET text = ?1 WHERE id = ?2",
            params![t, id],
        )
        .map_err(|e| e.to_string())?;
    }
    if let Some(c) = checked {
        conn.execute(
            "UPDATE project_status_items SET checked = ?1 WHERE id = ?2",
            params![c, id],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn delete_project_status_item(db: State<AppDb>, id: i64) -> Result<(), String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute("DELETE FROM project_status_items WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
```

- [ ] **Step 2: Run cargo check**

Run: `cd src-tauri && cargo check`
Expected: Compiles without errors.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/commands.rs
git commit -m "feat: add project status item Rust commands"
```

### Task 6: Register all project commands in lib.rs

**Files:**
- Modify: `src-tauri/src/lib.rs:52` (before the closing `]`)

- [ ] **Step 1: Add command registrations**

Add these 11 entries to the `generate_handler!` macro, before the closing `]`:

```rust
            commands::get_projects,
            commands::create_project,
            commands::update_project,
            commands::delete_project,
            commands::get_project_members,
            commands::add_project_member,
            commands::remove_project_member,
            commands::get_project_status_items,
            commands::add_project_status_item,
            commands::update_project_status_item,
            commands::delete_project_status_item,
```

- [ ] **Step 2: Run full Rust test + build**

Run: `cd src-tauri && cargo test && cargo build`
Expected: All tests pass, build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat: register project commands in Tauri handler"
```

---

## Chunk 2: Frontend Types, DB Layer, and CheckableList Refactor

### Task 7: Refactor types.ts — add BaseCheckableItem and project types

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Extract BaseCheckableItem and add project types**

Replace the existing `CheckableItem` interface and add new types:

```typescript
// Base interface for checkable items (used by CheckableList component)
export interface BaseCheckableItem {
  id: number;
  text: string;
  checked: boolean;
  created_at: string;
}

export interface CheckableItem extends BaseCheckableItem {
  team_member_id: number;
}

export interface Project {
  id: number;
  name: string;
  start_date: string;
  end_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectMember {
  id: number;
  project_id: number;
  team_member_id: number;
  first_name: string;
  last_name: string;
}

export interface ProjectStatusItem extends BaseCheckableItem {
  project_id: number;
}
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npm run build`
Expected: Build succeeds (CheckableItem still extends BaseCheckableItem, so all existing code works).

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add BaseCheckableItem and project types"
```

### Task 8: Update CheckableList to use BaseCheckableItem

**Files:**
- Modify: `src/components/team/CheckableList.tsx:1-22`

- [ ] **Step 1: Change import and prop types**

Change the import from:
```typescript
import type { CheckableItem } from "@/lib/types";
```
to:
```typescript
import type { BaseCheckableItem } from "@/lib/types";
```

Update `CheckableListProps`:
```typescript
interface CheckableListProps {
  title: string;
  items: BaseCheckableItem[];
  onAdd: (text: string) => Promise<BaseCheckableItem>;
  onUpdate: (id: number, text?: string, checked?: boolean) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onItemsChange: (items: BaseCheckableItem[]) => void;
}
```

Update `ItemRowProps`:
```typescript
interface ItemRowProps {
  item: BaseCheckableItem;
  onUpdate: (id: number, text?: string, checked?: boolean) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onItemsChange: (updater: (prev: BaseCheckableItem[]) => BaseCheckableItem[]) => void;
}
```

Also update `handleItemsUpdater` in the `CheckableList` function body (line 134) to use `BaseCheckableItem`:
```typescript
  const handleItemsUpdater = (updater: (prev: BaseCheckableItem[]) => BaseCheckableItem[]) => {
    onItemsChange(updater(items));
  };
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npm run build`
Expected: Build succeeds. Existing usages in `MemberDetail.tsx` still work because `CheckableItem extends BaseCheckableItem`.

- [ ] **Step 3: Commit**

```bash
git add src/components/team/CheckableList.tsx
git commit -m "refactor: generalize CheckableList to use BaseCheckableItem"
```

### Task 9: Add project functions to db.ts

**Files:**
- Modify: `src/lib/db.ts`

- [ ] **Step 1: Add imports and project functions**

Add `Project`, `ProjectMember`, `ProjectStatusItem` to the import from `./types`.

Add at the end of db.ts, before the Settings section:

```typescript
// Projects
export const getProjects = () => invoke<Project[]>("get_projects");
export const createProject = () => invoke<Project>("create_project");
export const updateProject = (id: number, field: string, value: string | null) =>
  invoke<void>("update_project", { id, field, value });
export const deleteProject = (id: number) => invoke<void>("delete_project", { id });

// Project Members
export const getProjectMembers = (projectId: number) =>
  invoke<ProjectMember[]>("get_project_members", { project_id: projectId });
export const addProjectMember = (projectId: number, teamMemberId: number) =>
  invoke<ProjectMember>("add_project_member", { project_id: projectId, team_member_id: teamMemberId });
export const removeProjectMember = (id: number) =>
  invoke<void>("remove_project_member", { id });

// Project Status Items
export const getProjectStatusItems = (projectId: number) =>
  invoke<ProjectStatusItem[]>("get_project_status_items", { project_id: projectId });
export const addProjectStatusItem = (projectId: number, text: string) =>
  invoke<ProjectStatusItem>("add_project_status_item", { project_id: projectId, text });
export const updateProjectStatusItem = (id: number, text?: string, checked?: boolean) =>
  invoke<void>("update_project_status_item", { id, text: text ?? null, checked: checked ?? null });
export const deleteProjectStatusItem = (id: number) =>
  invoke<void>("delete_project_status_item", { id });
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/lib/db.ts
git commit -m "feat: add project invoke functions to db.ts"
```

---

## Chunk 3: Frontend Components

### Task 10: Install react-markdown

- [ ] **Step 1: Install dependency**

Run: `npm install react-markdown`

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: add react-markdown dependency"
```

### Task 11: Create ProjectList component

**Files:**
- Create: `src/components/projects/ProjectList.tsx`

- [ ] **Step 1: Write ProjectList**

```typescript
import { useState } from "react";
import { PlusIcon, Trash2Icon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import type { Project } from "@/lib/types";

interface ProjectListProps {
  projects: Project[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onCreate: () => void;
  onDelete: (id: number) => void;
}

export function ProjectList({
  projects,
  selectedId,
  onSelect,
  onCreate,
  onDelete,
}: ProjectListProps) {
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [finishedOpen, setFinishedOpen] = useState(false);

  const active = projects.filter((p) => !p.end_date);
  const finished = projects.filter((p) => p.end_date);

  const renderItem = (project: Project) => (
    <li
      key={project.id}
      className={`group relative flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/50 ${
        selectedId === project.id ? "bg-muted" : ""
      }`}
      onClick={() => onSelect(project.id)}
      onMouseEnter={() => setHoveredId(project.id)}
      onMouseLeave={() => setHoveredId(null)}
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">
          {project.name || "Untitled Project"}
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {project.start_date}
        </div>
      </div>

      {hoveredId === project.id && (
        <AlertDialog
          open={pendingDeleteId === project.id}
          onOpenChange={(open) => {
            if (!open) setPendingDeleteId(null);
          }}
        >
          <AlertDialogTrigger
            render={
              <button
                className="ml-1 shrink-0 p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  setPendingDeleteId(project.id);
                }}
                title="Delete project"
              >
                <Trash2Icon className="size-3.5" />
              </button>
            }
          />
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Project</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete{" "}
                <strong>{project.name || "Untitled Project"}</strong>? This
                action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setPendingDeleteId(null)}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(project.id);
                  setPendingDeleteId(null);
                }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </li>
  );

  return (
    <div className="w-64 shrink-0 border-r flex flex-col h-full">
      <div className="flex items-center justify-between px-3 h-12 border-b">
        <span className="text-sm font-semibold">Projects</span>
        <Button variant="ghost" size="icon-sm" onClick={onCreate} title="Add project">
          <PlusIcon />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        {active.length === 0 && finished.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">
            No projects yet
          </div>
        ) : (
          <>
            <ul className="py-1">{active.map(renderItem)}</ul>

            {finished.length > 0 && (
              <div className="border-t">
                <button
                  className="flex w-full items-center gap-1 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
                  onClick={() => setFinishedOpen(!finishedOpen)}
                >
                  <ChevronRightIcon
                    className={`size-3 transition-transform ${finishedOpen ? "rotate-90" : ""}`}
                  />
                  Finished ({finished.length})
                </button>
                {finishedOpen && <ul className="pb-1">{finished.map(renderItem)}</ul>}
              </div>
            )}
          </>
        )}
      </ScrollArea>
    </div>
  );
}
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/projects/ProjectList.tsx
git commit -m "feat: add ProjectList component"
```

### Task 12: Create ProjectDetail component

**Files:**
- Create: `src/components/projects/ProjectDetail.tsx`

- [ ] **Step 1: Write ProjectDetail**

```typescript
import { useState, useEffect } from "react";
import { XIcon } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CheckableList } from "@/components/team/CheckableList";
import { useAutoSave } from "@/hooks/useAutoSave";
import {
  updateProject,
  getProjectMembers,
  addProjectMember,
  removeProjectMember,
  getProjectStatusItems,
  addProjectStatusItem,
  updateProjectStatusItem,
  deleteProjectStatusItem,
  getTeamMembers,
} from "@/lib/db";
import type {
  Project,
  ProjectMember,
  ProjectStatusItem,
  BaseCheckableItem,
  TeamMember,
} from "@/lib/types";

interface ProjectDetailProps {
  project: Project;
  onProjectChange: (field: string, value: string | null) => void;
}

export function ProjectDetail({ project, onProjectChange }: ProjectDetailProps) {
  const [name, setName] = useState(project.name);
  const [endDate, setEndDate] = useState(project.end_date ?? "");
  const [notes, setNotes] = useState(project.notes ?? "");
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [allTeamMembers, setAllTeamMembers] = useState<TeamMember[]>([]);
  const [statusItems, setStatusItems] = useState<ProjectStatusItem[]>([]);

  useEffect(() => {
    getProjectMembers(project.id).then(setMembers);
    getProjectStatusItems(project.id).then(setStatusItems);
    getTeamMembers().then(setAllTeamMembers);
  }, [project.id]);

  const { save: saveName } = useAutoSave({
    onSave: async (val) => {
      if (val != null && val !== project.name) {
        await updateProject(project.id, "name", val);
        onProjectChange("name", val);
      }
    },
  });

  const { save: saveEndDate } = useAutoSave({
    onSave: async (val) => {
      if (val !== undefined) {
        const v = val || null;
        await updateProject(project.id, "end_date", v);
        onProjectChange("end_date", v);
      }
    },
  });

  const { save: saveNotes } = useAutoSave({
    onSave: async (val) => {
      if (val !== undefined) {
        const v = val || null;
        await updateProject(project.id, "notes", v);
        onProjectChange("notes", v);
      }
    },
  });

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value);
    saveName(e.target.value);
  };

  const handleEndDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEndDate(e.target.value);
    saveEndDate(e.target.value);
  };

  const handleNotesChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNotes(e.target.value);
    saveNotes(e.target.value);
  };

  const handleAddMember = async (teamMemberId: number) => {
    const member = await addProjectMember(project.id, teamMemberId);
    setMembers((prev) => [...prev, member]);
  };

  const handleRemoveMember = async (id: number) => {
    await removeProjectMember(id);
    setMembers((prev) => prev.filter((m) => m.id !== id));
  };

  const assignedIds = new Set(members.map((m) => m.team_member_id));
  const availableMembers = allTeamMembers.filter((m) => !assignedIds.has(m.id));

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-2xl space-y-6 p-6">
        {/* Name */}
        <div className="space-y-2">
          <Label htmlFor="project-name">Name</Label>
          <Input
            id="project-name"
            value={name}
            onChange={handleNameChange}
            placeholder="Project name"
          />
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Start Date</Label>
            <div className="text-sm text-muted-foreground py-2">
              {project.start_date}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="project-end-date">End Date</Label>
            <Input
              id="project-end-date"
              type="date"
              value={endDate}
              onChange={handleEndDateChange}
            />
          </div>
        </div>

        <Separator />

        {/* Team Members */}
        <div className="space-y-2">
          <Label>Team Members</Label>
          <div className="flex flex-wrap gap-2">
            {members.map((m) => (
              <span
                key={m.id}
                className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-sm"
              >
                {m.first_name} {m.last_name}
                <button
                  className="ml-0.5 rounded p-0.5 text-muted-foreground hover:text-destructive"
                  onClick={() => handleRemoveMember(m.id)}
                  title="Remove member"
                >
                  <XIcon className="size-3" />
                </button>
              </span>
            ))}
          </div>
          {availableMembers.length > 0 && (
            <select
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              value=""
              onChange={(e) => {
                const id = Number(e.target.value);
                if (id) handleAddMember(id);
              }}
            >
              <option value="">Add a team member...</option>
              {availableMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.first_name} {m.last_name}
                </option>
              ))}
            </select>
          )}
        </div>

        <Separator />

        {/* Status Items */}
        <CheckableList
          title="Status"
          items={statusItems as BaseCheckableItem[]}
          onAdd={(text) => addProjectStatusItem(project.id, text) as Promise<BaseCheckableItem>}
          onUpdate={(id, text, checked) => updateProjectStatusItem(id, text, checked)}
          onDelete={deleteProjectStatusItem}
          onItemsChange={(items) => setStatusItems(items as ProjectStatusItem[])}
        />

        <Separator />

        {/* Notes */}
        <div className="space-y-2">
          <Label htmlFor="project-notes">Notes</Label>
          <Textarea
            id="project-notes"
            value={notes}
            onChange={handleNotesChange}
            placeholder="Write notes in markdown..."
            className="min-h-[120px] font-mono text-sm"
          />
          {notes && (
            <div className="prose prose-sm dark:prose-invert max-w-none rounded-md border p-4">
              <ReactMarkdown>{notes}</ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/projects/ProjectDetail.tsx
git commit -m "feat: add ProjectDetail component"
```

### Task 13: Create Projects page

**Files:**
- Create: `src/pages/Projects.tsx`

- [ ] **Step 1: Write Projects page**

```typescript
import { useState, useEffect, useCallback } from "react";
import { ProjectList } from "@/components/projects/ProjectList";
import { ProjectDetail } from "@/components/projects/ProjectDetail";
import { getProjects, createProject, deleteProject } from "@/lib/db";
import type { Project } from "@/lib/types";

export function Projects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const loadProjects = useCallback(async () => {
    const data = await getProjects();
    setProjects(data);
  }, []);

  useEffect(() => {
    let cancelled = false;
    getProjects().then((data) => {
      if (!cancelled) setProjects(data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCreate = async () => {
    const project = await createProject();
    await loadProjects();
    setSelectedId(project.id);
  };

  const handleDelete = async (id: number) => {
    await deleteProject(id);
    if (selectedId === id) setSelectedId(null);
    await loadProjects();
  };

  const handleProjectChange = (field: string, value: string | null) => {
    setProjects((prev) =>
      prev.map((p) => (p.id === selectedId ? { ...p, [field]: value } : p)),
    );
  };

  const selectedProject = projects.find((p) => p.id === selectedId) ?? null;

  return (
    <div className="flex h-full">
      <ProjectList
        projects={projects}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onCreate={handleCreate}
        onDelete={handleDelete}
      />
      <div className="flex-1 overflow-auto">
        {selectedProject ? (
          <ProjectDetail
            key={selectedProject.id}
            project={selectedProject}
            onProjectChange={handleProjectChange}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            Select a project to view details
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/pages/Projects.tsx
git commit -m "feat: add Projects page component"
```

### Task 14: Add route and sidebar navigation

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Add Projects route to App.tsx**

Add import at line 6 (after SalaryPlanner import):
```typescript
import { Projects } from "./pages/Projects";
```

Add route at line 41 (between the `/` and `/titles` routes):
```tsx
          <Route path="/projects" element={<Projects />} />
```

- [ ] **Step 2: Add Projects nav item to Sidebar.tsx**

Change the lucide-react import (line 2) from:
```typescript
import { Users, BadgeCheck, DollarSign, Settings, PanelLeftClose, PanelLeft } from "lucide-react";
```
to:
```typescript
import { Users, FolderKanban, BadgeCheck, DollarSign, Settings, PanelLeftClose, PanelLeft } from "lucide-react";
```

Change the `navItems` array (lines 12-16) from:
```typescript
const navItems = [
  { to: "/", icon: Users, label: "Team Members" },
  { to: "/titles", icon: BadgeCheck, label: "Titles" },
  { to: "/salary", icon: DollarSign, label: "Salary Planner" },
];
```
to:
```typescript
const navItems = [
  { to: "/", icon: Users, label: "Team Members" },
  { to: "/projects", icon: FolderKanban, label: "Projects" },
  { to: "/titles", icon: BadgeCheck, label: "Titles" },
  { to: "/salary", icon: DollarSign, label: "Salary Planner" },
];
```

- [ ] **Step 3: Verify no TypeScript errors**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/components/layout/Sidebar.tsx
git commit -m "feat: add Projects route and sidebar navigation"
```

### Task 15: Manual smoke test

- [ ] **Step 1: Start the app**

Run: `npm run tauri dev`

- [ ] **Step 2: Verify the following manually**

1. "Projects" appears in sidebar between "Team Members" and "Titles"
2. Clicking it shows the split view with empty state
3. Creating a project works (+ button), auto-selects it
4. Name field auto-saves on blur/debounce
5. Start date shows today, is read-only
6. End date can be set; project moves to "Finished" section (collapsed by default)
7. Team members can be added via dropdown, removed via X
8. Status items work (add, check, edit, delete)
9. Notes textarea renders markdown preview below
10. Deleting a project shows AlertDialog confirmation
