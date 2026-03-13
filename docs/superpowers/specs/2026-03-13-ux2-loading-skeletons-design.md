# UX2: Loading Skeletons & Async Feedback

## Overview

Add skeleton loading states for initial page loads and spinner/disabled states for async actions (create, delete, upload). Makes the app feel responsive instead of frozen during data fetches.

## Problem

- Pages render empty until data arrives — no visual indication that loading is happening
- SalaryPlanner is the only page that shows "Loading…" text
- Create/delete buttons have no disabled or loading state during the operation
- Picture upload/delete has no progress indicator
- Users can double-click actions because nothing disables the button during execution

## Design

### Skeleton components

Add the shadcn skeleton primitive: `npx shadcn@latest add skeleton`

Create two reusable skeleton patterns that match the existing split-view layout:

**`src/components/ui/list-skeleton.tsx`** — for the left panel:
- Renders 5–8 skeleton rows matching the list item height
- Each row: a rounded rectangle (avatar placeholder) + two lines of varying width
- Matches the `w-64` list panel width

**`src/components/ui/detail-skeleton.tsx`** — for the right panel:
- Skeleton blocks matching the section layout: header bar, separator, field groups
- Matches the `max-w-2xl p-6 space-y-6` content area

### Page loading states

Each page gets a `loading` state that starts `true` and flips to `false` after the initial data fetch:

```
const [loading, setLoading] = useState(true);

useEffect(() => {
  getItems()
    .then(setItems)
    .catch(() => showError("Failed to load"))
    .finally(() => setLoading(false));
}, []);
```

When `loading` is `true`:
- Left panel shows `<ListSkeleton />`
- Right panel shows the empty-state message (no detail selected yet)

### Action loading states

For discrete actions (create, delete, upload), use a per-action loading flag to:
1. Disable the triggering button
2. Show a spinner icon replacing the normal icon

Pattern:
```
const [creating, setCreating] = useState(false);

const handleCreate = async () => {
  setCreating(true);
  try { ... } finally { setCreating(false); }
};

<Button disabled={creating}>
  {creating ? <Loader2 className="animate-spin" /> : <Plus />}
</Button>
```

### Specific locations

| Page | List skeleton | Action spinners |
|------|--------------|-----------------|
| Team Members | Member rows with avatar + name | Create, Delete |
| Projects | Project rows with name + date | Create, Delete |
| Titles | Title rows with name + count | Create, Delete |
| Salary Planner | Data point rows with name + budget | Create, Delete, Add Member |
| Reports | Report rows with name | Create, Delete, PDF Export |

### Picture upload

Show a small spinner overlay on the avatar during upload/delete. Disable the upload and delete buttons while an operation is in progress.

### Double-click prevention

All action buttons that trigger async operations should be `disabled` while the operation is in flight. This naturally prevents double-clicks without needing explicit debounce.

## Files affected

- `src/components/ui/list-skeleton.tsx` — new file
- `src/components/ui/detail-skeleton.tsx` — new file
- `src/pages/TeamMembers.tsx` — loading state, action spinners
- `src/pages/Projects.tsx` — loading state, action spinners
- `src/pages/Titles.tsx` — loading state, action spinners
- `src/pages/SalaryPlanner.tsx` — replace "Loading…" with skeleton, action spinners
- `src/pages/Reports.tsx` — loading state, action spinners
- `src/components/team/MemberDetail.tsx` — picture upload/delete spinner
