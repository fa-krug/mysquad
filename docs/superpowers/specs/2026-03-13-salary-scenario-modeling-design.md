# Salary Scenario Modeling

## Overview

Add "what if" scenario modeling to the Salary Planner. Users can create a scenario group that branches from an existing data point into N scenario variants (min 2), edit salary parts independently per scenario, and compare them side-by-side. When satisfied, promote one scenario to a normal data point and discard the rest.

## Database Changes

### New migration `011_scenario_groups.sql`

**New table `scenario_groups`:**
```sql
CREATE TABLE scenario_groups (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    budget INTEGER,
    previous_data_point_id INTEGER REFERENCES salary_data_points(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**New table `scenario_group_ranges`:**
```sql
CREATE TABLE scenario_group_ranges (
    id INTEGER PRIMARY KEY,
    scenario_group_id INTEGER NOT NULL REFERENCES scenario_groups(id) ON DELETE CASCADE,
    title_id INTEGER NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
    min_salary INTEGER NOT NULL DEFAULT 0,
    max_salary INTEGER NOT NULL DEFAULT 0,
    UNIQUE(scenario_group_id, title_id)
);
```

**Modify `salary_data_points`:**
```sql
ALTER TABLE salary_data_points ADD COLUMN scenario_group_id INTEGER REFERENCES scenario_groups(id) ON DELETE CASCADE;
CREATE INDEX idx_salary_data_points_scenario_group ON salary_data_points(scenario_group_id);
```

Data points with `scenario_group_id` set are scenario children. Data points without it are normal (unchanged behavior).

## Backend (Rust) Changes

### New structs

- `ScenarioGroup` — id, name, budget, previous_data_point_id, created_at, children: `Vec<SalaryDataPointSummary>`
- `SalaryListItem` — Rust enum with `#[serde(tag = "type")]`:
  ```rust
  #[derive(Serialize)]
  #[serde(tag = "type")]
  pub enum SalaryListItem {
      #[serde(rename = "data_point")]
      DataPoint { data_point: SalaryDataPointSummary },
      #[serde(rename = "scenario_group")]
      ScenarioGroup { scenario_group: ScenarioGroup },
  }
  ```
- `ScenarioSummary` — data_point_id, data_point_name, total_salary (cents), headcount

### New commands

- **`create_scenario_group(previous_data_point_id: Option<i64>, count: i64)`**
  Creates a scenario group + N child data points. If `previous_data_point_id` is set, copies members, salary parts, and ranges from the previous data point into each child and into the group ranges. Default name = today's date + " Scenarios". Child data points are named "Scenario 1", "Scenario 2", etc. Returns the created `ScenarioGroup`. Must run in a transaction.

- **`delete_scenario_group(id: i64)`**
  Deletes the group. CASCADE removes all children and group ranges. Confirmation is handled on the frontend via AlertDialog.

- **`update_scenario_group(id: i64, field: String, value: Option<String>)`**
  Dynamic field update for name and budget (same pattern as `update_salary_data_point`). Allowed fields: `name`, `budget`.

- **`update_scenario_group_range(scenario_group_id: i64, title_id: i64, min_salary: i64, max_salary: i64)`**
  Upsert a salary range for the group. Same pattern as `update_salary_range`.

- **`add_scenario(scenario_group_id: i64)`**
  Adds one child data point to the group, copying members and salary parts from the lowest-ID existing sibling. Named "Scenario N" where N is the new child count. Returns the new `SalaryDataPointSummary`.

- **`remove_scenario(data_point_id: i64)`**
  Removes a scenario child. Fails with error if removal would leave fewer than 2 children in the group.

- **`promote_scenario(data_point_id: i64)`**
  Must run in a transaction. Steps:
  1. Look up the data point's `scenario_group_id` and the group's `previous_data_point_id` and `budget`
  2. Set `scenario_group_id = NULL` on the data point
  3. Set `previous_data_point_id` on the data point from the group's value
  4. Set `budget` on the data point from the group's value
  5. Copy `scenario_group_ranges` rows to `salary_ranges` for the data point
  6. Delete the scenario group (CASCADE removes siblings and group ranges)

