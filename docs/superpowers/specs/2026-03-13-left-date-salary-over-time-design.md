# Left Date & Salary Over Time Report

## Overview

Two related features:
1. Mark team members as having left the company (with a leave date), excluding them from active views
2. A salary-over-time line chart in the Reports page showing all members' salary history across data points

## Database Changes

### Migration `010_left_date.sql`
- Add `left_date TEXT` column to `team_members` (nullable, ISO date string, null = active employee)
- `create_team_member` does not set `left_date` — defaults to null (active)

No new tables. The salary-over-time report queries existing `salary_data_points`, `salary_data_point_members`, and `salary_parts` tables.

## Backend (Rust) Changes

### TeamMember struct & queries
- Add `left_date: Option<String>` field to TeamMember struct
- Add `m.left_date` to the SELECT column list in `get_team_members` query
- Add `"left_date"` to the `allowed` field list in `update_team_member`
- `get_team_members` returns all members (active + former) — frontend handles filtering

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
    first_name: String,
    last_name: String,
    left_date: Option<String>,
    annual_total: i64, // cents
}
```

Query: for each data point, for each active member (where `is_active = true` on the data point member record), sum `salary_parts.amount * frequency` to get annual total in cents. Members not present in a data point are omitted (chart shows gaps). Order data points by `id` (creation order). Single Rust command avoids multiple frontend round-trips.

## Frontend Changes

### Types (`src/lib/types.ts`)
- Add `left_date: string | null` to `TeamMember`
- Add `SalaryOverTimePoint` and `SalaryOverTimeMember` interfaces (with `first_name`/`last_name` per codebase convention)

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
- **SalaryPlanner**: the `get_salary_data_point` Rust command will be modified to include `left_date` in the returned member data, so the frontend can filter or grey out former employees in the salary detail view
- **Titles**: filter on frontend using `left_date` from `getTeamMembers()` (already fetched)
- **Projects**: filter the "add member" list on frontend using `left_date`

### Reports page (`src/pages/Reports.tsx`)
- Add "Salary Over Time" chart in the empty state area (when no report is selected), replacing the "Select a report" placeholder
- Lazy-load new `SalaryOverTimeChart` component
- Chart is always visible when no specific report is selected — serves as the default/landing view of the Reports page

### New component: `SalaryOverTimeChart` (`src/components/salary/SalaryOverTimeChart.tsx`)
- Recharts `LineChart` (already a project dependency)
- X-axis: data point names, ordered by creation (by id)
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
