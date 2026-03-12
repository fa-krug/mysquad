# Unified Views Design

## Goal

Standardize all split-page views (Team Members, Titles, Salary Planner) to share the same layout structure, spacing, and interaction patterns. Convert Titles from a single-page inline-editing view to a split view. Settings remains a single-page form.

## Current State

| Page | Layout | List Width | Detail Width | Delete Confirmation |
|------|--------|-----------|-------------|-------------------|
| Team Members | Split (list + detail) | w-[250px] (in MemberList.tsx) | max-w-2xl p-6 | AlertDialog |
| Salary Planner | Split (list + detail + modal) | w-64 (256px) | unconstrained ScrollArea | `window.confirm()` |
| Titles | Single page, inline editing | N/A | max-w-2xl p-6 | None (immediate) |
| Settings | Single page form | N/A | max-w-lg p-6 | N/A |

### Key Inconsistencies

- List panel widths differ (250px vs 256px)
- Header heights and styles vary across pages
- Delete confirmation varies: AlertDialog (Team Members), `window.confirm` (Salary Planner), none (Titles)
- Titles uses a completely different layout pattern
- Detail panel content width is unconstrained in Salary Planner
- Selection styles differ: `bg-muted` (Team Members) vs `bg-accent` (Salary Planner)
- Empty state text varies
- Border-r placement inconsistent (applied inside list components)

## Unified Design

### Shared Split View Structure

All three split-page views follow this layout:

```
┌─────────────────────────────────────────────┐
│ flex h-full                                 │
│ ┌──────────┬──────────────────────────────┐ │
│ │ List     │ Detail                       │ │
│ │ w-64     │ flex-1 overflow-auto         │ │
│ │ shrink-0 │                              │ │
│ │          │ ┌──────────────────────────┐ │ │
│ │ ┌──────┐ │ │ max-w-2xl p-6            │ │ │
│ │ │Header│ │ │                          │ │ │
│ │ │h-12  │ │ │ Detail content...        │ │ │
│ │ │Title │ │ │                          │ │ │
│ │ │  [+] │ │ └──────────────────────────┘ │ │
│ │ ├──────┤ │                              │ │
│ │ │Scroll│ │                              │ │
│ │ │Area  │ │                              │ │
│ │ │      │ │                              │ │
│ │ │Items │ │                              │ │
│ │ └──────┘ │                              │ │
│ └──────────┴──────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

### List Panel (Standardized)

- **Width:** `w-64` (256px), `shrink-0`
- **Border:** `border-r border-border` — applied on the list component's root div
- **Header:** `h-12`, flex row with:
  - Page title: `font-semibold text-sm`
  - Add button: `size="icon-sm"` with `+` icon, aligned right
  - Bottom border: `border-b border-border`
- **List area:** `ScrollArea` filling remaining height
  - Items: `px-3 py-2`, `rounded-md`, `cursor-pointer`
  - Selected: `bg-muted` (standardize Salary Planner from `bg-accent`)
  - Hover: `hover:bg-muted/50`
  - Each item shows primary text (bold) + subtitle (muted, text-xs)
  - Delete button: visible on hover, `text-muted-foreground hover:text-destructive`
  - **Additional action buttons** (e.g., Salary Planner's edit/pencil button): allowed per-page, same hover visibility pattern

### Detail Panel (Standardized)

- **Container:** `flex-1 overflow-auto` — on the page-level wrapper div (not inside the detail component)
- **Content wrapper:** `max-w-2xl p-6 space-y-6` — inside the detail component
- **Empty state:** Centered text "Select a [item type] to view details" in `text-muted-foreground`

### Delete Confirmation

- **Top-level items** (team members, titles, salary data points): `AlertDialog` component (not `window.confirm`)
- **Sub-items** (children, status items, talk topics, salary parts): Immediate delete, no confirmation

## Page-Specific Changes

### Team Members

**Changes needed:**
- `MemberList.tsx`: Width `w-[250px]` → `w-64`
- `TeamMembers.tsx`: Add `overflow-auto` to the detail wrapper div (currently only on MemberDetail's internal div)

### Titles (Major Rework)

**Changes needed:**
- Convert from single-page inline-editing to split view
- **List panel:** Shows title name + member count subtitle
- **Detail panel:**
  - Editable title name input (auto-save)
  - Member count display
  - Read-only list of team members with this title
  - Each member is clickable → navigates to Team Members page with that member selected
- **Navigation:** Use React Router's `useNavigate` with state: `navigate('/', { state: { memberId: id } })`. `TeamMembers.tsx` reads `location.state?.memberId` on mount to pre-select.
- **Delete:** Add AlertDialog confirmation (currently immediate)
- **Create:** Add button in list header → calls `createTitle("New Title")` with a default name → selects it → focuses name input in detail

### Salary Planner

**Changes needed:**
- List panel width: already `w-64` ✓
- List header: standardize to match shared pattern (h-12, same font/button styles)
- List selection style: `bg-accent` → `bg-muted` for consistency
- Detail panel: wrap content in `max-w-2xl p-6` constraint
- Delete: replace `window.confirm()` with `AlertDialog` component
- **Keep** the per-item edit (pencil) button in the list — it opens the data point modal, which is unique to this page
- Modal for editing data point name/budget: keep as-is

### Settings

**No changes.** Remains a single-page form with `max-w-lg p-6`.

## Shared Component Opportunity

**Recommendation:** Do NOT extract a shared component. The pages have enough variation (Salary Planner has a modal + edit buttons, Team Members has search) that a shared component would accumulate props and conditionals. Instead, enforce consistency through identical Tailwind class patterns.

## Files to Modify

1. `src/pages/Titles.tsx` — full rewrite to split view
2. `src/pages/TeamMembers.tsx` — add `overflow-auto` to detail wrapper, read `location.state?.memberId` for cross-page navigation
3. `src/pages/SalaryPlanner.tsx` — standardize header, add `max-w-2xl` to detail, replace `window.confirm` with `AlertDialog`, change selection style to `bg-muted`
4. `src/components/team/MemberList.tsx` — width `w-[250px]` → `w-64`
5. New: `src/components/titles/TitleList.tsx` — list panel for titles
6. New: `src/components/titles/TitleDetail.tsx` — detail panel for titles
7. `src/components/salary/DataPointList.tsx` — selection style `bg-accent` → `bg-muted`
8. No new Rust command needed — `TitleDetail` calls `getTeamMembers()` and filters by `title_id` client-side (sufficient for small team sizes, avoids backend changes)

## Out of Scope

- No changes to Settings page
- No changes to Sidebar or AppLayout
- No changes to auto-save behavior
- No new shared layout components
- No changes to the Rust backend (member filtering done client-side)
