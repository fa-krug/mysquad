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
```

Data points with `scenario_group_id` set are scenario children. Data points without it are normal (unchanged behavior).

## Backend (Rust) Changes

### New structs

- `ScenarioGroup` — id, name, budget, previous_data_point_id, created_at, children: `Vec<SalaryDataPointSummary>`
- `SalaryListItem` — tagged enum with `type` field: either `"data_point"` wrapping a `SalaryDataPointSummary` or `"scenario_group"` wrapping a `ScenarioGroup`
- `ScenarioSummary` — data_point_id, data_point_name, total_salary (cents), headcount

### New commands

- **`create_scenario_group(previous_data_point_id: Option<i64>, count: i64)`**
  Creates a scenario group + N child data points. If `previous_data_point_id` is set, copies members, salary parts, and ranges from the previous data point into each child and into the group ranges. Default name = today's date + " Scenarios". Returns the created `ScenarioGroup`.

- **`delete_scenario_group(id: i64)`**
  Deletes the group. CASCADE removes all children and group ranges.

- **`update_scenario_group(id: i64, field: String, value: Option<String>)`**
  Dynamic field update for name and budget (same pattern as `update_salary_data_point`). Allowed fields: `name`, `budget`.

- **`update_scenario_group_range(scenario_group_id: i64, title_id: i64, min_salary: i64, max_salary: i64)`**
  Upsert a salary range for the group. Same pattern as `update_salary_range`.

- **`add_scenario(scenario_group_id: i64)`**
  Adds one child data point to the group, copying members and salary parts from the first existing sibling. Returns the new `SalaryDataPointSummary`.

- **`remove_scenario(data_point_id: i64)`**
  Removes a scenario child. Fails with error if only 2 children remain (minimum is 2).

- **`promote_scenario(data_point_id: i64)`**
  Detaches the data point: sets `scenario_group_id = NULL`, copies the group's budget to the data point's budget, copies `scenario_group_ranges` to `salary_ranges` for the data point, sets `previous_data_point_id` on the data point from the group's `previous_data_point_id`. Then deletes the scenario group (CASCADE removes siblings and group ranges).

- **`get_scenario_summaries(scenario_group_id: i64)`**
  Returns a `Vec<ScenarioSummary>` — for each child data point: id, name, total active salary (sum of all active members' `amount * frequency`), and active headcount. Used for the comparison table.

### Modified commands

- **`get_salary_data_points`** — returns `Vec<SalaryListItem>` instead of `Vec<SalaryDataPointSummary>`. Query fetches normal data points (where `scenario_group_id IS NULL`) and scenario groups, interleaves them by creation date. Scenario children are nested inside their group's `children` array, not shown at top level.

- **`get_salary_data_point`** — unchanged. Works for scenario children since they are normal data points with salary parts.

- **`get_salary_over_time`** — filters out scenario children (`WHERE sdpm.data_point_id IN (SELECT id FROM salary_data_points WHERE scenario_group_id IS NULL)`). Only normal/promoted data points appear in the chart.

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

export interface SalaryListItem {
  type: "data_point" | "scenario_group";
  data_point?: SalaryDataPointSummary;
  scenario_group?: ScenarioGroup;
}

export interface ScenarioSummary {
  data_point_id: number;
  data_point_name: string;
  total_salary: number;
  headcount: number;
}
```

### db.ts

Add invoke calls for all new commands: `createScenarioGroup`, `deleteScenarioGroup`, `updateScenarioGroup`, `updateScenarioGroupRange`, `addScenario`, `removeScenario`, `promoteScenario`, `getScenarioSummaries`.

Update `getSalaryDataPoints` return type to `SalaryListItem[]`.

### DataPointList (`src/components/salary/DataPointList.tsx`)

- Accepts `SalaryListItem[]` instead of `SalaryDataPointSummary[]`
- Normal data points render as current
- Scenario groups render with a distinct accent color (e.g., purple tint) and a chevron toggle
- Clicking a group expands/collapses its children (indented underneath)
- Children render as sub-items with indentation and muted style
- Hover on a child shows a "Promote" button icon
- Promote click triggers an AlertDialog: "Promote this scenario? This will delete all other scenarios in the group." → calls `promoteScenario`

### DataPointModal (`src/components/salary/DataPointModal.tsx`)

- **Create mode:** Add a "Scenario" Switch toggle. When on, show a number input for count (min 2, default 2). On submit, calls `createScenarioGroup` instead of `createSalaryDataPoint`.
- **Edit mode for scenario group:** Shows name, budget, ranges, and a count display with +/- buttons (min 2). Add calls `addScenario`, remove calls `removeScenario`. No edit modal for scenario children.

### MemberSalaryCard comparison (`src/components/salary/MemberSalaryCard.tsx`)

When viewing a scenario child, below the salary parts table, show a compact comparison row:
- Annual total for this member in each sibling scenario (labeled by scenario name)
- Previous data point total (if available)
- Delta from previous as +/- amount and percentage

### Scenario summary table (new component `src/components/salary/ScenarioComparisonTable.tsx`)

Shown at the top of the detail view when viewing a scenario child:
- One row per sibling scenario + one for previous data point
- Columns: Name, Total Cost, Budget, Delta from Previous, Headcount
- Current scenario row highlighted with accent background

### SalaryPlanner page (`src/pages/SalaryPlanner.tsx`)

- `selectedId` can now refer to a scenario child data point ID
- Clicking a scenario group expands/collapses the tree — does NOT show detail panel
- Clicking a scenario child shows the detail panel (same as normal data point, plus comparison sections)
- Loads scenario summaries when a scenario child is selected (for comparison table and member card comparisons)
- Loads sibling salary data for per-member comparison

## Scope Boundaries

- No drag-and-drop reordering of scenarios
- No merging scenarios (only promote or delete)
- No scenario-specific analytics charts — reuses existing per-data-point charts
- No limit on scenario count beyond minimum of 2
- Scenario children share the same member list (copied at creation). Adding/removing members is not supported per-scenario — members are managed at creation time from the previous data point
- Ranges are per-group (via `scenario_group_ranges`), not per-scenario child
- The salary-over-time chart in Reports excludes scenario children
- No undo for promote — confirmation dialog covers this
- Scenario children auto-named "Scenario 1", "Scenario 2", etc. at creation (editable per-child via existing `update_salary_data_point`)
