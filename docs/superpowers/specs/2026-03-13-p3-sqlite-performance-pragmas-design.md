# P3: SQLite Performance Pragmas

## Overview

Add performance-oriented PRAGMA settings when opening the database connection. These are well-established SQLite optimizations safe for a single-user desktop app.

## Problem

The current `open_db_with_key()` in `db.rs` only sets `key`, `foreign_keys`, and `recursive_triggers`. SQLite defaults are conservative (designed for multi-process server use), leaving performance on the table for a desktop app.

## Design

### Pragmas to add in `open_db_with_key()`

Add these after the existing pragma calls in `db.rs`:

| Pragma | Value | Why |
|--------|-------|-----|
| `journal_mode` | `WAL` | Write-Ahead Logging — reads don't block writes, faster concurrent access. Persists across connections once set. |
| `synchronous` | `NORMAL` | Reduces fsync frequency. WAL + NORMAL is safe against app crashes (only unsafe against OS crash + power loss, acceptable for desktop). |
| `cache_size` | `-16000` | 16MB page cache (negative = KB). Default is ~2MB. Proportionate for a small desktop DB. |
| `temp_store` | `MEMORY` | Temporary tables/indexes in RAM instead of disk. Faster sorts and joins. |

### Order matters

`journal_mode=WAL` must be set before `synchronous=NORMAL` for the safety guarantee to hold.

### Implementation

```rust
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
```

### SQLCipher compatibility

This app uses SQLCipher (encrypted SQLite via `bundled-sqlcipher` feature in rusqlite). SQLCipher 4.x supports WAL mode, but `PRAGMA key` must remain the very first pragma after opening the connection. The proposed ordering preserves this. Verify WAL works correctly with the bundled SQLCipher version during implementation — if it causes issues, skip WAL and keep the other three pragmas.

### WAL file note

WAL mode creates a `*.db-wal` and `*.db-shm` file alongside the database. These are normal and managed automatically by SQLite. No cleanup needed. Once set, WAL persists across connections — subsequent `PRAGMA journal_mode = WAL` calls on reopen are confirmations, not changes.

## Impact

- **Effort**: ~5 minutes
- **Risk**: Negligible — these are standard production SQLite settings
- **Benefit**: Faster writes (WAL + NORMAL), larger cache reduces disk reads, faster temp operations
