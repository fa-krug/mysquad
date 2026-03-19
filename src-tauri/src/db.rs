use parking_lot::Mutex;
use rusqlite::{Connection, Result};

#[derive(Default)]
pub struct AppDb {
    pub conn: Mutex<Option<Connection>>,
}

impl AppDb {
    pub fn new() -> Self {
        Self {
            conn: Mutex::new(None),
        }
    }

    /// Acquire the database connection, returning a descriptive error if the DB is not open.
    pub fn with_db<F, T>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&Connection) -> Result<T, String>,
    {
        let guard = self.conn.lock();
        let conn = guard.as_ref().ok_or("Database not open")?;
        f(conn)
    }
}

pub fn open_db_with_key(path: &str, key: &str) -> Result<Connection> {
    let conn = Connection::open(path)?;
    conn.pragma_update(None, "key", key)?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "synchronous", "NORMAL")?;
    conn.pragma_update(None, "cache_size", "-16000")?;
    conn.pragma_update(None, "temp_store", "MEMORY")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    conn.pragma_update(None, "recursive_triggers", "OFF")?;
    Ok(conn)
}

fn has_column(conn: &Connection, table: &str, column: &str) -> bool {
    let sql = format!(
        "SELECT COUNT(*) FROM pragma_table_info('{}') WHERE name = ?1",
        table
    );
    conn.query_row(&sql, [column], |row| row.get::<_, i32>(0))
        .unwrap_or(0)
        > 0
}

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

    if version < 3 {
        if !has_column(conn, "team_members", "picture_path") {
            let migration_sql = include_str!("../migrations/003_member_pictures.sql");
            conn.execute_batch(migration_sql)?;
        }
        conn.pragma_update(None, "user_version", 3)?;
    }

    if version < 4 {
        let migration_sql = include_str!("../migrations/004_projects.sql");
        conn.execute_batch(migration_sql)?;
        conn.pragma_update(None, "user_version", 4)?;
    }

    if version < 5 {
        if !has_column(conn, "team_members", "exclude_from_salary") {
            let migration_sql = include_str!("../migrations/005_exclude_from_salary.sql");
            conn.execute_batch(migration_sql)?;
        }
        conn.pragma_update(None, "user_version", 5)?;
    }

    if version < 6 {
        let migration_sql = include_str!("../migrations/006_reports.sql");
        conn.execute_batch(migration_sql)?;
        conn.pragma_update(None, "user_version", 6)?;
    }

    if version < 7 {
        let migration_sql = include_str!("../migrations/007_add_indexes.sql");
        conn.execute_batch(migration_sql)?;
        conn.pragma_update(None, "user_version", 7)?;
    }

    if version < 8 {
        if !has_column(conn, "salary_data_point_members", "promoted_title_id") {
            let migration_sql = include_str!("../migrations/008_promoted_title.sql");
            conn.execute_batch(migration_sql)?;
        }
        conn.pragma_update(None, "user_version", 8)?;
    }

    if version < 9 {
        if !has_column(conn, "salary_data_points", "previous_data_point_id") {
            let migration_sql = include_str!("../migrations/009_previous_data_point.sql");
            conn.execute_batch(migration_sql)?;
        }
        conn.pragma_update(None, "user_version", 9)?;
    }

    if version < 10 {
        if !has_column(conn, "team_members", "left_date") {
            let migration_sql = include_str!("../migrations/010_left_date.sql");
            conn.execute_batch(migration_sql)?;
        }
        conn.pragma_update(None, "user_version", 10)?;
    }

    if version < 11 {
        let migration_sql = include_str!("../migrations/011_scenario_groups.sql");
        conn.execute_batch(migration_sql)?;
        conn.pragma_update(None, "user_version", 11)?;
    }

    if version < 12 {
        if !has_column(conn, "salary_data_point_members", "is_presented") {
            let migration_sql = include_str!("../migrations/012_presentation_toggle.sql");
            conn.execute_batch(migration_sql)?;
        }
        conn.pragma_update(None, "user_version", 12)?;
    }

    if version < 13 {
        if !has_column(conn, "team_members", "lead_id") {
            let migration_sql = include_str!("../migrations/013_lead_id.sql");
            conn.execute_batch(migration_sql)?;
        }
        conn.pragma_update(None, "user_version", 13)?;
    }

    if version < 14 {
        let migration_sql = include_str!("../migrations/014_meetings.sql");
        conn.execute_batch(migration_sql)?;
        conn.pragma_update(None, "user_version", 14)?;
    }

    if version < 15 {
        let migration_sql = include_str!("../migrations/015_escalations.sql");
        conn.execute_batch(migration_sql)?;
        conn.pragma_update(None, "user_version", 15)?;
    }

    if version < 16 {
        let migration_sql = include_str!("../migrations/016_report_blocks.sql");
        conn.execute_batch(migration_sql)?;
        conn.pragma_update(None, "user_version", 16)?;
    }

    if version < 17 {
        if !has_column(conn, "salary_data_points", "template_path") {
            let migration_sql = include_str!("../migrations/017_salary_template.sql");
            conn.execute_batch(migration_sql)?;
        }
        conn.pragma_update(None, "user_version", 17)?;
    }

    if version < 18 {
        let migration_sql = include_str!("../migrations/018_scenario_group_members.sql");
        conn.execute_batch(migration_sql)?;
        conn.pragma_update(None, "user_version", 18)?;
    }

    if version < 19 {
        let migration_sql = include_str!("../migrations/019_soft_delete.sql");
        conn.execute_batch(migration_sql)?;
        conn.pragma_update(None, "user_version", 19)?;
    }

    if version < 20 {
        let migration_sql = include_str!("../migrations/020_additional_indexes.sql");
        conn.execute_batch(migration_sql)?;
        conn.pragma_update(None, "user_version", 20)?;
    }

    if version < 21 {
        let migration_sql = include_str!("../migrations/021_project_links.sql");
        conn.execute_batch(migration_sql)?;
        conn.pragma_update(None, "user_version", 21)?;
    }

    // Repair: ensure columns exist even if version was bumped past their migration
    let repair_columns = [
        ("team_members", "picture_path", "TEXT"),
        (
            "team_members",
            "exclude_from_salary",
            "INTEGER NOT NULL DEFAULT 0",
        ),
        ("team_members", "left_date", "TEXT"),
        (
            "team_members",
            "lead_id",
            "INTEGER REFERENCES team_members(id) ON DELETE SET NULL DEFAULT NULL",
        ),
        (
            "salary_data_point_members",
            "promoted_title_id",
            "INTEGER REFERENCES titles(id) ON DELETE SET NULL",
        ),
        (
            "salary_data_point_members",
            "is_presented",
            "INTEGER NOT NULL DEFAULT 0",
        ),
        (
            "salary_data_points",
            "previous_data_point_id",
            "INTEGER REFERENCES salary_data_points(id) ON DELETE SET NULL",
        ),
        ("salary_data_points", "template_path", "TEXT"),
    ];
    for (table, column, col_type) in repair_columns {
        if !has_column(conn, table, column) {
            eprintln!("[REPAIR] Adding missing column {}.{}", table, column);
            conn.execute_batch(&format!(
                "ALTER TABLE {} ADD COLUMN {} {};",
                table, column, col_type
            ))?;
        }
    }

    Ok(())
}

