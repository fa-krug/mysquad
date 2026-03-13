# P2: Eliminate N+1 Queries

## Overview

Rewrite `get_report_detail()` and `get_salary_data_point()` to use batch queries instead of per-row loops. Currently these functions execute dozens of individual queries where 2-4 would suffice.

## Problem

### `get_report_detail()` — 1 + N + M queries per call

1. Fetches all team members (1 query)
2. For each member with status items enabled: prepares and executes a separate query (N queries, where N = team members not filtered out by stakeholder flag)
3. For each project with status items: prepares and executes a separate query (M queries, where M = active projects)

The statement is also re-prepared inside the loop for every iteration. Note: the status item and project queries are conditional — they only run when `collect_statuses` and `include_projects` report flags are true respectively.

### `get_salary_data_point()` — 2 + N queries per call

1. Fetches all salary_data_point_members (1 query)
2. Fetches salary_ranges (1 query)
3. For each member: executes a separate query to fetch salary_parts (N queries)

Note: the `parts_stmt` is already correctly prepared outside the loop; the N+1 here is purely the per-member query execution, not statement re-preparation.

## Design

### `get_report_detail()` rewrite

Replace the per-member loop with two batch queries:

1. **Batch member statuses** (only when `collect_statuses` is true): Fetch the member list first, filter out excluded stakeholders in Rust, then batch-fetch status items only for included members: `SELECT si.* FROM status_items si WHERE si.team_member_id IN (?1, ?2, ...)`. Group results in Rust by `team_member_id` using a `HashMap<i64, Vec<StatusItem>>`.

2. **Batch project statuses** (only when `include_projects` is true): Same pattern — `SELECT psi.*, psi.project_id FROM project_status_items psi WHERE psi.project_id IN (...)` — group by `project_id`

3. Assemble the report detail by looking up each member/project's items from the HashMap

**Result**: 1-3 queries total depending on report flags, regardless of data size.

### `get_salary_data_point()` rewrite

Replace the per-member parts loop:

1. Fetch all members for the data point (1 query — unchanged)
2. Fetch all salary_parts for those members in one query: `SELECT sp.* FROM salary_parts sp WHERE sp.data_point_member_id IN (?1, ?2, ...)` — group by `data_point_member_id`

**Result**: 2 queries total.

### Statement preparation

In `get_report_detail()`: move `conn.prepare()` calls outside of loops. Currently re-prepared on every iteration. Prepare once, execute many. (Already correct in `get_salary_data_point()` — no change needed there.)

### Rust grouping pattern

```rust
use std::collections::HashMap;

// Fetch all status items for relevant members
let mut status_map: HashMap<i64, Vec<StatusItem>> = HashMap::new();
let mut stmt = conn.prepare("SELECT ... FROM status_items WHERE team_member_id IN (...)")?;
let rows = stmt.query_map([], |row| { ... })?;
for item in rows {
    let item = item?;
    status_map.entry(item.team_member_id).or_default().push(item);
}

// Then when building each member's data:
let statuses = status_map.remove(&member.id).unwrap_or_default();
```

## Impact

- **Effort**: ~1 hour
- **Risk**: Low — same data, different query strategy. Verify with existing Rust tests.
- **Benefit**: `get_report_detail()` goes from 1+N+M queries to 1-3 fixed queries. `get_salary_data_point()` goes from 2+N to 2-3 fixed queries.
