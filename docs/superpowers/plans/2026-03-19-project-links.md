# Project Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an ordered list of clickable links (web URLs and local folders) to each project, with drag-to-reorder and Finder drop support.

**Architecture:** New `project_links` table with CRUD + reorder backend commands, mirroring the existing `project_status_items` pattern. Frontend adds a new Links section to ProjectDetail using dnd-kit for sortable reorder and native drop events for Finder folder drops.

**Tech Stack:** Rust/SQLite backend, React + TypeScript frontend, `@dnd-kit/core` + `@dnd-kit/sortable` for drag-and-drop, `@tauri-apps/plugin-opener` for opening links.

---

### Task 1: Database Migration

**Files:**
- Create: `src-tauri/migrations/021_project_links.sql`
- Modify: `src-tauri/src/db.rs:186` (add migration registration)

- [ ] **Step 1: Create migration file**

```sql
-- src-tauri/migrations/021_project_links.sql
CREATE TABLE project_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    label TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_project_links_project_id ON project_links(project_id);
```

- [ ] **Step 2: Register migration in db.rs**

In `src-tauri/src/db.rs`, after the `version < 20` block (line 186), add:

```rust
    if version < 21 {
        let migration_sql = include_str!("../migrations/021_project_links.sql");
        conn.execute_batch(migration_sql)?;
        conn.pragma_update(None, "user_version", 21)?;
    }
```

- [ ] **Step 3: Update test assertions**

Update all `assert_eq!(version, 20)` to `assert_eq!(version, 21)` in `src-tauri/src/db.rs` at lines 272, 372, 388.

- [ ] **Step 4: Run Rust tests**

Run: `cd src-tauri && cargo test`
Expected: All tests pass, migration creates the table correctly.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/migrations/021_project_links.sql src-tauri/src/db.rs
git commit -m "feat: add project_links database migration"
```

---

### Task 2: Backend CRUD Commands

**Files:**
- Modify: `src-tauri/src/commands.rs:999` (after `delete_project_status_item`)
- Modify: `src-tauri/src/lib.rs:161` (register new commands)

- [ ] **Step 1: Add ProjectLink struct and get command**

In `src-tauri/src/commands.rs`, after `delete_project_status_item` (line 999) and before the `// ── Settings commands ──` comment (line 1001), add:

```rust
// ── Project Link commands ──

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProjectLink {
    pub id: i64,
    pub project_id: i64,
    pub url: String,
    pub label: Option<String>,
    pub sort_order: i64,
    pub created_at: String,
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_project_links(
    db: State<AppDb>,
    project_id: i64,
) -> Result<Vec<ProjectLink>, String> {
    let guard = db.conn.lock();
    let conn = guard.as_ref().ok_or("Database not open")?;
    let mut stmt = conn
        .prepare(
            "SELECT id, project_id, url, label, sort_order, created_at
             FROM project_links
             WHERE project_id = ?1
             ORDER BY sort_order ASC",
        )
        .map_err(|e| e.to_string())?;
    let items = stmt
        .query_map(params![project_id], |row| {
            Ok(ProjectLink {
                id: row.get(0)?,
                project_id: row.get(1)?,
                url: row.get(2)?,
                label: row.get(3)?,
                sort_order: row.get(4)?,
                created_at: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(items)
}
```

- [ ] **Step 2: Add add_project_link command**

```rust
#[tauri::command(rename_all = "snake_case")]
pub fn add_project_link(
    db: State<AppDb>,
    project_id: i64,
    url: String,
    label: Option<String>,
) -> Result<ProjectLink, String> {
    let guard = db.conn.lock();
    let conn = guard.as_ref().ok_or("Database not open")?;
    let max_order: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(sort_order), -1) FROM project_links WHERE project_id = ?1",
            params![project_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO project_links (project_id, url, label, sort_order) VALUES (?1, ?2, ?3, ?4)",
        params![project_id, url, label, max_order + 1],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    let created_at: String = conn
        .query_row(
            "SELECT created_at FROM project_links WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(ProjectLink {
        id,
        project_id,
        url,
        label,
        sort_order: max_order + 1,
        created_at,
    })
}
```

