# UX3: Keyboard Shortcuts & Quick Navigation

## Overview

Add keyboard shortcuts for common actions and a `Cmd+K` command palette for fast navigation. This transforms MySquad from a click-heavy app into one that rewards daily use.

## Problem

- No keyboard shortcuts exist beyond default browser tab/focus behavior
- Navigating between sections requires mouse clicks on the sidebar
- Creating new items requires finding and clicking small icon buttons
- No way to quickly find a specific team member, project, or title
- Power users (team leads using this daily) have no way to speed up workflows

## Design

### Command Palette (Cmd+K)

Add `cmdk` package (the library behind shadcn/ui's command component): `npx shadcn@latest add command`

**Behavior:**
- `Cmd+K` opens the palette from anywhere in the app
- Searchable list of all navigable items grouped by type:
  - **Team Members** — each member listed by name, navigates to member detail
  - **Projects** — each project listed by name
  - **Pages** — Team Members, Projects, Titles, Salary Planner, Reports, Settings
  - **Actions** — "New Team Member", "New Project", "New Title", "New Report", "New Data Point"
- Fuzzy search across all items
- `Enter` to select, `Esc` to close, arrow keys to navigate
- Recent items shown when the palette opens with no query

**Component:** `src/components/layout/CommandPalette.tsx`
- Mounted in `AppLayout.tsx`
- Fetches team members, projects, and titles on open (not eagerly — data stays fresh)
- Uses React Router's `useNavigate` to navigate + set selection state

### Global keyboard shortcuts

Register via `useEffect` in `AppLayout.tsx` with a `keydown` listener:

| Shortcut | Action | Context |
|----------|--------|---------|
| `Cmd+K` | Open command palette | Global |
| `Cmd+N` | Create new item in current view | Any list page |
| `Cmd+Backspace` | Delete selected item (with confirmation) | When item selected |
| `Cmd+1` through `Cmd+5` | Navigate to page (Team, Projects, Titles, Salary, Reports) | Global |
| `↑` / `↓` | Move selection in list panel | When list panel focused |
| `Escape` | Deselect current item / close palette | When item selected or palette open |

### Shortcut hint display

Add a `Cmd+/` shortcut that opens a small overlay showing all available shortcuts (similar to GitHub's `?` shortcut help). Simple dialog with a two-column table of shortcuts.

**Component:** `src/components/layout/ShortcutHelp.tsx`

### Arrow key navigation in lists

Each list component (`MemberList`, `ProjectList`, `TitleList`, etc.) gets keyboard handling:
- `↑`/`↓` moves the highlight through the list
- `Enter` selects the highlighted item
- The list panel must be focused (clicking on it or pressing `Tab`)

### Integration with existing navigation

- Sidebar `Cmd+1`–`Cmd+5` shortcuts map to the `navItems` array order
- Command palette "New X" actions call the same `handleCreate` functions already on each page
- Navigation from palette uses the same `location.state` pattern as the existing Titles → Member link

## Files affected

- `src/components/layout/CommandPalette.tsx` — new file
- `src/components/layout/ShortcutHelp.tsx` — new file
- `src/components/layout/AppLayout.tsx` — mount CommandPalette, ShortcutHelp, global keydown listener
- `src/components/team/MemberList.tsx` — arrow key navigation
- `src/components/projects/ProjectList.tsx` — arrow key navigation
- `src/pages/Titles.tsx` — arrow key navigation in title list
- `src/pages/SalaryPlanner.tsx` — arrow key navigation in data point list
- `src/pages/Reports.tsx` — arrow key navigation in report list
