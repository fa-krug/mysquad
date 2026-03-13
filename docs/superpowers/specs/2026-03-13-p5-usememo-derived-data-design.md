# P5: Add useMemo for Derived Data

## Overview

Wrap frequently recalculated derived values in `useMemo` to prevent unnecessary recomputation on every render.

## Problem

Several components recalculate filtered/derived data on every render cycle, even when the source data hasn't changed. While individually cheap, these add up — especially in components that re-render frequently due to auto-save state changes.

## Design

### Target locations

| File | Current code | Memoize on |
|------|-------------|------------|
| `TeamMembers.tsx` | `members.filter((m) => !pendingIds.has(m.id))` | `[members, pendingIds]` |
| `SalaryPlanner.tsx` | `detail?.members.filter((m) => m.is_active) ?? []` | `[detail]` |
| `SalaryPlanner.tsx` | `dataPoints.filter((d) => !pendingIds.has(d.id))` | `[dataPoints, pendingIds]` |
| `CheckableList.tsx` | `items.filter(...)` for unchecked/checked split (~lines 146-148) | `[items, filterText]` (filter depends on `query` which derives from `filterText`) |
| `Titles.tsx` | Filtered titles list excluding pending deletes | `[titles, pendingIds]` |
| `Projects.tsx` | `projects.filter((p) => !pendingIds.has(p.id))` | `[projects, pendingIds]` |
| `Reports.tsx` | Filtered reports list excluding pending deletes | `[reports, pendingIds]` |

### Pattern

```tsx
// Before
const activeMembers = detail?.members.filter((m) => m.is_active) ?? [];

// After
const activeMembers = useMemo(
  () => detail?.members.filter((m) => m.is_active) ?? [],
  [detail]
);
```

### What NOT to memoize

- Simple property access (`member.name`)
- Values used once and not passed as props
- Anything where the dependency array would change on every render anyway

### Scope

This is a targeted pass — only the locations listed above. Not a blanket memoization effort.

## Impact

- **Effort**: ~20 minutes
- **Risk**: None — pure computation, same results
- **Benefit**: Eliminates redundant filter/map operations on frequent re-renders. Biggest win in CheckableList (renders on every keystroke via auto-save).