- [ ] **Step 3: Add update_project_link command**

```rust
#[tauri::command(rename_all = "snake_case")]
pub fn update_project_link(
    db: State<AppDb>,
    id: i64,
    url: Option<String>,
    label: Option<String>,
) -> Result<(), String> {
    let guard = db.conn.lock();
    let conn = guard.as_ref().ok_or("Database not open")?;
    if let Some(u) = url {
        conn.execute(
            "UPDATE project_links SET url = ?1 WHERE id = ?2",
            params![u, id],
        )
        .map_err(|e| e.to_string())?;
    }
    // Empty string clears label to null
    if let Some(l) = label {
        let val = if l.is_empty() { None } else { Some(l) };
        conn.execute(
            "UPDATE project_links SET label = ?1 WHERE id = ?2",
            params![val, id],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}
```

- [ ] **Step 4: Add delete and reorder commands**

```rust
#[tauri::command(rename_all = "snake_case")]
pub fn delete_project_link(db: State<AppDb>, id: i64) -> Result<(), String> {
    let guard = db.conn.lock();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute("DELETE FROM project_links WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn reorder_project_links(
    db: State<AppDb>,
    project_id: i64,
    link_ids: Vec<i64>,
) -> Result<(), String> {
    let guard = db.conn.lock();
    let conn = guard.as_ref().ok_or("Database not open")?;
    for (i, lid) in link_ids.iter().enumerate() {
        conn.execute(
            "UPDATE project_links SET sort_order = ?1 WHERE id = ?2 AND project_id = ?3",
            params![i as i64, lid, project_id],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}
```

- [ ] **Step 5: Register commands in lib.rs**

In `src-tauri/src/lib.rs`, after line 161 (`commands::delete_project_status_item,`), add:

```rust
            commands::get_project_links,
            commands::add_project_link,
            commands::update_project_link,
            commands::delete_project_link,
            commands::reorder_project_links,
```

- [ ] **Step 6: Run Rust tests**

Run: `cd src-tauri && cargo test`
Expected: All tests pass, no compilation errors.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat: add project link CRUD and reorder backend commands"
```

---

### Task 3: Export/Import Support

**Files:**
- Modify: `src-tauri/src/export_import.rs`

- [ ] **Step 1: Add ExportProjectLink struct**

After `ExportProjectStatusItem` (line 137), add:

```rust
#[derive(Serialize, Deserialize)]
pub struct ExportProjectLink {
    pub id: i64,
    pub project_id: i64,
    pub url: String,
    pub label: Option<String>,
    pub sort_order: i64,
    pub created_at: String,
}
```

- [ ] **Step 2: Add field to ExportData struct**

In the `ExportData` struct (line 6), after the `project_status_items` field (line 21), add:

```rust
    pub project_links: Vec<ExportProjectLink>,
