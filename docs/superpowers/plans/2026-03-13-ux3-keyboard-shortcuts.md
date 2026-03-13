# UX3: Keyboard Shortcuts & Quick Navigation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add keyboard shortcuts, a Cmd+K command palette, and arrow key list navigation to make MySquad fast for daily use.

**Architecture:** Global keyboard shortcuts are handled by a `useEffect` keydown listener in `AppLayout.tsx`. The command palette uses shadcn/ui's `command` component (built on cmdk). Arrow key navigation is added to each list component via `onKeyDown` handlers on the `<ul>` elements.

**Tech Stack:** cmdk (via shadcn command component), React Router `useNavigate`, existing shadcn Dialog.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/components/layout/CommandPalette.tsx` | Create | Cmd+K searchable palette with team members, projects, titles, pages, actions |
| `src/components/layout/ShortcutHelp.tsx` | Create | Cmd+/ overlay showing all keyboard shortcuts |
| `src/components/layout/AppLayout.tsx` | Modify | Mount CommandPalette & ShortcutHelp, add global keydown listener for Cmd+1-5, Cmd+N, Cmd+Backspace |
| `src/components/team/MemberList.tsx` | Modify | Add arrow key navigation to list |
| `src/components/projects/ProjectList.tsx` | Modify | Add arrow key navigation to list |
| `src/components/titles/TitleList.tsx` | Modify | Add arrow key navigation to list |
| `src/components/salary/DataPointList.tsx` | Modify | Add arrow key navigation to list |
| `src/components/reports/ReportList.tsx` | Modify | Add arrow key navigation to list |

---

### Task 1: Install shadcn command component

- [ ] **Step 1: Add shadcn command component**

```bash
npx shadcn@latest add command
```

This installs the `cmdk` dependency and creates `src/components/ui/command.tsx`.

- [ ] **Step 2: Add shadcn dialog component (dependency for command)**

```bash
npx shadcn@latest add dialog
```

- [ ] **Step 3: Verify the components were created**

```bash
ls src/components/ui/command.tsx src/components/ui/dialog.tsx
```

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/command.tsx src/components/ui/dialog.tsx package.json package-lock.json
git commit -m "feat(ux3): add shadcn command and dialog components"
```

---

### Task 2: Create CommandPalette component

**Files:**
- Create: `src/components/layout/CommandPalette.tsx`

- [ ] **Step 1: Create CommandPalette.tsx**

```tsx
import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Users,
  FolderKanban,
  BadgeCheck,
  DollarSign,
  FileText,
  Settings,
  Plus,
} from "lucide-react";
import { getTeamMembers, getProjects, getTitles } from "@/lib/db";
import type { TeamMember, Project, Title } from "@/lib/types";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const pages = [
  { name: "Team Members", path: "/", icon: Users },
  { name: "Projects", path: "/projects", icon: FolderKanban },
  { name: "Titles", path: "/titles", icon: BadgeCheck },
  { name: "Salary Planner", path: "/salary", icon: DollarSign },
  { name: "Reports", path: "/reports", icon: FileText },
  { name: "Settings", path: "/settings", icon: Settings },
];

const actions = [
  { name: "New Team Member", path: "/", action: "create-member", icon: Plus },
  { name: "New Project", path: "/projects", action: "create-project", icon: Plus },
  { name: "New Title", path: "/titles", action: "create-title", icon: Plus },
  { name: "New Report", path: "/reports", action: "create-report", icon: Plus },
  { name: "New Data Point", path: "/salary", action: "create-datapoint", icon: Plus },
];

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [titles, setTitles] = useState<Title[]>([]);

  useEffect(() => {
    if (!open) return;
    Promise.all([getTeamMembers(), getProjects(), getTitles()]).then(
      ([m, p, t]) => {
        setMembers(m);
        setProjects(p);
        setTitles(t);
      },
    );
  }, [open]);

  const runCommand = useCallback(
    (callback: () => void) => {
      onOpenChange(false);
      callback();
    },
    [onOpenChange],
  );

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Team Members">
          {members.map((m) => (
            <CommandItem
              key={`member-${m.id}`}
              value={`${m.first_name} ${m.last_name}`}
              onSelect={() =>
                runCommand(() =>
                  navigate("/", { state: { memberId: m.id } }),
                )
              }
            >
              <Users className="mr-2 h-4 w-4" />
              {m.first_name} {m.last_name}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandGroup heading="Projects">
          {projects.map((p) => (
            <CommandItem
              key={`project-${p.id}`}
              value={p.name || "Untitled Project"}
              onSelect={() =>
                runCommand(() =>
                  navigate("/projects", { state: { projectId: p.id } }),
                )
              }
            >
              <FolderKanban className="mr-2 h-4 w-4" />
              {p.name || "Untitled Project"}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandGroup heading="Pages">
          {pages.map((page) => (
            <CommandItem
              key={page.path}
              value={page.name}
              onSelect={() => runCommand(() => navigate(page.path))}
            >
              <page.icon className="mr-2 h-4 w-4" />
              {page.name}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandGroup heading="Actions">
          {actions.map((action) => (
            <CommandItem
              key={action.action}
              value={action.name}
              onSelect={() =>
                runCommand(() =>
                  navigate(action.path, { state: { action: action.action } }),
                )
              }
            >
              <action.icon className="mr-2 h-4 w-4" />
              {action.name}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
```

