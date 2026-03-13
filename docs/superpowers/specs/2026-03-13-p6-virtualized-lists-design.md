# P6: Virtualized Lists

## Overview

Add list virtualization to the sidebar member/title/report lists and to the longer detail lists (CheckableList items, salary members) so only visible items are rendered in the DOM.

## Problem

All lists render every item to the DOM. While current team sizes are likely small (10-50 members), several lists can grow larger:

- CheckableList items (status items, talk topics) — users can accumulate hundreds over time
- Salary data point members — mirrors team size
- Report member/stakeholder/project lists — all rendered at once
- Sidebar lists re-render all items on selection change

## Design

### Library choice: `@tanstack/react-virtual`

- Lightweight (~2KB gzipped), no heavy dependencies
- Headless — works with existing DOM structure and styling
- Active maintenance, widely adopted
- Supports variable row heights

### Where to apply

| Component | List | Estimated max items | Priority | Notes |
|-----------|------|-------------------|----------|-------|
| `CheckableList` | Status items / talk topics | 100+ | High | Has checked/unchecked split sections — see note below |
| `MemberList` | Sidebar team member list | 50+ | Medium | Has keyboard nav requiring `scrollToIndex` |
| `SalaryPlanner` | Salary member cards | 50+ | Medium | |
| Projects sidebar | Projects | 20+ | Low | |
| Title list sidebar | Titles | 20+ | Low | |
| Report list sidebar | Reports | 10+ | Low | |

### Implementation pattern

```tsx
import { useVirtualizer } from "@tanstack/react-virtual";

function VirtualList({ items }: { items: Item[] }) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 40, // row height in px
  });

  return (
    <ScrollArea ref={parentRef}>
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map((virtualRow) => (
          <div
            key={items[virtualRow.index].id}
            style={{
              position: "absolute",
              top: virtualRow.start,
              height: virtualRow.size,
              width: "100%",
            }}
          >
            {/* render item */}
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
```

### Integration with existing ScrollArea

The sidebar lists already use `<ScrollArea>` from shadcn/ui. The virtualizer needs a ref to the actual scrolling DOM element. shadcn/ui's `ScrollArea` wraps Radix's `ScrollAreaViewport`, which does not expose a straightforward ref. **Recommended approach**: replace `<ScrollArea>` with a plain `<div>` with `overflow-y: auto` and matching styles for virtualized lists. This avoids fighting Radix internals while keeping the same visual appearance.

### CheckableList split-section complexity

CheckableList renders unchecked and checked items in two separate sections with a collapsible divider. Items may also have variable heights (text wrapping in inputs). Two options:

1. **Simpler**: Virtualize only the unchecked section (the one users actively interact with). Keep the checked section as-is since it's collapsed by default.
2. **Full**: Combine both sections into a single virtual list with a sticky divider element. Use `measureElement` for dynamic row heights. More complex but handles the most items.

Recommend option 1 for initial implementation.

### Keyboard navigation

`MemberList` has `ArrowUp`/`ArrowDown` keyboard navigation. Virtualized lists must call `virtualizer.scrollToIndex(newIndex)` when the keyboard-selected item is off-screen. This is a required implementation detail, not optional.

### Threshold approach

Only virtualize when item count exceeds a threshold (e.g., 30 items). Below that, render normally to avoid added complexity for small lists. This keeps the simple case simple.

```tsx
const shouldVirtualize = items.length > 30;
```

## Impact

- **Effort**: ~1 hour
- **Risk**: Low-medium — needs testing with keyboard navigation and scroll-to-selected behavior
- **Benefit**: DOM node count stays constant regardless of list size. Biggest win for CheckableList where items accumulate over time.
