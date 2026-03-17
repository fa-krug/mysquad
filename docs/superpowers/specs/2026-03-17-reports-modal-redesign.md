# Reports Modal Redesign

## Summary

Move report configuration (name, toggles, block management) from the inline detail panel into a modal dialog. Make the detail panel a read-only rendered view. Add "Salary Over Time" as a selectable report block type.

## Current State

- Reports use a split-view layout: list left, detail right
- Report detail mixes configuration (name input, toggles, add/remove blocks) with rendered block output
- When no report is selected, `SalaryOverTimeChart` is shown as a fallback — it is not a selectable block
- 7 block types exist: team_overview, member_statuses, open_escalations, project_status, salary_summary, one_on_one_coverage, upcoming_birthdays

## Design

### Data Model

No schema changes. The existing `reports` and `report_blocks` tables are sufficient.

**Backend addition**: New block type `"salary_over_time"` in `get_report_block_data`. It calls the existing `get_salary_over_time` query and returns the data as a `ReportBlockData` payload.

### Report Config Modal

A new `ReportModal` component (`sm:max-w-lg`) using shadcn `Dialog`, following the `DataPointModal` pattern:

**Props:**
- `open: boolean`
- `reportId: number | null` (null = creating new)
- `onClose: () => void`
- `onSaved: () => void`

**Contents:**
- Report name input at the top
- Three toggle switches: collect statuses, include stakeholders, include projects
- Block list showing current blocks with remove button per block and drag-to-reorder
- "Add block" dropdown at the bottom (disables already-added block types, like current `AddBlockMenu`)

**Behavior:**
- Creating: `createReport()` on first save, then allows adding blocks
- Editing: loads existing report data, saves changes on close/save
- Follows same save pattern as `DataPointModal`

### Report Detail Panel (Read-Only)

The right panel becomes a read-only rendered view:
- Header bar with report name and a gear/edit icon button to open the modal
- Rendered blocks below (using existing `BlockRenderer`)
- PDF export button remains in the header
- No inline editing, no add-block menu

### Empty State

When no report is selected: centered "Select a report" in `text-muted-foreground`, consistent with Team Members and Titles pages.

### Salary Over Time Block

- New block type `"salary_over_time"` added to `BLOCK_LABELS` in `BlockRenderer`
- Renders the existing `SalaryOverTimeChart` component as-is, passing fetched data
- No additional configuration options
- Subject to the same singleton constraint (one per report)

### Files Changed

**Frontend:**
- `src/pages/Reports.tsx` — remove inline SalaryOverTimeChart fallback, add empty state, wire up modal
- `src/components/reports/ReportModal.tsx` — new modal component
- `src/components/reports/ReportDetail.tsx` — make read-only, add gear button, remove config UI
- `src/components/reports/blocks/BlockRenderer.tsx` — add salary_over_time block type
- `src/lib/types.ts` — add SalaryOverTime to ReportBlockDataPayload if needed

**Backend:**
- `src-tauri/src/commands.rs` — add `build_salary_over_time` block data builder
