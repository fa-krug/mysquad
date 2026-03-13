# P7: React.memo on Frequently Re-rendered Components

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wrap key child components with `React.memo` and stabilize callback props with `useCallback` to prevent unnecessary re-renders in list views.

**Architecture:** Add `React.memo` to list-item components (ItemRow, ChildRow, SalaryPartRow, MemberAvatar) and stabilize their parent callbacks with `useCallback`. Fix the composite key anti-pattern in ChildrenList. Skip sidebar lists — they're already virtualized (P6), making memo on inline items low-value.

**Tech Stack:** React 19 (`memo`, `useCallback`), TypeScript

---

## Chunk 1: Component Memoization

### Task 1: Memoize ItemRow and stabilize CheckableList callbacks

**Files:**
- Modify: `src/components/team/CheckableList.tsx`

- [ ] **Step 1: Add `memo` import and wrap ItemRow**

In `CheckableList.tsx`, add `memo` to the React import and wrap the `ItemRow` component:

```tsx
// Change the function declaration from:
function ItemRow({ item, onUpdate, onDelete, onItemsChange }: ItemRowProps) {

// To:
const ItemRow = memo(function ItemRow({ item, onUpdate, onDelete, onItemsChange }: ItemRowProps) {
  // ... existing body unchanged ...
});
```

- [ ] **Step 2: Wrap CheckableList callbacks with useCallback**

Add `useCallback` to the React import. Wrap `handleItemsUpdater` with `useCallback`. Note: this function calls `onItemsChange(updater(items))` — it closes over `items` (prop) and `onItemsChange` (prop). Since `items` changes on every update, wrapping it naively would recreate on every render, defeating memo. Refactor to avoid the `items` closure by having `onItemsChange` accept an updater function:

```tsx
// handleItemsUpdater — refactor to avoid closing over `items`:
const handleItemsUpdater = useCallback(
  (updater: (prev: BaseCheckableItem[]) => BaseCheckableItem[]) => {
    onItemsChange(updater);
  },
  [onItemsChange],
);
```

This requires updating the `CheckableListProps` interface so `onItemsChange` accepts either an array or an updater function:

```tsx
interface CheckableListProps {
  // ...
  onItemsChange: (itemsOrUpdater: BaseCheckableItem[] | ((prev: BaseCheckableItem[]) => BaseCheckableItem[])) => void;
}
```

And update `handleCommitAdd` to also use the updater pattern:

```tsx
onItemsChange((prev) => [...prev, created]);
```

Then in `MemberDetail.tsx`, update `onItemsChange` handlers to support both patterns:

```tsx
const handleStatusItemsChange = useCallback(
  (itemsOrUpdater: BaseCheckableItem[] | ((prev: BaseCheckableItem[]) => BaseCheckableItem[])) => {
    setStatusItems((prev) => {
      const next = typeof itemsOrUpdater === "function" ? itemsOrUpdater(prev) : itemsOrUpdater;
      return next as CheckableItem[];
    });
  },
  [],
);
```

(Same pattern for `handleTopicItemsChange`.)

- [ ] **Step 3: Build to verify no TypeScript errors**

Run: `npm run build`
Expected: Clean build, no errors.

- [ ] **Step 4: Commit**

```
feat(p7): memoize ItemRow and stabilize CheckableList callbacks
```

---

### Task 2: Memoize MemberAvatar and stabilize MemberDetail callbacks

**Files:**
- Modify: `src/components/team/MemberAvatar.tsx`
- Modify: `src/components/team/MemberDetail.tsx`

- [ ] **Step 1: Wrap MemberAvatar with `memo`**

In `MemberAvatar.tsx`, add `memo` to the React import and wrap the component:

```tsx
// Change from:
export function MemberAvatar({ ... }: MemberAvatarProps) {

// To:
export const MemberAvatar = memo(function MemberAvatar({ ... }: MemberAvatarProps) {
  // ... existing body unchanged ...
});
```

- [ ] **Step 2: Stabilize MemberDetail callbacks passed to MemberAvatar**

In `MemberDetail.tsx`, add `useCallback` to the React import. Wrap `handleUploadPicture` and `handleDeletePicture`:

```tsx
const handleUploadPicture = useCallback(async () => {
  // ... existing body (calls uploadMemberPicture, setPicturePath, setCacheKey, onMemberChange) ...
}, [member.id, onMemberChange]);

const handleDeletePicture = useCallback(async () => {
  // ... existing body (calls deleteMemberPicture, setPicturePath, onMemberChange) ...
}, [member.id, onMemberChange]);
```

- [ ] **Step 3: Stabilize MemberDetail callbacks passed to CheckableList**

Wrap all inline arrow function callbacks passed to each `CheckableList`. Currently these are inline in JSX (lines 104-120):

```tsx
// Status callbacks
const handleStatusAdd = useCallback(
  (text: string) => addStatusItem(member.id, text),
  [member.id],
);

const handleStatusUpdate = useCallback(
  (id: number, text?: string, checked?: boolean) => updateStatusItem(id, text, checked),
  [],
);

const handleStatusItemsChange = useCallback(
  (itemsOrUpdater: BaseCheckableItem[] | ((prev: BaseCheckableItem[]) => BaseCheckableItem[])) => {
    setStatusItems((prev) => {
      const next = typeof itemsOrUpdater === "function" ? itemsOrUpdater(prev) : itemsOrUpdater;
      return next as CheckableItem[];
    });
  },
  [],
);

// Talk Topics callbacks (same pattern)
const handleTopicAdd = useCallback(
  (text: string) => addTalkTopic(member.id, text),
  [member.id],
);

const handleTopicUpdate = useCallback(
  (id: number, text?: string, checked?: boolean) => updateTalkTopic(id, text, checked),
  [],
);

const handleTopicItemsChange = useCallback(
  (itemsOrUpdater: BaseCheckableItem[] | ((prev: BaseCheckableItem[]) => BaseCheckableItem[])) => {
    setTalkTopics((prev) => {
      const next = typeof itemsOrUpdater === "function" ? itemsOrUpdater(prev) : itemsOrUpdater;
      return next as CheckableItem[];
    });
  },
  [],
);
```

