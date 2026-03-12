# Salary View Rework Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the simple salary-per-member field with a data-point-based salary planning system featuring salary components, budget tracking, ranges, comparisons, and analytics charts.

**Architecture:** New DB tables (salary_data_points, salary_data_point_members, salary_parts, salary_ranges) with Rust Tauri commands for CRUD. Frontend is a two-panel layout: left panel lists data points, right panel shows member salary details and analytics charts. All calculations are derived state in React.

**Tech Stack:** Rust/SQLite (backend), React 19 + TypeScript + Recharts (frontend), shadcn/ui components, Tailwind CSS v4

---

## File Structure

### Rust Backend
- **Modify:** `src-tauri/migrations/001_initial.sql` — no changes (stays as v1)
- **Create:** `src-tauri/migrations/002_salary_data_points.sql` — new tables + data migration
- **Modify:** `src-tauri/src/db.rs` — add v2 migration step
- **Modify:** `src-tauri/src/commands.rs` — remove salary from TeamMember, add all new salary commands + structs
- **Modify:** `src-tauri/src/lib.rs` — register new commands

### Frontend
- **Modify:** `src/lib/types.ts` — remove salary from TeamMember, add new interfaces
- **Modify:** `src/lib/db.ts` — add new invoke wrappers
- **Replace:** `src/pages/SalaryPlanner.tsx` — complete rewrite
- **Create:** `src/components/salary/DataPointList.tsx` — left panel
- **Create:** `src/components/salary/DataPointModal.tsx` — edit/create modal
- **Create:** `src/components/salary/MemberSalaryCard.tsx` — per-member salary parts editor
- **Create:** `src/components/salary/SalaryPartRow.tsx` — individual salary part row
- **Create:** `src/components/salary/SalaryAnalytics.tsx` — charts container
- **Create:** `src/components/salary/SalaryBarChart.tsx` — horizontal salary overview chart
- **Create:** `src/components/salary/VariablePayChart.tsx` — variable vs fixed breakdown
- **Create:** `src/components/salary/ComparisonChart.tsx` — current vs previous data point
- **Create:** `src/components/salary/BudgetGauge.tsx` — budget comparison widget
- **Create:** `src/lib/salary-utils.ts` — pure calculation functions (totals, range fit, deltas)
- **Modify:** `src/App.tsx` — no route changes needed (same /salary path)

---

## Chunk 1: Database Migration & Rust Structs

### Task 1: Create migration SQL file

**Files:**
- Create: `src-tauri/migrations/002_salary_data_points.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- New salary data point tables

CREATE TABLE IF NOT EXISTS salary_data_points (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    budget     INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER IF NOT EXISTS salary_data_points_updated_at
    AFTER UPDATE ON salary_data_points
    FOR EACH ROW
    WHEN OLD.updated_at = NEW.updated_at
BEGIN
    UPDATE salary_data_points SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;

CREATE TABLE IF NOT EXISTS salary_data_point_members (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    data_point_id  INTEGER NOT NULL REFERENCES salary_data_points(id) ON DELETE CASCADE,
    member_id      INTEGER NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
    is_active      INTEGER NOT NULL DEFAULT 1,
    is_promoted    INTEGER NOT NULL DEFAULT 0,
    UNIQUE(data_point_id, member_id)
);

CREATE TABLE IF NOT EXISTS salary_parts (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    data_point_member_id  INTEGER NOT NULL REFERENCES salary_data_point_members(id) ON DELETE CASCADE,
    name                  TEXT,
    amount                INTEGER NOT NULL DEFAULT 0,
    frequency             INTEGER NOT NULL DEFAULT 1,
    is_variable           INTEGER NOT NULL DEFAULT 0,
    sort_order            INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS salary_ranges (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    data_point_id  INTEGER NOT NULL REFERENCES salary_data_points(id) ON DELETE CASCADE,
    title_id       INTEGER NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
    min_salary     INTEGER NOT NULL,
    max_salary     INTEGER NOT NULL,
    UNIQUE(data_point_id, title_id)
);

-- Seed data migration: import existing salary values into a data point
INSERT INTO salary_data_points (name)
SELECT 'Imported'
WHERE EXISTS (SELECT 1 FROM team_members WHERE salary IS NOT NULL);

INSERT INTO salary_data_point_members (data_point_id, member_id, is_active, is_promoted)
SELECT dp.id, m.id, 1, 0
FROM team_members m
CROSS JOIN salary_data_points dp
WHERE dp.name = 'Imported'
  AND dp.id = (SELECT MAX(id) FROM salary_data_points WHERE name = 'Imported');

INSERT INTO salary_parts (data_point_member_id, name, amount, frequency, is_variable, sort_order)
SELECT sdpm.id, 'Base', m.salary, 1, 0, 0
FROM team_members m
JOIN salary_data_point_members sdpm ON sdpm.member_id = m.id
JOIN salary_data_points dp ON dp.id = sdpm.data_point_id
WHERE dp.name = 'Imported'
  AND dp.id = (SELECT MAX(id) FROM salary_data_points WHERE name = 'Imported')
  AND m.salary IS NOT NULL;

-- Drop salary column from team_members (SQLite table recreation)
-- Must disable foreign keys for table recreation (children, status_items, talk_topics reference team_members)
PRAGMA foreign_keys = OFF;

CREATE TABLE team_members_new (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name     TEXT NOT NULL,
    last_name      TEXT NOT NULL,
    email          TEXT,
    personal_email TEXT,
    personal_phone TEXT,
    address_street TEXT,
    address_city   TEXT,
    address_zip    TEXT,
    title_id       INTEGER REFERENCES titles(id) ON DELETE RESTRICT,
    start_date     DATE,
    notes          TEXT,
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO team_members_new (id, first_name, last_name, email, personal_email, personal_phone,
    address_street, address_city, address_zip, title_id, start_date, notes, created_at, updated_at)
SELECT id, first_name, last_name, email, personal_email, personal_phone,
    address_street, address_city, address_zip, title_id, start_date, notes, created_at, updated_at
FROM team_members;

DROP TABLE team_members;
ALTER TABLE team_members_new RENAME TO team_members;

PRAGMA foreign_keys = ON;

-- Recreate the updated_at trigger on the new table
CREATE TRIGGER IF NOT EXISTS team_members_updated_at
    AFTER UPDATE ON team_members
    FOR EACH ROW
    WHEN OLD.updated_at = NEW.updated_at
BEGIN
    UPDATE team_members SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;
```

- [ ] **Step 2: Commit**

```bash
git add src-tauri/migrations/002_salary_data_points.sql
git commit -m "feat: add migration for salary data points tables"
```

### Task 2: Wire up migration in db.rs

**Files:**
- Modify: `src-tauri/src/db.rs:24-33`

- [ ] **Step 1: Write a failing test for v2 migration**

Add this test to the `tests` module in `src-tauri/src/db.rs`:

