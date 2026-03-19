# Project Links

Add a list of links to each project for quick access to local folders (opened in Finder) and web URLs (opened in browser).

## Requirements

- Each project has an ordered list of links
- A link has a URL (required) and an optional display label
- All links are stored as URLs: web links as `https://...`, local folders as `file:///...`
- Links are clickable — they open in the appropriate app (Finder for `file://`, browser for `https://`)
- Links can be reordered via drag-and-drop
- Folders can be dragged from Finder onto the links section to add them
- Links can be added manually via an inline form (URL + optional label)
- Links can be edited and deleted
- If a label is provided, show it; otherwise show the URL

## Database

New migration adds a `project_links` table:

```sql
CREATE TABLE project_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    label TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

## Backend Commands

Five new Tauri commands following the `project_status_items` pattern:

| Command | Params | Returns | Notes |
|---|---|---|---|
| `get_project_links` | `project_id` | `ProjectLink[]` | Ordered by `sort_order ASC` |
| `add_project_link` | `project_id, url, label` | `ProjectLink` | Sets `sort_order` to max+1 |
| `update_project_link` | `id, url?, label?` | `()` | Conditional updates for url and/or label. Passing empty string for label clears it to null. |
| `delete_project_link` | `id` | `()` | Hard delete |
| `reorder_project_links` | `project_id, link_ids` | `()` | Receives ordered array of IDs, bulk-updates `sort_order` to match array index in a transaction |

## Frontend

### Types (`src/lib/types.ts`)

```typescript
interface ProjectLink {
  id: number;
  project_id: number;
  url: string;
  label: string | null;
  sort_order: number;
  created_at: string;
}
```

### API (`src/lib/db.ts`)

Five new functions matching the backend commands: `getProjectLinks`, `addProjectLink`, `updateProjectLink`, `deleteProjectLink`, `reorderProjectLinks`.

### UI (`src/components/projects/ProjectDetail.tsx`)

New "Links" section placed after the date fields, before Notes.

**Link list:**
- Each link shows an auto-detected icon (folder icon for `file://`, globe icon for `https://`)
- Displays label if provided, otherwise the URL
- Clicking opens via `@tauri-apps/plugin-opener` (already a project dependency)
- Hover reveals edit and delete buttons
- Drag handle for reordering

**Add link:**
- "+" button expands an inline form with URL field + optional label field
- The links section accepts drops from Finder — dropped folder paths are converted to `file://` URLs

**Edit link:**
- Clicking edit turns the link into an inline form (same as add, pre-filled)
- Save calls `update_project_link`

**Reorder:**
- Uses `@dnd-kit/core` + `@dnd-kit/sortable` (new dependency)
- On drop, calls `reorder_project_links` with the new order

**External drag-and-drop (Finder folders):**
- Native browser `drop` event handler on the links section
- Converts dropped file path to `file://` URL and calls `add_project_link`

## New Dependencies

- `@dnd-kit/core` — core drag-and-drop engine
- `@dnd-kit/sortable` — sortable list preset
