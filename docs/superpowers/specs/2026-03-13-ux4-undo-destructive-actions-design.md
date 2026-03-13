# UX4: Undo for Destructive Actions

## Overview

Replace upfront "Are you sure?" confirmation dialogs with an undo pattern: execute the delete immediately, show an "Undo" toast for 5 seconds, and permanently delete only after the timer expires. Faster for confident users, less disruptive than modals.

## Problem

- Every delete requires a two-step AlertDialog (click delete → read dialog → click confirm)
- This friction adds up when managing many items
- AlertDialogs interrupt flow and steal focus
- Sub-item deletes (children, salary parts, status items) already happen immediately with no confirmation — inconsistent with top-level item behavior

## Design

### Soft-delete pattern

Instead of immediately calling `DELETE` on the backend, the flow becomes:

1. User clicks delete
2. Item is hidden from the UI instantly (optimistic removal from state)
3. Toast appears: "{Item name} deleted" with an "Undo" button, 5s duration
4. If timer expires → call the real backend `delete*` function
5. If user clicks "Undo" → restore the item to state, no backend call

### Implementation approach

**Option A: Frontend-only soft delete (recommended)**

Keep the item in the frontend list state but filter it out of rendering. On undo, re-add it. On timer expiry, call the backend delete.

This requires no backend changes. The tradeoff is that if the app crashes or locks during the 5s window, the item is not actually deleted. This is acceptable — failing safe (keeping data) is better than failing unsafe (losing data).

**Option B: Backend soft delete with restore**

Add a `deleted_at` column and a `restore_*` command. More robust but requires migration changes for every table that supports delete.

**Recommendation: Option A** — simpler, no migration, the 5s window is short enough that crash risk is negligible.

### Pending-delete state management

Create `src/hooks/usePendingDelete.ts`:

```typescript
interface PendingDelete {
  id: number;
  label: string;       // for the toast message
  onConfirm: () => Promise<void>;  // actual backend delete
  onUndo: () => void;   // restore item to state
  timerId: ReturnType<typeof setTimeout>;
}
```

The hook returns:
- `scheduleDelete(item)` — hides item, shows toast, starts timer
- `pendingIds: Set<number>` — IDs currently pending deletion (used to filter list rendering)

### Which deletes get undo

**Top-level items (get undo toast):**
- Team members
- Projects
- Titles (only if no members assigned — validation stays)
- Reports
- Salary data points

**Sub-items (stay as immediate delete, no change):**
- Children, status items, talk topics, salary parts, project members, project status items

This matches the current pattern where sub-items already delete immediately and top-level items have confirmation dialogs. We're replacing the dialogs with undo, not adding undo to everything.

### Interaction with auto-lock

If auto-lock triggers while a delete is pending:
1. Flush all pending saves (existing behavior)
2. Cancel all pending deletes (items are restored — err on the side of keeping data)
3. Lock the app

### Interaction with UX1 (toasts)

This spec depends on UX1's toast system being in place. The undo toast is a `sonner` toast with an action button:

```typescript
toast("Team member deleted", {
  action: { label: "Undo", onClick: () => restore() },
  duration: 5000,
  onAutoClose: () => confirmDelete(),
});
```

## Files affected

- `src/hooks/usePendingDelete.ts` — new file
- `src/pages/TeamMembers.tsx` — replace AlertDialog delete with undo pattern
- `src/pages/Projects.tsx` — replace AlertDialog delete with undo pattern
- `src/pages/Titles.tsx` — replace AlertDialog delete with undo pattern (keep validation check)
- `src/pages/Reports.tsx` — replace AlertDialog delete with undo pattern
- `src/pages/SalaryPlanner.tsx` — replace AlertDialog delete with undo pattern
- `src/components/layout/AppLayout.tsx` or `src/App.tsx` — cancel pending deletes on lock

### Dependencies

- **Requires UX1** (toast notifications) to be implemented first
