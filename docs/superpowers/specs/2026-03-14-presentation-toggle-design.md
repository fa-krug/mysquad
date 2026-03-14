# Per-Member Presentation Toggle

## Purpose

Allow the user to toggle individual team members into "presentation mode" on a data point so that during salary negotiations, only selected members are visible. Budget is hidden when presentation mode is active.

## Behavior

- Each member on a data point gets an `is_presented` flag (default 0 / false).
- **No members presented (default):** Normal view — all members visible, budget shown, all graphs render all active members.
- **1+ members presented:** Only presented members appear in the member list and all graphs. Budget gauge is completely hidden.
- Toggle is per data point — each data point has independent presentation state.
- Toggling a member does not affect their data, activity status, or any other field.

## Data Model

### Migration (next version)

Add column to `salary_data_point_members`:

```sql
ALTER TABLE salary_data_point_members ADD COLUMN is_presented INTEGER NOT NULL DEFAULT 0;
```

### TypeScript Type

Add `is_presented: boolean` to `SalaryDataPointMember` in `types.ts`.

## Backend

`updateSalaryDataPointMember` in `commands.rs` already handles field/value updates for `is_active`, `is_promoted`, and `promoted_title_id`. Add `is_presented` as another valid field with the same pattern.

## Frontend

### Filtering Logic (SalaryPlanner.tsx)

Derive a `presentedMembers` list from `detail.members`:

```
const anyPresented = detail.members.some(m => m.is_presented)
const visibleMembers = anyPresented
  ? detail.members.filter(m => m.is_presented)
  : detail.members
```

Pass `visibleMembers` to all child components instead of `detail.members`. Pass `anyPresented` to control budget visibility.

### Member Card (MemberSalaryCard.tsx)

Add an eye icon toggle button to each member card header area. When `is_presented` is true, show a filled/active icon state. Clicking toggles the flag via `updateSalaryDataPointMember`.

### Budget (BudgetGauge.tsx)

Parent passes a prop (e.g., `hidden` or conditionally doesn't render) when `anyPresented` is true. The gauge simply doesn't render.

### Charts (SalaryAnalytics.tsx and children)

All charts already receive members as props. Since the parent filters to `visibleMembers`, charts automatically show only presented members. No chart-level changes needed.

### Scenario Comparison Table

Hide the budget column/row when `anyPresented` is true.

## Files to Change

| File | Change |
|------|--------|
| `src-tauri/migrations/` | New migration: add `is_presented` column |
| `src-tauri/src/db.rs` | Bump migration version |
| `src-tauri/src/commands.rs` | Add `is_presented` to `update_salary_data_point_member` match |
| `src/lib/types.ts` | Add `is_presented` to `SalaryDataPointMember` |
| `src/pages/SalaryPlanner.tsx` | Filter members, pass `anyPresented` flag |
| `src/components/salary/MemberSalaryCard.tsx` | Add eye toggle icon |
| `src/components/salary/SalaryAnalytics.tsx` | Pass `anyPresented` to hide budget |
| `src/components/salary/BudgetGauge.tsx` | Conditional render based on parent |
| `src/components/salary/ScenarioComparisonTable.tsx` | Hide budget when presented |

## Edge Cases

- If a presented member is also inactive, they still show (presentation overrides normal filtering).
- Toggling all members off (none presented) returns to normal view automatically.
- Creating a new data point: all members start with `is_presented = 0` (normal view).