```rust
#[test]
fn test_migration_v2_salary_data_points() {
    let conn = open_db_with_key(":memory:", "test-key-0123456789abcdef").unwrap();
    run_migrations(&conn).unwrap();

    // Verify new tables exist
    let count: i32 = conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='salary_data_points'",
        [], |row| row.get(0)
    ).unwrap();
    assert_eq!(count, 1);

    let count: i32 = conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='salary_data_point_members'",
        [], |row| row.get(0)
    ).unwrap();
    assert_eq!(count, 1);

    let count: i32 = conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='salary_parts'",
        [], |row| row.get(0)
    ).unwrap();
    assert_eq!(count, 1);

    let count: i32 = conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='salary_ranges'",
        [], |row| row.get(0)
    ).unwrap();
    assert_eq!(count, 1);

    // Verify salary column removed from team_members
    let has_salary: bool = conn.prepare("SELECT salary FROM team_members")
        .is_ok();
    assert!(!has_salary);

    // Verify user_version is 2
    let version: i32 = conn.pragma_query_value(None, "user_version", |row| row.get(0)).unwrap();
    assert_eq!(version, 2);
}

#[test]
fn test_migration_v2_seeds_existing_salary_data() {
    let conn = open_db_with_key(":memory:", "test-key-0123456789abcdef").unwrap();
    // Run v1 only first
    let migration_sql = include_str!("../migrations/001_initial.sql");
    conn.execute_batch(migration_sql).unwrap();
    conn.pragma_update(None, "user_version", 1).unwrap();

    // Insert a team member with salary
    conn.execute(
        "INSERT INTO team_members (first_name, last_name, salary) VALUES ('Alice', 'Smith', 7500000)",
        []
    ).unwrap();
    // Insert one without salary
    conn.execute(
        "INSERT INTO team_members (first_name, last_name) VALUES ('Bob', 'Jones')",
        []
    ).unwrap();

    // Now run full migrations (will run v2)
    run_migrations(&conn).unwrap();

    // Should have one data point named "Imported"
    let dp_count: i32 = conn.query_row(
        "SELECT COUNT(*) FROM salary_data_points WHERE name = 'Imported'",
        [], |row| row.get(0)
    ).unwrap();
    assert_eq!(dp_count, 1);

    // Both members should be in the data point
    let member_count: i32 = conn.query_row(
        "SELECT COUNT(*) FROM salary_data_point_members",
        [], |row| row.get(0)
    ).unwrap();
    assert_eq!(member_count, 2);

    // Only Alice should have a salary part
    let part_count: i32 = conn.query_row(
        "SELECT COUNT(*) FROM salary_parts",
        [], |row| row.get(0)
    ).unwrap();
    assert_eq!(part_count, 1);

    // The salary part should be 7500000 cents
    let amount: i64 = conn.query_row(
        "SELECT amount FROM salary_parts",
        [], |row| row.get(0)
    ).unwrap();
    assert_eq!(amount, 7500000);
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd src-tauri && cargo test test_migration_v2 2>&1`
Expected: FAIL — new tables don't exist yet because `run_migrations` doesn't know about v2.

- [ ] **Step 3: Update run_migrations to include v2**

In `src-tauri/src/db.rs`, replace the `run_migrations` function:

```rust
pub fn run_migrations(conn: &Connection) -> Result<()> {
    let version: i32 = conn.pragma_query_value(None, "user_version", |row| row.get(0))?;

    if version < 1 {
        let migration_sql = include_str!("../migrations/001_initial.sql");
        conn.execute_batch(migration_sql)?;
        conn.pragma_update(None, "user_version", 1)?;
    }

    if version < 2 {
        let migration_sql = include_str!("../migrations/002_salary_data_points.sql");
        conn.execute_batch(migration_sql)?;
        conn.pragma_update(None, "user_version", 2)?;
    }

    Ok(())
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd src-tauri && cargo test test_migration_v2 2>&1`
Expected: PASS

- [ ] **Step 5: Run all tests to check for regressions**

Run: `cd src-tauri && cargo test 2>&1`
Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/db.rs
git commit -m "feat: wire up v2 migration for salary data points"
```

### Task 3: Add Rust structs and data point CRUD commands

**Files:**
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/Cargo.toml` (add chrono dependency)

- [ ] **Step 1: Add chrono dependency**

In `src-tauri/Cargo.toml`, add to `[dependencies]`:

```toml
chrono = "0.4"
```

- [ ] **Step 2: Remove salary from TeamMember struct and queries**

In `src-tauri/src/commands.rs`, update the `TeamMember` struct to remove the `salary` field.

Also remove `"salary"` from the `allowed` array in `update_team_member`:

```rust
let allowed = [
    "first_name", "last_name", "email", "personal_email", "personal_phone",
    "address_street", "address_city", "address_zip", "title_id",
    "start_date", "notes",
];
```

Update the `TeamMember` struct:

```rust
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TeamMember {
    pub id: i64,
    pub first_name: String,
    pub last_name: String,
    pub email: Option<String>,
    pub personal_email: Option<String>,
    pub personal_phone: Option<String>,
    pub address_street: Option<String>,
    pub address_city: Option<String>,
    pub address_zip: Option<String>,
    pub title_id: Option<i64>,
    pub title_name: Option<String>,
    pub start_date: Option<String>,
    pub notes: Option<String>,
}
```

Update `get_team_members` query to remove `m.salary` from the SELECT and fix column indices:

```rust
#[tauri::command]
pub fn get_team_members(db: State<AppDb>) -> Result<Vec<TeamMember>, String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    let mut stmt = conn
        .prepare(
            "SELECT m.id, m.first_name, m.last_name, m.email, m.personal_email,
                    m.personal_phone, m.address_street, m.address_city, m.address_zip,
                    m.title_id, t.name as title_name, m.start_date, m.notes
             FROM team_members m
             LEFT JOIN titles t ON m.title_id = t.id
             ORDER BY m.last_name ASC, m.first_name ASC",
        )
        .map_err(|e| e.to_string())?;

    let members = stmt
        .query_map([], |row| {
            Ok(TeamMember {
                id: row.get(0)?,
                first_name: row.get(1)?,
                last_name: row.get(2)?,
                email: row.get(3)?,
                personal_email: row.get(4)?,
                personal_phone: row.get(5)?,
                address_street: row.get(6)?,
                address_city: row.get(7)?,
                address_zip: row.get(8)?,
                title_id: row.get(9)?,
                title_name: row.get(10)?,
                start_date: row.get(11)?,
                notes: row.get(12)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(members)
}
```

Update `create_team_member` to remove `salary: None` from the returned struct.

Remove `"salary"` from the `allowed` array in `update_team_member`.

- [ ] **Step 3: Add new salary structs**

Add these structs after the `TeamMember` struct section in `commands.rs`:

```rust
// ── Salary data point structs ──

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SalaryDataPointSummary {
    pub id: i64,
    pub name: String,
    pub budget: Option<i64>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SalaryDataPointDetail {
    pub id: i64,
    pub name: String,
    pub budget: Option<i64>,
    pub members: Vec<SalaryDataPointMember>,
    pub ranges: Vec<SalaryRange>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SalaryDataPointMember {
    pub id: i64,
    pub member_id: i64,
    pub first_name: String,
    pub last_name: String,
    pub title_id: Option<i64>,
    pub title_name: Option<String>,
    pub is_active: bool,
    pub is_promoted: bool,
    pub parts: Vec<SalaryPart>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SalaryPart {
    pub id: i64,
    pub name: Option<String>,
    pub amount: i64,
    pub frequency: i64,
    pub is_variable: bool,
    pub sort_order: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SalaryRange {
    pub id: i64,
    pub title_id: i64,
    pub title_name: String,
    pub min_salary: i64,
    pub max_salary: i64,
}
```

- [ ] **Step 4: Add get_salary_data_points command**

```rust
// ── Salary data point commands ──

#[tauri::command]
pub fn get_salary_data_points(db: State<AppDb>) -> Result<Vec<SalaryDataPointSummary>, String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    let mut stmt = conn
        .prepare("SELECT id, name, budget, created_at FROM salary_data_points ORDER BY id DESC")
        .map_err(|e| e.to_string())?;
    let points = stmt
        .query_map([], |row| {
            Ok(SalaryDataPointSummary {
                id: row.get(0)?,
                name: row.get(1)?,
                budget: row.get(2)?,
                created_at: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(points)
}
```

- [ ] **Step 5: Add get_salary_data_point (detail) command**

