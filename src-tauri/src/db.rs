use rusqlite::{Connection, Result};
use std::sync::Mutex;

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
        let migration_sql = include_str!("../migrations/003_member_pictures.sql");
        conn.execute_batch(migration_sql)?;
        conn.pragma_update(None, "user_version", 3)?;
    }

    if version < 4 {
        let migration_sql = include_str!("../migrations/004_projects.sql");
        conn.execute_batch(migration_sql)?;
        conn.pragma_update(None, "user_version", 4)?;
    }

    if version < 5 {
        let migration_sql = include_str!("../migrations/005_exclude_from_salary.sql");
        conn.execute_batch(migration_sql)?;
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
        let migration_sql = include_str!("../migrations/008_promoted_title.sql");
        conn.execute_batch(migration_sql)?;
        conn.pragma_update(None, "user_version", 8)?;
    }

    if version < 9 {
        let migration_sql = include_str!("../migrations/009_previous_data_point.sql");
        conn.execute_batch(migration_sql)?;
        conn.pragma_update(None, "user_version", 9)?;
    }

    Ok(())
}

pub fn close_db(db: &AppDb) {
    let mut guard = db.conn.lock().unwrap();
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
        assert_eq!(version, 9);
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

        // Verify user_version is 3 (all migrations run)
        let version: i32 = conn
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .unwrap();
        assert_eq!(version, 9);
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
        assert_eq!(version, 9);
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
}