Then update the JSX:
```tsx
<CheckableList
  title="Status"
  items={statusItems}
  onAdd={handleStatusAdd}
  onUpdate={handleStatusUpdate}
  onDelete={deleteStatusItem}
  onItemsChange={handleStatusItemsChange}
/>
```
(Same pattern for Talk Topics using the topic callbacks.)

- [ ] **Step 4: Build to verify no TypeScript errors**

Run: `npm run build`
Expected: Clean build, no errors.

- [ ] **Step 5: Commit**

```
feat(p7): memoize MemberAvatar and stabilize MemberDetail callbacks
```

---

### Task 3: Fix ChildRow composite key and memoize ChildRow

**Files:**
- Modify: `src/components/team/ChildrenList.tsx`

- [ ] **Step 1: Fix the composite key anti-pattern**

Find the line rendering `<ChildRow>` with `key={`${child.id}-${child.name}-${child.date_of_birth}`}` and change to:

```tsx
key={child.id}
```

- [ ] **Step 2: Wrap ChildRow with `memo`**

Add `memo` to the React import and wrap:

```tsx
const ChildRow = memo(function ChildRow({ child, onDelete, onUpdate }: ChildRowProps) {
  // ... existing body unchanged ...
});
```

- [ ] **Step 3: Stabilize ChildrenList callbacks passed to ChildRow**

Wrap `handleDelete` and `handleUpdate` with `useCallback`:

```tsx
const handleDelete = useCallback(async (id: number) => {
  try {
    await deleteChild(id);
    setChildren((prev) => prev.filter((c) => c.id !== id));
  } catch (e) {
    setError(e instanceof Error ? e.message : String(e));
  }
}, []);

const handleUpdate = useCallback(async (id: number, name: string, dob: string | null) => {
  await updateChild(id, name, dob);
  setChildren((prev) => prev.map((c) => (c.id === id ? { ...c, name, date_of_birth: dob } : c)));
}, []);
```

Note: Both use state setters (stable) and imported db functions (stable), so `[]` deps is correct.

- [ ] **Step 4: Build to verify no TypeScript errors**

Run: `npm run build`
Expected: Clean build, no errors.

- [ ] **Step 5: Commit**

```
feat(p7): fix ChildRow composite key and memoize ChildRow
```

---

### Task 4: Memoize SalaryPartRow and stabilize SalaryPlanner callbacks

**Files:**
- Modify: `src/components/salary/SalaryPartRow.tsx`
- Modify: `src/components/salary/MemberSalaryCard.tsx`
- Modify: `src/pages/SalaryPlanner.tsx`

- [ ] **Step 1: Wrap SalaryPartRow with `memo`**

In `SalaryPartRow.tsx`, add `memo` to the React import:

```tsx
export const SalaryPartRow = memo(function SalaryPartRow({ part, onDelete, onChanged }: SalaryPartRowProps) {
  // ... existing body unchanged ...
});
```

- [ ] **Step 2: Wrap MemberSalaryCard with `memo`**

In `MemberSalaryCard.tsx`, add `memo` to the React import:

```tsx
export const MemberSalaryCard = memo(function MemberSalaryCard({ member, ranges, onAddPart, onDeletePart, onChanged }: MemberSalaryCardProps) {
  // ... existing body unchanged ...
});
```

- [ ] **Step 3: Stabilize SalaryPlanner callbacks**

In `SalaryPlanner.tsx`, wrap `handleAddPart`, `handleDeletePart`, and `handlePartChanged` with `useCallback`:

```tsx
const handleAddPart = useCallback(async (dataPointMemberId: number) => {
  await createSalaryPart(dataPointMemberId);
  if (selectedId) await loadDetailOnly(selectedId);
}, [selectedId, loadDetailOnly]);

const handleDeletePart = useCallback(async (partId: number) => {
  await deleteSalaryPartApi(partId);
  if (selectedId) await loadDetailOnly(selectedId);
}, [selectedId, loadDetailOnly]);

const handlePartChanged = useCallback(() => {
  if (selectedId) loadDetailOnly(selectedId);
}, [selectedId, loadDetailOnly]);
```

- [ ] **Step 4: Build to verify no TypeScript errors**

Run: `npm run build`
Expected: Clean build, no errors.

- [ ] **Step 5: Commit**

```
feat(p7): memoize SalaryPartRow and MemberSalaryCard, stabilize SalaryPlanner callbacks
```

---

### Task 5: Final verification

- [ ] **Step 1: Full build check**

Run: `npm run build`
Expected: Clean build, zero errors.

- [ ] **Step 2: Run the app and smoke-test**

Run: `npm run dev`

Verify in browser:
1. Editing a CheckableList item text — other items should not flash/re-render
2. ChildrenList — editing name/DOB no longer unmounts/remounts rows
3. Salary parts — editing one part doesn't cause all parts to re-render
4. MemberAvatar — changing member fields doesn't cause avatar flicker

- [ ] **Step 3: Commit any fixes if needed**