```rust
#[tauri::command]
pub fn get_salary_data_point(db: State<AppDb>, id: i64) -> Result<SalaryDataPointDetail, String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;

    // Get the data point itself
    let (name, budget): (String, Option<i64>) = conn
        .query_row(
            "SELECT name, budget FROM salary_data_points WHERE id = ?1",
            params![id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| e.to_string())?;

    // Get members with their info
    let mut member_stmt = conn
        .prepare(
            "SELECT sdpm.id, sdpm.member_id, m.first_name, m.last_name,
                    m.title_id, t.name as title_name, sdpm.is_active, sdpm.is_promoted
             FROM salary_data_point_members sdpm
             JOIN team_members m ON m.id = sdpm.member_id
             LEFT JOIN titles t ON t.id = m.title_id
             WHERE sdpm.data_point_id = ?1
             ORDER BY m.last_name ASC, m.first_name ASC",
        )
        .map_err(|e| e.to_string())?;

    let members: Vec<SalaryDataPointMember> = member_stmt
        .query_map(params![id], |row| {
            Ok(SalaryDataPointMember {
                id: row.get(0)?,
                member_id: row.get(1)?,
                first_name: row.get(2)?,
                last_name: row.get(3)?,
                title_id: row.get(4)?,
                title_name: row.get(5)?,
                is_active: row.get(6)?,
                is_promoted: row.get(7)?,
                parts: Vec::new(), // filled below
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    // Load parts for each member
    let mut parts_stmt = conn
        .prepare(
            "SELECT id, name, amount, frequency, is_variable, sort_order
             FROM salary_parts
             WHERE data_point_member_id = ?1
             ORDER BY sort_order ASC, id ASC",
        )
        .map_err(|e| e.to_string())?;

    let members: Vec<SalaryDataPointMember> = members
        .into_iter()
        .map(|mut member| {
            let parts = parts_stmt
                .query_map(params![member.id], |row| {
                    Ok(SalaryPart {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        amount: row.get(2)?,
                        frequency: row.get(3)?,
                        is_variable: row.get(4)?,
                        sort_order: row.get(5)?,
                    })
                })
                .map_err(|e| e.to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?;
            member.parts = parts;
            Ok(member)
        })
        .collect::<Result<Vec<_>, String>>()?;

    // Get salary ranges
    let mut range_stmt = conn
        .prepare(
            "SELECT sr.id, sr.title_id, t.name as title_name, sr.min_salary, sr.max_salary
             FROM salary_ranges sr
             JOIN titles t ON t.id = sr.title_id
             WHERE sr.data_point_id = ?1
             ORDER BY t.name ASC",
        )
        .map_err(|e| e.to_string())?;

    let ranges = range_stmt
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
        .map_err(|e| e.to_string())?;

    Ok(SalaryDataPointDetail {
        id,
        name,
        budget,
        members,
        ranges,
    })
}
```

- [ ] **Step 6: Add create_salary_data_point command**

```rust
#[tauri::command]
pub fn create_salary_data_point(db: State<AppDb>) -> Result<SalaryDataPointSummary, String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;

    let today = chrono::Local::now().format("%Y-%m-%d").to_string();

    // Check if there's a previous data point to clone from
    let prev_id: Option<i64> = conn
        .query_row(
            "SELECT id FROM salary_data_points ORDER BY id DESC LIMIT 1",
            [],
            |row| row.get(0),
        )
        .ok();

    if let Some(prev) = prev_id {
        // Clone from previous data point
        let prev_budget: Option<i64> = conn
            .query_row("SELECT budget FROM salary_data_points WHERE id = ?1", params![prev], |row| row.get(0))
            .map_err(|e| e.to_string())?;

        conn.execute(
            "INSERT INTO salary_data_points (name, budget) VALUES (?1, ?2)",
            params![today, prev_budget],
        ).map_err(|e| e.to_string())?;
        let new_id = conn.last_insert_rowid();

        // Clone members
        conn.execute(
            "INSERT INTO salary_data_point_members (data_point_id, member_id, is_active, is_promoted)
             SELECT ?1, member_id, is_active, is_promoted
             FROM salary_data_point_members WHERE data_point_id = ?2",
            params![new_id, prev],
        ).map_err(|e| e.to_string())?;

        // Clone salary parts
        conn.execute(
            "INSERT INTO salary_parts (data_point_member_id, name, amount, frequency, is_variable, sort_order)
             SELECT new_sdpm.id, sp.name, sp.amount, sp.frequency, sp.is_variable, sp.sort_order
             FROM salary_parts sp
             JOIN salary_data_point_members old_sdpm ON old_sdpm.id = sp.data_point_member_id
             JOIN salary_data_point_members new_sdpm ON new_sdpm.data_point_id = ?1
                 AND new_sdpm.member_id = old_sdpm.member_id
             WHERE old_sdpm.data_point_id = ?2",
            params![new_id, prev],
        ).map_err(|e| e.to_string())?;

        // Clone salary ranges
        conn.execute(
            "INSERT INTO salary_ranges (data_point_id, title_id, min_salary, max_salary)
             SELECT ?1, title_id, min_salary, max_salary
             FROM salary_ranges WHERE data_point_id = ?2",
            params![new_id, prev],
        ).map_err(|e| e.to_string())?;

        let created_at: String = conn
            .query_row("SELECT created_at FROM salary_data_points WHERE id = ?1", params![new_id], |row| row.get(0))
            .map_err(|e| e.to_string())?;

        Ok(SalaryDataPointSummary { id: new_id, name: today, budget: prev_budget, created_at })
    } else {
        // No previous — create empty with all team members
        conn.execute(
            "INSERT INTO salary_data_points (name) VALUES (?1)",
            params![today],
        ).map_err(|e| e.to_string())?;
        let new_id = conn.last_insert_rowid();

        conn.execute(
            "INSERT INTO salary_data_point_members (data_point_id, member_id, is_active, is_promoted)
             SELECT ?1, id, 1, 0 FROM team_members",
            params![new_id],
        ).map_err(|e| e.to_string())?;

        let created_at: String = conn
            .query_row("SELECT created_at FROM salary_data_points WHERE id = ?1", params![new_id], |row| row.get(0))
            .map_err(|e| e.to_string())?;

        Ok(SalaryDataPointSummary { id: new_id, name: today, budget: None, created_at })
    }
}
```

**Note:** This requires adding `chrono` as a dependency. Add to `src-tauri/Cargo.toml`:

```toml
chrono = "0.4"
```

- [ ] **Step 7: Add update and delete data point commands**

```rust
#[tauri::command]
pub fn update_salary_data_point(db: State<AppDb>, id: i64, field: String, value: Option<String>) -> Result<(), String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    let allowed = ["name", "budget"];
    if !allowed.contains(&field.as_str()) {
        return Err(format!("Invalid field: {}", field));
    }
    let sql = format!("UPDATE salary_data_points SET {} = ?1 WHERE id = ?2", field);
    conn.execute(&sql, params![value, id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_salary_data_point(db: State<AppDb>, id: i64) -> Result<(), String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute("DELETE FROM salary_data_points WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
```

- [ ] **Step 8: Add member, salary part, and salary range commands**

```rust
#[tauri::command]
pub fn update_salary_data_point_member(db: State<AppDb>, id: i64, field: String, value: Option<String>) -> Result<(), String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    let allowed = ["is_active", "is_promoted"];
    if !allowed.contains(&field.as_str()) {
        return Err(format!("Invalid field: {}", field));
    }
    let sql = format!("UPDATE salary_data_point_members SET {} = ?1 WHERE id = ?2", field);
    conn.execute(&sql, params![value, id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn create_salary_part(db: State<AppDb>, data_point_member_id: i64) -> Result<SalaryPart, String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    let sort_order: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM salary_parts WHERE data_point_member_id = ?1",
            params![data_point_member_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO salary_parts (data_point_member_id, amount, frequency, is_variable, sort_order) VALUES (?1, 0, 1, 0, ?2)",
        params![data_point_member_id, sort_order],
    ).map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    Ok(SalaryPart { id, name: None, amount: 0, frequency: 1, is_variable: false, sort_order })
}

#[tauri::command]
pub fn update_salary_part(db: State<AppDb>, id: i64, field: String, value: Option<String>) -> Result<(), String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    let allowed = ["name", "amount", "frequency", "is_variable"];
    if !allowed.contains(&field.as_str()) {
        return Err(format!("Invalid field: {}", field));
    }
    let sql = format!("UPDATE salary_parts SET {} = ?1 WHERE id = ?2", field);
    conn.execute(&sql, params![value, id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_salary_part(db: State<AppDb>, id: i64) -> Result<(), String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute("DELETE FROM salary_parts WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn update_salary_range(db: State<AppDb>, data_point_id: i64, title_id: i64, min_salary: i64, max_salary: i64) -> Result<(), String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute(
        "INSERT INTO salary_ranges (data_point_id, title_id, min_salary, max_salary)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(data_point_id, title_id) DO UPDATE SET min_salary = excluded.min_salary, max_salary = excluded.max_salary",
        params![data_point_id, title_id, min_salary, max_salary],
    ).map_err(|e| e.to_string())?;
    Ok(())
}
```

