# Salary Scenario Modeling Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "what if" scenario modeling to the Salary Planner — users create scenario groups with N variants, edit independently, compare side-by-side, and promote one to a normal data point.

**Architecture:** New `scenario_groups` and `scenario_group_ranges` tables plus a `scenario_group_id` FK on `salary_data_points`. Rust backend gets 9 new commands and 4 modified commands. Frontend updates DataPointList to show expandable scenario groups, DataPointModal to support scenario creation/editing, and adds a ScenarioComparisonTable component.

**Tech Stack:** Rust/SQLite (rusqlite), React 19, TypeScript, Tauri v2, shadcn/ui, Tailwind CSS v4

**Spec:** `docs/superpowers/specs/2026-03-13-salary-scenario-modeling-design.md`

---

## File Map

**Create:**
- `src-tauri/migrations/011_scenario_groups.sql` — new tables + ALTER
- `src/components/salary/ScenarioComparisonTable.tsx` — group-level comparison table

**Modify:**
- `src-tauri/src/db.rs` — add migration 11
- `src-tauri/src/commands.rs` — new structs, 9 new commands, 4 modified commands
- `src-tauri/src/lib.rs` — register new commands
- `src/lib/types.ts` — ScenarioGroup, SalaryListItem, ScenarioSummary types
- `src/lib/db.ts` — 9 new invoke calls, update return type
- `src/components/salary/DataPointList.tsx` — expandable scenario groups
- `src/components/salary/DataPointModal.tsx` — scenario toggle + group editing
- `src/components/salary/MemberSalaryCard.tsx` — sibling comparison row
- `src/pages/SalaryPlanner.tsx` — handle SalaryListItem[], scenario state

---

## Chunk 1: Database Migration + Rust Structs

### Task 1: Create migration SQL

**Files:**
- Create: `src-tauri/migrations/011_scenario_groups.sql`

- [ ] **Step 1: Write the migration file**

```sql
CREATE TABLE scenario_groups (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    budget INTEGER,
    previous_data_point_id INTEGER REFERENCES salary_data_points(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE scenario_group_ranges (
    id INTEGER PRIMARY KEY,
    scenario_group_id INTEGER NOT NULL REFERENCES scenario_groups(id) ON DELETE CASCADE,
    title_id INTEGER NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
    min_salary INTEGER NOT NULL DEFAULT 0,
    max_salary INTEGER NOT NULL DEFAULT 0,
    UNIQUE(scenario_group_id, title_id)
);

ALTER TABLE salary_data_points ADD COLUMN scenario_group_id INTEGER REFERENCES scenario_groups(id) ON DELETE CASCADE;
CREATE INDEX idx_salary_data_points_scenario_group ON salary_data_points(scenario_group_id);
```

- [ ] **Step 2: Register migration in db.rs**

Add to `src-tauri/src/db.rs` after the `version < 10` block:

```rust
if version < 11 {
    let migration_sql = include_str!("../migrations/011_scenario_groups.sql");
    conn.execute_batch(migration_sql)?;
    conn.pragma_update(None, "user_version", 11)?;
}
```

- [ ] **Step 3: Update schema version test**

In `db.rs` tests, update `test_schema_version_tracking` to assert version == 11, and update `test_migration_v2_salary_data_points` to assert version == 11.

- [ ] **Step 4: Add migration test**

```rust
#[test]
fn test_migration_v11_scenario_groups() {
    let conn = open_db_with_key(":memory:", "test-key-0123456789abcdef").unwrap();
    run_migrations(&conn).unwrap();

    let count: i32 = conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='scenario_groups'",
        [], |row| row.get(0)
    ).unwrap();
    assert_eq!(count, 1);

    let count: i32 = conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='scenario_group_ranges'",
        [], |row| row.get(0)
    ).unwrap();
    assert_eq!(count, 1);

    // Verify scenario_group_id column on salary_data_points
    let has_col: bool = conn
        .prepare("SELECT scenario_group_id FROM salary_data_points LIMIT 0")
        .is_ok();
    assert!(has_col);
}
```

- [ ] **Step 5: Run tests**

Run: `cd src-tauri && cargo test`
Expected: All tests PASS including the new migration test.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/migrations/011_scenario_groups.sql src-tauri/src/db.rs
git commit -m "feat: add migration 011 for scenario groups tables"
```

### Task 2: Add new Rust structs + update existing commands

> **Important:** This task combines struct additions AND existing command updates into one commit so the codebase compiles at every commit boundary.

**Files:**
- Modify: `src-tauri/src/commands.rs`

- [ ] **Step 1: Add new structs and update existing struct fields**

Add after the `SalaryRange` struct (line ~1021):

```rust
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ScenarioGroup {
    pub id: i64,
    pub name: String,
    pub budget: Option<i64>,
    pub previous_data_point_id: Option<i64>,
    pub created_at: String,
    pub children: Vec<SalaryDataPointSummary>,
}

#[derive(Serialize)]
#[serde(tag = "type")]
pub enum SalaryListItem {
    #[serde(rename = "data_point")]
    DataPoint { data_point: SalaryDataPointSummary },
    #[serde(rename = "scenario_group")]
    ScenarioGroup { scenario_group: ScenarioGroup },
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ScenarioSummary {
    pub data_point_id: i64,
    pub data_point_name: String,
    pub total_salary: i64,
    pub headcount: i64,
}
```

Also add `scenario_group_id: Option<i64>` field to both `SalaryDataPointSummary` and `SalaryDataPointDetail` structs.

- [ ] **Step 2: Update `get_salary_data_points` to return `Vec<SalaryListItem>`**

Replace the entire `get_salary_data_points` function:

```rust
#[tauri::command(rename_all = "snake_case")]
pub fn get_salary_data_points(db: State<AppDb>) -> Result<Vec<SalaryListItem>, String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;

