# Projects View Design Spec

## Overview

Add a "Projects" view to MySquad using the standard split-view pattern. Projects track work with a name, date range, assigned team members, status items, and markdown notes.

## Data Model

### New Tables (Migration 003)

**`projects`**
| Column | Type | Constraints |
|---|---|---|
| id | INTEGER | PRIMARY KEY |
| name | TEXT | NOT NULL DEFAULT '' |
| start_date | TEXT | NOT NULL DEFAULT (date('now')) |
| end_date | TEXT | NULL |
| notes | TEXT | NULL |
| created_at | TEXT | NOT NULL DEFAULT (datetime('now')) |
| updated_at | TEXT | NOT NULL DEFAULT (datetime('now')) |

**`project_members`**
| Column | Type | Constraints |
|---|---|---|
| id | INTEGER | PRIMARY KEY |
| project_id | INTEGER | NOT NULL FK→projects ON DELETE CASCADE |
| team_member_id | INTEGER | NOT NULL FK→team_members ON DELETE CASCADE |
| UNIQUE(project_id, team_member_id) | | |

**`project_status_items`**
| Column | Type | Constraints |
|---|---|---|
| id | INTEGER | PRIMARY KEY |
| project_id | INTEGER | NOT NULL FK→projects ON DELETE CASCADE |
| text | TEXT | NOT NULL |
| checked | INTEGER | NOT NULL DEFAULT 0 |
| created_at | TEXT | NOT NULL DEFAULT (datetime('now')) |

An `updated_at` trigger on `projects` mirrors the existing `team_members` pattern.

### TypeScript Types

```typescript
interface Project {
  id: number;
  name: string;
  start_date: string;
  end_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface ProjectMember {
  id: number;
  project_id: number;
  team_member_id: number;
  first_name: string;
  last_name: string;
}

// Reuse existing CheckableItem with project_id instead of team_member_id
interface ProjectStatusItem {
  id: number;
  project_id: number;
  text: string;
  checked: boolean;
  created_at: string;
}
```

## Rust Backend

### New Tauri Commands

| Command | Parameters | Returns | Description |
|---|---|---|---|
| `get_projects` | — | `Vec<Project>` | All projects ordered by end_date IS NULL DESC, name |
| `create_project` | — | `Project` | Insert with defaults, return new row |
| `update_project` | id, field, value | — | Field-level update (name, start_date, end_date, notes) |
| `delete_project` | id | — | CASCADE deletes members + status items |
| `get_project_members` | project_id | `Vec<ProjectMember>` | Members with first/last name joined from team_members |
| `add_project_member` | project_id, team_member_id | `ProjectMember` | Insert, return with name |
| `remove_project_member` | id | — | Delete by junction table id |
| `get_project_status_items` | project_id | `Vec<ProjectStatusItem>` | All status items for a project |
| `add_project_status_item` | project_id, text | `ProjectStatusItem` | Insert, return new row |
| `update_project_status_item` | id, text?, checked? | — | Partial update |
| `delete_project_status_item` | id | — | Delete by id |

## Frontend

### Navigation

- Add "Projects" to sidebar between "Team Members" and "Titles"
- Icon: `FolderKanban` from lucide-react
- Route: `/projects`

### Page: `src/pages/Projects.tsx`

Standard split-view container following `TeamMembers.tsx` pattern:
- State: projects list, selectedId
- Handlers: create, delete, field change
- Renders `ProjectList` (left) + `ProjectDetail` (right) or empty state

### Left Panel: `src/components/projects/ProjectList.tsx`

- `w-64 shrink-0 border-r` layout
- Header: `h-12 border-b` with "Projects" title + add button
- **Active projects** listed first (no end_date), sorted by name
- **Finished projects** (end_date set) collapsed in a collapsible section at the bottom, using a simple disclosure toggle
- Selection: `bg-muted` selected, `hover:bg-muted/50` hover
- Delete: hover-triggered AlertDialog confirmation

### Right Panel: `src/components/projects/ProjectDetail.tsx`

`h-full overflow-auto` → inner `max-w-2xl p-6 space-y-6`. Sections separated by `<Separator>`:

1. **Name** — text input, auto-saved via `useAutoSave`
2. **Dates** — start date (displayed, read-only) + end date (date picker input, nullable; setting it marks project as finished)
3. **Team Members** — displays assigned members as badges; a dropdown/combobox to add from existing team members (filtered to exclude already-assigned); remove button on each badge
4. **Status Items** — reuses `CheckableList` component with project-specific callbacks. The `CheckableItem` interface is compatible since it only needs id, text, checked, created_at. The `team_member_id` field will be mapped to `project_id` in the project-specific type.
5. **Notes** — `<textarea>` for editing with `useAutoSave`; below it, a live markdown preview rendered with `react-markdown`. Always visible, no toggle.

### CheckableList Reuse

The existing `CheckableList` accepts `items: CheckableItem[]` and callback props. For projects, we pass `ProjectStatusItem` objects — they share the same shape needed by CheckableList (id, text, checked, created_at). The `onAdd`/`onUpdate`/`onDelete` callbacks will call the project-specific db functions.

Since `CheckableItem` has `team_member_id` and `ProjectStatusItem` has `project_id`, we'll either:
- Cast/map at the boundary (simplest, no component changes), or
- Generalize `CheckableItem` to drop the owner field (the component doesn't use it anyway)

Recommendation: cast at the boundary to avoid touching existing code.

## Dependencies

- `react-markdown` — npm package for rendering markdown preview

## Migration File

`src-tauri/migrations/003_projects.sql` — creates tables, trigger, sets `PRAGMA user_version = 3`.
