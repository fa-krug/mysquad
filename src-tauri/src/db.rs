use rusqlite::{Connection, Result};
use std::sync::Mutex;

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
        conn.execute("INSERT INTO settings (key, value) VALUES ('test', 'val')", []).unwrap();
        let val: String = conn.query_row(
            "SELECT value FROM settings WHERE key = 'test'", [], |row| row.get(0)
        ).unwrap();
        assert_eq!(val, "val");
    }

    #[test]
    fn test_schema_version_tracking() {
        let conn = open_db_with_key(":memory:", "test-key-0123456789abcdef").unwrap();
        run_migrations(&conn).unwrap();
        let version: i32 = conn.pragma_query_value(None, "user_version", |row| row.get(0)).unwrap();
        assert_eq!(version, 1);
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
        let fk: bool = conn.pragma_query_value(None, "foreign_keys", |row| row.get(0)).unwrap();
        assert!(fk);
    }
}
