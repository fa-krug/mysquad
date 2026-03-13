# P1: Add Missing Database Indexes

## Overview

Add indexes on all foreign key columns used in JOINs and WHERE clauses. SQLite currently performs full table scans on every lookup through these columns.

## Problem

No indexes exist on any foreign key column. Every query that joins or filters by `title_id`, `team_member_id`, `project_id`, `data_point_id`, or `data_point_member_id` triggers a full table scan. As data grows, every page load and report generation gets progressively slower.

## Design

### New migration file

Create `src-tauri/migrations/007_add_indexes.sql` with indexes on:

| Table | Column(s) | Used by | Notes |
|-------|-----------|---------|-------|
| `team_members` | `title_id` | `get_team_members()` JOIN, `get_titles()` member count | |
| `children` | `team_member_id` | `get_children()` WHERE | |
| `status_items` | `team_member_id` | `get_items()`, `get_report_detail()` | |
| `talk_topics` | `team_member_id` | `get_items()` | |
| `project_members` | `team_member_id` | member project lookups | `project_id` already covered by UNIQUE(project_id, team_member_id) |
| `project_status_items` | `project_id` | `get_report_detail()` | |
| `salary_data_point_members` | `member_id` | salary member lookups | `data_point_id` already covered by UNIQUE(data_point_id, member_id) |
| `salary_parts` | `data_point_member_id` | `get_salary_data_point()` parts loop | |

**Skipped (redundant):** Indexes where the column is already the leftmost column of an existing UNIQUE constraint — SQLite uses the unique index for these lookups automatically:
- `salary_data_point_members.data_point_id` — covered by `UNIQUE(data_point_id, member_id)`
- `project_members.project_id` — covered by `UNIQUE(project_id, team_member_id)`

### Migration approach

- Use `CREATE INDEX IF NOT EXISTS` for safety
- Bump `PRAGMA user_version` in `db.rs` migration runner
- Indexes are created once on upgrade; zero runtime cost after that

### Naming convention

`idx_{table}_{column}` — e.g., `idx_team_members_title_id`

## Impact

- **Effort**: ~15 minutes
- **Risk**: None — additive only, no schema changes
- **Benefit**: O(log n) lookups instead of O(n) scans on all foreign key queries
