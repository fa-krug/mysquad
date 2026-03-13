# P6: Virtualized Lists Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add list virtualization using `@tanstack/react-virtual` so only visible items render in the DOM, with a threshold of 30 items below which lists render normally.

**Architecture:** A shared `useVirtualList` hook encapsulates virtualizer setup, keyboard-nav `scrollToIndex`, and the threshold check. Each sidebar list component conditionally switches between its current rendering and a virtualized path. `ScrollArea` is replaced with a plain `overflow-y: auto` div when virtualized to avoid fighting Radix internals. CheckableList virtualizes only the unchecked section.

**Tech Stack:** `@tanstack/react-virtual`, React hooks

---

## Chunk 1: Foundation + Sidebar Lists

### Task 1: Install @tanstack/react-virtual

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install the package**

```bash
npm install @tanstack/react-virtual
```

- [ ] **Step 2: Verify installation**

```bash
npm ls @tanstack/react-virtual
```

Expected: shows the installed version

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(p6): install @tanstack/react-virtual"
```

---

### Task 2: Create useVirtualList hook

**Files:**
- Create: `src/hooks/useVirtualList.ts`

This hook wraps `useVirtualizer` with the app's common patterns: threshold check, scroll container ref, and a `scrollToIndex` helper for keyboard navigation.

- [ ] **Step 1: Create the hook**

```ts
import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

const VIRTUALIZE_THRESHOLD = 30;

interface UseVirtualListOptions {
  count: number;
  estimateSize: number;
  enabled?: boolean;
}

export function useVirtualList({
  count,
  estimateSize,
  enabled = true,
}: UseVirtualListOptions) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const shouldVirtualize = enabled && count > VIRTUALIZE_THRESHOLD;

  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimateSize,
    enabled: shouldVirtualize,
  });

  return {
    scrollRef,
    shouldVirtualize,
    virtualizer,
    totalSize: virtualizer.getTotalSize(),
    virtualItems: virtualizer.getVirtualItems(),
  };
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: no TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useVirtualList.ts
git commit -m "feat(p6): add useVirtualList hook"
```

---

### Task 3: Virtualize MemberList

**Files:**
- Modify: `src/components/team/MemberList.tsx`

MemberList has arrow key navigation that must call `scrollToIndex` when virtualized. Row height is ~40px (`py-2` padding + content).

- [ ] **Step 1: Update MemberList to use virtualization**

Replace imports — remove `ScrollArea`, add `useVirtualList`:

```tsx
import { useVirtualList } from "@/hooks/useVirtualList";
// Remove: import { ScrollArea } from "@/components/ui/scroll-area";
```

Add the hook inside the component:

```tsx
const { scrollRef, shouldVirtualize, virtualizer, totalSize, virtualItems } =
  useVirtualList({ count: members.length, estimateSize: 40 });