- [ ] **Step 2: Verify no TypeScript errors**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/CommandPalette.tsx
git commit -m "feat(ux3): add command palette component"
```

---

### Task 3: Create ShortcutHelp component

**Files:**
- Create: `src/components/layout/ShortcutHelp.tsx`

- [ ] **Step 1: Create ShortcutHelp.tsx**

```tsx
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ShortcutHelpProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const shortcuts = [
  { keys: "⌘ K", description: "Open command palette" },
  { keys: "⌘ N", description: "Create new item" },
  { keys: "⌘ ⌫", description: "Delete selected item" },
  { keys: "⌘ 1–5", description: "Navigate to page" },
  { keys: "↑ / ↓", description: "Move selection in list" },
  { keys: "Escape", description: "Deselect / close" },
  { keys: "⌘ /", description: "Show this help" },
];

export function ShortcutHelp({ open, onOpenChange }: ShortcutHelpProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
        </DialogHeader>
        <div className="grid gap-2">
          {shortcuts.map((s) => (
            <div
              key={s.keys}
              className="flex items-center justify-between py-1"
            >
              <span className="text-sm text-muted-foreground">
                {s.description}
              </span>
              <kbd className="rounded bg-muted px-2 py-1 text-xs font-mono">
                {s.keys}
              </kbd>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/layout/ShortcutHelp.tsx
git commit -m "feat(ux3): add keyboard shortcut help dialog"
```

---

### Task 4: Wire up global shortcuts in AppLayout

**Files:**
- Modify: `src/components/layout/AppLayout.tsx`

- [ ] **Step 1: Update AppLayout to mount palette, help dialog, and global keydown handler**

AppLayout needs:
1. State for `paletteOpen` and `helpOpen`
2. Import and mount `CommandPalette` and `ShortcutHelp`
3. `useEffect` with keydown listener for: Cmd+K (palette), Cmd+/ (help), Cmd+1-5 (nav), Cmd+N (create action via navigate state), Cmd+Backspace (delete action via navigate state)

The global keydown handler uses `useNavigate` and maps Cmd+1-5 to the sidebar `navItems` paths: `["/", "/projects", "/titles", "/salary", "/reports"]`.

Cmd+N and Cmd+Backspace dispatch via `navigate(currentPath, { state: { action: "..." } })` — the page components will react to these via `location.state`.

```tsx
import { useState, useEffect } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { CommandPalette } from "./CommandPalette";
import { ShortcutHelp } from "./ShortcutHelp";
import { Toaster } from "@/components/ui/sonner";

const navPaths = ["/", "/projects", "/titles", "/salary", "/reports"];

export function AppLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Skip if user is typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.metaKey && e.key === "k") {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }

      if (e.metaKey && e.key === "/") {
        e.preventDefault();
        setHelpOpen((prev) => !prev);
        return;
      }

      // Cmd+1 through Cmd+5
      if (e.metaKey && e.key >= "1" && e.key <= "5") {
        e.preventDefault();
        const index = parseInt(e.key) - 1;
        if (navPaths[index]) navigate(navPaths[index]);
        return;
      }

      // Cmd+N — create new item
      if (e.metaKey && e.key === "n") {
        e.preventDefault();
        navigate(location.pathname, {
          state: { action: "create" },
          replace: true,
        });
        return;
      }

      // Cmd+Backspace — delete selected item
      if (e.metaKey && e.key === "Backspace") {
        e.preventDefault();
        navigate(location.pathname, {
          state: { action: "delete" },
          replace: true,
        });
        return;
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [navigate, location.pathname]);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
      <Toaster />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <ShortcutHelp open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  );
}
```

- [ ] **Step 2: Verify no TypeScript errors**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/AppLayout.tsx
git commit -m "feat(ux3): wire global keyboard shortcuts in AppLayout"
```

---

### Task 5: Handle Cmd+N and Cmd+Backspace actions in page components

**Files:**
- Modify: `src/pages/TeamMembers.tsx`
- Modify: `src/pages/Projects.tsx`
- Modify: `src/pages/Titles.tsx`
- Modify: `src/pages/SalaryPlanner.tsx`
- Modify: `src/pages/Reports.tsx`

Each page needs to watch `location.state` for `action: "create"` and `action: "delete"`, and also handle `location.state` for item selection from the command palette (e.g., `memberId`, `projectId`).

- [ ] **Step 1: Update TeamMembers.tsx**

Add a `useEffect` that watches `location.state` for:
- `action: "create"` → call `handleCreate()`
- `action: "delete"` → trigger delete of `selectedId`
- `memberId` → select that member (already handled in initial state)

Add after the existing `useEffect` blocks:

```tsx
useEffect(() => {
  const state = location.state;
  if (!state) return;
  // Clear state so it doesn't re-trigger
  window.history.replaceState({}, "");

  if (state.action === "create" || state.action === "create-member") {
    handleCreate();
  } else if (state.action === "delete" && selectedId !== null) {
    handleDelete(selectedId);
  } else if (state.memberId) {
    setSelectedId(state.memberId);
  }
}, [location.state]);
```

- [ ] **Step 2: Update Projects.tsx**

Same pattern — watch for `create`/`create-project`, `delete`, and `projectId`:

```tsx
const location = useLocation(); // add import

useEffect(() => {
  const state = location.state;
  if (!state) return;
  window.history.replaceState({}, "");

  if (state.action === "create" || state.action === "create-project") {
    handleCreate();
  } else if (state.action === "delete" && selectedId !== null) {
    handleDelete(selectedId);
  } else if (state.projectId) {
    setSelectedId(state.projectId);
  }
}, [location.state]);
```

- [ ] **Step 3: Update Titles.tsx**

```tsx
const location = useLocation(); // add import

useEffect(() => {
  const state = location.state;
  if (!state) return;
  window.history.replaceState({}, "");

  if (state.action === "create" || state.action === "create-title") {
    handleCreate();
  } else if (state.action === "delete" && selectedId !== null) {
    handleDelete(selectedId);
  }
}, [location.state]);
```

- [ ] **Step 4: Update SalaryPlanner.tsx**

```tsx
const location = useLocation(); // add import

useEffect(() => {
  const state = location.state;
  if (!state) return;
  window.history.replaceState({}, "");

  if (state.action === "create" || state.action === "create-datapoint") {
    handleCreate();
  } else if (state.action === "delete" && selectedId !== null) {
    handleDelete(selectedId);
  }
}, [location.state]);
```

- [ ] **Step 5: Update Reports.tsx**

```tsx
const location = useLocation(); // add import

useEffect(() => {
  const state = location.state;
  if (!state) return;
  window.history.replaceState({}, "");

  if (state.action === "create" || state.action === "create-report") {
    handleCreate();
  } else if (state.action === "delete" && selectedId !== null) {
    handleDelete(selectedId);
  }
}, [location.state]);
```

- [ ] **Step 6: Verify no TypeScript errors**

```bash
npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add src/pages/TeamMembers.tsx src/pages/Projects.tsx src/pages/Titles.tsx src/pages/SalaryPlanner.tsx src/pages/Reports.tsx
git commit -m "feat(ux3): handle Cmd+N/Cmd+Backspace and palette navigation in page components"
```

---

### Task 6: Add arrow key navigation to all list components

**Files:**
- Modify: `src/components/team/MemberList.tsx`
- Modify: `src/components/projects/ProjectList.tsx`
- Modify: `src/components/titles/TitleList.tsx`
- Modify: `src/components/salary/DataPointList.tsx`
- Modify: `src/components/reports/ReportList.tsx`

Each list component gets:
1. A `ref` on the `<ul>` element
2. `tabIndex={0}` on the wrapper so it can receive focus
3. An `onKeyDown` handler for ArrowUp, ArrowDown, Enter

- [ ] **Step 1: Update MemberList.tsx**

Add `onKeyDown` to the `<ul>` and make it focusable. The handler finds the currently selected index and moves up/down:

```tsx
// Add to component body:
const handleKeyDown = (e: React.KeyboardEvent) => {
  const ids = members.map((m) => m.id);
  const currentIndex = ids.indexOf(selectedId ?? -1);

  if (e.key === "ArrowDown") {
    e.preventDefault();
    const next = currentIndex < ids.length - 1 ? currentIndex + 1 : 0;
    onSelect(ids[next]);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    const prev = currentIndex > 0 ? currentIndex - 1 : ids.length - 1;
    onSelect(ids[prev]);
  }
};

// On the <ul>:
<ul className="py-1" tabIndex={0} onKeyDown={handleKeyDown}>
```

- [ ] **Step 2: Update ProjectList.tsx**

Same pattern, but uses the `active` array for navigation (not finished projects):

```tsx
const handleKeyDown = (e: React.KeyboardEvent) => {
  const visibleProjects = finishedOpen ? [...active, ...finished] : active;
  const ids = visibleProjects.map((p) => p.id);
  const currentIndex = ids.indexOf(selectedId ?? -1);

  if (e.key === "ArrowDown") {
    e.preventDefault();
    const next = currentIndex < ids.length - 1 ? currentIndex + 1 : 0;
    onSelect(ids[next]);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    const prev = currentIndex > 0 ? currentIndex - 1 : ids.length - 1;
    onSelect(ids[prev]);
  }
};
```

Apply to the `<ul className="py-1">` for active items (add `tabIndex={0}` and `onKeyDown`).

- [ ] **Step 3: Update TitleList.tsx**

```tsx
const handleKeyDown = (e: React.KeyboardEvent) => {
  const ids = titles.map((t) => t.id);
  const currentIndex = ids.indexOf(selectedId ?? -1);

  if (e.key === "ArrowDown") {
    e.preventDefault();
    const next = currentIndex < ids.length - 1 ? currentIndex + 1 : 0;
    onSelect(ids[next]);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    const prev = currentIndex > 0 ? currentIndex - 1 : ids.length - 1;
    onSelect(ids[prev]);
  }
};
```

- [ ] **Step 4: Update DataPointList.tsx**

```tsx
const handleKeyDown = (e: React.KeyboardEvent) => {
  const ids = dataPoints.map((dp) => dp.id);
  const currentIndex = ids.indexOf(selectedId ?? -1);

  if (e.key === "ArrowDown") {
    e.preventDefault();
    const next = currentIndex < ids.length - 1 ? currentIndex + 1 : 0;
    onSelect(ids[next]);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    const prev = currentIndex > 0 ? currentIndex - 1 : ids.length - 1;
    onSelect(ids[prev]);
  }
};
```

- [ ] **Step 5: Update ReportList.tsx**

```tsx
const handleKeyDown = (e: React.KeyboardEvent) => {
  const ids = reports.map((r) => r.id);
  const currentIndex = ids.indexOf(selectedId ?? -1);

  if (e.key === "ArrowDown") {
    e.preventDefault();
    const next = currentIndex < ids.length - 1 ? currentIndex + 1 : 0;
    onSelect(ids[next]);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    const prev = currentIndex > 0 ? currentIndex - 1 : ids.length - 1;
    onSelect(ids[prev]);
  }
};
```

- [ ] **Step 6: Verify no TypeScript errors**

```bash
npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add src/components/team/MemberList.tsx src/components/projects/ProjectList.tsx src/components/titles/TitleList.tsx src/components/salary/DataPointList.tsx src/components/reports/ReportList.tsx
git commit -m "feat(ux3): add arrow key navigation to all list components"
```

---

### Task 7: Final integration test

- [ ] **Step 1: Run full TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 2: Run Vite build**

```bash
npm run build
```

- [ ] **Step 3: Manual smoke test checklist**

Run `npm run dev` and verify:
- Cmd+K opens command palette, typing filters items, Enter navigates, Esc closes
- Cmd+1 through Cmd+5 navigate to correct pages
- Cmd+N creates a new item on the current page
- Cmd+/ shows shortcut help dialog
- Arrow keys move selection in each list panel (after clicking the list to focus it)
- Cmd+Backspace triggers delete confirmation on selected item
