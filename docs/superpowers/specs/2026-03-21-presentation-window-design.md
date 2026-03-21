# Presentation Mode Rework: Separate Window Per Member

## Summary

Replace the current inline presentation mode (toggling `is_presented` per member and conditionally hiding/showing UI elements on the same page) with a multi-window approach. Each eye button click opens a dedicated Tauri window for that member, containing an editable salary view with charts, analytics, and promotion info. The main window always shows its full normal UI.

## Goals

- Decouple presentation from the main window — no more conditional UI hiding
- One presentation window per member, each a standard resizable OS window
- Bidirectional live editing — changes in either window sync to all others
- Remove `is_presented` DB state entirely — presentation is ephemeral (window open = presenting)
- Add promotion info to the presentation view

## Architecture

### Window Creation

- Eye button on `MemberSalaryCard` calls a Tauri Rust command `open_presentation_window(data_point_id, member_id)`
- Rust creates a `WebviewWindow` with label `presentation-{dataPointId}-{memberId}` and URL `/presentation/{dataPointId}/{memberId}`
- If a window with that label already exists, focus it instead of creating a duplicate
- Window is a standard resizable OS window with reasonable default size

### Presentation Route

New route `/presentation/:dataPointId/:memberId` renders `PresentationPage`, containing:

- **Member header**: name, title, tenure/start date
- **Promotion info**: if promoted, show current title vs promoted title
- **Editable salary card**: salary parts with full editing (same editing mechanics as main window)
- **Previous data point comparison**: readonly salary parts from prior data point
- **Charts**: bar chart, over-time, variable pay, comparison
- **Analytics**: respects `show_ranges_in_presentation` setting

### Bidirectional Sync

1. User edits a salary part in any window (main or presentation)
2. Existing `invoke()` call saves to DB (no change to save mechanics)
3. After successful save, the window emits a Tauri event: `emit('salary-data-changed', { dataPointId, memberId })`
4. All other windows listen for `salary-data-changed` and re-fetch if the event matches their displayed data

Implementation:
- New hook `useSalarySync(dataPointId, memberId, onRefresh)` — sets up `listen('salary-data-changed')`, calls `onRefresh` on relevant events
- Emit happens in `db.ts` after salary mutation `invoke` calls (centralized)
- Both `DataPointDetailPanel` and `PresentationPage` use this hook

### Eye Icon State (Main Window)

- After `open_presentation_window` succeeds, highlight eye icon (`text-blue-600`)
- Listen for window close event (`tauri://destroyed` on the window label) to un-highlight
- Purely cosmetic/ephemeral — no DB state

## New Files

| File | Purpose |
|------|---------|
| `src/pages/Presentation.tsx` | Presentation page component |
| `src/hooks/useSalarySync.ts` | Inter-window sync hook |

## Modified Files

### Rust Backend

| File | Changes |
|------|---------|
| `commands.rs` | Add `open_presentation_window` command. Remove `is_presented` from `SalaryDataPointMember` struct, SELECT queries, and `update_salary_data_point_member` allowed fields. |
| `lib.rs` | Register `open_presentation_window` command. |
| `migrations/` | New migration to drop `is_presented` column from `salary_data_point_members`. |

### Frontend

| File | Changes |
|------|---------|
| `MemberSalaryCard.tsx` | Eye button calls `open_presentation_window` instead of toggling `is_presented`. Remove all `anyPresented` conditional logic (opacity, inactive badge). Remove `onTogglePresented` callback. |
| `DataPointDetailPanel.tsx` | Remove `anyPresented` memo, member presentation filtering, "Clear presentation" button, conditional hiding of export/PDF/scenario-comparison. Always show full UI. Add `useSalarySync` for live updates from presentation windows. |
| `SalaryAnalytics.tsx` | Remove `anyPresented` prop and conditional hiding of budget gauge/ranges. |
| `SalaryBarChart.tsx` | Remove presentation-only range/tooltip behavior. |
| `ComparisonChart.tsx` | Remove presentation-only tooltip behavior. |
| `SalaryOverTimeChart.tsx` | Remove presentation-only range/tooltip behavior. |
| `VariablePayChart.tsx` | Remove presentation-only tooltip behavior. |
| `types.ts` | Remove `is_presented` from `SalaryDataPointMember` type. |
| `db.ts` | Add `openPresentationWindow` invoke wrapper. Add event emission after salary mutation calls. |
| `src/App.tsx` (or router config) | Add `/presentation/:dataPointId/:memberId` route. |

### Kept As-Is

- `show_ranges_in_presentation` setting in `Settings.tsx` — repurposed for the presentation window
- All salary part editing logic — reused in presentation window

## Cleanup — What Gets Removed

### Database
- `is_presented` column from `salary_data_point_members` (via migration)

### Rust
- `is_presented` field from `SalaryDataPointMember` struct
- `sdpm.is_presented` from SELECT queries
- `"is_presented"` from allowed fields in `update_salary_data_point_member`

### Frontend
- `anyPresented` derived state and all conditional logic it drives
- `onTogglePresented` callback chain
- "Clear presentation" button
- Presentation-mode member filtering
- Conditional hiding of export/PDF/scenario-comparison/budget-gauge
- `is_presented` from TypeScript `SalaryDataPointMember` type

## Testing

### Manual
- Click eye on a member -> new window opens with correct member data
- Click eye on same member again -> existing window focuses (no duplicate)
- Click eye on different member -> second window opens
- Edit salary in presentation window -> main window updates
- Edit salary in main window -> presentation window updates
- Close presentation window -> eye icon in main window un-highlights
- Open presentation for a promoted member -> promotion info displays

### Rust
- `open_presentation_window`: verify window creation with correct label/URL
- Migration: verify column removal doesn't break existing queries