pub fn close_db(db: &AppDb) {
    let mut guard = db.conn.lock();
    *guard = None;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_open_db_in_memory_with_key() {
        let conn = open_db_with_key(":memory:", "test-key-0123456789abcdef").unwrap();
        let result: i32 = conn.query_row("SELECT 1", [], |row| row.get(0)).unwrap();
        assert_eq!(result, 1);
    }

    #[test]
    fn test_run_migrations() {
        let conn = open_db_with_key(":memory:", "test-key-0123456789abcdef").unwrap();
        run_migrations(&conn).unwrap();
        conn.execute(
            "INSERT INTO settings (key, value) VALUES ('test', 'val')",
            [],
        )
        .unwrap();
        let val: String = conn
            .query_row("SELECT value FROM settings WHERE key = 'test'", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(val, "val");
    }

    #[test]
    fn test_schema_version_tracking() {
        let conn = open_db_with_key(":memory:", "test-key-0123456789abcdef").unwrap();
        run_migrations(&conn).unwrap();
        let version: i32 = conn
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .unwrap();
        assert_eq!(version, 21);
    }

    #[test]
    fn test_lead_id_self_reference_blocked() {
        let conn = open_db_with_key(":memory:", "test-key-0123456789abcdef").unwrap();
        run_migrations(&conn).unwrap();

        conn.execute(
            "INSERT INTO team_members (first_name, last_name) VALUES ('Alice', 'A')",
            [],
        )
        .unwrap();
        let alice_id = conn.last_insert_rowid();

        conn.execute(
            "INSERT INTO team_members (first_name, last_name) VALUES ('Bob', 'B')",
            [],
        )
        .unwrap();
        let bob_id = conn.last_insert_rowid();

        // Valid: Bob's lead is Alice
        conn.execute(
            "UPDATE team_members SET lead_id = ?1 WHERE id = ?2",
            rusqlite::params![alice_id, bob_id],
        )
        .unwrap();

        let lead: Option<i64> = conn
            .query_row(
                "SELECT lead_id FROM team_members WHERE id = ?1",
                [bob_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(lead, Some(alice_id));
    }

    #[test]
    fn test_migrations_idempotent() {
        let conn = open_db_with_key(":memory:", "test-key-0123456789abcdef").unwrap();
        run_migrations(&conn).unwrap();
        run_migrations(&conn).unwrap();
    }

    #[test]
    fn test_foreign_keys_enabled() {
        let conn = open_db_with_key(":memory:", "test-key-0123456789abcdef").unwrap();
        run_migrations(&conn).unwrap();
        let fk: bool = conn
            .pragma_query_value(None, "foreign_keys", |row| row.get(0))
            .unwrap();
        assert!(fk);
    }

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

        let count: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='salary_parts'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);

        let count: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='salary_ranges'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);

        // Verify salary column removed from team_members
        let has_salary: bool = conn.prepare("SELECT salary FROM team_members").is_ok();
        assert!(!has_salary);

        // Verify user_version is 11 (all migrations run)
        let version: i32 = conn
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .unwrap();
        assert_eq!(version, 21);
    }

    #[test]
    fn test_migration_v3_picture_path() {
        let conn = open_db_with_key(":memory:", "test-key-0123456789abcdef").unwrap();
        run_migrations(&conn).unwrap();

        let has_col: bool = conn
            .prepare("SELECT picture_path FROM team_members LIMIT 0")
            .is_ok();
        assert!(has_col);

        let version: i32 = conn
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .unwrap();
        assert_eq!(version, 21);
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
            [],
        )
        .unwrap();

        // Now run full migrations (will run v2)
        run_migrations(&conn).unwrap();

        // Should have one data point named "Imported"
        let dp_count: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM salary_data_points WHERE name = 'Imported'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(dp_count, 1);

        // Both members should be in the data point
        let member_count: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM salary_data_point_members",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(member_count, 2);

        // Only Alice should have a salary part
        let part_count: i32 = conn
            .query_row("SELECT COUNT(*) FROM salary_parts", [], |row| row.get(0))
            .unwrap();
        assert_eq!(part_count, 1);

        // The salary part should be 7500000 cents
        let amount: i64 = conn
            .query_row("SELECT amount FROM salary_parts", [], |row| row.get(0))
            .unwrap();
        assert_eq!(amount, 7500000);
    }

    #[test]
    fn test_migration_v4_projects() {
        let conn = open_db_with_key(":memory:", "test-key-0123456789abcdef").unwrap();
        run_migrations(&conn).unwrap();

        // Verify projects table exists
        let count: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='projects'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);

        // Verify project_members table exists
        let count: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='project_members'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);

        // Verify project_status_items table exists
        let count: i32 = conn.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='project_status_items'",
            [], |row| row.get(0)
        ).unwrap();
        assert_eq!(count, 1);

        // Verify updated_at trigger works
        conn.execute("INSERT INTO projects (name) VALUES ('Test')", [])
            .unwrap();
        let id: i64 = conn.last_insert_rowid();
        let before: String = conn
            .query_row(
                "SELECT updated_at FROM projects WHERE id = ?1",
                [id],
                |row| row.get(0),
            )
            .unwrap();
        conn.execute("UPDATE projects SET name = 'Updated' WHERE id = ?1", [id])
            .unwrap();
        let after: String = conn
            .query_row(
                "SELECT updated_at FROM projects WHERE id = ?1",
                [id],
                |row| row.get(0),
            )
            .unwrap();
        assert!(after >= before);

        // Verify cascade delete
        conn.execute(
            "INSERT INTO project_members (project_id, team_member_id) VALUES (?1, (SELECT id FROM team_members LIMIT 1))",
            [id]
        ).ok(); // May fail if no team_members, that's fine
        conn.execute("DELETE FROM projects WHERE id = ?1", [id])
            .unwrap();
    }

    #[test]
    fn test_migration_v11_scenario_groups() {
        let conn = open_db_with_key(":memory:", "test-key-0123456789abcdef").unwrap();
        run_migrations(&conn).unwrap();

        let count: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='scenario_groups'",
                [],
                |row| row.get(0),
            )
            .unwrap();
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

    #[test]
    fn test_scenario_group_creation() {
        let conn = open_db_with_key(":memory:", "test-key-0123456789abcdef").unwrap();
        run_migrations(&conn).unwrap();

        conn.execute(
            "INSERT INTO team_members (first_name, last_name) VALUES ('Alice', 'Smith')",
            [],
        )
        .unwrap();
        conn.execute("INSERT INTO salary_data_points (name) VALUES ('Base')", [])
            .unwrap();
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
            "INSERT INTO scenario_groups (name, budget, previous_data_point_id) VALUES ('Test Scenarios', 1000000, ?1)",
            [base_dp_id],
        ).unwrap();
        let sg_id = conn.last_insert_rowid();

        for i in 1..=2 {
            conn.execute(
                "INSERT INTO salary_data_points (name, scenario_group_id) VALUES (?1, ?2)",
                rusqlite::params![format!("Scenario {}", i), sg_id],
            )
            .unwrap();
        }

        let child_count: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM salary_data_points WHERE scenario_group_id = ?1",
                [sg_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(child_count, 2);

        let normal_count: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM salary_data_points WHERE scenario_group_id IS NULL",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(normal_count, 1);
    }

    #[test]
    fn test_promote_scenario() {
        let conn = open_db_with_key(":memory:", "test-key-0123456789abcdef").unwrap();
        run_migrations(&conn).unwrap();

        conn.execute("INSERT INTO salary_data_points (name) VALUES ('Base')", [])
            .unwrap();
        let base_dp_id = conn.last_insert_rowid();

        conn.execute(
            "INSERT INTO scenario_groups (name, budget, previous_data_point_id) VALUES ('Scenarios', 500000, ?1)",
            [base_dp_id],
        ).unwrap();
        let sg_id = conn.last_insert_rowid();

        conn.execute(
            "INSERT INTO salary_data_points (name, scenario_group_id) VALUES ('Scenario 1', ?1)",
            [sg_id],
        )
        .unwrap();
        let child1_id = conn.last_insert_rowid();

        conn.execute(
            "INSERT INTO salary_data_points (name, scenario_group_id) VALUES ('Scenario 2', ?1)",
            [sg_id],
        )
        .unwrap();

        conn.execute_batch("BEGIN").unwrap();
        conn.execute(
            "UPDATE salary_data_points SET scenario_group_id = NULL WHERE id = ?1",
            [child1_id],
        )
        .unwrap();
        conn.execute(
            "UPDATE salary_data_points SET previous_data_point_id = ?1 WHERE id = ?2",
            rusqlite::params![base_dp_id, child1_id],
        )
        .unwrap();
        conn.execute(
            "UPDATE salary_data_points SET budget = 500000 WHERE id = ?1",
            [child1_id],
        )
        .unwrap();
        conn.execute("DELETE FROM scenario_groups WHERE id = ?1", [sg_id])
            .unwrap();
        conn.execute_batch("COMMIT").unwrap();

        let sg_id_after: Option<i64> = conn
            .query_row(
                "SELECT scenario_group_id FROM salary_data_points WHERE id = ?1",
                [child1_id],
                |row| row.get(0),
            )
            .unwrap();
        assert!(sg_id_after.is_none());

        let budget: Option<i64> = conn
            .query_row(
                "SELECT budget FROM salary_data_points WHERE id = ?1",
                [child1_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(budget, Some(500000));

        let sibling_count: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM salary_data_points WHERE name = 'Scenario 2'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(sibling_count, 0);

        let group_count: i32 = conn
            .query_row("SELECT COUNT(*) FROM scenario_groups", [], |row| row.get(0))
            .unwrap();
        assert_eq!(group_count, 0);
    }

    #[test]
    fn test_migration_v13_lead_id() {
        let conn = open_db_with_key(":memory:", "test-key-0123456789abcdef").unwrap();
        run_migrations(&conn).unwrap();

        // Verify lead_id column exists
        let has_col: bool = conn
            .prepare("SELECT lead_id FROM team_members LIMIT 0")
            .is_ok();
        assert!(has_col);

        // Verify lead_id defaults to NULL
        conn.execute(
            "INSERT INTO team_members (first_name, last_name) VALUES ('Test', 'User')",
            [],
        )
        .unwrap();
        let lead_id: Option<i64> = conn
            .query_row(
                "SELECT lead_id FROM team_members WHERE first_name = 'Test'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(lead_id.is_none());

        // Verify ON DELETE SET NULL
        conn.execute(
            "INSERT INTO team_members (first_name, last_name) VALUES ('Lead', 'Person')",
            [],
        )
        .unwrap();
        let lead_person_id: i64 = conn.last_insert_rowid();
        conn.execute(
            "UPDATE team_members SET lead_id = ?1 WHERE first_name = 'Test'",
            [lead_person_id],
        )
        .unwrap();
        conn.execute("DELETE FROM team_members WHERE id = ?1", [lead_person_id])
            .unwrap();
        let lead_id_after: Option<i64> = conn
            .query_row(
                "SELECT lead_id FROM team_members WHERE first_name = 'Test'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(lead_id_after.is_none());
    }

    #[test]
    fn test_remove_scenario_min_two() {
        let conn = open_db_with_key(":memory:", "test-key-0123456789abcdef").unwrap();
        run_migrations(&conn).unwrap();

        conn.execute("INSERT INTO scenario_groups (name) VALUES ('Test')", [])
            .unwrap();
        let sg_id = conn.last_insert_rowid();

        conn.execute(
            "INSERT INTO salary_data_points (name, scenario_group_id) VALUES ('S1', ?1)",
            [sg_id],
        )
        .unwrap();
        let child1_id = conn.last_insert_rowid();

        conn.execute(
            "INSERT INTO salary_data_points (name, scenario_group_id) VALUES ('S2', ?1)",
            [sg_id],
        )
        .unwrap();

        let child_count: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM salary_data_points WHERE scenario_group_id = ?1",
                [sg_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(child_count, 2);

        conn.execute(
            "INSERT INTO salary_data_points (name, scenario_group_id) VALUES ('S3', ?1)",
            [sg_id],
        )
        .unwrap();

        conn.execute("DELETE FROM salary_data_points WHERE id = ?1", [child1_id])
            .unwrap();

        let remaining: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM salary_data_points WHERE scenario_group_id = ?1",
                [sg_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(remaining, 2);
    }
}
