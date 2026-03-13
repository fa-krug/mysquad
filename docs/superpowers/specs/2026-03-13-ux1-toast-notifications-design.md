# UX1: Toast Notifications & Consistent Error Handling

## Overview

Replace the fragmented feedback system (inline "Saved"/"Error" text, `alert()` calls, silent failures) with a unified toast notification system. Every user action that mutates data gets clear, consistent feedback.

## Problem

Current state across the app:

- **useAutoSave** shows inline "Saving…" / "Saved" / error text per field — easy to miss, disappears after 1.5s
- **Titles page** uses `alert()` for validation errors (e.g., deleting a title with members)
- **Most create/delete operations** have no success or error feedback at all
- **Picture upload** shows inline error text below the avatar
- **Failed data loads** are silently swallowed (Projects, Reports, Salary)

## Design

### Toast component

Add `sonner` as the toast library (shadcn/ui recommends it, lightweight, supports stacking and swipe-to-dismiss).

Install via: `npx shadcn@latest add sonner`

Place `<Toaster />` in `AppLayout.tsx` so it's available on all pages.

### Toast categories

| Category | Appearance | Duration | Example |
|----------|-----------|----------|---------|
| Success | Default style, checkmark icon | 3s auto-dismiss | "Team member deleted" |
| Error | Destructive variant, X icon | Persistent until dismissed | "Failed to save — database error" |
| Info | Default style, info icon | 3s auto-dismiss | "PDF exported to Downloads" |

### What triggers toasts

**Create operations** — success toast: "{Item} created"
- `createTeamMember`, `createProject`, `createTitle`, `createReport`, `createSalaryDataPoint`

**Delete operations** — success toast: "{Item} deleted" (this also sets up UX4 undo later)
- All `delete*` functions in `db.ts`

**Bulk/async operations** — success or error toast:
- `uploadMemberPicture` → "Picture uploaded" / "Upload failed: {error}"
- PDF export → "PDF exported" / "Export failed: {error}"

**Data load failures** — error toast:
- Any `get*` call that fails on page mount → "Failed to load {data type}"

**Auto-save** — keep the existing inline indicator for field-level saves (toast per keystroke would be noisy). Only toast on auto-save *errors* that the inline indicator might miss.

**Validation errors** — replace `alert()` calls with error toasts:
- "Cannot delete title — {n} members still assigned"

### What does NOT trigger toasts

- Successful auto-saves (the inline "Saved" text is sufficient for continuous editing)
- Navigation actions
- Lock/unlock (the lock screen itself is the feedback)

### Implementation scope

1. Add `sonner` via shadcn
2. Add `<Toaster />` to `AppLayout.tsx`
3. Create `src/lib/toast.ts` with typed helper functions:
   - `showSuccess(message: string)`
   - `showError(message: string)`
   - `showInfo(message: string)`
4. Update all page-level create/delete handlers to call toast on success/failure
5. Add try/catch to all `useEffect` data-loading blocks, toast on error
6. Replace `alert()` in Titles page with `showError()`
7. Replace inline picture upload error with toast
8. Add toast to PDF export in Reports

### Interaction with useAutoSave

No changes to `useAutoSave` itself. The inline saving/saved/error indicators stay for field-level feedback. Toasts are for discrete actions (create, delete, upload, export) and load failures.

## Files affected

- `src/components/layout/AppLayout.tsx` — add `<Toaster />`
- `src/lib/toast.ts` — new file, toast helpers
- `src/pages/TeamMembers.tsx` — toast on create/delete/load errors
- `src/pages/Projects.tsx` — toast on create/delete/load errors
- `src/pages/Titles.tsx` — replace `alert()`, toast on create/delete
- `src/pages/SalaryPlanner.tsx` — toast on create/delete/load errors
- `src/pages/Reports.tsx` — toast on create/delete/load errors, PDF export
- `src/components/team/MemberDetail.tsx` — toast on picture upload/delete errors