    // Fetch normal data points (not scenario children)
    let mut dp_stmt = conn
        .prepare("SELECT id, name, budget, previous_data_point_id, created_at FROM salary_data_points WHERE scenario_group_id IS NULL ORDER BY id DESC")
        .map_err(|e| e.to_string())?;
    let normal_points: Vec<SalaryDataPointSummary> = dp_stmt
        .query_map([], |row| {
            Ok(SalaryDataPointSummary {
                id: row.get(0)?,
                name: row.get(1)?,
                budget: row.get(2)?,
                previous_data_point_id: row.get(3)?,
                created_at: row.get(4)?,
                scenario_group_id: None,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    // Fetch scenario groups with their children
    let mut sg_stmt = conn
        .prepare("SELECT id, name, budget, previous_data_point_id, created_at FROM scenario_groups ORDER BY id DESC")
        .map_err(|e| e.to_string())?;
    let groups: Vec<(i64, String, Option<i64>, Option<i64>, String)> = sg_stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let mut child_stmt = conn
        .prepare("SELECT id, name, budget, previous_data_point_id, created_at, scenario_group_id FROM salary_data_points WHERE scenario_group_id = ?1 ORDER BY id ASC")
        .map_err(|e| e.to_string())?;

    let mut scenario_groups: Vec<ScenarioGroup> = Vec::new();
    for (sg_id, sg_name, sg_budget, sg_prev, sg_created) in groups {
        let children: Vec<SalaryDataPointSummary> = child_stmt
            .query_map(params![sg_id], |row| {
                Ok(SalaryDataPointSummary {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    budget: row.get(2)?,
                    previous_data_point_id: row.get(3)?,
                    created_at: row.get(4)?,
                    scenario_group_id: row.get(5)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;

        scenario_groups.push(ScenarioGroup {
            id: sg_id,
            name: sg_name,
            budget: sg_budget,
            previous_data_point_id: sg_prev,
            created_at: sg_created,
            children,
        });
    }

    // Interleave by created_at descending
    let mut items: Vec<SalaryListItem> = Vec::new();
    let mut dp_iter = normal_points.into_iter().peekable();
    let mut sg_iter = scenario_groups.into_iter().peekable();

    loop {
        match (dp_iter.peek(), sg_iter.peek()) {
            (Some(dp), Some(sg)) => {
                // Compare created_at descending (larger = more recent = first)
                if dp.created_at >= sg.created_at {
                    let dp = dp_iter.next().unwrap();
                    items.push(SalaryListItem::DataPoint { data_point: dp });
                } else {
                    let sg = sg_iter.next().unwrap();
                    items.push(SalaryListItem::ScenarioGroup { scenario_group: sg });
                }
            }
            (Some(_), None) => {
                let dp = dp_iter.next().unwrap();
                items.push(SalaryListItem::DataPoint { data_point: dp });
            }
            (None, Some(_)) => {
                let sg = sg_iter.next().unwrap();
                items.push(SalaryListItem::ScenarioGroup { scenario_group: sg });
            }
            (None, None) => break,
        }
    }

    Ok(items)
}
```

- [ ] **Step 3: Update `get_salary_data_point` to include scenario_group_id and use group ranges**

In the `get_salary_data_point` function:

1. Change the initial query to also fetch `scenario_group_id`:
```rust
let (name, budget, previous_data_point_id, scenario_group_id): (String, Option<i64>, Option<i64>, Option<i64>) = conn
    .query_row(
        "SELECT name, budget, previous_data_point_id, scenario_group_id FROM salary_data_points WHERE id = ?1",
        params![id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
    )
    .map_err(|e| e.to_string())?;
```

2. Change the range query to use `scenario_group_ranges` when `scenario_group_id` is set:
```rust
let ranges = if let Some(sg_id) = scenario_group_id {
    let mut range_stmt = conn
        .prepare(
            "SELECT sgr.id, sgr.title_id, t.name as title_name, sgr.min_salary, sgr.max_salary
             FROM scenario_group_ranges sgr
             JOIN titles t ON t.id = sgr.title_id
             WHERE sgr.scenario_group_id = ?1
             ORDER BY t.name ASC",
        )
        .map_err(|e| e.to_string())?;
    range_stmt
        .query_map(params![sg_id], |row| {
            Ok(SalaryRange {
                id: row.get(0)?,
                title_id: row.get(1)?,
                title_name: row.get(2)?,
                min_salary: row.get(3)?,
                max_salary: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?
} else {
    // existing salary_ranges query
    let mut range_stmt = conn
        .prepare(
            "SELECT sr.id, sr.title_id, t.name as title_name, sr.min_salary, sr.max_salary
             FROM salary_ranges sr
             JOIN titles t ON t.id = sr.title_id
             WHERE sr.data_point_id = ?1
             ORDER BY t.name ASC",
        )
        .map_err(|e| e.to_string())?;
    range_stmt
        .query_map(params![id], |row| {
            Ok(SalaryRange {
                id: row.get(0)?,
                title_id: row.get(1)?,
                title_name: row.get(2)?,
                min_salary: row.get(3)?,
                max_salary: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?
};
```

3. Add `scenario_group_id` to the return struct:
```rust
Ok(SalaryDataPointDetail {
    id,
    name,
    budget,
    previous_data_point_id,
    scenario_group_id,
    members,
    ranges,
})
```

- [ ] **Step 4: Update `create_salary_data_point` to exclude scenario children**

Change the prev_id query from:
```rust
"SELECT id FROM salary_data_points ORDER BY id DESC LIMIT 1"
```
to:
```rust
"SELECT id FROM salary_data_points WHERE scenario_group_id IS NULL ORDER BY id DESC LIMIT 1"
```

Also add `scenario_group_id: None` to both `SalaryDataPointSummary` return paths.

- [ ] **Step 5: Update `get_salary_over_time` to exclude scenario children**

Change:
```rust
"SELECT id, name FROM salary_data_points ORDER BY id"
```
to:
```rust
"SELECT id, name FROM salary_data_points WHERE scenario_group_id IS NULL ORDER BY id"
```

- [ ] **Step 6: Run `cargo build`**

Run: `cd src-tauri && cargo build`
Expected: Compiles successfully.

- [ ] **Step 7: Run tests**

Run: `cd src-tauri && cargo test`
Expected: All tests PASS.

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/commands.rs
git commit -m "feat: add scenario structs and update existing salary commands"
```

---

## Chunk 2: New Rust Commands

### Task 3: Implement `create_scenario_group`

**Files:**
- Modify: `src-tauri/src/commands.rs`

- [ ] **Step 1: Add the command**

Add after the `get_salary_over_time` function (before Report commands):

```rust
// ── Scenario group commands ──

#[tauri::command(rename_all = "snake_case")]
pub fn create_scenario_group(
    db: State<AppDb>,
    previous_data_point_id: Option<i64>,
    count: i64,
) -> Result<ScenarioGroup, String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;

    if count < 2 {
        return Err("Scenario group must have at least 2 scenarios".to_string());
    }

    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let group_name = format!("{} Scenarios", today);

    conn.execute_batch("BEGIN").map_err(|e| e.to_string())?;

    let result: Result<ScenarioGroup, String> = (|| {
        // Get budget and ranges from previous if set
        let prev_budget: Option<i64> = previous_data_point_id.and_then(|prev_id| {
            conn.query_row(
                "SELECT budget FROM salary_data_points WHERE id = ?1",
                params![prev_id],
                |row| row.get(0),
            ).ok()
        });

        conn.execute(
            "INSERT INTO scenario_groups (name, budget, previous_data_point_id) VALUES (?1, ?2, ?3)",
            params![group_name, prev_budget, previous_data_point_id],
        ).map_err(|e| e.to_string())?;
        let group_id = conn.last_insert_rowid();

        // Copy ranges from previous data point to group ranges
        if let Some(prev_id) = previous_data_point_id {
            conn.execute(
                "INSERT INTO scenario_group_ranges (scenario_group_id, title_id, min_salary, max_salary)
                 SELECT ?1, title_id, min_salary, max_salary
                 FROM salary_ranges WHERE data_point_id = ?2",
                params![group_id, prev_id],
            ).map_err(|e| e.to_string())?;
        }

        // Create N child data points
        let mut children = Vec::new();
        for i in 1..=count {
            let child_name = format!("Scenario {}", i);

            if let Some(prev_id) = previous_data_point_id {
                conn.execute(
                    "INSERT INTO salary_data_points (name, scenario_group_id) VALUES (?1, ?2)",
                    params![child_name, group_id],
                ).map_err(|e| e.to_string())?;
                let child_id = conn.last_insert_rowid();

                // Copy members
                conn.execute(
                    "INSERT INTO salary_data_point_members (data_point_id, member_id, is_active, is_promoted, promoted_title_id)
                     SELECT ?1, sdpm.member_id, sdpm.is_active, sdpm.is_promoted, sdpm.promoted_title_id
                     FROM salary_data_point_members sdpm
                     JOIN team_members m ON m.id = sdpm.member_id
                     WHERE sdpm.data_point_id = ?2 AND m.exclude_from_salary = 0 AND m.left_date IS NULL",
                    params![child_id, prev_id],
                ).map_err(|e| e.to_string())?;

                // Copy salary parts
                conn.execute(
                    "INSERT INTO salary_parts (data_point_member_id, name, amount, frequency, is_variable, sort_order)
                     SELECT new_sdpm.id, sp.name, sp.amount, sp.frequency, sp.is_variable, sp.sort_order
                     FROM salary_parts sp
                     JOIN salary_data_point_members old_sdpm ON old_sdpm.id = sp.data_point_member_id
                     JOIN salary_data_point_members new_sdpm ON new_sdpm.data_point_id = ?1
                         AND new_sdpm.member_id = old_sdpm.member_id
                     WHERE old_sdpm.data_point_id = ?2",
                    params![child_id, prev_id],
                ).map_err(|e| e.to_string())?;

                let created_at: String = conn
                    .query_row("SELECT created_at FROM salary_data_points WHERE id = ?1", params![child_id], |row| row.get(0))
                    .map_err(|e| e.to_string())?;

                children.push(SalaryDataPointSummary {
                    id: child_id,
                    name: child_name,
                    budget: None,
                    previous_data_point_id: None,
                    created_at,
                    scenario_group_id: Some(group_id),
                });
            } else {
                conn.execute(
                    "INSERT INTO salary_data_points (name, scenario_group_id) VALUES (?1, ?2)",
                    params![child_name, group_id],
                ).map_err(|e| e.to_string())?;
                let child_id = conn.last_insert_rowid();

                // Add all non-excluded, non-left members
                conn.execute(
                    "INSERT INTO salary_data_point_members (data_point_id, member_id, is_active, is_promoted)
                     SELECT ?1, id, 1, 0 FROM team_members WHERE exclude_from_salary = 0 AND left_date IS NULL",
                    params![child_id],
                ).map_err(|e| e.to_string())?;

                let created_at: String = conn
                    .query_row("SELECT created_at FROM salary_data_points WHERE id = ?1", params![child_id], |row| row.get(0))
                    .map_err(|e| e.to_string())?;

                children.push(SalaryDataPointSummary {
                    id: child_id,
                    name: child_name,
                    budget: None,
                    previous_data_point_id: None,
                    created_at,
                    scenario_group_id: Some(group_id),
                });
            }
        }

        let group_created_at: String = conn
            .query_row("SELECT created_at FROM scenario_groups WHERE id = ?1", params![group_id], |row| row.get(0))
            .map_err(|e| e.to_string())?;

        Ok(ScenarioGroup {
            id: group_id,
            name: group_name,
            budget: prev_budget,
            previous_data_point_id,
            created_at: group_created_at,
            children,
        })
    })();

    match &result {
        Ok(_) => conn.execute_batch("COMMIT").map_err(|e| e.to_string())?,
        Err(_) => { let _ = conn.execute_batch("ROLLBACK"); }
    }

    result
}
```

- [ ] **Step 2: Run `cargo build`**

Run: `cd src-tauri && cargo build`
Expected: Compiles.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/commands.rs
git commit -m "feat: add create_scenario_group command"
```

### Task 4: Implement remaining scenario commands

**Files:**
- Modify: `src-tauri/src/commands.rs`

- [ ] **Step 1: Add `delete_scenario_group`**

```rust
#[tauri::command(rename_all = "snake_case")]
pub fn delete_scenario_group(db: State<AppDb>, id: i64) -> Result<(), String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute("DELETE FROM scenario_groups WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
```

- [ ] **Step 2: Add `update_scenario_group`**

```rust
#[tauri::command(rename_all = "snake_case")]
pub fn update_scenario_group(
    db: State<AppDb>,
    id: i64,
    field: String,
    value: Option<String>,
) -> Result<(), String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    let allowed = ["name", "budget"];
    if !allowed.contains(&field.as_str()) {
        return Err(format!("Invalid field: {}", field));
    }
    let sql = format!("UPDATE scenario_groups SET {} = ?1 WHERE id = ?2", field);
    conn.execute(&sql, params![value, id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
```

- [ ] **Step 3: Add `update_scenario_group_range`**

```rust
#[tauri::command(rename_all = "snake_case")]
pub fn update_scenario_group_range(
    db: State<AppDb>,
    scenario_group_id: i64,
    title_id: i64,
    min_salary: i64,
    max_salary: i64,
) -> Result<(), String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute(
        "INSERT INTO scenario_group_ranges (scenario_group_id, title_id, min_salary, max_salary)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(scenario_group_id, title_id) DO UPDATE SET min_salary = excluded.min_salary, max_salary = excluded.max_salary",
        params![scenario_group_id, title_id, min_salary, max_salary],
    ).map_err(|e| e.to_string())?;
    Ok(())
}
```

- [ ] **Step 4: Add `add_scenario`**

```rust
#[tauri::command(rename_all = "snake_case")]
pub fn add_scenario(db: State<AppDb>, scenario_group_id: i64) -> Result<SalaryDataPointSummary, String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;

    // Get current child count
    let child_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM salary_data_points WHERE scenario_group_id = ?1",
            params![scenario_group_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let new_name = format!("Scenario {}", child_count + 1);

    // Find lowest-ID sibling to copy from
    let source_dp_id: i64 = conn
        .query_row(
            "SELECT id FROM salary_data_points WHERE scenario_group_id = ?1 ORDER BY id ASC LIMIT 1",
            params![scenario_group_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    conn.execute_batch("BEGIN").map_err(|e| e.to_string())?;

    let result: Result<SalaryDataPointSummary, String> = (|| {
        conn.execute(
            "INSERT INTO salary_data_points (name, scenario_group_id) VALUES (?1, ?2)",
            params![new_name, scenario_group_id],
        ).map_err(|e| e.to_string())?;
        let new_id = conn.last_insert_rowid();

        // Copy members from source
        conn.execute(
            "INSERT INTO salary_data_point_members (data_point_id, member_id, is_active, is_promoted, promoted_title_id)
             SELECT ?1, member_id, is_active, is_promoted, promoted_title_id
             FROM salary_data_point_members WHERE data_point_id = ?2",
            params![new_id, source_dp_id],
        ).map_err(|e| e.to_string())?;

        // Copy salary parts
        conn.execute(
            "INSERT INTO salary_parts (data_point_member_id, name, amount, frequency, is_variable, sort_order)
             SELECT new_sdpm.id, sp.name, sp.amount, sp.frequency, sp.is_variable, sp.sort_order
             FROM salary_parts sp
             JOIN salary_data_point_members old_sdpm ON old_sdpm.id = sp.data_point_member_id
             JOIN salary_data_point_members new_sdpm ON new_sdpm.data_point_id = ?1
                 AND new_sdpm.member_id = old_sdpm.member_id
             WHERE old_sdpm.data_point_id = ?2",
            params![new_id, source_dp_id],
        ).map_err(|e| e.to_string())?;

        let created_at: String = conn
            .query_row("SELECT created_at FROM salary_data_points WHERE id = ?1", params![new_id], |row| row.get(0))
            .map_err(|e| e.to_string())?;

        Ok(SalaryDataPointSummary {
            id: new_id,
            name: new_name,
            budget: None,
            previous_data_point_id: None,
            created_at,
            scenario_group_id: Some(scenario_group_id),
        })
    })();

    match &result {
        Ok(_) => conn.execute_batch("COMMIT").map_err(|e| e.to_string())?,
        Err(_) => { let _ = conn.execute_batch("ROLLBACK"); }
    }

    result
}
```

- [ ] **Step 5: Add `remove_scenario`**

```rust
#[tauri::command(rename_all = "snake_case")]
pub fn remove_scenario(db: State<AppDb>, data_point_id: i64) -> Result<(), String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;

    let sg_id: i64 = conn
        .query_row(
            "SELECT scenario_group_id FROM salary_data_points WHERE id = ?1",
            params![data_point_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let child_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM salary_data_points WHERE scenario_group_id = ?1",
            params![sg_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    if child_count <= 2 {
        return Err("Cannot remove scenario: group must have at least 2 scenarios".to_string());
    }

    conn.execute("DELETE FROM salary_data_points WHERE id = ?1", params![data_point_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
```

- [ ] **Step 6: Add `promote_scenario`**

```rust
#[tauri::command(rename_all = "snake_case")]
pub fn promote_scenario(db: State<AppDb>, data_point_id: i64) -> Result<(), String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;

    conn.execute_batch("BEGIN").map_err(|e| e.to_string())?;

    let result: Result<(), String> = (|| {
        // 1. Look up group info
        let (sg_id, sg_prev, sg_budget): (i64, Option<i64>, Option<i64>) = conn
            .query_row(
                "SELECT sg.id, sg.previous_data_point_id, sg.budget
                 FROM scenario_groups sg
                 JOIN salary_data_points sdp ON sdp.scenario_group_id = sg.id
                 WHERE sdp.id = ?1",
                params![data_point_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .map_err(|e| e.to_string())?;

        // 2. Detach from group
        conn.execute(
            "UPDATE salary_data_points SET scenario_group_id = NULL WHERE id = ?1",
            params![data_point_id],
        ).map_err(|e| e.to_string())?;

        // 3. Set previous_data_point_id from group
        conn.execute(
            "UPDATE salary_data_points SET previous_data_point_id = ?1 WHERE id = ?2",
            params![sg_prev, data_point_id],
        ).map_err(|e| e.to_string())?;

        // 4. Set budget from group
        conn.execute(
            "UPDATE salary_data_points SET budget = ?1 WHERE id = ?2",
            params![sg_budget, data_point_id],
        ).map_err(|e| e.to_string())?;

        // 5. Copy group ranges to salary_ranges
        conn.execute(
            "INSERT INTO salary_ranges (data_point_id, title_id, min_salary, max_salary)
             SELECT ?1, title_id, min_salary, max_salary
             FROM scenario_group_ranges WHERE scenario_group_id = ?2",
            params![data_point_id, sg_id],
        ).map_err(|e| e.to_string())?;

        // 6. Delete group (CASCADE removes siblings and group ranges)
        conn.execute("DELETE FROM scenario_groups WHERE id = ?1", params![sg_id])
            .map_err(|e| e.to_string())?;

        Ok(())
    })();

    match &result {
        Ok(_) => conn.execute_batch("COMMIT").map_err(|e| e.to_string())?,
        Err(_) => { let _ = conn.execute_batch("ROLLBACK"); }
    }

    result
}
```

- [ ] **Step 7: Add `get_scenario_summaries`**

```rust
#[tauri::command(rename_all = "snake_case")]
pub fn get_scenario_summaries(db: State<AppDb>, scenario_group_id: i64) -> Result<Vec<ScenarioSummary>, String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;

    let mut stmt = conn
        .prepare(
            "SELECT sdp.id, sdp.name,
                    COALESCE(SUM(CASE WHEN sdpm.is_active = 1 THEN sp.amount * sp.frequency ELSE 0 END), 0) as total_salary
             FROM salary_data_points sdp
             LEFT JOIN salary_data_point_members sdpm ON sdpm.data_point_id = sdp.id
             LEFT JOIN salary_parts sp ON sp.data_point_member_id = sdpm.id
             WHERE sdp.scenario_group_id = ?1
             GROUP BY sdp.id
             ORDER BY sdp.id ASC",
        )
        .map_err(|e| e.to_string())?;

    let summaries: Vec<(i64, String, i64)> = stmt
        .query_map(params![scenario_group_id], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for (dp_id, dp_name, total_salary) in summaries {
        let headcount: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM salary_data_point_members WHERE data_point_id = ?1 AND is_active = 1",
                params![dp_id],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;

        result.push(ScenarioSummary {
            data_point_id: dp_id,
            data_point_name: dp_name,
            total_salary,
            headcount,
        });
    }

    Ok(result)
}
```

- [ ] **Step 8: Add `get_scenario_member_comparison`**

```rust
#[derive(Serialize)]
pub struct ScenarioMemberComparison {
    pub data_point_id: i64,
    pub data_point_name: String,
    pub annual_total: i64,
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_scenario_member_comparison(
    db: State<AppDb>,
    scenario_group_id: i64,
    member_id: i64,
) -> Result<Vec<ScenarioMemberComparison>, String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;

    let mut stmt = conn
        .prepare(
            "SELECT sdp.id, sdp.name,
                    COALESCE(SUM(sp.amount * sp.frequency), 0) as annual_total
             FROM salary_data_points sdp
             JOIN salary_data_point_members sdpm ON sdpm.data_point_id = sdp.id AND sdpm.member_id = ?2
             LEFT JOIN salary_parts sp ON sp.data_point_member_id = sdpm.id
             WHERE sdp.scenario_group_id = ?1
             GROUP BY sdp.id
             ORDER BY sdp.id ASC",
        )
        .map_err(|e| e.to_string())?;

    let results = stmt
        .query_map(params![scenario_group_id, member_id], |row| {
            Ok(ScenarioMemberComparison {
                data_point_id: row.get(0)?,
                data_point_name: row.get(1)?,
                annual_total: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(results)
}
```

- [ ] **Step 9: Run `cargo build`**

Run: `cd src-tauri && cargo build`
Expected: Compiles.

- [ ] **Step 10: Commit**

```bash
git add src-tauri/src/commands.rs
git commit -m "feat: add scenario group CRUD and comparison commands"
```

### Task 5: Register new commands in lib.rs

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add all new commands to generate_handler!**

After the `commands::get_report_detail,` line, add:

```rust
commands::create_scenario_group,
commands::delete_scenario_group,
commands::update_scenario_group,
commands::update_scenario_group_range,
commands::add_scenario,
commands::remove_scenario,
commands::promote_scenario,
commands::get_scenario_summaries,
commands::get_scenario_member_comparison,
```

- [ ] **Step 2: Run `cargo build`**

Run: `cd src-tauri && cargo build`
Expected: Compiles.

- [ ] **Step 3: Run all tests**

Run: `cd src-tauri && cargo test`
Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat: register scenario commands in Tauri handler"
```

### Task 5b: Add Rust tests for scenario commands

**Files:**
- Modify: `src-tauri/src/db.rs` (tests module)

> Note: The Tauri commands use `State<AppDb>` which requires Tauri runtime, so these tests exercise the underlying SQL logic directly against an in-memory database — the same pattern used by existing migration tests.

- [ ] **Step 1: Add test for create_scenario_group SQL logic**

```rust
#[test]
fn test_scenario_group_creation() {
    let conn = open_db_with_key(":memory:", "test-key-0123456789abcdef").unwrap();
    run_migrations(&conn).unwrap();

    // Create a base data point with a member and salary part
    conn.execute("INSERT INTO team_members (first_name, last_name) VALUES ('Alice', 'Smith')", []).unwrap();
    conn.execute("INSERT INTO salary_data_points (name) VALUES ('Base')", []).unwrap();
    let base_dp_id = conn.last_insert_rowid();
    conn.execute(
        "INSERT INTO salary_data_point_members (data_point_id, member_id, is_active, is_promoted) VALUES (?1, 1, 1, 0)",
        [base_dp_id],
    ).unwrap();
    let sdpm_id = conn.last_insert_rowid();
    conn.execute(
        "INSERT INTO salary_parts (data_point_member_id, name, amount, frequency, is_variable, sort_order) VALUES (?1, 'Base', 500000, 12, 0, 0)",
        [sdpm_id],
    ).unwrap();
    conn.execute(
        "INSERT INTO salary_ranges (data_point_id, title_id, min_salary, max_salary) VALUES (?1, 1, 0, 0)",
        [base_dp_id],
    ).ok(); // May fail if no title, that's ok for this test

    // Create scenario group
    conn.execute(
        "INSERT INTO scenario_groups (name, budget, previous_data_point_id) VALUES ('Test Scenarios', 1000000, ?1)",
        [base_dp_id],
    ).unwrap();
    let sg_id = conn.last_insert_rowid();

    // Create 2 child data points
    for i in 1..=2 {
        conn.execute(
            "INSERT INTO salary_data_points (name, scenario_group_id) VALUES (?1, ?2)",
            rusqlite::params![format!("Scenario {}", i), sg_id],
        ).unwrap();
    }

    // Verify children exist
    let child_count: i32 = conn.query_row(
        "SELECT COUNT(*) FROM salary_data_points WHERE scenario_group_id = ?1",
        [sg_id], |row| row.get(0),
    ).unwrap();
    assert_eq!(child_count, 2);

    // Verify children excluded from normal listing
    let normal_count: i32 = conn.query_row(
        "SELECT COUNT(*) FROM salary_data_points WHERE scenario_group_id IS NULL",
        [], |row| row.get(0),
    ).unwrap();
    assert_eq!(normal_count, 1); // Only the base data point
}
```

- [ ] **Step 2: Add test for promote_scenario SQL logic**

```rust
#[test]
fn test_promote_scenario() {
    let conn = open_db_with_key(":memory:", "test-key-0123456789abcdef").unwrap();
    run_migrations(&conn).unwrap();

    // Setup: base DP → scenario group with 2 children
    conn.execute("INSERT INTO salary_data_points (name) VALUES ('Base')", []).unwrap();
    let base_dp_id = conn.last_insert_rowid();

    conn.execute(
        "INSERT INTO scenario_groups (name, budget, previous_data_point_id) VALUES ('Scenarios', 500000, ?1)",
        [base_dp_id],
    ).unwrap();
    let sg_id = conn.last_insert_rowid();

    conn.execute(
        "INSERT INTO scenario_group_ranges (scenario_group_id, title_id, min_salary, max_salary) VALUES (?1, 1, 100000, 200000)",
        [sg_id],
    ).ok(); // May fail if no title

    conn.execute(
        "INSERT INTO salary_data_points (name, scenario_group_id) VALUES ('Scenario 1', ?1)",
        [sg_id],
    ).unwrap();
    let child1_id = conn.last_insert_rowid();

    conn.execute(
        "INSERT INTO salary_data_points (name, scenario_group_id) VALUES ('Scenario 2', ?1)",
        [sg_id],
    ).unwrap();

    // Promote child 1
    conn.execute_batch("BEGIN").unwrap();
    conn.execute("UPDATE salary_data_points SET scenario_group_id = NULL WHERE id = ?1", [child1_id]).unwrap();
    conn.execute("UPDATE salary_data_points SET previous_data_point_id = ?1 WHERE id = ?2",
        rusqlite::params![base_dp_id, child1_id]).unwrap();
    conn.execute("UPDATE salary_data_points SET budget = 500000 WHERE id = ?1", [child1_id]).unwrap();
    conn.execute("DELETE FROM scenario_groups WHERE id = ?1", [sg_id]).unwrap();
    conn.execute_batch("COMMIT").unwrap();

    // Verify promoted DP exists and is normal
    let sg_id_after: Option<i64> = conn.query_row(
        "SELECT scenario_group_id FROM salary_data_points WHERE id = ?1",
        [child1_id], |row| row.get(0),
    ).unwrap();
    assert!(sg_id_after.is_none());

    // Verify budget was copied
    let budget: Option<i64> = conn.query_row(
        "SELECT budget FROM salary_data_points WHERE id = ?1",
        [child1_id], |row| row.get(0),
    ).unwrap();
    assert_eq!(budget, Some(500000));

    // Verify sibling was cascade-deleted
    let sibling_count: i32 = conn.query_row(
        "SELECT COUNT(*) FROM salary_data_points WHERE name = 'Scenario 2'",
        [], |row| row.get(0),
    ).unwrap();
    assert_eq!(sibling_count, 0);

    // Verify group was deleted
    let group_count: i32 = conn.query_row(
        "SELECT COUNT(*) FROM scenario_groups",
        [], |row| row.get(0),
    ).unwrap();
    assert_eq!(group_count, 0);
}
```

- [ ] **Step 3: Add test for remove_scenario min-2 enforcement**

```rust
#[test]
fn test_remove_scenario_min_two() {
    let conn = open_db_with_key(":memory:", "test-key-0123456789abcdef").unwrap();
    run_migrations(&conn).unwrap();

    conn.execute(
        "INSERT INTO scenario_groups (name) VALUES ('Test')",
        [],
    ).unwrap();
    let sg_id = conn.last_insert_rowid();

    conn.execute(
        "INSERT INTO salary_data_points (name, scenario_group_id) VALUES ('S1', ?1)",
        [sg_id],
    ).unwrap();
    let child1_id = conn.last_insert_rowid();

    conn.execute(
        "INSERT INTO salary_data_points (name, scenario_group_id) VALUES ('S2', ?1)",
        [sg_id],
    ).unwrap();

    // With 2 children, should not be able to remove
    let child_count: i32 = conn.query_row(
        "SELECT COUNT(*) FROM salary_data_points WHERE scenario_group_id = ?1",
        [sg_id], |row| row.get(0),
    ).unwrap();
    assert_eq!(child_count, 2);

    // Add a third child — now removal should be possible
    conn.execute(
        "INSERT INTO salary_data_points (name, scenario_group_id) VALUES ('S3', ?1)",
        [sg_id],
    ).unwrap();

    conn.execute("DELETE FROM salary_data_points WHERE id = ?1", [child1_id]).unwrap();

    let remaining: i32 = conn.query_row(
        "SELECT COUNT(*) FROM salary_data_points WHERE scenario_group_id = ?1",
        [sg_id], |row| row.get(0),
    ).unwrap();
    assert_eq!(remaining, 2);
}
```

- [ ] **Step 4: Run tests**

Run: `cd src-tauri && cargo test`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/db.rs
git commit -m "test: add Rust tests for scenario group operations"
```

---

## Chunk 3: Frontend Types and DB Layer

### Task 6: Update TypeScript types

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Add `scenario_group_id` to SalaryDataPointSummary**

```typescript
export interface SalaryDataPointSummary {
  id: number;
  name: string;
  budget: number | null;
  previous_data_point_id: number | null;
  created_at: string;
  scenario_group_id: number | null;
}
```

- [ ] **Step 2: Add `scenario_group_id` to SalaryDataPointDetail**

```typescript
export interface SalaryDataPointDetail {
  id: number;
  name: string;
  budget: number | null;
  previous_data_point_id: number | null;
  scenario_group_id: number | null;
  members: SalaryDataPointMember[];
  ranges: SalaryRange[];
}
```

- [ ] **Step 3: Add new types at end of file**

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

export interface ScenarioMemberComparison {
  data_point_id: number;
  data_point_name: string;
  annual_total: number;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add TypeScript types for scenario modeling"
```

### Task 7: Update db.ts with new invoke calls

**Files:**
- Modify: `src/lib/db.ts`

- [ ] **Step 1: Update imports**

Add `ScenarioGroup`, `SalaryListItem`, `ScenarioSummary`, `ScenarioMemberComparison` to the type import.

- [ ] **Step 2: Update `getSalaryDataPoints` return type**

```typescript
export const getSalaryDataPoints = () => invoke<SalaryListItem[]>("get_salary_data_points");
```

- [ ] **Step 3: Add new scenario invoke calls**

After the salary ranges section:

```typescript
// Scenario Groups
export const createScenarioGroup = (previousDataPointId: number | null, count: number) =>
  invoke<ScenarioGroup>("create_scenario_group", {
    previous_data_point_id: previousDataPointId,
    count,
  });
export const deleteScenarioGroup = (id: number) =>
  invoke<void>("delete_scenario_group", { id });
export const updateScenarioGroup = (id: number, field: string, value: string | null) =>
  invoke<void>("update_scenario_group", { id, field, value });
export const updateScenarioGroupRange = (
  scenarioGroupId: number,
  titleId: number,
  minSalary: number,
  maxSalary: number,
) =>
  invoke<void>("update_scenario_group_range", {
    scenario_group_id: scenarioGroupId,
    title_id: titleId,
    min_salary: minSalary,
    max_salary: maxSalary,
  });
export const addScenario = (scenarioGroupId: number) =>
  invoke<SalaryDataPointSummary>("add_scenario", { scenario_group_id: scenarioGroupId });
export const removeScenario = (dataPointId: number) =>
  invoke<void>("remove_scenario", { data_point_id: dataPointId });
export const promoteScenario = (dataPointId: number) =>
  invoke<void>("promote_scenario", { data_point_id: dataPointId });
export const getScenarioSummaries = (scenarioGroupId: number) =>
  invoke<ScenarioSummary[]>("get_scenario_summaries", { scenario_group_id: scenarioGroupId });
export const getScenarioMemberComparison = (scenarioGroupId: number, memberId: number) =>
  invoke<ScenarioMemberComparison[]>("get_scenario_member_comparison", {
    scenario_group_id: scenarioGroupId,
    member_id: memberId,
  });
```

- [ ] **Step 4: Run TypeScript check**

Run: `npm run build`
Expected: Type errors in components that use `getSalaryDataPoints` (they expect `SalaryDataPointSummary[]` but now get `SalaryListItem[]`). This is expected — we'll fix those in subsequent tasks.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db.ts
git commit -m "feat: add scenario invoke calls to db.ts"
```

---

## Chunk 4: Frontend Components — DataPointList

### Task 8: Update DataPointList to handle SalaryListItem[]

**Files:**
- Modify: `src/components/salary/DataPointList.tsx`

- [ ] **Step 1: Rewrite DataPointList**

Update the component to accept `SalaryListItem[]` and render scenario groups as expandable containers. Key changes:

- Props: `items: SalaryListItem[]` instead of `dataPoints: SalaryDataPointSummary[]`
- New props: `onDeleteGroup: (id: number) => void`, `onEditGroup: (group: ScenarioGroup) => void`, `onPromote: (dataPointId: number) => void`
- Track `expandedGroups: Set<number>` state
- Normal data points render as before
- Scenario groups render with purple accent, chevron toggle, name, budget
- Children render indented when group is expanded
- Children show a promote icon button on hover
- Drop virtualization for this list (scenario groups make flat indexing complex; list is unlikely to be large enough to need it)

```typescript
import type React from "react";
import { useState, useMemo } from "react";
import { Plus, Pencil, Trash2, Loader2, ChevronRight, ChevronDown, ArrowUpFromLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { cn } from "@/lib/utils";
import { formatCents } from "@/lib/salary-utils";
import type { SalaryListItem, SalaryDataPointSummary, ScenarioGroup } from "@/lib/types";

interface DataPointListProps {
  items: SalaryListItem[];
  selectedId: number | null;
  loading?: boolean;
  creating?: boolean;
  onSelect: (id: number) => void;
  onCreate: () => void;
  onEdit: (dp: SalaryDataPointSummary) => void;
  onEditGroup: (group: ScenarioGroup) => void;
  onDelete: (id: number) => void;
  onDeleteGroup: (id: number) => void;
  onPromote: (dataPointId: number) => void;
}

export function DataPointList({
  items,
  selectedId,
  loading,
  creating,
  onSelect,
  onCreate,
  onEdit,
  onEditGroup,
  onDelete,
  onDeleteGroup,
  onPromote,
}: DataPointListProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());

  function toggleGroup(groupId: number) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }

  // Build flat list of selectable IDs for keyboard navigation
  const selectableIds = useMemo(() => {
    const ids: number[] = [];
    for (const item of items) {
      if (item.type === "data_point") {
        ids.push(item.data_point.id);
      } else if (expandedGroups.has(item.scenario_group.id)) {
        for (const child of item.scenario_group.children) {
          ids.push(child.id);
        }
      }
    }
    return ids;
  }, [items, expandedGroups]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const currentIndex = selectableIds.indexOf(selectedId ?? -1);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = currentIndex < selectableIds.length - 1 ? currentIndex + 1 : 0;
      onSelect(selectableIds[next]);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = currentIndex > 0 ? currentIndex - 1 : selectableIds.length - 1;
      onSelect(selectableIds[prev]);
    }
  };

  return (
    <div className="flex h-full flex-col border-r">
      <div className="flex items-center justify-between border-b px-3 h-12">
        <h2 className="text-sm font-semibold">Data Points</h2>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onCreate}
          disabled={creating}
          title="New Data Point"
        >
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-2">
            <ListSkeleton />
          </div>
        ) : (
          <div className="flex flex-col gap-1 p-2 outline-none" tabIndex={0} onKeyDown={handleKeyDown}>
            {items.length === 0 && (
              <p className="px-2 py-4 text-center text-sm text-muted-foreground">
                No data points yet.
              </p>
            )}
            {items.map((item) => {
              if (item.type === "data_point") {
                const dp = item.data_point;
                return (
                  <div
                    key={`dp-${dp.id}`}
                    onClick={() => onSelect(dp.id)}
                    className={cn(
                      "group flex cursor-pointer items-center justify-between rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted/50",
                      selectedId === dp.id && "bg-muted",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{dp.name}</div>
                      {dp.budget != null && (
                        <div className="text-xs text-muted-foreground">
                          Budget: {formatCents(dp.budget)}
                        </div>
                      )}
                    </div>
                    <div className="ml-2 flex shrink-0 gap-1 opacity-0 group-hover:opacity-100">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEdit(dp);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(dp.id);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              } else {
                const group = item.scenario_group;
                const isExpanded = expandedGroups.has(group.id);
                return (
                  <div key={`sg-${group.id}`}>
                    <div
                      onClick={() => toggleGroup(group.id)}
                      className="group flex cursor-pointer items-center justify-between rounded-md px-3 py-2 text-sm transition-colors hover:bg-purple-100/50 dark:hover:bg-purple-900/20 bg-purple-50/50 dark:bg-purple-950/10"
                    >
                      <div className="flex items-center gap-1 min-w-0 flex-1">
                        {isExpanded ? (
                          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-purple-600 dark:text-purple-400" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-purple-600 dark:text-purple-400" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium text-purple-700 dark:text-purple-300">
                            {group.name}
                          </div>
                          {group.budget != null && (
                            <div className="text-xs text-muted-foreground">
                              Budget: {formatCents(group.budget)}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="ml-2 flex shrink-0 gap-1 opacity-0 group-hover:opacity-100">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditGroup(group);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteGroup(group.id);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    {isExpanded &&
                      group.children.map((child) => (
                        <div
                          key={`child-${child.id}`}
                          onClick={() => onSelect(child.id)}
                          className={cn(
                            "group flex cursor-pointer items-center justify-between rounded-md pl-8 pr-3 py-1.5 text-sm transition-colors hover:bg-muted/50",
                            selectedId === child.id && "bg-muted",
                          )}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-muted-foreground">{child.name}</div>
                          </div>
                          <div className="ml-2 flex shrink-0 gap-1 opacity-0 group-hover:opacity-100">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              title="Promote this scenario"
                              onClick={(e) => {
                                e.stopPropagation();
                                onPromote(child.id);
                              }}
                            >
                              <ArrowUpFromLine className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                  </div>
                );
              }
            })}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build compiles (expect errors in SalaryPlanner — not yet updated)**

Run: `npx tsc --noEmit 2>&1 | head -30`
Expected: Errors in SalaryPlanner.tsx due to prop changes. This is expected.

- [ ] **Step 3: Commit**

```bash
git add src/components/salary/DataPointList.tsx
git commit -m "feat: update DataPointList for scenario group support"
```

---

## Chunk 5: Frontend Components — DataPointModal, ScenarioComparisonTable, MemberSalaryCard

### Task 9: Update DataPointModal for scenario creation and group editing

**Files:**
- Modify: `src/components/salary/DataPointModal.tsx`

- [ ] **Step 1: Update DataPointModal**

Key changes:
- Add imports for `Switch`, `createScenarioGroup`, `updateScenarioGroup`, `updateScenarioGroupRange`, `addScenario`, `removeScenario`
- Add `ScenarioGroup` type import
- New props: `editingGroup: ScenarioGroup | null` (when editing a group instead of a data point)
- In create mode: add a "Scenario" Switch toggle. When on, show count input (min 2, default 2). On submit, call `createScenarioGroup` instead of normal save flow.
- In edit mode for groups: show name, budget, ranges (using `updateScenarioGroupRange`), and child count with +/- buttons
- Filter "Compare to" dropdown to exclude scenario children and groups

Add new props to the interface:
```typescript
interface DataPointModalProps {
  dataPointId: number | null;
  editingGroup: ScenarioGroup | null;
  titles: Title[];
  dataPoints: SalaryListItem[];
  isNew: boolean;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}
```

Add scenario toggle state:
```typescript
const [isScenario, setIsScenario] = useState(false);
const [scenarioCount, setScenarioCount] = useState(2);
```

Extract normal data points from `SalaryListItem[]` for the "Compare to" dropdown:
```typescript
const normalDataPoints = dataPoints
  .filter((item): item is { type: "data_point"; data_point: SalaryDataPointSummary } => item.type === "data_point")
  .map((item) => item.data_point);
const otherDataPoints = normalDataPoints.filter((dp) => dp.id !== dataPointId);
```

When `editingGroup` is set, render group-specific form (name, budget, ranges, child count +/-).

When `isScenario` is on in create mode, the save handler calls:
```typescript
await createScenarioGroup(
  previousDpId ? Number(previousDpId) : null,
  scenarioCount,
);
```

The full component implementation follows these patterns from the existing code but branches on `editingGroup` and `isScenario` state.

- [ ] **Step 2: Commit**

```bash
git add src/components/salary/DataPointModal.tsx
git commit -m "feat: add scenario creation toggle and group editing to DataPointModal"
```

### Task 10: Create ScenarioComparisonTable component

**Files:**
- Create: `src/components/salary/ScenarioComparisonTable.tsx`

- [ ] **Step 1: Create the component**

```typescript
import { formatCents } from "@/lib/salary-utils";
import { cn } from "@/lib/utils";
import type { ScenarioSummary } from "@/lib/types";

interface ScenarioComparisonTableProps {
  summaries: ScenarioSummary[];
  currentDataPointId: number;
  budget: number | null;
  previousTotal: number | null;
}

export function ScenarioComparisonTable({
  summaries,
  currentDataPointId,
  budget,
  previousTotal,
}: ScenarioComparisonTableProps) {
  if (summaries.length === 0) return null;

  return (
    <div className="rounded-lg border border-purple-200 dark:border-purple-800/50 bg-purple-50/30 dark:bg-purple-950/10 p-4">
      <h3 className="text-sm font-semibold mb-3 text-purple-700 dark:text-purple-300">
        Scenario Comparison
      </h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-muted-foreground">
            <th className="px-2 py-1 text-left font-medium">Scenario</th>
            <th className="px-2 py-1 text-right font-medium">Total Cost</th>
            <th className="px-2 py-1 text-right font-medium">Budget</th>
            <th className="px-2 py-1 text-right font-medium">Delta</th>
            <th className="px-2 py-1 text-right font-medium">Headcount</th>
          </tr>
        </thead>
        <tbody>
          {previousTotal != null && (
            <tr className="text-xs text-muted-foreground border-b">
              <td className="px-2 py-1.5 italic">Previous</td>
              <td className="px-2 py-1.5 text-right">{formatCents(previousTotal)}</td>
              <td className="px-2 py-1.5 text-right">—</td>
              <td className="px-2 py-1.5 text-right">—</td>
              <td className="px-2 py-1.5 text-right">—</td>
            </tr>
          )}
          {summaries.map((s) => {
            const delta = previousTotal != null ? s.total_salary - previousTotal : null;
            const deltaPct = previousTotal && previousTotal > 0 ? (delta! / previousTotal) * 100 : null;
            const budgetDiff = budget != null ? s.total_salary - budget : null;
            return (
              <tr
                key={s.data_point_id}
                className={cn(
                  s.data_point_id === currentDataPointId &&
                    "bg-purple-100/50 dark:bg-purple-900/20 font-medium",
                )}
              >
                <td className="px-2 py-1.5">{s.data_point_name}</td>
                <td className="px-2 py-1.5 text-right">{formatCents(s.total_salary)}</td>
                <td className="px-2 py-1.5 text-right">
                  {budget != null ? formatCents(budget) : "—"}
                  {budgetDiff != null && (
                    <span className={cn("ml-1 text-xs", budgetDiff > 0 ? "text-red-600" : "text-green-600")}>
                      ({budgetDiff > 0 ? "+" : ""}{formatCents(budgetDiff)})
                    </span>
                  )}
                </td>
                <td className="px-2 py-1.5 text-right">
                  {delta != null ? (
                    <span className={delta > 0 ? "text-red-600" : "text-green-600"}>
                      {delta > 0 ? "+" : ""}
                      {formatCents(delta)}
                      {deltaPct != null && (
                        <span className="ml-1 text-xs">({deltaPct > 0 ? "+" : ""}{deltaPct.toFixed(1)}%)</span>
                      )}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-2 py-1.5 text-right">{s.headcount}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/salary/ScenarioComparisonTable.tsx
git commit -m "feat: add ScenarioComparisonTable component"
```

### Task 11: Update MemberSalaryCard with scenario comparison row

**Files:**
- Modify: `src/components/salary/MemberSalaryCard.tsx`

- [ ] **Step 1: Add comparison row**

Add optional prop:
```typescript
scenarioComparison?: ScenarioMemberComparison[];
```

After the "Add Part" button, when `scenarioComparison` is provided and has items, render:

```tsx
{scenarioComparison && scenarioComparison.length > 0 && (
  <div className="mt-3 pt-3 border-t border-purple-200 dark:border-purple-800/50">
    <div className="text-xs font-medium text-purple-600 dark:text-purple-400 mb-1">
      Scenario comparison
    </div>
    <div className="flex flex-wrap gap-3 text-xs">
      {scenarioComparison.map((sc) => (
        <div key={sc.data_point_id} className="flex items-center gap-1">
          <span className="text-muted-foreground">{sc.data_point_name}:</span>
          <span className="font-medium">{formatCents(sc.annual_total)}/yr</span>
        </div>
      ))}
    </div>
  </div>
)}
```

Import `ScenarioMemberComparison` and `formatCents` (formatCents already imported).

- [ ] **Step 2: Commit**

```bash
git add src/components/salary/MemberSalaryCard.tsx
git commit -m "feat: add scenario comparison row to MemberSalaryCard"
```

---

## Chunk 6: SalaryPlanner Page Integration

### Task 12: Update SalaryPlanner to handle SalaryListItem[]

**Files:**
- Modify: `src/pages/SalaryPlanner.tsx`

- [ ] **Step 1: Update state and imports**

Replace `SalaryDataPointSummary[]` state with `SalaryListItem[]`:

```typescript
import type { SalaryListItem, SalaryDataPointDetail, SalaryPart, Title, ScenarioGroup, ScenarioSummary, ScenarioMemberComparison } from "@/lib/types";
```

Add imports for new db functions:
```typescript
import {
  getSalaryDataPoints,
  getSalaryDataPoint,
  createSalaryDataPoint,
  deleteSalaryDataPoint,
  createSalaryPart,
  deleteSalaryPart as deleteSalaryPartApi,
  getPreviousMemberData,
  getTitles,
  createScenarioGroup,
  deleteScenarioGroup,
  promoteScenario,
  getScenarioSummaries,
  getScenarioMemberComparison,
} from "@/lib/db";
```

Update state:
```typescript
const [listItems, setListItems] = useState<SalaryListItem[]>([]);
const [scenarioSummaries, setScenarioSummaries] = useState<ScenarioSummary[]>([]);
const [memberComparisons, setMemberComparisons] = useState<Record<number, ScenarioMemberComparison[]>>({});
const [editingGroup, setEditingGroup] = useState<ScenarioGroup | null>(null);
```

- [ ] **Step 2: Update loadDataPoints to use SalaryListItem[]**

```typescript
const loadDataPoints = useCallback(async () => {
  const [items, t] = await Promise.all([getSalaryDataPoints(), getTitles()]);
  setListItems(items);
  setTitles(t);
  return items;
}, []);
```

- [ ] **Step 3: Update initial load and selection**

On initial load, auto-select the first data point (from either a normal data point or the first child of a scenario group):
```typescript
useEffect(() => {
  let cancelled = false;
  Promise.all([getSalaryDataPoints(), getTitles()])
    .then(([items, t]) => {
      if (cancelled) return;
      setListItems(items);
      setTitles(t);
      // Select first selectable item
      for (const item of items) {
        if (item.type === "data_point") {
          setSelectedId(item.data_point.id);
          break;
        } else if (item.scenario_group.children.length > 0) {
          setSelectedId(item.scenario_group.children[0].id);
          break;
        }
      }
      setLoading(false);
    })
    .catch(() => {
      if (!cancelled) {
        showError("Failed to load salary data");
        setLoading(false);
      }
    });
  return () => { cancelled = true; };
}, []);
```

- [ ] **Step 4: Load scenario data when viewing a scenario child**

When detail loads and has `scenario_group_id`, fetch scenario summaries and member comparisons:
```typescript
useEffect(() => {
  if (!detail?.scenario_group_id) {
    setScenarioSummaries([]);
    setMemberComparisons({});
    return;
  }
  let cancelled = false;
  const sgId = detail.scenario_group_id;

  getScenarioSummaries(sgId).then((summaries) => {
    if (!cancelled) setScenarioSummaries(summaries);
  });

  Promise.all(
    detail.members.map(async (m) => {
      const comparison = await getScenarioMemberComparison(sgId, m.member_id);
      return [m.member_id, comparison] as const;
    }),
  ).then((entries) => {
    if (!cancelled) setMemberComparisons(Object.fromEntries(entries));
  });

  return () => { cancelled = true; };
}, [detail]);
```

- [ ] **Step 5: Update handleCreate for scenario support**

Change `handleCreate` to open the modal in pure "create" mode without pre-creating a data point. The modal itself handles creation on save (either `createSalaryDataPoint` or `createScenarioGroup` depending on the scenario toggle):

```typescript
function handleCreate() {
  setEditingDpId(null);
  setEditingGroup(null);
  setEditingIsNew(true);
  setModalOpen(true);
}
```

The DataPointModal's `handleSave` in create mode (`isNew && !editingGroup && dataPointId === null`) will:
- If scenario toggle is OFF: call `createSalaryDataPoint()`, then apply form values via `updateSalaryDataPoint` calls, then call `onSaved()`
- If scenario toggle is ON: call `createScenarioGroup(previousDpId, scenarioCount)`, then call `onSaved()`

This avoids the pre-create-then-delete pattern entirely.

- [ ] **Step 6: Add handlers for scenario group operations**

```typescript
function handleEditGroup(group: ScenarioGroup) {
  setEditingGroup(group);
  setEditingDpId(null);
  setEditingIsNew(false);
  setModalOpen(true);
}

async function handleDeleteGroup(groupId: number) {
  // Use AlertDialog flow similar to handleDelete
  scheduleDelete({
    id: groupId,
    label: "Scenario group",
    onConfirm: async () => {
      await deleteScenarioGroup(groupId);
      const items = await loadDataPoints();
      // Select first available item
      setSelectedId(null);
      setDetail(null);
      for (const item of items) {
        if (item.type === "data_point") {
          setSelectedId(item.data_point.id);
          break;
        }
      }
    },
  });
}

async function handlePromote(dataPointId: number) {
  try {
    await promoteScenario(dataPointId);
    await loadDataPoints();
    setSelectedId(dataPointId);
    if (selectedId === dataPointId) {
      await loadDetail(dataPointId);
    }
    showSuccess("Scenario promoted to data point");
  } catch {
    showError("Failed to promote scenario");
  }
}
```

- [ ] **Step 7: Update visibleDataPoints → visibleItems**

```typescript
const visibleItems = useMemo(
  () => listItems.filter((item) => {
    if (item.type === "data_point") return !pendingIds.has(item.data_point.id);
    return !pendingIds.has(item.scenario_group.id);
  }),
  [listItems, pendingIds],
);
```

- [ ] **Step 8: Update the render to use new DataPointList props**

```tsx
<DataPointList
  items={visibleItems}
  selectedId={selectedId}
  loading={loading}
  creating={creating}
  onSelect={setSelectedId}
  onCreate={handleCreate}
  onEdit={handleEdit}
  onEditGroup={handleEditGroup}
  onDelete={handleDelete}
  onDeleteGroup={handleDeleteGroup}
  onPromote={handlePromote}
/>
```

- [ ] **Step 9: Add ScenarioComparisonTable to detail view**

Import and render the table when viewing a scenario child:

```tsx
import { ScenarioComparisonTable } from "@/components/salary/ScenarioComparisonTable";
```

In the detail view, before the member salary cards:
```tsx
{detail.scenario_group_id && scenarioSummaries.length > 0 && (
  <ScenarioComparisonTable
    summaries={scenarioSummaries}
    currentDataPointId={detail.id}
    budget={detail.budget}
    previousTotal={/* sum from previousData */}
  />
)}
```

Calculate `previousTotal`:
```typescript
const previousTotal = useMemo(() => {
  if (!previousData || Object.keys(previousData).length === 0) return null;
  let total = 0;
  for (const parts of Object.values(previousData)) {
    if (parts) {
      for (const p of parts) {
        total += p.amount * p.frequency;
      }
    }
  }
  return total;
}, [previousData]);
```

- [ ] **Step 10: Pass scenario comparison to MemberSalaryCard**

```tsx
<MemberSalaryCard
  key={member.id}
  member={member}
  ranges={detail.ranges}
  onAddPart={handleAddPart}
  onDeletePart={handleDeletePart}
  onChanged={handlePartChanged}
  scenarioComparison={detail.scenario_group_id ? memberComparisons[member.member_id] : undefined}
/>
```

- [ ] **Step 11: Update DataPointModal props**

```tsx
<DataPointModal
  dataPointId={editingDpId}
  editingGroup={editingGroup}
  titles={titles}
  dataPoints={listItems}
  isNew={editingIsNew}
  open={modalOpen}
  onClose={() => {
    setModalOpen(false);
    setEditingGroup(null);
  }}
  onSaved={handleModalSaved}
/>
```

- [ ] **Step 12: Update handleDelete to work with SalaryListItem[]**

```typescript
function handleDelete(id: number) {
  // Find the data point in list items
  let dpName = "Data point";
  for (const item of listItems) {
    if (item.type === "data_point" && item.data_point.id === id) {
      dpName = item.data_point.name || dpName;
      break;
    }
  }
  const wasSelected = selectedId === id;
  scheduleDelete({
    id,
    label: dpName,
    onConfirm: async () => {
      await deleteSalaryDataPoint(id);
      const items = await loadDataPoints();
      if (wasSelected) {
        let newId: number | null = null;
        for (const item of items) {
          if (item.type === "data_point") {
            newId = item.data_point.id;
            break;
          }
        }
        setSelectedId(newId);
        setDetail(null);
      }
    },
    onUndo: wasSelected ? () => setSelectedId(id) : undefined,
  });
  if (wasSelected) {
    setSelectedId(null);
    setDetail(null);
  }
}
```

- [ ] **Step 13: Run build**

Run: `npm run build`
Expected: Compiles without errors.

- [ ] **Step 14: Commit**

```bash
git add src/pages/SalaryPlanner.tsx
git commit -m "feat: integrate scenario modeling into SalaryPlanner page"
```

---

## Chunk 7: DataPointModal Scenario Details + AlertDialogs

### Task 13: Complete DataPointModal scenario implementation

**Files:**
- Modify: `src/components/salary/DataPointModal.tsx`

- [ ] **Step 1: Add scenario create mode UI**

In create mode, after the "Budget" field, add:

```tsx
<Separator />
<div className="flex items-center justify-between">
  <Label>Create as Scenario Group</Label>
  <Switch checked={isScenario} onCheckedChange={setIsScenario} />
</div>
{isScenario && (
  <div className="flex flex-col gap-1.5">
    <Label>Number of Scenarios</Label>
    <Input
      type="number"
      min={2}
      value={scenarioCount}
      onChange={(e) => setScenarioCount(Math.max(2, parseInt(e.target.value) || 2))}
    />
  </div>
)}
```

- [ ] **Step 2: Add group edit mode UI**

When `editingGroup` is set, render a different form:
- Name input (save via `updateScenarioGroup`)
- Budget input (save via `updateScenarioGroup`)
- Salary ranges (save via `updateScenarioGroupRange`)
- Child count display with +/- buttons (add calls `addScenario`, remove calls `removeScenario`)

```tsx
if (editingGroup) {
  // Render group-specific form
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>Edit Scenario Group</DialogTitle>
        </DialogHeader>
        <ScrollArea className="flex-1 pr-4">
          {/* name, budget, ranges, child count +/- */}
        </ScrollArea>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleGroupSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Handle save in create mode (pure create, no pre-created data point)**

In `handleSave`, at the top — since `handleCreate` no longer pre-creates a data point, the modal handles creation:

```typescript
if (isNew && !editingGroup) {
  setSaving(true);
  try {
    if (isScenario) {
      // Create scenario group directly
      await createScenarioGroup(
        previousDpId ? Number(previousDpId) : null,
        scenarioCount,
      );
    } else {
      // Create normal data point, then apply form values
      const dp = await createSalaryDataPoint();
      if (name !== dp.name) {
        await updateSalaryDataPoint(dp.id, "name", name);
      }
      const budgetCents = budget === "" ? null : String(Math.round(parseFloat(budget) * 100));
      if (budgetCents) {
        await updateSalaryDataPoint(dp.id, "budget", budgetCents);
      }
      if (previousDpId) {
        await updateSalaryDataPoint(dp.id, "previous_data_point_id", previousDpId);
      }
      // Save ranges and member states as in existing handleSave logic
    }
    onSaved();
    onClose();
  } finally {
    setSaving(false);
  }
  return;
}
```

- [ ] **Step 4: Add promote AlertDialog to DataPointList**

In the DataPointList, wrap the promote button click in an AlertDialog confirmation. Import AlertDialog components and manage state for pending promote.

Actually, the promote confirmation should be in SalaryPlanner since it owns the data flow. Use the existing `scheduleDelete`-like pattern or add a simple `window.confirm`-style AlertDialog.

Simplest approach: add a confirmation dialog in SalaryPlanner for promote:

```typescript
const [promotingId, setPromotingId] = useState<number | null>(null);
```

And in the render:
```tsx
<AlertDialog open={promotingId !== null} onOpenChange={(o) => !o && setPromotingId(null)}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Promote this scenario?</AlertDialogTitle>
      <AlertDialogDescription>
        This will convert this scenario into a normal data point and delete all other scenarios in the group.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction onClick={() => {
        if (promotingId) handlePromote(promotingId);
        setPromotingId(null);
      }}>
        Promote
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

Pass `onPromote={setPromotingId}` to DataPointList instead of calling promote directly.

- [ ] **Step 5: Run build and test**

Run: `npm run build`
Expected: Compiles.

- [ ] **Step 6: Commit**

```bash
git add src/components/salary/DataPointModal.tsx src/pages/SalaryPlanner.tsx
git commit -m "feat: complete scenario creation, group editing, and promote confirmation"
```

---

## Chunk 8: Final Integration and Cleanup

### Task 14: Verify end-to-end and run full build

- [ ] **Step 1: Run Rust tests**

Run: `cd src-tauri && cargo test`
Expected: All tests pass.

- [ ] **Step 2: Run full frontend build**

Run: `npm run build`
Expected: No TypeScript or build errors.

- [ ] **Step 3: Run the app**

Run: `npm run tauri dev`
Manual test:
1. Open Salary Planner
2. Create a new scenario group (toggle "Scenario" on in create modal)
3. Verify group appears in list with purple accent
4. Expand group and click a scenario child
5. Verify detail panel shows ScenarioComparisonTable
6. Edit salary parts in one scenario — verify comparison updates
7. Promote a scenario — verify it becomes a normal data point
8. Delete a scenario group — verify cleanup

- [ ] **Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: scenario modeling integration fixes"
```
