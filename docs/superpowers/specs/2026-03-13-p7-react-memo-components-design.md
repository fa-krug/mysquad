# P7: React.memo on Frequently Re-rendered Components

## Overview

Wrap key child components with `React.memo` to prevent unnecessary re-renders when their props haven't changed. Pair with `useCallback` for event handler props passed to memoized components.

## Problem

No components use `React.memo`. When a parent re-renders (e.g., due to auto-save state change, selection change, or any state update), all children re-render regardless of whether their props changed. This is most impactful in list views where many sibling components re-render when only one item changed.

## Design

### Components to memoize

| Component | Why it re-renders unnecessarily | Parent trigger | Prerequisite |
|-----------|-------------------------------|----------------|--------------|
| `ItemRow` (in CheckableList) | Any item text change re-renders ALL rows | `items` state update | Stabilize `handleItemsUpdater`, `onUpdate`, `onDelete` with useCallback |
| `SalaryPartRow` | Any part edit re-renders all parts | `parts` state update | Stabilize `onChanged` callback in SalaryPlanner with useCallback |
| `MemberAvatar` | Parent detail re-renders on any field change | `MemberDetail` state | Stabilize `onUpload`/`onDelete` handlers in MemberDetail with useCallback |
| `ChildRow` (in ChildrenList) | Any child edit re-renders all rows | `children` state update | Fix key from `${child.id}-${child.name}-${child.date_of_birth}` to just `child.id` (composite key defeats memo — React unmounts/remounts on any field change) |
| Sidebar list items | Selection change re-renders entire list | `selectedId` state | **Requires extraction first** — currently inline `<li>` in `.map()`, not separate components. Extract a `SidebarItem` component, then wrap with memo. |

### Pattern

```tsx
// Before
function ItemRow({ item, onToggle, onTextChange, onDelete }: ItemRowProps) {
  return <div>...</div>;
}

// After
const ItemRow = memo(function ItemRow({ item, onToggle, onTextChange, onDelete }: ItemRowProps) {
  return <div>...</div>;
});
```

### useCallback for handler props

For `React.memo` to be effective, callback props must be stable. Specific unstable callbacks that need `useCallback`:

| Location | Callback | Currently |
|----------|----------|-----------|
| `CheckableList` | `handleItemsUpdater` | Regular function |
| `MemberDetail` | `onUpdate` passed to CheckableList | Inline arrow function |
| `MemberDetail` | `onUpload`/`onDelete` passed to MemberAvatar | Async functions in component body |
| `SalaryPlanner` | `handlePartChanged` passed to SalaryPartRow | Regular function |

```tsx
// Example: In CheckableList
const handleToggle = useCallback((id: number) => {
  // toggle logic
}, [/* deps */]);

const handleDelete = useCallback((id: number) => {
  // delete logic
}, [/* deps */]);
```

### ChildRow key fix

`ChildrenList` uses a composite key `${child.id}-${child.name}-${child.date_of_birth}` which includes mutable fields. When name or DOB changes, React unmounts and remounts the component entirely, bypassing memo. Fix: change to `key={child.id}`.

### What NOT to memoize

- Page-level components (only one instance, rarely benefits)
- Components that receive new objects/arrays as props on every render (memo check fails anyway — fix the prop first with useMemo from P5)
- Components that genuinely need to re-render on every parent render

### Dependencies

- **P5 (useMemo) should be done first.** Without memoized derived data, many props passed to memo'd components will be new references every render, defeating the purpose.
- **P6 interaction**: If a list is virtualized (P6), `React.memo` on its items is less critical since only visible items render. Skip redundant memo wrapping on virtualized list items.

### Verification

Use React DevTools Profiler to confirm re-render reduction. Before/after comparison on:
1. Typing in a CheckableList item — only that ItemRow should re-render
2. Changing selection in sidebar — only old and new selected items should re-render
3. Editing a salary part — only that SalaryPartRow should re-render

## Impact

- **Effort**: ~1 hour (includes extracting sidebar items into components)
- **Risk**: Low — memo is a pure optimization, no behavior change. Incorrect dependency arrays in useCallback could cause stale closures — test thoroughly.
- **Benefit**: Reduces re-render count from O(n) to O(1) for list edits. Most impactful when combined with P5.
