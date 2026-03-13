# Left Date & Salary Over Time Report

## Overview

Two related features:
1. Mark team members as having left the company (with a leave date), excluding them from active views
2. A salary-over-time line chart in the Reports page showing all members' salary history across data points

## Database Changes

### Migration `010_left_date.sql`
- Add `left_date TEXT` column to `team_members` (nullable, ISO date string, null = active employee)

No new tables. The salary-over-time report queries existing `salary_data_points`, `salary_data_point_members`, and `salary_parts` tables.

## Backend (Rust) Changes

### TeamMember struct
- Add `left_date: Option<String>` field
- `get_team_members` returns all members (active + former) — frontend handles filtering
- `update_team_member` already supports dynamic field updates, so `left_date` works automatically

### New command: `get_salary_over_time`
Returns all salary data points with each member's total annual salary.

```rust
struct SalaryOverTimePoint {
    data_point_id: i64,
    data_point_name: String,
    members: Vec<SalaryOverTimeMember>,
}

struct SalaryOverTimeMember {
    member_id: i64,
    member_name: String,
    left_date: Option<String>,
    annual_total: i64, // cents
}
```

Query: for each data point, for each member, sum `salary_parts.amount * frequency` to get annual total in cents. Single Rust command avoids multiple frontend round-trips.

## Frontend Changes

### Types (`src/lib/types.ts`)
- Add `left_date: string | null` to `TeamMember`
- Add `SalaryOverTimePoint` and `SalaryOverTimeMember` interfaces

### db.ts
- Add `getSalaryOverTime()` invoke call

### MemberList (`src/components/team/MemberList.tsx`)
- Split members into active (left_date is null) and former (left_date is not null)
- Active members rendered as current
- Collapsible "Former employees" section at bottom (shadcn/ui `Collapsible`), collapsed by default
- Former members shown with muted styling

### MemberDetail (`src/components/team/MemberDetail.tsx`)
- Add leave date field (DatePicker) in member info section
- When set, visually indicate the member has left (badge or muted header)

### Filtering out former employees
- **SalaryPlanner**: filter out members with `left_date` from member lists
- **Titles**: filter out former employees
- **Projects**: filter out former employees

### Reports page (`src/pages/Reports.tsx`)
- Add a "Salary Over Time" analytics block (global, not tied to individual reports)
- Lazy-load new `SalaryOverTimeChart` component

### New component: `SalaryOverTimeChart` (`src/components/salary/SalaryOverTimeChart.tsx`)
- Recharts `LineChart` (already a project dependency)
- X-axis: data point names, ordered by creation
- Y-axis: annual salary in euros
- One line per member, labeled with name
- Former employees: dashed lines
- Tooltip: member name + formatted salary on hover

## Scope boundaries
- No changes to existing 4 salary charts in SalaryPlanner
- No filtering/date-range controls on the salary-over-time chart
- No changes to existing Reports (status collection) functionality
- Former employees completely excluded from SalaryPlanner, Titles, Projects — no toggle to include them
- No "rejoin" workflow — clear the leave date to reactivate