```

Update `handleKeyDown` to call `scrollToIndex` when virtualized:

```tsx
const handleKeyDown = (e: React.KeyboardEvent) => {
  const ids = members.map((m) => m.id);
  const currentIndex = ids.indexOf(selectedId ?? -1);

  if (e.key === "ArrowDown") {
    e.preventDefault();
    const next = currentIndex < ids.length - 1 ? currentIndex + 1 : 0;
    onSelect(ids[next]);
    if (shouldVirtualize) virtualizer.scrollToIndex(next);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    const prev = currentIndex > 0 ? currentIndex - 1 : ids.length - 1;
    onSelect(ids[prev]);
    if (shouldVirtualize) virtualizer.scrollToIndex(prev);
  }
};
```

Replace the `<ScrollArea className="flex-1">` wrapper and list body. The full list section becomes:

```tsx
{/* List */}
<div ref={scrollRef} className="flex-1 overflow-y-auto">
  {loading ? (
    <ListSkeleton showAvatar />
  ) : members.length === 0 ? (
    <div className="px-3 py-6 text-center text-sm text-muted-foreground">
      No team members yet
    </div>
  ) : shouldVirtualize ? (
    <ul
      className="py-1 outline-none relative"
      style={{ height: totalSize }}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {virtualItems.map((virtualRow) => {
        const member = members[virtualRow.index];
        return (
          <li
            key={member.id}
            className={`group absolute left-0 w-full flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/50 ${
              selectedId === member.id ? "bg-muted" : ""
            }`}
            style={{
              top: virtualRow.start,
              height: virtualRow.size,
            }}
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
              {member.title_name && (
                <div className="text-xs text-muted-foreground truncate">
                  {member.title_name}
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
      })}
    </ul>
  ) : (
    <ul className="py-1 outline-none" tabIndex={0} onKeyDown={handleKeyDown}>
      {members.map((member) => (
        <li
          key={member.id}
          className={`group relative flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/50 ${
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
            {member.title_name && (
              <div className="text-xs text-muted-foreground truncate">
                {member.title_name}
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
      ))}
    </ul>
  )}
</div>
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/components/team/MemberList.tsx
git commit -m "feat(p6): virtualize MemberList sidebar"
```

---

### Task 4: Virtualize TitleList

**Files:**
- Modify: `src/components/titles/TitleList.tsx`

Same pattern as MemberList. Row height ~40px.

- [ ] **Step 1: Update TitleList**

Replace `ScrollArea` import with `useVirtualList`. Add hook:

```tsx
const { scrollRef, shouldVirtualize, virtualizer, totalSize, virtualItems } =
  useVirtualList({ count: titles.length, estimateSize: 40 });
```

Update `handleKeyDown` to add `scrollToIndex` calls (same pattern as MemberList).

Replace `<ScrollArea className="flex-1">` with `<div ref={scrollRef} className="flex-1 overflow-y-auto">`.

Add virtualized branch (`shouldVirtualize ? ... : ...`) following the same pattern as MemberList Task 3. The virtualized `<li>` renders:

```tsx
<li
  key={title.id}
  className={`group absolute left-0 w-full flex items-start px-3 py-2 cursor-pointer hover:bg-muted/50 ${
    selectedId === title.id ? "bg-muted" : ""
  }`}
  style={{ top: virtualRow.start, height: virtualRow.size }}
  onClick={() => onSelect(title.id)}
>
  <div className="flex-1 min-w-0">
    <div className="text-sm font-medium truncate">{title.name}</div>
    <div className="text-xs text-muted-foreground">
      {title.member_count} {title.member_count === 1 ? "member" : "members"}
    </div>
  </div>
  <Button
    variant="ghost"
    size="icon"
    className="h-6 w-6 opacity-0 group-hover:opacity-100 shrink-0"
    onClick={(e) => { e.stopPropagation(); onDelete(title.id); }}
  >
    <Trash2 className="h-3.5 w-3.5" />
  </Button>
</li>
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/components/titles/TitleList.tsx
git commit -m "feat(p6): virtualize TitleList sidebar"
```

---

### Task 5: Virtualize ReportList

**Files:**
- Modify: `src/components/reports/ReportList.tsx`

Row height ~40px. Has `hoveredId` state for showing edit/delete buttons.

- [ ] **Step 1: Update ReportList**

Same pattern: replace `ScrollArea` with `useVirtualList`, add hook, update `handleKeyDown` with `scrollToIndex`, add virtualized/non-virtualized branches.

The virtualized `<li>` renders:

```tsx
<li
  key={report.id}
  className={`group absolute left-0 w-full flex items-start px-3 py-2 cursor-pointer hover:bg-muted/50 ${
    selectedId === report.id ? "bg-muted" : ""
  }`}
  style={{ top: virtualRow.start, height: virtualRow.size }}
  onClick={() => onSelect(report.id)}
  onMouseEnter={() => setHoveredId(report.id)}
  onMouseLeave={() => setHoveredId(null)}
>
  <div className="flex-1 min-w-0">
    <div className="text-sm font-medium truncate">{report.name}</div>
  </div>
  {hoveredId === report.id && (
    <div className="flex items-center gap-0.5 ml-1 shrink-0">
      <button
        className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
        onClick={(e) => { e.stopPropagation(); onEdit(report.id); }}
        title="Edit report"
      >
        <PencilIcon className="size-3.5" />
      </button>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 opacity-0 group-hover:opacity-100 shrink-0"
        onClick={(e) => { e.stopPropagation(); onDelete(report.id); }}
      >
        <Trash2Icon className="h-3.5 w-3.5" />
      </Button>
    </div>
  )}
</li>
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/components/reports/ReportList.tsx
git commit -m "feat(p6): virtualize ReportList sidebar"
```

---

### Task 6: Virtualize DataPointList

**Files:**
- Modify: `src/components/salary/DataPointList.tsx`

Row height ~50px (has optional budget line). Uses `cn()` for class merging and `<div>` instead of `<ul>/<li>`.

- [ ] **Step 1: Update DataPointList**

Same pattern but with `<div>` elements. Replace `ScrollArea` with `useVirtualList`, add hook with `estimateSize: 50`, update `handleKeyDown`.

Replace `<ScrollArea className="flex-1">` with `<div ref={scrollRef} className="flex-1 overflow-y-auto">`.

The virtualized item renders:

```tsx
<div
  key={dp.id}
  onClick={() => onSelect(dp.id)}
  className={cn(
    "group absolute left-0 w-full flex cursor-pointer items-center justify-between rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted/50",
    selectedId === dp.id && "bg-muted",
  )}
  style={{ top: virtualRow.start, height: virtualRow.size }}
>
  <div className="min-w-0 flex-1">
    <div className="truncate font-medium">{dp.name}</div>
    {dp.budget != null && (
      <div className="text-xs text-muted-foreground">
        Budget: {formatCents(dp.budget)}
      </div>
    )}
  </div>
  <div className="ml-2 flex shrink-0 gap-1 opacity-0 group-hover:opacity-100">
    <Button variant="ghost" size="icon" className="h-7 w-7"
      onClick={(e) => { e.stopPropagation(); onEdit(dp); }}>
      <Pencil className="h-3.5 w-3.5" />
    </Button>
    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"
      onClick={(e) => { e.stopPropagation(); onDelete(dp.id); }}>
      <Trash2 className="h-3.5 w-3.5" />
    </Button>
  </div>
</div>
```

The wrapper div for the virtualized path uses `relative` positioning and `p-2` to match the existing padding (note: `gap-1` from the original is not needed since absolute-positioned items don't participate in flex layout — spacing comes from the virtualizer's `estimateSize`):

```tsx
<div
  className="relative p-2 outline-none"
  style={{ height: totalSize }}
  tabIndex={0}
  onKeyDown={handleKeyDown}
>
  {virtualItems.map((virtualRow) => { ... })}
</div>
```

The non-virtualized fallback must retain the original classes including `gap-1`:

```tsx
<div
  className="flex flex-col gap-1 p-2 outline-none"
  tabIndex={0}
  onKeyDown={handleKeyDown}
>
  {dataPoints.map((dp) => ( /* existing item JSX */ ))}
</div>
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/components/salary/DataPointList.tsx
git commit -m "feat(p6): virtualize DataPointList sidebar"
```

---

### Task 7: Virtualize ProjectList

**Files:**
- Modify: `src/components/projects/ProjectList.tsx`

More complex — has active/finished split with collapsible section. Virtualize only the active section (analogous to CheckableList approach). The finished section is collapsed by default and typically small.

- [ ] **Step 1: Update ProjectList**

Replace `ScrollArea` with `useVirtualList`. Virtualize only the `active` array:

```tsx
const { scrollRef, shouldVirtualize, virtualizer, totalSize, virtualItems } =
  useVirtualList({ count: active.length, estimateSize: 40 });
```

Update `handleKeyDown` — when virtualized, use `scrollToIndex` for active items and `scrollIntoView` for finished items:

```tsx
const handleKeyDown = (e: React.KeyboardEvent) => {
  const visibleProjects = finishedOpen ? [...active, ...finished] : active;
  const ids = visibleProjects.map((p) => p.id);
  const currentIndex = ids.indexOf(selectedId ?? -1);

  let nextIndex: number;
  if (e.key === "ArrowDown") {
    e.preventDefault();
    nextIndex = currentIndex < ids.length - 1 ? currentIndex + 1 : 0;
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    nextIndex = currentIndex > 0 ? currentIndex - 1 : ids.length - 1;
  } else {
    return;
  }

  onSelect(ids[nextIndex]);
  if (shouldVirtualize) {
    if (nextIndex < active.length) {
      virtualizer.scrollToIndex(nextIndex);
    } else {
      // Finished item — outside virtualizer, use native scrollIntoView
      const el = scrollRef.current?.querySelector(`[data-project-id="${ids[nextIndex]}"]`);
      el?.scrollIntoView({ block: "nearest" });
    }
  }
};
```

Replace `<ScrollArea>` with `<div ref={scrollRef} className="flex-1 overflow-y-auto">`. The active list gets virtualized/non-virtualized branches; the finished collapsible section stays as-is (rendered normally after the virtual list). Add `data-project-id={project.id}` to finished items' `<li>` elements so keyboard nav can scroll them into view.

- [ ] **Step 2: Verify build**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/components/projects/ProjectList.tsx
git commit -m "feat(p6): virtualize ProjectList sidebar"
```

---

## Chunk 2: CheckableList

### Task 8: Virtualize CheckableList unchecked section

**Files:**
- Modify: `src/components/team/CheckableList.tsx`

Per spec: virtualize only the unchecked section (the one users interact with). Keep checked section as-is since it's collapsed by default. CheckableList has no keyboard navigation, simplifying the implementation.

Row height ~32px (`py-1` + checkbox + input).

- [ ] **Step 1: Add useVirtualList to CheckableList**

Add import:

```tsx
import { useVirtualList } from "@/hooks/useVirtualList";
```

Add hook inside the component, keyed to the unchecked array:

```tsx
const { scrollRef, shouldVirtualize, virtualizer, totalSize, virtualItems } =
  useVirtualList({ count: unchecked.length, estimateSize: 32 });
```

- [ ] **Step 2: Add virtualized rendering for unchecked items**

Replace the unchecked `.map()` block (lines 237-245) with a conditional:

```tsx
{/* Unchecked items */}
{unchecked.length === 0 && checked.length === 0 && !adding && (
  <div className="text-sm text-muted-foreground py-1">
    {query ? "No matches" : "No items yet"}
  </div>
)}

{shouldVirtualize ? (
  <div ref={scrollRef} className="overflow-y-auto max-h-64">
    <div className="relative" style={{ height: totalSize }}>
      {virtualItems.map((virtualRow) => {
        const item = unchecked[virtualRow.index];
        return (
          <div
            key={item.id}
            className="absolute left-0 w-full"
            style={{ top: virtualRow.start, height: virtualRow.size }}
          >
            <ItemRow
              item={item}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onItemsChange={handleItemsUpdater}
            />
          </div>
        );
      })}
    </div>
  </div>
) : (
  unchecked.map((item) => (
    <ItemRow
      key={item.id}
      item={item}
      onUpdate={onUpdate}
      onDelete={onDelete}
      onItemsChange={handleItemsUpdater}
    />
  ))
)}
```

Note: CheckableList doesn't have its own scroll container — it lives inside the detail pane's scroll. When virtualizing, we add a `max-h-64` (256px, ~8 visible rows) scroll container so the virtualizer has a bounded scroll element. This only kicks in above 30 items.

- [ ] **Step 3: Verify build**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/components/team/CheckableList.tsx
git commit -m "feat(p6): virtualize CheckableList unchecked section"
```

---

### Task 9: Manual smoke test

No automated tests needed for this — it's a rendering optimization with identical visual output. Verify manually:

- [ ] **Step 1: Start the app**

```bash
npm run tauri dev
```

- [ ] **Step 2: Verify all sidebar lists render and scroll correctly**

Check each page: Team Members, Titles, Reports, Salary Planner, Projects. Verify:
- Items display correctly
- Arrow key navigation works
- Hover states (delete/edit buttons) work
- Selection highlighting works
- Scrolling is smooth

- [ ] **Step 3: Verify CheckableList in member detail**

Open a team member, check Status and Talk Topics sections:
- Items display correctly
- Adding items works
- Checking/unchecking works
- Filter works
- Completed section collapse/expand works

- [ ] **Step 4: Final commit (if any remaining changes)**

```bash
git add src/components/ src/hooks/
git commit -m "feat(p6): virtualized lists implementation complete"
```