- [ ] **Step 9: Add get_previous_member_data command**

```rust
#[tauri::command]
pub fn get_previous_member_data(db: State<AppDb>, data_point_id: i64, member_id: i64) -> Result<Option<Vec<SalaryPart>>, String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;

    // Find the most recent earlier data point where this member was active
    let prev_sdpm_id: Option<i64> = conn
        .query_row(
            "SELECT sdpm.id
             FROM salary_data_point_members sdpm
             JOIN salary_data_points dp ON dp.id = sdpm.data_point_id
             WHERE sdpm.member_id = ?1
               AND dp.id < ?2
               AND sdpm.is_active = 1
             ORDER BY dp.id DESC
             LIMIT 1",
            params![member_id, data_point_id],
            |row| row.get(0),
        )
        .ok();

    match prev_sdpm_id {
        None => Ok(None),
        Some(sdpm_id) => {
            let mut stmt = conn
                .prepare(
                    "SELECT id, name, amount, frequency, is_variable, sort_order
                     FROM salary_parts WHERE data_point_member_id = ?1
                     ORDER BY sort_order ASC, id ASC",
                )
                .map_err(|e| e.to_string())?;
            let parts = stmt
                .query_map(params![sdpm_id], |row| {
                    Ok(SalaryPart {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        amount: row.get(2)?,
                        frequency: row.get(3)?,
                        is_variable: row.get(4)?,
                        sort_order: row.get(5)?,
                    })
                })
                .map_err(|e| e.to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?;
            Ok(Some(parts))
        }
    }
}
```

- [ ] **Step 10: Register all new commands in lib.rs**

In `src-tauri/src/lib.rs`, add these to the `generate_handler!` macro:

```rust
commands::get_salary_data_points,
commands::get_salary_data_point,
commands::create_salary_data_point,
commands::update_salary_data_point,
commands::delete_salary_data_point,
commands::update_salary_data_point_member,
commands::create_salary_part,
commands::update_salary_part,
commands::delete_salary_part,
commands::update_salary_range,
commands::get_previous_member_data,
```

- [ ] **Step 11: Build and test**

Run: `cd src-tauri && cargo test 2>&1`
Expected: all tests PASS

Run: `cd src-tauri && cargo build 2>&1`
Expected: builds successfully

- [ ] **Step 12: Commit**

```bash
git add src-tauri/
git commit -m "feat: add salary data point Rust commands and structs"
```

---

## Chunk 2: Frontend Types, DB Layer, and Utility Functions

### Task 4: Update TypeScript types

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Remove salary from TeamMember and add new interfaces**

Replace the contents of `src/lib/types.ts`:

```typescript
export interface TeamMember {
  id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  personal_email: string | null;
  personal_phone: string | null;
  address_street: string | null;
  address_city: string | null;
  address_zip: string | null;
  title_id: number | null;
  title_name: string | null;
  start_date: string | null;
  notes: string | null;
}

export interface Child {
  id: number;
  team_member_id: number;
  name: string;
  date_of_birth: string | null;
}

export interface CheckableItem {
  id: number;
  team_member_id: number;
  text: string;
  checked: boolean;
  created_at: string;
}

export interface Title {
  id: number;
  name: string;
  member_count: number;
}

export interface SalaryDataPointSummary {
  id: number;
  name: string;
  budget: number | null;
  created_at: string;
}

export interface SalaryDataPointDetail {
  id: number;
  name: string;
  budget: number | null;
  members: SalaryDataPointMember[];
  ranges: SalaryRange[];
}

export interface SalaryDataPointMember {
  id: number;
  member_id: number;
  first_name: string;
  last_name: string;
  title_id: number | null;
  title_name: string | null;
  is_active: boolean;
  is_promoted: boolean;
  parts: SalaryPart[];
}

export interface SalaryPart {
  id: number;
  name: string | null;
  amount: number;
  frequency: number;
  is_variable: boolean;
  sort_order: number;
}

export interface SalaryRange {
  id: number;
  title_id: number;
  title_name: string;
  min_salary: number;
  max_salary: number;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: update types for salary data points"
```

### Task 5: Update db.ts invoke wrappers

**Files:**
- Modify: `src/lib/db.ts`

- [ ] **Step 1: Add salary data point invoke functions**

Add these imports and functions to `src/lib/db.ts`. Add `SalaryDataPointSummary`, `SalaryDataPointDetail`, `SalaryPart` to the type import. Then add after the Titles section:

```typescript
// Salary Data Points
export const getSalaryDataPoints = () =>
  invoke<SalaryDataPointSummary[]>("get_salary_data_points");
export const getSalaryDataPoint = (id: number) =>
  invoke<SalaryDataPointDetail>("get_salary_data_point", { id });
export const createSalaryDataPoint = () =>
  invoke<SalaryDataPointSummary>("create_salary_data_point");
export const updateSalaryDataPoint = (id: number, field: string, value: string | null) =>
  invoke<void>("update_salary_data_point", { id, field, value });
export const deleteSalaryDataPoint = (id: number) =>
  invoke<void>("delete_salary_data_point", { id });

// Salary Data Point Members
export const updateSalaryDataPointMember = (id: number, field: string, value: string | null) =>
  invoke<void>("update_salary_data_point_member", { id, field, value });

// Salary Parts
export const createSalaryPart = (dataPointMemberId: number) =>
  invoke<SalaryPart>("create_salary_part", { data_point_member_id: dataPointMemberId });
export const updateSalaryPart = (id: number, field: string, value: string | null) =>
  invoke<void>("update_salary_part", { id, field, value });
export const deleteSalaryPart = (id: number) =>
  invoke<void>("delete_salary_part", { id });

// Salary Ranges
export const updateSalaryRange = (dataPointId: number, titleId: number, minSalary: number, maxSalary: number) =>
  invoke<void>("update_salary_range", { data_point_id: dataPointId, title_id: titleId, min_salary: minSalary, max_salary: maxSalary });

// Salary Comparison
export const getPreviousMemberData = (dataPointId: number, memberId: number) =>
  invoke<SalaryPart[] | null>("get_previous_member_data", { data_point_id: dataPointId, member_id: memberId });
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/db.ts
git commit -m "feat: add salary data point invoke wrappers"
```

### Task 6: Create salary utility functions

**Files:**
- Create: `src/lib/salary-utils.ts`

- [ ] **Step 1: Write the utility functions**