```

- [ ] **Step 3: Add query function**

After `query_project_status_items` (around line 528), add:

```rust
fn query_project_links(conn: &Connection) -> Result<Vec<ExportProjectLink>, String> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, url, label, sort_order, created_at FROM project_links ORDER BY id"
    ).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(ExportProjectLink {
                id: row.get(0)?,
                project_id: row.get(1)?,
                url: row.get(2)?,
                label: row.get(3)?,
                sort_order: row.get(4)?,
                created_at: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}
```

- [ ] **Step 4: Wire into export function**

Find where `query_project_status_items` is called in the export function and add `query_project_links` call nearby. Add the result to the `ExportData` struct construction.

- [ ] **Step 5: Add insert function for overwrite import**

Following the `insert_project_status_items` pattern, add:

```rust
fn insert_project_links(
    conn: &Connection,
    links: &[ExportProjectLink],
    project_map: &HashMap<i64, i64>,
) -> Result<(), String> {
    for l in links {
        if let Some(&new_pid) = project_map.get(&l.project_id) {
            conn.execute(
                "INSERT INTO project_links (project_id, url, label, sort_order, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![new_pid, l.url, l.label, l.sort_order, l.created_at],
            ).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}
```

- [ ] **Step 6: Add upsert function for merge import**

Following the `upsert_project_status_items` pattern, add:

```rust
fn upsert_project_links(
    conn: &Connection,
    links: &[ExportProjectLink],
    project_map: &HashMap<i64, i64>,
) -> Result<(), String> {
    for l in links {
        if let Some(&new_pid) = project_map.get(&l.project_id) {
            let existing: Option<i64> = conn
                .query_row(
                    "SELECT id FROM project_links WHERE project_id = ?1 AND url = ?2",
                    params![new_pid, l.url],
                    |row| row.get(0),
                )
                .optional()
                .map_err(|e| e.to_string())?;
            if let Some(eid) = existing {
                conn.execute(
                    "UPDATE project_links SET label = ?1, sort_order = ?2 WHERE id = ?3",
                    params![l.label, l.sort_order, eid],
                )
                .map_err(|e| e.to_string())?;
            } else {
                conn.execute(
                    "INSERT INTO project_links (project_id, url, label, sort_order, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
                    params![new_pid, l.url, l.label, l.sort_order, l.created_at],
                )
                .map_err(|e| e.to_string())?;
            }
        }
    }
    Ok(())
}
```

- [ ] **Step 7: Wire into import functions**

Add `DELETE FROM project_links;` to the overwrite import's delete chain. Call `insert_project_links` in overwrite mode and `upsert_project_links` in merge mode, both after the project_status_items equivalents.

- [ ] **Step 8: Add default empty vec to test ExportData**

Find the test `ExportData` construction (around line 1398) and add `project_links: vec![],`.

- [ ] **Step 9: Run Rust tests**

Run: `cd src-tauri && cargo test`
Expected: All tests pass.

- [ ] **Step 10: Commit**

```bash
git add src-tauri/src/export_import.rs
git commit -m "feat: add project links to export/import"
```

---

### Task 4: Frontend Types and API

**Files:**
- Modify: `src/lib/types.ts:64` (after ProjectStatusItem)
- Modify: `src/lib/db.ts:244` (after project status item functions)

- [ ] **Step 1: Add ProjectLink type**

In `src/lib/types.ts`, after the `ProjectStatusItem` interface (line 64), add:

```typescript
export interface ProjectLink {
  id: number;
  project_id: number;
  url: string;
  label: string | null;
  sort_order: number;
  created_at: string;
}
```

- [ ] **Step 2: Add API functions**

In `src/lib/db.ts`, after the `deleteProjectStatusItem` function (line 244), add:

```typescript
// Project links
export const getProjectLinks = (projectId: number) =>
  invoke<ProjectLink[]>("get_project_links", { project_id: projectId });
export const addProjectLink = (projectId: number, url: string, label: string | null) =>
  invoke<ProjectLink>("add_project_link", { project_id: projectId, url, label });
export const updateProjectLink = (id: number, url?: string, label?: string) =>
  invoke<void>("update_project_link", { id, url: url ?? null, label: label ?? null });
export const deleteProjectLink = (id: number) =>
  invoke<void>("delete_project_link", { id });
export const reorderProjectLinks = (projectId: number, linkIds: number[]) =>
  invoke<void>("reorder_project_links", { project_id: projectId, link_ids: linkIds });
```

Add `ProjectLink` to the import from `types.ts` at the top of `db.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts src/lib/db.ts
git commit -m "feat: add ProjectLink type and API functions"
```

---

### Task 5: Install dnd-kit Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install packages**

Run: `npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @dnd-kit dependencies for drag-and-drop"
```

---

### Task 6: ProjectLinks Component

**Files:**
- Create: `src/components/projects/ProjectLinks.tsx`

- [ ] **Step 1: Create the ProjectLinks component**

Create `src/components/projects/ProjectLinks.tsx`. This component manages the full links section:

```typescript
import { useState, useEffect, useCallback } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { PlusIcon } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { SortableLink } from "./SortableLink";
import { LinkForm } from "./LinkForm";
import {
  getProjectLinks,
  addProjectLink,
  deleteProjectLink,
  updateProjectLink,
  reorderProjectLinks,
} from "@/lib/db";
import type { ProjectLink } from "@/lib/types";

interface ProjectLinksProps {
  projectId: number;
}

export function ProjectLinks({ projectId }: ProjectLinksProps) {
  const [links, setLinks] = useState<ProjectLink[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  useEffect(() => {
    getProjectLinks(projectId).then(setLinks);
  }, [projectId]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = links.findIndex((l) => l.id === active.id);
      const newIndex = links.findIndex((l) => l.id === over.id);
      const reordered = arrayMove(links, oldIndex, newIndex);
      setLinks(reordered);
      await reorderProjectLinks(
        projectId,
        reordered.map((l) => l.id)
      );
    },
    [links, projectId]
  );

  const handleAdd = async (url: string, label: string) => {
    const link = await addProjectLink(projectId, url, label || null);
    setLinks((prev) => [...prev, link]);
    setShowAddForm(false);
  };

  const handleUpdate = async (id: number, url: string, label: string) => {
    await updateProjectLink(id, url, label);
    setLinks((prev) =>
      prev.map((l) =>
        l.id === id
          ? { ...l, url, label: label || null }
          : l
      )
    );
    setEditingId(null);
  };

  const handleDelete = async (id: number) => {
    await deleteProjectLink(id);
    setLinks((prev) => prev.filter((l) => l.id !== id));
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    for (let i = 0; i < files.length; i++) {
      const path = (files[i] as any).path as string | undefined;
      if (path) {
        const url = `file://${path}`;
        const link = await addProjectLink(projectId, url, null);
        setLinks((prev) => [...prev, link]);
      }
    }
  };

  return (
    <div
      className="space-y-2"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      <div className="flex items-center justify-between">
        <Label>Links</Label>
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          onClick={() => setShowAddForm(true)}
        >
          <PlusIcon className="size-4" />
        </Button>
      </div>

      {links.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={links.map((l) => l.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-1">
              {links.map((link) =>
                editingId === link.id ? (
                  <LinkForm
                    key={link.id}
                    initialUrl={link.url}
                    initialLabel={link.label ?? ""}
                    onSubmit={(url, label) =>
                      handleUpdate(link.id, url, label)
                    }
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <SortableLink
                    key={link.id}
                    link={link}
                    onEdit={() => setEditingId(link.id)}
                    onDelete={() => handleDelete(link.id)}
                  />
                )
              )}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {showAddForm && (
        <LinkForm
          onSubmit={handleAdd}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {links.length === 0 && !showAddForm && (
        <p className="text-sm text-muted-foreground">
          Drop a folder here or click + to add a link
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify frontend compiles**

Run: `npm run build`
Expected: May fail since SortableLink and LinkForm don't exist yet. That's expected — continue to next task.

- [ ] **Step 3: Commit**

```bash
git add src/components/projects/ProjectLinks.tsx
git commit -m "feat: add ProjectLinks container component"
```

---

### Task 7: SortableLink Component

**Files:**
- Create: `src/components/projects/SortableLink.tsx`

- [ ] **Step 1: Create SortableLink component**

```typescript
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { open } from "@tauri-apps/plugin-opener";
import {
  GripVerticalIcon,
  FolderIcon,
  GlobeIcon,
  PencilIcon,
  TrashIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ProjectLink } from "@/lib/types";

interface SortableLinkProps {
  link: ProjectLink;
  onEdit: () => void;
  onDelete: () => void;
}

export function SortableLink({ link, onEdit, onDelete }: SortableLinkProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: link.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isFolder = link.url.startsWith("file://");
  const Icon = isFolder ? FolderIcon : GlobeIcon;

  const displayText = link.label || link.url;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50 ${
        isDragging ? "opacity-50" : ""
      }`}
    >
      <button
        className="cursor-grab text-muted-foreground hover:text-foreground"
        {...attributes}
        {...listeners}
      >
        <GripVerticalIcon className="size-4" />
      </button>

      <Icon className="size-4 shrink-0 text-muted-foreground" />

      <button
        className="min-w-0 flex-1 truncate text-left hover:underline"
        onClick={() => open(link.url)}
        title={link.url}
      >
        {displayText}
      </button>

      <div className="flex shrink-0 gap-0.5 opacity-0 group-hover:opacity-100">
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          onClick={onEdit}
        >
          <PencilIcon className="size-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          onClick={onDelete}
        >
          <TrashIcon className="size-3" />
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/projects/SortableLink.tsx
git commit -m "feat: add SortableLink component with drag handle"
```

---

### Task 8: LinkForm Component

**Files:**
- Create: `src/components/projects/LinkForm.tsx`

- [ ] **Step 1: Create LinkForm component**

```typescript
import { useState } from "react";
import { CheckIcon, XIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface LinkFormProps {
  initialUrl?: string;
  initialLabel?: string;
  onSubmit: (url: string, label: string) => void;
  onCancel: () => void;
}

export function LinkForm({
  initialUrl = "",
  initialLabel = "",
  onSubmit,
  onCancel,
}: LinkFormProps) {
  const [url, setUrl] = useState(initialUrl);
  const [label, setLabel] = useState(initialLabel);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    onSubmit(url.trim(), label.trim());
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <Input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="URL or file path..."
        className="h-8 flex-1 text-sm"
        autoFocus
      />
      <Input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Label (optional)"
        className="h-8 w-32 text-sm"
      />
      <Button
        type="submit"
        variant="ghost"
        size="icon"
        className="size-6"
        disabled={!url.trim()}
      >
        <CheckIcon className="size-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-6"
        onClick={onCancel}
      >
        <XIcon className="size-4" />
      </Button>
    </form>
  );
}
```

- [ ] **Step 2: Verify frontend compiles**

Run: `npm run build`
Expected: PASS — all components exist now.

- [ ] **Step 3: Commit**

```bash
git add src/components/projects/LinkForm.tsx
git commit -m "feat: add LinkForm inline component for add/edit"
```

---

### Task 9: Integrate Links into ProjectDetail

**Files:**
- Modify: `src/components/projects/ProjectDetail.tsx`

- [ ] **Step 1: Add import**

At the top of `ProjectDetail.tsx`, add:

```typescript
import { ProjectLinks } from "./ProjectLinks";
```

- [ ] **Step 2: Add Links section to the template**

In the JSX, after the dates section (line 136, after the closing `</div>` of the grid) and before the first `<Separator />` (line 138), insert:

```tsx
        <Separator />

        {/* Links */}
        <ProjectLinks projectId={project.id} />
```

- [ ] **Step 3: Verify frontend compiles**

Run: `npm run build`
Expected: PASS

- [ ] **Step 4: Manual test**

Run: `npm run tauri dev`
- Navigate to Projects, select a project
- Verify the Links section appears after dates, before Team Members
- Add a link manually (URL + label)
- Add a link with URL only
- Edit a link
- Delete a link
- Reorder links by dragging
- Drag a folder from Finder onto the links section
- Click a web link — should open in browser
- Click a folder link — should open in Finder

- [ ] **Step 5: Commit**

```bash
git add src/components/projects/ProjectDetail.tsx
git commit -m "feat: integrate ProjectLinks section into ProjectDetail"
```
