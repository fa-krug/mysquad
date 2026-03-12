# Salary View Rework — Design Spec

## Overview

Replace the current simple salary table (one salary field per team member) with a full salary planning system based on **data points** — snapshots that track salary composition, budget, and ranges over time.

## Data Model

### New Tables

**`salary_data_points`**
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | Auto-increment |
| name | TEXT NOT NULL | Default: current date (YYYY-MM-DD) |
| budget | INTEGER | Cents, nullable |
| created_at | DATETIME | Default CURRENT_TIMESTAMP |
| updated_at | DATETIME | Default CURRENT_TIMESTAMP |

**`salary_data_point_members`**
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | Auto-increment |
| data_point_id | INTEGER FK | → salary_data_points(id) ON DELETE CASCADE |
| member_id | INTEGER FK | → team_members(id) ON DELETE CASCADE |
| is_active | INTEGER | Default 1 (boolean) |
| is_promoted | INTEGER | Default 0 (boolean) |
| | UNIQUE | (data_point_id, member_id) |

**`salary_parts`**
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | Auto-increment |
| data_point_member_id | INTEGER FK | → salary_data_point_members(id) ON DELETE CASCADE |
| name | TEXT | Optional label (e.g., "Base", "Bonus") |
| amount | INTEGER NOT NULL | Cents |
| frequency | INTEGER NOT NULL | Times per year (e.g., 1, 12). Default 1 |
| is_variable | INTEGER NOT NULL | Default 0 (boolean) |
| sort_order | INTEGER NOT NULL | Default 0 |

**`salary_ranges`**
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | Auto-increment |
| data_point_id | INTEGER FK | → salary_data_points(id) ON DELETE CASCADE |
| title_id | INTEGER FK | → titles(id) ON DELETE CASCADE |
| min_salary | INTEGER NOT NULL | Cents, annual |
| max_salary | INTEGER NOT NULL | Cents, annual |
| | UNIQUE | (data_point_id, title_id) |

### Migration

- Drop `salary` column from `team_members` (requires table recreation in SQLite)
- Create all four new tables with triggers for `updated_at` on `salary_data_points`

## Rust Backend Commands

### Data Points
- **`get_salary_data_points()`** — list all (id, name, budget, created_at) for left panel
- **`get_salary_data_point(id)`** — full detail: members with salary parts, salary ranges, budget
- **`create_salary_data_point()`** — new data point, cloning from most recent: members (active/promoted), salary parts, salary ranges, budget. Name defaults to current date.
- **`update_salary_data_point(id, field, value)`** — update name or budget
- **`delete_salary_data_point(id)`** — cascade deletes all related data

### Data Point Members
- **`update_salary_data_point_member(id, field, value)`** — toggle is_active or is_promoted

### Salary Parts
- **`create_salary_part(data_point_member_id)`** — add part (defaults: amount=0, frequency=1, is_variable=false)
- **`update_salary_part(id, field, value)`** — update name, amount, frequency, or is_variable
- **`delete_salary_part(id)`** — remove a part

### Salary Ranges
- **`update_salary_range(data_point_id, title_id, min_salary, max_salary)`** — upsert range for a title

### Comparison
- **`get_previous_member_data(data_point_id, member_id)`** — finds most recent earlier data point where member was active, returns their salary parts. Used for delta calculations.

## Frontend Layout

### Left Panel — Data Point List
- Vertical scrollable list, sorted by creation date (newest first)
- Each item shows name + budget summary
- Edit button per item → opens modal
- "New Data Point" button at top (opens modal pre-filled from last data point)
- Click to select; selected item highlighted
- Delete option with confirmation

### Edit Modal
- Name input
- Budget input ($)
- Salary ranges: min/max per title
- Member list: active checkbox + promoted checkbox per member
- Save/Cancel buttons

### Right Panel — Data Point Detail (when selected)

**Top: Team Member Salaries**
- One section per active member (inactive hidden)
- Name, title, promoted badge if applicable
- Salary parts table per member:
  - Columns: name (text), amount ($), frequency (number), variable (toggle)
  - Add/remove part buttons
- Annual total per member (sum of amount × frequency for each part)
- Range fit color indicator against their title's salary range

**Bottom: Analytics & Graphs**

#### Salary Overview Bar Chart (horizontal)
- One bar per active member
- Bar length = annual total
- Color fill based on title range fit (green/yellow/red)
- Promoted members: distinct visual (dashed border or muted color)
- Vertical line at budget-per-head average

#### Variable Pay Breakdown
- Stacked bars per member: solid = fixed, striped/lighter = variable
- Percentage label on the variable section

#### Comparison Chart (current vs previous)
- Grouped horizontal bars: lighter = previous data point total, darker = current
- Delta label showing +$X (+Y%)
- Green for raise, red for decrease, gray for no change
- Members with no previous active data point: "New" badge, no delta

#### Budget Gauge
- Progress bar or donut: total salary vs budget
- Green if under budget, red if over
- Shows: total, budget, difference ($), difference (%)
- Only counts non-promoted members

## Range Fit Coloring Logic
- Below min → red
- Within bottom 10% of range → yellow
- Within range → green
- Within top 10% of range → yellow
- Above max → red

## Reactivity

- Every input uses `useAutoSave` pattern (debounced save, then refetch)
- Totals, range colors, budget comparison, variable %, graphs — all derived state, recomputed on every render
- Comparison data fetched on data point selection and refreshed on salary part changes
- No separate "calculate" step

## Charting Library

Recharts — lightweight, React-native, no heavy dependencies.

## Removals

- Drop `salary` column from `team_members` table
- Remove current `SalaryPlanner.tsx` page (replaced entirely)
- Remove salary display from any other components if present