```typescript
import type { SalaryPart, SalaryRange, SalaryDataPointMember } from "./types";

/** Calculate annual total for a set of salary parts (in cents) */
export function annualTotal(parts: SalaryPart[]): number {
  return parts.reduce((sum, p) => sum + p.amount * p.frequency, 0);
}

/** Calculate variable portion of annual total (in cents) */
export function variableTotal(parts: SalaryPart[]): number {
  return parts.filter((p) => p.is_variable).reduce((sum, p) => sum + p.amount * p.frequency, 0);
}

/** Variable percentage (0-100) */
export function variablePercent(parts: SalaryPart[]): number {
  const total = annualTotal(parts);
  if (total === 0) return 0;
  return (variableTotal(parts) / total) * 100;
}

/** Format cents as dollar string */
export function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(cents / 100);
}

/** Format percentage with sign */
export function formatDeltaPercent(percent: number): string {
  const sign = percent > 0 ? "+" : "";
  return `${sign}${percent.toFixed(1)}%`;
}

/** Determine range fit color class */
export type RangeFit = "red" | "yellow" | "green" | "none";

export function rangeFitColor(total: number, range: SalaryRange | undefined): RangeFit {
  if (!range) return "none";
  const { min_salary, max_salary } = range;
  if (total < min_salary) return "red";
  if (total > max_salary) return "red";
  const span = max_salary - min_salary;
  const lowThreshold = min_salary + span * 0.1;
  const highThreshold = max_salary - span * 0.1;
  if (total < lowThreshold || total > highThreshold) return "yellow";
  return "green";
}

/** Get the salary range for a member based on their title */
export function getRangeForMember(member: SalaryDataPointMember, ranges: SalaryRange[]): SalaryRange | undefined {
  if (!member.title_id) return undefined;
  return ranges.find((r) => r.title_id === member.title_id);
}

/** Calculate budget totals (excluding promoted members) */
export function budgetTotals(members: SalaryDataPointMember[]) {
  const activeNonPromoted = members.filter((m) => m.is_active && !m.is_promoted);
  const total = activeNonPromoted.reduce((sum, m) => sum + annualTotal(m.parts), 0);
  const headcount = activeNonPromoted.length;
  return { total, headcount };
}

/** Calculate delta between current and previous salary parts */
export function salaryDelta(currentParts: SalaryPart[], previousParts: SalaryPart[] | null) {
  const current = annualTotal(currentParts);
  if (!previousParts) return { current, previous: null, absoluteDelta: null, percentDelta: null };
  const previous = annualTotal(previousParts);
  const absoluteDelta = current - previous;
  const percentDelta = previous === 0 ? (current > 0 ? 100 : 0) : (absoluteDelta / previous) * 100;
  return { current, previous, absoluteDelta, percentDelta };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/salary-utils.ts
git commit -m "feat: add salary calculation utility functions"
```

---

## Chunk 3: Frontend Components — Left Panel and Modal

### Task 7: Install Recharts

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install recharts**

Run: `npm install recharts`

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add recharts dependency"
```

### Task 8: Create DataPointList component (left panel)

**Files:**
- Create: `src/components/salary/DataPointList.tsx`

- [ ] **Step 1: Write the component**

```typescript
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { formatCents } from "@/lib/salary-utils";
import type { SalaryDataPointSummary } from "@/lib/types";