- **`get_scenario_summaries(scenario_group_id: i64)`**
  Returns a `Vec<ScenarioSummary>` — for each child data point: id, name, total active salary (sum of all active members' `amount * frequency`), and active headcount. Used for the comparison table.

- **`get_scenario_member_comparison(scenario_group_id: i64, member_id: i64)`**
  Returns salary part totals for one member across all sibling scenarios. Avoids the frontend needing to load full detail for every sibling. Returns `Vec<{ data_point_id, data_point_name, annual_total }>`.

### Modified commands

- **`get_salary_data_points`** — returns `Vec<SalaryListItem>` instead of `Vec<SalaryDataPointSummary>`. Query fetches normal data points (where `scenario_group_id IS NULL`) and scenario groups, interleaves them by creation date. Scenario children are nested inside their group's `children` array, not shown at top level.

- **`get_salary_data_point`** — for scenario children, query `scenario_group_ranges` instead of `salary_ranges` (detect by checking if the data point has `scenario_group_id IS NOT NULL`). Returns ranges from the group. Also add `scenario_group_id: Option<i64>` to the `SalaryDataPointDetail` struct so the frontend knows this is a scenario child.

- **`create_salary_data_point`** — filter scenario children from auto-previous-selection: change the query `SELECT id FROM salary_data_points ORDER BY id DESC LIMIT 1` to `SELECT id FROM salary_data_points WHERE scenario_group_id IS NULL ORDER BY id DESC LIMIT 1`.

- **`get_salary_over_time`** — filter scenario children from both the outer data points query (`SELECT id, name FROM salary_data_points WHERE scenario_group_id IS NULL ORDER BY id`) and the member query. Only normal/promoted data points appear in the chart.

### All new commands must be registered in `lib.rs` `generate_handler!` macro.

## Frontend Changes

### Types (`src/lib/types.ts`)

```typescript
export interface ScenarioGroup {
  id: number;
  name: string;
  budget: number | null;
  previous_data_point_id: number | null;
  created_at: string;
  children: SalaryDataPointSummary[];
}

export type SalaryListItem =
  | { type: "data_point"; data_point: SalaryDataPointSummary }
  | { type: "scenario_group"; scenario_group: ScenarioGroup };

export interface ScenarioSummary {
  data_point_id: number;
  data_point_name: string;
  total_salary: number;
  headcount: number;
}
```

Add `scenario_group_id: number | null` to `SalaryDataPointSummary` and `SalaryDataPointDetail`.

### db.ts

Add invoke calls for all new commands: `createScenarioGroup`, `deleteScenarioGroup`, `updateScenarioGroup`, `updateScenarioGroupRange`, `addScenario`, `removeScenario`, `promoteScenario`, `getScenarioSummaries`, `getScenarioMemberComparison`.

Update `getSalaryDataPoints` return type to `SalaryListItem[]`.

### DataPointList (`src/components/salary/DataPointList.tsx`)

- Accepts `SalaryListItem[]` instead of `SalaryDataPointSummary[]`
- Normal data points render as current
- Scenario groups render with a distinct accent color (e.g., purple tint) and a chevron toggle
- Clicking a group expands/collapses its children (indented underneath)
- Children render as sub-items with indentation and muted style
- Hover on a child shows a "Promote" button icon
- Promote click triggers an AlertDialog: "Promote this scenario? This will delete all other scenarios in the group." → calls `promoteScenario`
- Delete on a scenario group triggers an AlertDialog: "Delete this scenario group? This will delete all scenarios in the group."

### DataPointModal (`src/components/salary/DataPointModal.tsx`)

- Receives a helper to extract normal data points from `SalaryListItem[]` for the "Compare to" dropdown (scenario children and scenario groups excluded)
- **Create mode:** Add a "Scenario" Switch toggle. When on, show a number input for count (min 2, default 2). On submit, calls `createScenarioGroup` instead of `createSalaryDataPoint`.
- **Edit mode for scenario group:** Shows name, budget, ranges, and a count display with +/- buttons (min 2). Add calls `addScenario`, remove calls `removeScenario`. No edit modal for scenario children.

### MemberSalaryCard comparison (`src/components/salary/MemberSalaryCard.tsx`)

When viewing a scenario child (detected via `scenario_group_id` on detail), below the salary parts table, show a compact comparison row:
- Annual total for this member in each sibling scenario (data from `getScenarioMemberComparison`)
- Previous data point total (if available)
- Delta from previous as +/- amount and percentage

### Scenario summary table (new component `src/components/salary/ScenarioComparisonTable.tsx`)

Shown at the top of the detail view when viewing a scenario child:
- Data from `getScenarioSummaries`
- One row per sibling scenario + one for previous data point
- Columns: Name, Total Cost, Budget, Delta from Previous, Headcount
- Current scenario row highlighted with accent background

### SalaryPlanner page (`src/pages/SalaryPlanner.tsx`)

- `selectedId` can now refer to a scenario child data point ID
- Clicking a scenario group expands/collapses the tree — does NOT show detail panel
- Clicking a scenario child shows the detail panel (same as normal data point, plus comparison sections)
- Loads scenario summaries when a scenario child is selected (for comparison table)
- Loads per-member comparison data via `getScenarioMemberComparison`
- All existing consumers of the old `SalaryDataPointSummary[]` return type are updated:
  - `handleDelete` extracts data points from list items
  - `visibleDataPoints` / `pendingIds` work with list items
  - The `DataPointModal` receives extracted normal data points for the "Compare to" dropdown

## Scope Boundaries

- No drag-and-drop reordering of scenarios
- No merging scenarios (only promote or delete)
- No scenario-specific analytics charts — reuses existing per-data-point charts
- No limit on scenario count beyond minimum of 2
- Scenario children share the same member list (copied at creation). Adding/removing members is not supported per-scenario — members are managed at creation time from the previous data point
- Ranges are per-group (via `scenario_group_ranges`), not per-scenario child. `get_salary_data_point` returns group ranges for scenario children.
- The salary-over-time chart in Reports excludes scenario children
- No undo for promote — confirmation dialog covers this
- Deleting a scenario group also gets a confirmation dialog
- Scenario children auto-named "Scenario 1", "Scenario 2", etc. at creation (editable per-child via existing `update_salary_data_point`)
- Scenario children and scenario groups excluded from "Compare to" dropdown in DataPointModal