interface DataPointListProps {
  dataPoints: SalaryDataPointSummary[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onCreate: () => void;
  onEdit: (dp: SalaryDataPointSummary) => void;
  onDelete: (id: number) => void;
}

export function DataPointList({ dataPoints, selectedId, onSelect, onCreate, onEdit, onDelete }: DataPointListProps) {
  return (
    <div className="flex h-full flex-col border-r">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Data Points</h2>
        <Button variant="ghost" size="icon" onClick={onCreate} title="New Data Point">
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-1 p-2">
          {dataPoints.length === 0 && (
            <p className="px-2 py-4 text-center text-sm text-muted-foreground">
              No data points yet.
            </p>
          )}
          {dataPoints.map((dp) => (
            <div
              key={dp.id}
              onClick={() => onSelect(dp.id)}
              className={cn(
                "group flex cursor-pointer items-center justify-between rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent",
                selectedId === dp.id && "bg-accent text-accent-foreground"
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
                  onClick={(e) => { e.stopPropagation(); onEdit(dp); }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive"
                  onClick={(e) => { e.stopPropagation(); onDelete(dp.id); }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/salary/DataPointList.tsx
git commit -m "feat: add DataPointList component"
```

### Task 9: Create DataPointModal component

**Files:**
- Create: `src/components/salary/DataPointModal.tsx`

- [ ] **Step 1: Write the modal component**

```typescript
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  updateSalaryDataPoint,
  updateSalaryDataPointMember,
  updateSalaryRange,
  getSalaryDataPoint,
} from "@/lib/db";
import type { SalaryDataPointDetail, SalaryRange, Title } from "@/lib/types";

interface DataPointModalProps {
  dataPointId: number | null;
  titles: Title[];
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function DataPointModal({ dataPointId, titles, open, onClose, onSaved }: DataPointModalProps) {
  const [detail, setDetail] = useState<SalaryDataPointDetail | null>(null);
  const [name, setName] = useState("");
  const [budget, setBudget] = useState("");
  const [ranges, setRanges] = useState<Record<number, { min: string; max: string }>>({});
  const [memberStates, setMemberStates] = useState<Record<number, { active: boolean; promoted: boolean }>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !dataPointId) return;
    getSalaryDataPoint(dataPointId).then((d) => {
      setDetail(d);
      setName(d.name);
      setBudget(d.budget != null ? String(Math.round(d.budget / 100)) : "");
      const rangeMap: Record<number, { min: string; max: string }> = {};
      d.ranges.forEach((r) => {
        rangeMap[r.title_id] = {
          min: String(Math.round(r.min_salary / 100)),
          max: String(Math.round(r.max_salary / 100)),
        };
      });
      setRanges(rangeMap);
      const mStates: Record<number, { active: boolean; promoted: boolean }> = {};
      d.members.forEach((m) => {
        mStates[m.id] = { active: m.is_active, promoted: m.is_promoted };
      });
      setMemberStates(mStates);
    });
  }, [open, dataPointId]);

  async function handleSave() {
    if (!detail) return;
    setSaving(true);
    try {
      // Save name
      if (name !== detail.name) {
        await updateSalaryDataPoint(detail.id, "name", name);
      }
      // Save budget
      const budgetCents = budget === "" ? null : String(Math.round(parseFloat(budget) * 100));
      const oldBudget = detail.budget != null ? String(detail.budget) : null;
      if (budgetCents !== oldBudget) {
        await updateSalaryDataPoint(detail.id, "budget", budgetCents);
      }
      // Save member states
      for (const member of detail.members) {
        const state = memberStates[member.id];
        if (!state) continue;
        if (state.active !== member.is_active) {
          await updateSalaryDataPointMember(member.id, "is_active", state.active ? "1" : "0");
        }
        if (state.promoted !== member.is_promoted) {
          await updateSalaryDataPointMember(member.id, "is_promoted", state.promoted ? "1" : "0");
        }
      }
      // Save ranges
      for (const title of titles) {
        const r = ranges[title.id];
        if (!r) continue;
        const minCents = r.min === "" ? 0 : Math.round(parseFloat(r.min) * 100);
        const maxCents = r.max === "" ? 0 : Math.round(parseFloat(r.max) * 100);
        if (minCents > 0 || maxCents > 0) {
          await updateSalaryRange(detail.id, title.id, minCents, maxCents);
        }
      }
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  if (!detail) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Edit Data Point</DialogTitle>
        </DialogHeader>
        <ScrollArea className="flex-1 pr-4">
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Budget ($)</Label>
              <Input type="number" min="0" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="Annual budget" />
            </div>

            <Separator />
            <h3 className="text-sm font-semibold">Salary Ranges per Title</h3>
            {titles.map((title) => (
              <div key={title.id} className="flex items-center gap-2">
                <span className="w-32 truncate text-sm">{title.name}</span>
                <Input
                  type="number"
                  min="0"
                  className="w-28"
                  placeholder="Min $"
                  value={ranges[title.id]?.min ?? ""}
                  onChange={(e) => setRanges((prev) => ({ ...prev, [title.id]: { ...prev[title.id], min: e.target.value, max: prev[title.id]?.max ?? "" } }))}
                />
                <span className="text-xs text-muted-foreground">–</span>
                <Input
                  type="number"
                  min="0"
                  className="w-28"
                  placeholder="Max $"
                  value={ranges[title.id]?.max ?? ""}
                  onChange={(e) => setRanges((prev) => ({ ...prev, [title.id]: { min: prev[title.id]?.min ?? "", max: e.target.value } }))}
                />
              </div>
            ))}

            <Separator />
            <h3 className="text-sm font-semibold">Team Members</h3>
            {detail.members.map((member) => {
              const state = memberStates[member.id] ?? { active: member.is_active, promoted: member.is_promoted };
              return (
                <div key={member.id} className="flex items-center gap-4 text-sm">
                  <span className="w-40 truncate">{member.last_name}, {member.first_name}</span>
                  <label className="flex items-center gap-1.5">
                    <Checkbox
                      checked={state.active}
                      onCheckedChange={(checked) =>
                        setMemberStates((prev) => ({
                          ...prev,
                          [member.id]: { ...prev[member.id], active: !!checked },
                        }))
                      }
                    />
                    <span>Active</span>
                  </label>
                  <label className="flex items-center gap-1.5">
                    <Checkbox
                      checked={state.promoted}
                      onCheckedChange={(checked) =>
                        setMemberStates((prev) => ({
                          ...prev,
                          [member.id]: { ...prev[member.id], promoted: !!checked },
                        }))
                      }
                    />
                    <span>Promoted</span>
                  </label>
                </div>
              );
            })}
          </div>
        </ScrollArea>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/salary/DataPointModal.tsx
git commit -m "feat: add DataPointModal component"
```

---

## Chunk 4: Frontend Components — Member Salary Editor

### Task 10: Create SalaryPartRow component

**Files:**
- Create: `src/components/salary/SalaryPartRow.tsx`

- [ ] **Step 1: Write the component**

```typescript
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useAutoSave } from "@/hooks/useAutoSave";
import { updateSalaryPart } from "@/lib/db";
import type { SalaryPart } from "@/lib/types";

interface SalaryPartRowProps {
  part: SalaryPart;
  onDelete: (id: number) => void;
  onChanged: () => void;
}

export function SalaryPartRow({ part, onDelete, onChanged }: SalaryPartRowProps) {
  const [name, setName] = useState(part.name ?? "");
  const [amount, setAmount] = useState(part.amount ? String(Math.round(part.amount / 100)) : "");
  const [frequency, setFrequency] = useState(String(part.frequency));
  const [isVariable, setIsVariable] = useState(part.is_variable);

  const nameSave = useAutoSave({
    onSave: async (value) => {
      await updateSalaryPart(part.id, "name", value);
      onChanged();
    },
  });

  const amountSave = useAutoSave({
    onSave: async (value) => {
      const cents = value === null || value === "" ? "0" : String(Math.round(parseFloat(value) * 100));
      await updateSalaryPart(part.id, "amount", cents);
      onChanged();
    },
  });

  const freqSave = useAutoSave({
    onSave: async (value) => {
      await updateSalaryPart(part.id, "frequency", value === null || value === "" ? "1" : value);
      onChanged();
    },
  });

  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-2 py-1">
        <Input
          value={name}
          onChange={(e) => { setName(e.target.value); nameSave.save(e.target.value || null); }}
          placeholder="Label"
          className="h-8 text-sm"
        />
      </td>
      <td className="px-2 py-1">
        <div className="relative flex items-center">
          <span className="absolute left-2 text-xs text-muted-foreground">$</span>
          <Input
            type="number"
            min="0"
            value={amount}
            onChange={(e) => { setAmount(e.target.value); amountSave.save(e.target.value || null); }}
            className="h-8 pl-5 text-sm w-28"
          />
        </div>
      </td>
      <td className="px-2 py-1">
        <Input
          type="number"
          min="1"
          value={frequency}
          onChange={(e) => { setFrequency(e.target.value); freqSave.save(e.target.value || null); }}
          className="h-8 text-sm w-16"
        />
      </td>
      <td className="px-2 py-1 text-center">
        <Checkbox
          checked={isVariable}
          onCheckedChange={async (checked) => {
            const val = !!checked;
            setIsVariable(val);
            await updateSalaryPart(part.id, "is_variable", val ? "1" : "0");
            onChanged();
          }}
        />
      </td>
      <td className="px-2 py-1">
        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onDelete(part.id)}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </td>
    </tr>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/salary/SalaryPartRow.tsx
git commit -m "feat: add SalaryPartRow component"
```

### Task 11: Create MemberSalaryCard component

**Files:**
- Create: `src/components/salary/MemberSalaryCard.tsx`

- [ ] **Step 1: Write the component**

```typescript
import { Plus, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SalaryPartRow } from "./SalaryPartRow";
import { annualTotal, formatCents, rangeFitColor, getRangeForMember } from "@/lib/salary-utils";
import { cn } from "@/lib/utils";
import type { SalaryDataPointMember, SalaryRange } from "@/lib/types";

const fitColors: Record<string, string> = {
  green: "text-green-600",
  yellow: "text-yellow-600",
  red: "text-red-600",
  none: "text-muted-foreground",
};

interface MemberSalaryCardProps {
  member: SalaryDataPointMember;
  ranges: SalaryRange[];
  onAddPart: (dataPointMemberId: number) => void;
  onDeletePart: (partId: number) => void;
  onChanged: () => void;
}

export function MemberSalaryCard({ member, ranges, onAddPart, onDeletePart, onChanged }: MemberSalaryCardProps) {
  const total = annualTotal(member.parts);
  const range = getRangeForMember(member, ranges);
  const fit = rangeFitColor(total, range);

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">
            {member.last_name}, {member.first_name}
          </h3>
          {member.title_name && (
            <span className="text-xs text-muted-foreground">({member.title_name})</span>
          )}
          {member.is_promoted && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
              <Star className="h-3 w-3" /> Promoted
            </span>
          )}
        </div>
        <div className={cn("text-sm font-semibold", fitColors[fit])}>
          {formatCents(total)}/yr
          {range && (
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              ({formatCents(range.min_salary)} – {formatCents(range.max_salary)})
            </span>
          )}
        </div>
      </div>

      {member.parts.length > 0 && (
        <table className="w-full">
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th className="px-2 py-1 text-left font-medium">Label</th>
              <th className="px-2 py-1 text-left font-medium">Amount</th>
              <th className="px-2 py-1 text-left font-medium">Freq/yr</th>
              <th className="px-2 py-1 text-center font-medium">Variable</th>
              <th className="px-2 py-1 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {member.parts.map((part) => (
              <SalaryPartRow key={part.id} part={part} onDelete={onDeletePart} onChanged={onChanged} />
            ))}
          </tbody>
        </table>
      )}

      <Button
        variant="ghost"
        size="sm"
        className="mt-2 text-xs"
        onClick={() => onAddPart(member.id)}
      >
        <Plus className="h-3.5 w-3.5 mr-1" /> Add Part
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/salary/MemberSalaryCard.tsx
git commit -m "feat: add MemberSalaryCard component"
```

---

## Chunk 5: Frontend Components — Analytics Charts

### Task 12: Create SalaryBarChart component

**Files:**
- Create: `src/components/salary/SalaryBarChart.tsx`

- [ ] **Step 1: Write the component**

```typescript
import { BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine, Cell, ResponsiveContainer } from "recharts";
import { annualTotal, rangeFitColor, getRangeForMember, formatCents, budgetTotals } from "@/lib/salary-utils";
import type { SalaryDataPointMember, SalaryRange } from "@/lib/types";

const fillColors = { green: "#16a34a", yellow: "#ca8a04", red: "#dc2626", none: "#94a3b8" };

interface SalaryBarChartProps {
  members: SalaryDataPointMember[];
  ranges: SalaryRange[];
  budget: number | null;
}

export function SalaryBarChart({ members, ranges, budget }: SalaryBarChartProps) {
  const active = members.filter((m) => m.is_active);
  if (active.length === 0) return null;

  const data = active.map((m) => {
    const total = annualTotal(m.parts);
    const range = getRangeForMember(m, ranges);
    const fit = rangeFitColor(total, range);
    return {
      name: `${m.last_name}, ${m.first_name}`,
      total: total / 100,
      fit,
      isPromoted: m.is_promoted,
    };
  });

  const { total: budgetTotal, headcount } = budgetTotals(members);
  const avgPerHead = budget && headcount > 0 ? (budget / 100) / headcount : null;

  return (
    <div>
      <h4 className="text-sm font-semibold mb-2">Salary Overview</h4>
      <ResponsiveContainer width="100%" height={active.length * 40 + 40}>
        <BarChart data={data} layout="vertical" margin={{ left: 120, right: 20, top: 5, bottom: 5 }}>
          <XAxis type="number" tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
          <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12 }} />
          <Tooltip formatter={(value: number) => formatCents(value * 100)} />
          <Bar dataKey="total" radius={[0, 4, 4, 0]}>
            {data.map((entry, i) => (
              <Cell
                key={i}
                fill={fillColors[entry.fit]}
                opacity={entry.isPromoted ? 0.5 : 1}
                strokeDasharray={entry.isPromoted ? "4 2" : undefined}
                stroke={entry.isPromoted ? fillColors[entry.fit] : undefined}
              />
            ))}
          </Bar>
          {avgPerHead && (
            <ReferenceLine x={avgPerHead} stroke="#6366f1" strokeDasharray="3 3" label={{ value: "Avg", position: "top", fontSize: 11 }} />
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/salary/SalaryBarChart.tsx
git commit -m "feat: add SalaryBarChart component"
```

### Task 13: Create VariablePayChart component

**Files:**
- Create: `src/components/salary/VariablePayChart.tsx`

- [ ] **Step 1: Write the component**

```typescript
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { annualTotal, variableTotal, formatCents } from "@/lib/salary-utils";
import type { SalaryDataPointMember } from "@/lib/types";

interface VariablePayChartProps {
  members: SalaryDataPointMember[];
}

export function VariablePayChart({ members }: VariablePayChartProps) {
  const active = members.filter((m) => m.is_active);
  if (active.length === 0) return null;

  const data = active.map((m) => {
    const total = annualTotal(m.parts);
    const variable = variableTotal(m.parts);
    const fixed = total - variable;
    const varPct = total > 0 ? ((variable / total) * 100).toFixed(1) : "0";
    return {
      name: `${m.last_name}, ${m.first_name}`,
      fixed: fixed / 100,
      variable: variable / 100,
      varPct,
    };
  });

  return (
    <div>
      <h4 className="text-sm font-semibold mb-2">Variable Pay Breakdown</h4>
      <ResponsiveContainer width="100%" height={active.length * 40 + 40}>
        <BarChart data={data} layout="vertical" margin={{ left: 120, right: 60, top: 5, bottom: 5 }}>
          <XAxis type="number" tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
          <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12 }} />
          <Tooltip formatter={(value: number) => formatCents(value * 100)} />
          <Bar dataKey="fixed" stackId="salary" fill="#3b82f6" radius={[0, 0, 0, 0]} name="Fixed" />
          <Bar dataKey="variable" stackId="salary" fill="#93c5fd" radius={[0, 4, 4, 0]} name="Variable">
            {data.map((entry, i) => (
              <Cell key={i} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground px-2">
        {data.map((d) => (
          <span key={d.name}>{d.name}: {d.varPct}% variable</span>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/salary/VariablePayChart.tsx
git commit -m "feat: add VariablePayChart component"
```

### Task 14: Create ComparisonChart component

**Files:**
- Create: `src/components/salary/ComparisonChart.tsx`

- [ ] **Step 1: Write the component**

```typescript
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { annualTotal, formatCents, formatDeltaPercent } from "@/lib/salary-utils";
import type { SalaryDataPointMember, SalaryPart } from "@/lib/types";

interface ComparisonChartProps {
  members: SalaryDataPointMember[];
  previousData: Record<number, SalaryPart[] | null>; // keyed by member_id
}

export function ComparisonChart({ members, previousData }: ComparisonChartProps) {
  const active = members.filter((m) => m.is_active);
  if (active.length === 0) return null;

  const data = active.map((m) => {
    const current = annualTotal(m.parts) / 100;
    const prevParts = previousData[m.member_id];
    const previous = prevParts ? annualTotal(prevParts) / 100 : null;
    const delta = previous !== null ? current - previous : null;
    const deltaPct = previous !== null && previous > 0 ? ((delta! / previous) * 100) : null;
    return {
      name: `${m.last_name}, ${m.first_name}`,
      current,
      previous: previous ?? 0,
      delta,
      deltaPct,
      isNew: prevParts === null,
    };
  });

  const hasAnyPrevious = data.some((d) => !d.isNew);
  if (!hasAnyPrevious) return null;

  return (
    <div>
      <h4 className="text-sm font-semibold mb-2">Comparison vs Previous</h4>
      <ResponsiveContainer width="100%" height={active.length * 50 + 40}>
        <BarChart data={data} layout="vertical" margin={{ left: 120, right: 80, top: 5, bottom: 5 }}>
          <XAxis type="number" tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
          <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12 }} />
          <Tooltip formatter={(value: number) => formatCents(value * 100)} />
          <Bar dataKey="previous" fill="#cbd5e1" radius={[0, 4, 4, 0]} name="Previous" />
          <Bar dataKey="current" fill="#3b82f6" radius={[0, 4, 4, 0]} name="Current" />
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs px-2">
        {data.map((d) => (
          <span
            key={d.name}
            className={d.isNew ? "text-muted-foreground" : d.delta! > 0 ? "text-green-600" : d.delta! < 0 ? "text-red-600" : "text-muted-foreground"}
          >
            {d.name}: {d.isNew ? "New" : `${d.delta! > 0 ? "+" : ""}${formatCents(d.delta! * 100)} (${formatDeltaPercent(d.deltaPct!)})`}
          </span>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/salary/ComparisonChart.tsx
git commit -m "feat: add ComparisonChart component"
```

### Task 15: Create BudgetGauge component

**Files:**
- Create: `src/components/salary/BudgetGauge.tsx`

- [ ] **Step 1: Write the component**

```typescript
import { formatCents, formatDeltaPercent } from "@/lib/salary-utils";
import { cn } from "@/lib/utils";

interface BudgetGaugeProps {
  totalSalary: number; // cents, non-promoted only
  budget: number | null; // cents
}

export function BudgetGauge({ totalSalary, budget }: BudgetGaugeProps) {
  if (budget === null || budget === 0) return null;

  const diff = totalSalary - budget;
  const diffPct = (diff / budget) * 100;
  const usage = (totalSalary / budget) * 100;
  const isOver = diff > 0;

  return (
    <div>
      <h4 className="text-sm font-semibold mb-2">Budget</h4>
      <div className="rounded-lg border border-border p-4">
        <div className="mb-3 h-3 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full transition-all", isOver ? "bg-red-500" : "bg-green-500")}
            style={{ width: `${Math.min(usage, 100)}%` }}
          />
        </div>
        <div className="flex justify-between text-sm">
          <div>
            <span className="text-muted-foreground">Total: </span>
            <span className="font-medium">{formatCents(totalSalary)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Budget: </span>
            <span className="font-medium">{formatCents(budget)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Diff: </span>
            <span className={cn("font-medium", isOver ? "text-red-600" : "text-green-600")}>
              {diff > 0 ? "+" : ""}{formatCents(diff)} ({formatDeltaPercent(diffPct)})
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/salary/BudgetGauge.tsx
git commit -m "feat: add BudgetGauge component"
```

### Task 16: Create SalaryAnalytics container

**Files:**
- Create: `src/components/salary/SalaryAnalytics.tsx`

- [ ] **Step 1: Write the component**

```typescript
import { SalaryBarChart } from "./SalaryBarChart";
import { VariablePayChart } from "./VariablePayChart";
import { ComparisonChart } from "./ComparisonChart";
import { BudgetGauge } from "./BudgetGauge";
import { budgetTotals } from "@/lib/salary-utils";
import type { SalaryDataPointDetail, SalaryPart } from "@/lib/types";

interface SalaryAnalyticsProps {
  detail: SalaryDataPointDetail;
  previousData: Record<number, SalaryPart[] | null>;
}

export function SalaryAnalytics({ detail, previousData }: SalaryAnalyticsProps) {
  const { total } = budgetTotals(detail.members);

  return (
    <div className="flex flex-col gap-6">
      <BudgetGauge totalSalary={total} budget={detail.budget} />
      <SalaryBarChart members={detail.members} ranges={detail.ranges} budget={detail.budget} />
      <VariablePayChart members={detail.members} />
      <ComparisonChart members={detail.members} previousData={previousData} />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/salary/SalaryAnalytics.tsx
git commit -m "feat: add SalaryAnalytics container component"
```

---

## Chunk 6: Frontend — Main SalaryPlanner Page (Integration)

### Task 17: Rewrite SalaryPlanner page

**Files:**
- Replace: `src/pages/SalaryPlanner.tsx`

- [ ] **Step 1: Write the new SalaryPlanner page**

```typescript
import { useState, useEffect, useCallback } from "react";
import { DataPointList } from "@/components/salary/DataPointList";
import { DataPointModal } from "@/components/salary/DataPointModal";
import { MemberSalaryCard } from "@/components/salary/MemberSalaryCard";
import { SalaryAnalytics } from "@/components/salary/SalaryAnalytics";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  getSalaryDataPoints,
  getSalaryDataPoint,
  createSalaryDataPoint,
  deleteSalaryDataPoint,
  createSalaryPart,
  deleteSalaryPart as deleteSalaryPartApi,
  getPreviousMemberData,
  getTitles,
} from "@/lib/db";
import type { SalaryDataPointSummary, SalaryDataPointDetail, SalaryPart, Title } from "@/lib/types";

export function SalaryPlanner() {
  const [dataPoints, setDataPoints] = useState<SalaryDataPointSummary[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<SalaryDataPointDetail | null>(null);
  const [previousData, setPreviousData] = useState<Record<number, SalaryPart[] | null>>({});
  const [titles, setTitles] = useState<Title[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDpId, setEditingDpId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const loadDataPoints = useCallback(async () => {
    const [dps, t] = await Promise.all([getSalaryDataPoints(), getTitles()]);
    setDataPoints(dps);
    setTitles(t);
    return dps;
  }, []);

  const loadDetail = useCallback(async (id: number) => {
    const d = await getSalaryDataPoint(id);
    setDetail(d);

    // Load comparison data for active members
    const prev: Record<number, SalaryPart[] | null> = {};
    await Promise.all(
      d.members
        .filter((m) => m.is_active)
        .map(async (m) => {
          prev[m.member_id] = await getPreviousMemberData(id, m.member_id);
        })
    );
    setPreviousData(prev);
  }, []);

  useEffect(() => {
    loadDataPoints().then((dps) => {
      if (dps.length > 0) {
        setSelectedId(dps[0].id);
      }
      setLoading(false);
    });
  }, [loadDataPoints]);

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  async function handleCreate() {
    const dp = await createSalaryDataPoint();
    await loadDataPoints();
    setSelectedId(dp.id);
    setEditingDpId(dp.id);
    setModalOpen(true);
  }

  function handleEdit(dp: SalaryDataPointSummary) {
    setEditingDpId(dp.id);
    setModalOpen(true);
  }

  async function handleDelete(id: number) {
    if (!window.confirm("Delete this data point? This cannot be undone.")) return;
    await deleteSalaryDataPoint(id);
    const dps = await loadDataPoints();
    if (selectedId === id) {
      setSelectedId(dps.length > 0 ? dps[0].id : null);
      setDetail(null);
    }
  }

  async function handleAddPart(dataPointMemberId: number) {
    await createSalaryPart(dataPointMemberId);
    if (selectedId) await loadDetailOnly(selectedId);
  }

  async function handleDeletePart(partId: number) {
    await deleteSalaryPartApi(partId);
    if (selectedId) await loadDetailOnly(selectedId);
  }

  // Light refetch: only detail, no comparison data (used for part edits)
  const loadDetailOnly = useCallback(async (id: number) => {
    const d = await getSalaryDataPoint(id);
    setDetail(d);
  }, []);

  function handlePartChanged() {
    if (selectedId) loadDetailOnly(selectedId);
  }

  async function handleModalSaved() {
    await loadDataPoints();
    if (selectedId) await loadDetail(selectedId);
  }

  if (loading) {
    return <div className="p-6"><p className="text-muted-foreground">Loading…</p></div>;
  }

  const activeMembers = detail?.members.filter((m) => m.is_active) ?? [];

  return (
    <div className="flex h-full">
      {/* Left panel */}
      <div className="w-64 shrink-0">
        <DataPointList
          dataPoints={dataPoints}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onCreate={handleCreate}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      </div>

      {/* Right panel */}
      <ScrollArea className="flex-1">
        <div className="p-6">
          {!detail ? (
            <p className="text-muted-foreground">Select or create a data point to get started.</p>
          ) : (
            <div className="flex flex-col gap-6">
              <h1 className="text-2xl font-bold">{detail.name}</h1>

              {/* Member salary cards */}
              {activeMembers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No active members in this data point.</p>
              ) : (
                activeMembers.map((member) => (
                  <MemberSalaryCard
                    key={member.id}
                    member={member}
                    ranges={detail.ranges}
                    onAddPart={handleAddPart}
                    onDeletePart={handleDeletePart}
                    onChanged={handlePartChanged}
                  />
                ))
              )}

              {/* Analytics */}
              {activeMembers.length > 0 && (
                <>
                  <hr className="border-border" />
                  <SalaryAnalytics detail={detail} previousData={previousData} />
                </>
              )}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Edit modal */}
      <DataPointModal
        dataPointId={editingDpId}
        titles={titles}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={handleModalSaved}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify the build compiles**

Run: `npm run build 2>&1`
Expected: no TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add src/pages/SalaryPlanner.tsx
git commit -m "feat: rewrite SalaryPlanner page with data points, salary parts, and analytics"
```

---

## Chunk 7: Cleanup and Final Verification

### Task 18: Remove salary references from other components

**Files:**
- Modify: `src/lib/types.ts` (already done in Task 4)
- Check: Any other files referencing `salary` on TeamMember

- [ ] **Step 1: Search for stale salary references**

Run: `grep -r "salary" src/ --include="*.ts" --include="*.tsx" -l` and check each file for references to the old `member.salary` pattern. Fix any remaining references.

- [ ] **Step 2: Verify full build**

Run: `npm run build 2>&1`
Expected: no errors

Run: `cd src-tauri && cargo build 2>&1`
Expected: no errors

Run: `cd src-tauri && cargo test 2>&1`
Expected: all tests PASS

- [ ] **Step 3: Commit any remaining fixes**

```bash
git add -A
git commit -m "chore: remove stale salary references"
```

### Task 19: Manual smoke test

- [ ] **Step 1: Run the app**

Run: `npm run tauri dev`

- [ ] **Step 2: Verify the following flows work:**

1. Navigate to Salary Planner page
2. Create a new data point (should default to today's date)
3. Click edit button → modal opens with name, budget, ranges, member toggles
4. Add salary parts to a member (amount, frequency, variable toggle)
5. Verify totals update reactively
6. Verify range fit colors appear correctly
7. Create a second data point (should clone from first)
8. Modify salaries in second data point
9. Verify comparison chart shows deltas
10. Verify budget gauge shows correct totals
11. Toggle a member as promoted → verify budget excludes them
12. Toggle a member as inactive → verify they disappear from the list

- [ ] **Step 3: Final commit if any fixes needed**
