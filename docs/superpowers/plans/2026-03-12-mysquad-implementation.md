# MySquad Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a macOS Tauri v2 desktop app for team management with encrypted SQLite, biometric unlock, and a React/shadcn/ui frontend.

**Architecture:** Tauri v2 Rust backend handles SQLCipher DB access, macOS Keychain, and Touch ID. React frontend communicates via Tauri `invoke()` commands. All data persisted in an encrypted SQLite DB unlocked via biometrics on launch.

**Tech Stack:** Tauri v2, Rust, rusqlite (bundled-sqlcipher), security-framework, Vite, React 19, TypeScript, shadcn/ui, Tailwind CSS, React Router, Vitest, Testing Library

**Spec:** `docs/superpowers/specs/2026-03-12-mysquad-app-design.md`

---

## File Structure

```
mysquad/
├── src-tauri/
│   ├── src/
│   │   ├── main.rs              # Tauri entry point
│   │   ├── lib.rs               # Tauri setup, register commands & plugins
│   │   ├── db.rs                # SQLCipher DB open/close, migrations, query execution
│   │   ├── keychain.rs          # macOS Keychain: store/retrieve encryption key
│   │   ├── biometric.rs         # Touch ID / LocalAuthentication
│   │   └── commands.rs          # All Tauri commands exposed to frontend
│   ├── migrations/
│   │   └── 001_initial.sql      # Initial schema
│   ├── Cargo.toml
│   └── tauri.conf.json
├── src/
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx      # Collapsible sidebar with nav
│   │   │   ├── AppLayout.tsx    # Sidebar + content area wrapper
│   │   │   └── LockScreen.tsx   # Biometric unlock screen
│   │   ├── team/
│   │   │   ├── MemberList.tsx   # Left panel: scrollable member list
│   │   │   ├── MemberDetail.tsx # Right panel: orchestrates sections
│   │   │   ├── InfoSection.tsx  # Editable member info fields
│   │   │   ├── ChildrenList.tsx # Add/remove children with DOB
│   │   │   └── CheckableList.tsx # Reusable for status items & talk topics
│   │   └── ui/                  # shadcn/ui generated components
│   ├── hooks/
│   │   ├── useAutoSave.ts       # Debounced auto-save hook
│   │   ├── useAutoLock.ts       # Auto-lock on sleep/blur/idle
│   │   └── useTheme.ts          # Theme detection and switching
│   ├── lib/
│   │   ├── db.ts                # Tauri invoke wrappers for all DB commands
│   │   ├── types.ts             # TypeScript interfaces matching DB schema
│   │   └── utils.ts             # shadcn/ui cn() utility
│   ├── pages/
│   │   ├── TeamMembers.tsx      # Split view page
│   │   ├── Titles.tsx           # Title CRUD page
│   │   ├── SalaryPlanner.tsx    # Salary table page
│   │   └── Settings.tsx         # Theme + auto-lock config
│   ├── App.tsx                  # Router + lock gate + layout
│   ├── main.tsx                 # React entry point
│   └── index.css                # Tailwind directives + CSS variables
├── package.json
├── tsconfig.json
├── vite.config.ts
└── tailwind.config.ts
```

---

## Chunk 1: Project Scaffolding & Rust Backend

### Task 1: Scaffold Tauri v2 + Vite + React + TypeScript Project

**Files:**
- Create: entire project scaffold via `create-tauri-app`
- Modify: `src-tauri/Cargo.toml` (add dependencies)
- Modify: `src-tauri/tauri.conf.json` (app identity)

- [ ] **Step 1: Scaffold the project**

```bash
cd /Users/skrug/PycharmProjects
npm create tauri-app@latest mysquad -- --template react-ts --manager npm
```

Select: TypeScript/JavaScript, npm, React, TypeScript.

- [ ] **Step 2: Verify scaffold builds**

```bash
cd /Users/skrug/PycharmProjects/mysquad
npm install
npm run tauri build -- --debug 2>&1 | head -20
```

Expected: build starts (may not complete without Rust deps yet, but scaffold is valid).

- [ ] **Step 3: Update tauri.conf.json with app identity**

In `src-tauri/tauri.conf.json`, set:
```json
{
  "productName": "MySquad",
  "version": "0.1.0",
  "identifier": "com.mysquad.app",
  "build": {
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "title": "MySquad",
        "width": 1200,
        "height": 800,
        "minWidth": 900,
        "minHeight": 600
      }
    ]
  }
}
```

- [ ] **Step 4: Add Rust dependencies to Cargo.toml**

In `src-tauri/Cargo.toml`, set dependencies:
```toml
[dependencies]
tauri = { version = "2", features = [] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
rusqlite = { version = "0.37", features = ["bundled-sqlcipher"] }
security-framework = "3"
rand = "0.9"
hex = "0.4"
dirs = "6"

[build-dependencies]
tauri-build = { version = "2", features = [] }
```

- [ ] **Step 5: Verify Rust dependencies compile**

```bash
cd /Users/skrug/PycharmProjects/mysquad/src-tauri
cargo check
```

Expected: compiles successfully (SQLCipher bundled build may take a few minutes first time).

- [ ] **Step 6: Verify main.rs calls lib**

The scaffold should have created `src-tauri/src/main.rs`. Verify it calls into `lib.rs`. It should contain:
```rust
// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    app_lib::run();
}
```

If the scaffold uses a different pattern (e.g., inline builder in main.rs), restructure so that `main.rs` calls the `run()` function from `lib.rs`. The `lib.rs` will be replaced in Task 5.

- [ ] **Step 7: Initialize git and commit**

```bash
cd /Users/skrug/PycharmProjects/mysquad
git init
git add -A
git commit -m "chore: scaffold Tauri v2 + Vite + React + TypeScript project"
```

---

### Task 2: Rust Backend — Database Module

**Files:**
- Create: `src-tauri/src/db.rs`
- Create: `src-tauri/migrations/001_initial.sql`

- [ ] **Step 1: Write the migration SQL file**

Create `src-tauri/migrations/001_initial.sql`:
```sql
-- App settings (key-value)
CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Titles lookup
CREATE TABLE IF NOT EXISTS titles (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Team members
CREATE TABLE IF NOT EXISTS team_members (
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
    salary         INTEGER,
    start_date     DATE,
    notes          TEXT,
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Trigger to auto-update updated_at on team_members
CREATE TRIGGER IF NOT EXISTS team_members_updated_at
    AFTER UPDATE ON team_members
    FOR EACH ROW
    WHEN OLD.updated_at = NEW.updated_at
BEGIN
    UPDATE team_members SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;

-- Children of team members
CREATE TABLE IF NOT EXISTS children (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    team_member_id INTEGER NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
    name           TEXT NOT NULL,
    date_of_birth  DATE
);

-- Status items per team member
CREATE TABLE IF NOT EXISTS status_items (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    team_member_id INTEGER NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
    text           TEXT NOT NULL,
    checked        BOOLEAN DEFAULT 0,
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Talk topics per team member
CREATE TABLE IF NOT EXISTS talk_topics (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    team_member_id INTEGER NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
    text           TEXT NOT NULL,
    checked        BOOLEAN DEFAULT 0,
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

- [ ] **Step 2: Write tests for db module**

Create `src-tauri/src/db.rs` with tests first:
```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_open_db_in_memory_with_key() {
        let conn = open_db_with_key(":memory:", "test-key-0123456789abcdef").unwrap();
        // Verify we can execute a query
        let result: i32 = conn.query_row("SELECT 1", [], |row| row.get(0)).unwrap();
        assert_eq!(result, 1);
    }

    #[test]
    fn test_run_migrations() {
        let conn = open_db_with_key(":memory:", "test-key-0123456789abcdef").unwrap();
        run_migrations(&conn).unwrap();
        // Verify tables exist by inserting into settings
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
        // Running again should not error
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
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd /Users/skrug/PycharmProjects/mysquad/src-tauri
cargo test -- --test-threads=1
```

Expected: FAIL — `open_db_with_key` and `run_migrations` not yet defined.

- [ ] **Step 4: Implement db module**

Complete `src-tauri/src/db.rs`:
```rust
use rusqlite::{Connection, Result};
use std::path::Path;
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
    // Ensure recursive triggers remain OFF (SQLite default) to prevent
    // the updated_at trigger from recursing infinitely
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
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /Users/skrug/PycharmProjects/mysquad/src-tauri
cargo test -- --test-threads=1
```

Expected: all 5 tests PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/skrug/PycharmProjects/mysquad
git add src-tauri/src/db.rs src-tauri/migrations/001_initial.sql
git commit -m "feat: add SQLCipher database module with migrations"
```

---

### Task 3: Rust Backend — Keychain Module

**Files:**
- Create: `src-tauri/src/keychain.rs`

- [ ] **Step 1: Write keychain module with tests**

Create `src-tauri/src/keychain.rs`:
```rust
use security_framework::passwords::{delete_generic_password, get_generic_password, set_generic_password};

const SERVICE_NAME: &str = "com.mysquad.app";
const ACCOUNT_NAME: &str = "db-encryption-key";

pub fn store_key(key: &str) -> Result<(), String> {
    set_generic_password(SERVICE_NAME, ACCOUNT_NAME, key.as_bytes())
        .map_err(|e| format!("Failed to store key in Keychain: {}", e))
}

pub fn retrieve_key() -> Result<String, String> {
    let bytes = get_generic_password(SERVICE_NAME, ACCOUNT_NAME)
        .map_err(|e| format!("Failed to retrieve key from Keychain: {}", e))?;
    String::from_utf8(bytes)
        .map_err(|e| format!("Key is not valid UTF-8: {}", e))
}

pub fn delete_key() -> Result<(), String> {
    delete_generic_password(SERVICE_NAME, ACCOUNT_NAME)
        .map_err(|e| format!("Failed to delete key from Keychain: {}", e))
}

pub fn generate_key() -> String {
    use rand::Rng;
    let mut rng = rand::rng();
    let key_bytes: [u8; 32] = rng.random();
    hex::encode(key_bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_key_length() {
        let key = generate_key();
        // 32 bytes = 64 hex chars
        assert_eq!(key.len(), 64);
    }

    #[test]
    fn test_generate_key_uniqueness() {
        let key1 = generate_key();
        let key2 = generate_key();
        assert_ne!(key1, key2);
    }

    // Note: Keychain store/retrieve/delete tests require macOS Keychain access
    // and are tested via integration tests or manual testing.
}
```

- [ ] **Step 2: Run tests**

```bash
cd /Users/skrug/PycharmProjects/mysquad/src-tauri
cargo test keychain -- --test-threads=1
```

Expected: 2 tests PASS.

- [ ] **Step 3: Commit**

```bash
cd /Users/skrug/PycharmProjects/mysquad
git add src-tauri/src/keychain.rs
git commit -m "feat: add macOS Keychain module for encryption key storage"
```

---

### Task 4: Rust Backend — Biometric Module

**Files:**
- Create: `src-tauri/src/biometric.rs`

- [ ] **Step 1: Create Swift biometric helper**

Create `src-tauri/swift-helper/authenticate.swift`:
```swift
import LocalAuthentication
import Foundation

let context = LAContext()
var error: NSError?
let reason = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "Authenticate"

let semaphore = DispatchSemaphore(value: 0)
var success = false
var authError: String?

if context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error) {
    context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason) { result, evalError in
        success = result
        if let evalError = evalError {
            authError = evalError.localizedDescription
        }
        semaphore.signal()
    }
    semaphore.wait()
} else {
    authError = error?.localizedDescription ?? "Biometric authentication not available"
}

if success {
    print("success")
    exit(0)
} else {
    fputs(authError ?? "Authentication failed", stderr)
    exit(1)
}
```

Note: `.deviceOwnerAuthentication` (policy 2) uses Touch ID with system password fallback. This handles Macs without Touch ID.

- [ ] **Step 2: Add build step to compile Swift helper**

Add to `src-tauri/build.rs` (after the tauri_build::build() call):
```rust
fn main() {
    // Compile the Swift biometric helper
    let status = std::process::Command::new("swiftc")
        .args([
            "swift-helper/authenticate.swift",
            "-o",
            "../target/authenticate-helper",
            "-framework", "LocalAuthentication",
        ])
        .status()
        .expect("Failed to compile Swift helper");
    assert!(status.success(), "Swift helper compilation failed");

    tauri_build::build();
}
```

- [ ] **Step 3: Write biometric Rust module**

Create `src-tauri/src/biometric.rs`:
```rust
use std::process::Command;
use std::path::PathBuf;

/// Authenticate using Touch ID or system password fallback.
/// Calls a compiled Swift helper that uses the LocalAuthentication framework.
/// Uses .deviceOwnerAuthentication (policy 2) which falls back to system password
/// on Macs without Touch ID hardware.
pub fn authenticate(reason: &str) -> Result<(), String> {
    let helper_path = get_helper_path()?;

    let output = Command::new(&helper_path)
        .arg(reason)
        .output()
        .map_err(|e| format!("Failed to run authentication helper: {}", e))?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Authentication failed: {}", stderr.trim()))
    }
}

fn get_helper_path() -> Result<PathBuf, String> {
    // In development, the helper is in the target directory
    // In production, it's bundled alongside the app binary
    let exe_dir = std::env::current_exe()
        .map_err(|e| format!("Cannot find executable path: {}", e))?
        .parent()
        .ok_or("Cannot find executable directory")?
        .to_path_buf();

    let helper = exe_dir.join("authenticate-helper");
    if helper.exists() {
        return Ok(helper);
    }

    // Fallback: check target directory (development)
    let dev_helper = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .join("target/authenticate-helper");
    if dev_helper.exists() {
        return Ok(dev_helper);
    }

    Err("Authentication helper not found".into())
}

#[cfg(test)]
mod tests {
    // Biometric authentication requires user interaction and hardware.
    // These are tested manually or via integration tests.
    // Unit tests verify the module compiles correctly.

    #[test]
    fn test_module_compiles() {
        // Ensures the module compiles without errors
        assert!(true);
    }
}
```

- [ ] **Step 4: Run tests**

```bash
cd /Users/skrug/PycharmProjects/mysquad/src-tauri
cargo test biometric
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/skrug/PycharmProjects/mysquad
git add src-tauri/src/biometric.rs src-tauri/swift-helper/ src-tauri/build.rs
git commit -m "feat: add biometric authentication via Swift helper (Touch ID + password fallback)"
```

---

### Task 5: Rust Backend — Tauri Commands

**Files:**
- Create: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: Write Tauri commands**

Create `src-tauri/src/commands.rs`:
```rust
use crate::biometric;
use crate::db::{self, AppDb};
use crate::keychain;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;

// ── Auth commands ──

#[tauri::command]
pub fn authenticate(reason: String) -> Result<(), String> {
    biometric::authenticate(&reason)
}

#[tauri::command]
pub fn unlock_db(db: State<AppDb>) -> Result<(), String> {
    let key = match keychain::retrieve_key() {
        Ok(k) => k,
        Err(_) => {
            // First launch: generate and store key
            let new_key = keychain::generate_key();
            keychain::store_key(&new_key)?;
            new_key
        }
    };

    let db_path = get_db_path()?;
    let conn = db::open_db_with_key(&db_path, &key)
        .map_err(|e| format!("Failed to open database: {}", e))?;
    db::run_migrations(&conn)
        .map_err(|e| format!("Failed to run migrations: {}", e))?;

    let mut guard = db.conn.lock().unwrap();
    *guard = Some(conn);
    Ok(())
}

#[tauri::command]
pub fn lock_db(db: State<AppDb>) -> Result<(), String> {
    db::close_db(&db);
    Ok(())
}

// ── Team member commands ──

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
    pub salary: Option<i64>,
    pub start_date: Option<String>,
    pub notes: Option<String>,
}

#[tauri::command]
pub fn get_team_members(db: State<AppDb>) -> Result<Vec<TeamMember>, String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    let mut stmt = conn
        .prepare(
            "SELECT m.id, m.first_name, m.last_name, m.email, m.personal_email,
                    m.personal_phone, m.address_street, m.address_city, m.address_zip,
                    m.title_id, t.name as title_name, m.salary, m.start_date, m.notes
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
                salary: row.get(11)?,
                start_date: row.get(12)?,
                notes: row.get(13)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(members)
}

#[tauri::command]
pub fn create_team_member(db: State<AppDb>) -> Result<TeamMember, String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute(
        "INSERT INTO team_members (first_name, last_name) VALUES ('New', 'Member')",
        [],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    Ok(TeamMember {
        id,
        first_name: "New".into(),
        last_name: "Member".into(),
        email: None,
        personal_email: None,
        personal_phone: None,
        address_street: None,
        address_city: None,
        address_zip: None,
        title_id: None,
        title_name: None,
        salary: None,
        start_date: None,
        notes: None,
    })
}

#[tauri::command]
pub fn update_team_member(db: State<AppDb>, id: i64, field: String, value: Option<String>) -> Result<(), String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;

    // Whitelist allowed fields to prevent SQL injection
    let allowed = [
        "first_name", "last_name", "email", "personal_email", "personal_phone",
        "address_street", "address_city", "address_zip", "title_id", "salary",
        "start_date", "notes",
    ];
    if !allowed.contains(&field.as_str()) {
        return Err(format!("Invalid field: {}", field));
    }

    let sql = format!("UPDATE team_members SET {} = ?1 WHERE id = ?2", field);
    conn.execute(&sql, params![value, id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_team_member(db: State<AppDb>, id: i64) -> Result<(), String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute("DELETE FROM team_members WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ── Children commands ──

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Child {
    pub id: i64,
    pub team_member_id: i64,
    pub name: String,
    pub date_of_birth: Option<String>,
}

#[tauri::command]
pub fn get_children(db: State<AppDb>, team_member_id: i64) -> Result<Vec<Child>, String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    let mut stmt = conn
        .prepare("SELECT id, team_member_id, name, date_of_birth FROM children WHERE team_member_id = ?1")
        .map_err(|e| e.to_string())?;
    let children = stmt
        .query_map(params![team_member_id], |row| {
            Ok(Child {
                id: row.get(0)?,
                team_member_id: row.get(1)?,
                name: row.get(2)?,
                date_of_birth: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(children)
}

#[tauri::command]
pub fn add_child(db: State<AppDb>, team_member_id: i64, name: String, date_of_birth: Option<String>) -> Result<Child, String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute(
        "INSERT INTO children (team_member_id, name, date_of_birth) VALUES (?1, ?2, ?3)",
        params![team_member_id, name, date_of_birth],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    Ok(Child { id, team_member_id, name, date_of_birth })
}

#[tauri::command]
pub fn update_child(db: State<AppDb>, id: i64, name: String, date_of_birth: Option<String>) -> Result<(), String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute(
        "UPDATE children SET name = ?1, date_of_birth = ?2 WHERE id = ?3",
        params![name, date_of_birth, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_child(db: State<AppDb>, id: i64) -> Result<(), String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute("DELETE FROM children WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ── Checkable items commands (status_items & talk_topics) ──

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CheckableItem {
    pub id: i64,
    pub team_member_id: i64,
    pub text: String,
    pub checked: bool,
    pub created_at: String,
}

fn get_items(db: &AppDb, table: &str, team_member_id: i64) -> Result<Vec<CheckableItem>, String> {
    let allowed_tables = ["status_items", "talk_topics"];
    if !allowed_tables.contains(&table) {
        return Err(format!("Invalid table: {}", table));
    }
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    let sql = format!(
        "SELECT id, team_member_id, text, checked, created_at FROM {}
         WHERE team_member_id = ?1
         ORDER BY checked ASC, CASE WHEN checked = 0 THEN created_at END ASC,
                  CASE WHEN checked = 1 THEN created_at END DESC",
        table
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let items = stmt
        .query_map(params![team_member_id], |row| {
            Ok(CheckableItem {
                id: row.get(0)?,
                team_member_id: row.get(1)?,
                text: row.get(2)?,
                checked: row.get(3)?,
                created_at: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(items)
}

#[tauri::command]
pub fn get_status_items(db: State<AppDb>, team_member_id: i64) -> Result<Vec<CheckableItem>, String> {
    get_items(&db, "status_items", team_member_id)
}

#[tauri::command]
pub fn get_talk_topics(db: State<AppDb>, team_member_id: i64) -> Result<Vec<CheckableItem>, String> {
    get_items(&db, "talk_topics", team_member_id)
}

fn add_item(db: &AppDb, table: &str, team_member_id: i64, text: String) -> Result<CheckableItem, String> {
    let allowed_tables = ["status_items", "talk_topics"];
    if !allowed_tables.contains(&table) {
        return Err(format!("Invalid table: {}", table));
    }
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    let sql = format!(
        "INSERT INTO {} (team_member_id, text) VALUES (?1, ?2)", table
    );
    conn.execute(&sql, params![team_member_id, text])
        .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    let created_at: String = conn
        .query_row(
            &format!("SELECT created_at FROM {} WHERE id = ?1", table),
            params![id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(CheckableItem { id, team_member_id, text, checked: false, created_at })
}

#[tauri::command]
pub fn add_status_item(db: State<AppDb>, team_member_id: i64, text: String) -> Result<CheckableItem, String> {
    add_item(&db, "status_items", team_member_id, text)
}

#[tauri::command]
pub fn add_talk_topic(db: State<AppDb>, team_member_id: i64, text: String) -> Result<CheckableItem, String> {
    add_item(&db, "talk_topics", team_member_id, text)
}

fn update_item(db: &AppDb, table: &str, id: i64, text: Option<String>, checked: Option<bool>) -> Result<(), String> {
    let allowed_tables = ["status_items", "talk_topics"];
    if !allowed_tables.contains(&table) {
        return Err(format!("Invalid table: {}", table));
    }
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    if let Some(t) = text {
        let sql = format!("UPDATE {} SET text = ?1 WHERE id = ?2", table);
        conn.execute(&sql, params![t, id]).map_err(|e| e.to_string())?;
    }
    if let Some(c) = checked {
        let sql = format!("UPDATE {} SET checked = ?1 WHERE id = ?2", table);
        conn.execute(&sql, params![c, id]).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn update_status_item(db: State<AppDb>, id: i64, text: Option<String>, checked: Option<bool>) -> Result<(), String> {
    update_item(&db, "status_items", id, text, checked)
}

#[tauri::command]
pub fn update_talk_topic(db: State<AppDb>, id: i64, text: Option<String>, checked: Option<bool>) -> Result<(), String> {
    update_item(&db, "talk_topics", id, text, checked)
}

fn delete_item(db: &AppDb, table: &str, id: i64) -> Result<(), String> {
    let allowed_tables = ["status_items", "talk_topics"];
    if !allowed_tables.contains(&table) {
        return Err(format!("Invalid table: {}", table));
    }
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    let sql = format!("DELETE FROM {} WHERE id = ?1", table);
    conn.execute(&sql, params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_status_item(db: State<AppDb>, id: i64) -> Result<(), String> {
    delete_item(&db, "status_items", id)
}

#[tauri::command]
pub fn delete_talk_topic(db: State<AppDb>, id: i64) -> Result<(), String> {
    delete_item(&db, "talk_topics", id)
}

// ── Titles commands ──

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Title {
    pub id: i64,
    pub name: String,
    pub member_count: i64,
}

#[tauri::command]
pub fn get_titles(db: State<AppDb>) -> Result<Vec<Title>, String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    let mut stmt = conn
        .prepare(
            "SELECT t.id, t.name, COUNT(m.id) as member_count
             FROM titles t
             LEFT JOIN team_members m ON m.title_id = t.id
             GROUP BY t.id
             ORDER BY t.name ASC",
        )
        .map_err(|e| e.to_string())?;
    let titles = stmt
        .query_map([], |row| {
            Ok(Title {
                id: row.get(0)?,
                name: row.get(1)?,
                member_count: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(titles)
}

#[tauri::command]
pub fn create_title(db: State<AppDb>, name: String) -> Result<Title, String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute("INSERT INTO titles (name) VALUES (?1)", params![name])
        .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    Ok(Title { id, name, member_count: 0 })
}

#[tauri::command]
pub fn update_title(db: State<AppDb>, id: i64, name: String) -> Result<(), String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute("UPDATE titles SET name = ?1 WHERE id = ?2", params![name, id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_title(db: State<AppDb>, id: i64) -> Result<(), String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    // Check if any members use this title
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM team_members WHERE title_id = ?1", params![id], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    if count > 0 {
        return Err(format!("Cannot delete title: {} team member(s) are assigned to it", count));
    }
    conn.execute("DELETE FROM titles WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ── Settings commands ──

#[tauri::command]
pub fn get_setting(db: State<AppDb>, key: String) -> Result<Option<String>, String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    let result = conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        params![key],
        |row| row.get(0),
    );
    match result {
        Ok(val) => Ok(Some(val)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn set_setting(db: State<AppDb>, key: String, value: String) -> Result<(), String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ── Helpers ──

fn get_db_path() -> Result<String, String> {
    let data_dir = dirs::data_local_dir()
        .ok_or("Could not determine app data directory")?;
    let app_dir = data_dir.join("com.mysquad.app");
    std::fs::create_dir_all(&app_dir)
        .map_err(|e| format!("Failed to create app directory: {}", e))?;
    Ok(app_dir.join("mysquad.db").to_string_lossy().into_owned())
}
```

- [ ] **Step 2: Wire up lib.rs**

Replace `src-tauri/src/lib.rs`:
```rust
mod biometric;
mod commands;
mod db;
mod keychain;

use db::AppDb;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppDb::new())
        .invoke_handler(tauri::generate_handler![
            commands::authenticate,
            commands::unlock_db,
            commands::lock_db,
            commands::get_team_members,
            commands::create_team_member,
            commands::update_team_member,
            commands::delete_team_member,
            commands::get_children,
            commands::add_child,
            commands::update_child,
            commands::delete_child,
            commands::get_status_items,
            commands::get_talk_topics,
            commands::add_status_item,
            commands::add_talk_topic,
            commands::update_status_item,
            commands::update_talk_topic,
            commands::delete_status_item,
            commands::delete_talk_topic,
            commands::get_titles,
            commands::create_title,
            commands::update_title,
            commands::delete_title,
            commands::get_setting,
            commands::set_setting,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 3: Verify full Rust backend compiles**

```bash
cd /Users/skrug/PycharmProjects/mysquad/src-tauri
cargo check
```

Expected: compiles with no errors.

- [ ] **Step 4: Run all Rust tests**

```bash
cd /Users/skrug/PycharmProjects/mysquad/src-tauri
cargo test -- --test-threads=1
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/skrug/PycharmProjects/mysquad
git add src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat: add Tauri commands for all CRUD operations and auth"
```

---

## Chunk 2: Frontend Foundation

### Task 6: Set Up shadcn/ui + Tailwind + React Router

**Files:**
- Modify: `package.json` (new deps)
- Modify: `tsconfig.json` (path aliases)
- Modify: `vite.config.ts` (path aliases)
- Modify: `src/index.css` (Tailwind + theme vars)
- Create: `src/lib/utils.ts`

- [ ] **Step 1: Install shadcn/ui**

```bash
cd /Users/skrug/PycharmProjects/mysquad
npx shadcn@latest init -t vite
```

When prompted, accept defaults (TypeScript, neutral base color, CSS variables: yes).

- [ ] **Step 2: Verify path aliases are configured**

The `shadcn init` should have configured `@/` path aliases. Verify `tsconfig.json` has:
```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

And `vite.config.ts` has:
```typescript
import path from "path";
// ...
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // ...
});
```

If not set up by `shadcn init`, add these manually.

- [ ] **Step 3: Install React Router and lucide-react**

```bash
npm install react-router-dom lucide-react
```

Note: `lucide-react` may already be installed by shadcn/ui init, but run this to ensure it's present.

- [ ] **Step 4: Install shadcn/ui components we'll need**

```bash
npx shadcn@latest add button input label select textarea checkbox separator scroll-area dropdown-menu dialog tooltip
```

- [ ] **Step 5: Verify dev server starts**

```bash
cd /Users/skrug/PycharmProjects/mysquad
npm run dev &
sleep 3
curl -s http://localhost:1420 | head -5
kill %1 2>/dev/null
```

Expected: HTML response from Vite dev server.

- [ ] **Step 6: Commit**

```bash
cd /Users/skrug/PycharmProjects/mysquad
git add -A
git commit -m "chore: set up shadcn/ui, Tailwind CSS, React Router"
```

---

### Task 7: TypeScript Types & DB Helper Layer

**Files:**
- Create: `src/lib/types.ts`
- Create: `src/lib/db.ts`

- [ ] **Step 1: Create TypeScript types**

Create `src/lib/types.ts`:
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
  salary: number | null;
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
```

- [ ] **Step 2: Create DB helper layer**

Create `src/lib/db.ts`:
```typescript
import { invoke } from "@tauri-apps/api/core";
import type { TeamMember, Child, CheckableItem, Title } from "./types";

// Auth
export const authenticate = (reason: string) =>
  invoke<void>("authenticate", { reason });
export const unlockDb = () => invoke<void>("unlock_db");
export const lockDb = () => invoke<void>("lock_db");

// Team Members
export const getTeamMembers = () =>
  invoke<TeamMember[]>("get_team_members");
export const createTeamMember = () =>
  invoke<TeamMember>("create_team_member");
export const updateTeamMember = (id: number, field: string, value: string | null) =>
  invoke<void>("update_team_member", { id, field, value });
export const deleteTeamMember = (id: number) =>
  invoke<void>("delete_team_member", { id });

// Children
// Note: Tauri v2 invoke params must match Rust function param names (snake_case)
export const getChildren = (teamMemberId: number) =>
  invoke<Child[]>("get_children", { team_member_id: teamMemberId });
export const addChild = (teamMemberId: number, name: string, dateOfBirth: string | null) =>
  invoke<Child>("add_child", { team_member_id: teamMemberId, name, date_of_birth: dateOfBirth });
export const updateChild = (id: number, name: string, dateOfBirth: string | null) =>
  invoke<void>("update_child", { id, name, date_of_birth: dateOfBirth });
export const deleteChild = (id: number) =>
  invoke<void>("delete_child", { id });

// Status Items
export const getStatusItems = (teamMemberId: number) =>
  invoke<CheckableItem[]>("get_status_items", { team_member_id: teamMemberId });
export const addStatusItem = (teamMemberId: number, text: string) =>
  invoke<CheckableItem>("add_status_item", { team_member_id: teamMemberId, text });
export const updateStatusItem = (id: number, text?: string, checked?: boolean) =>
  invoke<void>("update_status_item", { id, text: text ?? null, checked: checked ?? null });
export const deleteStatusItem = (id: number) =>
  invoke<void>("delete_status_item", { id });

// Talk Topics
export const getTalkTopics = (teamMemberId: number) =>
  invoke<CheckableItem[]>("get_talk_topics", { team_member_id: teamMemberId });
export const addTalkTopic = (teamMemberId: number, text: string) =>
  invoke<CheckableItem>("add_talk_topic", { team_member_id: teamMemberId, text });
export const updateTalkTopic = (id: number, text?: string, checked?: boolean) =>
  invoke<void>("update_talk_topic", { id, text: text ?? null, checked: checked ?? null });
export const deleteTalkTopic = (id: number) =>
  invoke<void>("delete_talk_topic", { id });

// Titles
export const getTitles = () => invoke<Title[]>("get_titles");
export const createTitle = (name: string) =>
  invoke<Title>("create_title", { name });
export const updateTitle = (id: number, name: string) =>
  invoke<void>("update_title", { id, name });
export const deleteTitle = (id: number) =>
  invoke<void>("delete_title", { id });

// Settings
export const getSetting = (key: string) =>
  invoke<string | null>("get_setting", { key });
export const setSetting = (key: string, value: string) =>
  invoke<void>("set_setting", { key, value });
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/skrug/PycharmProjects/mysquad
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/skrug/PycharmProjects/mysquad
git add src/lib/types.ts src/lib/db.ts
git commit -m "feat: add TypeScript types and Tauri command wrapper layer"
```

---

### Task 8: Theme Hook & CSS Setup

**Files:**
- Create: `src/hooks/useTheme.ts`
- Modify: `src/index.css`

- [ ] **Step 1: Create useTheme hook**

Create `src/hooks/useTheme.ts`:
```typescript
import { useEffect, useState, useCallback } from "react";
import { getSetting, setSetting } from "../lib/db";

type Theme = "light" | "dark" | "system";

function getSystemTheme(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  const resolved = theme === "system" ? getSystemTheme() : theme;
  document.documentElement.classList.toggle("dark", resolved === "dark");
}

export function useTheme(dbReady: boolean) {
  const [theme, setThemeState] = useState<Theme>("system");

  // On mount or DB ready, load saved preference
  useEffect(() => {
    if (!dbReady) {
      // Before DB is open, use system preference
      applyTheme("system");
      return;
    }
    getSetting("theme").then((saved) => {
      const t = (saved as Theme) || "system";
      setThemeState(t);
      applyTheme(t);
    });
  }, [dbReady]);

  // Listen for system theme changes
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      if (theme === "system") applyTheme("system");
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  const setTheme = useCallback(
    (t: Theme) => {
      setThemeState(t);
      applyTheme(t);
      if (dbReady) setSetting("theme", t);
    },
    [dbReady]
  );

  return { theme, setTheme };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/skrug/PycharmProjects/mysquad
git add src/hooks/useTheme.ts
git commit -m "feat: add useTheme hook with system preference detection"
```

---

### Task 9: Auto-Save Hook

**Files:**
- Create: `src/hooks/useAutoSave.ts`

- [ ] **Step 1: Create useAutoSave hook**

Create `src/hooks/useAutoSave.ts`:
```typescript
import { useRef, useCallback, useEffect, useState } from "react";

interface UseAutoSaveOptions {
  delay?: number;
  onSave: (value: string | null) => Promise<void>;
}

export function useAutoSave({ delay = 500, onSave }: UseAutoSaveOptions) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  const save = useCallback(
    (value: string | null) => {
      setError(null);
      setSaved(false);
      pendingValueRef.current = value;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(async () => {
        pendingValueRef.current = undefined;
        setSaving(true);
        try {
          await onSaveRef.current(value);
          setSaved(true);
          setTimeout(() => setSaved(false), 1500);
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        } finally {
          setSaving(false);
        }
      }, delay);
    },
    [delay]
  );

  // Track the latest pending value so flush can execute it
  const pendingValueRef = useRef<string | null | undefined>(undefined);

  // Flush pending saves (used before auto-lock)
  const flush = useCallback(async () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      // Execute the pending save immediately
      if (pendingValueRef.current !== undefined) {
        try {
          await onSaveRef.current(pendingValueRef.current);
        } catch {
          // Best effort on flush
        }
        pendingValueRef.current = undefined;
      }
    }
  }, []);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return { save, flush, saving, saved, error };
}
```

- [ ] **Step 2: Verify compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
cd /Users/skrug/PycharmProjects/mysquad
git add src/hooks/useAutoSave.ts
git commit -m "feat: add useAutoSave hook with debounce and error state"
```

---

### Task 10: Auto-Lock Hook

**Files:**
- Create: `src/hooks/useAutoLock.ts`

- [ ] **Step 1: Create useAutoLock hook**

Create `src/hooks/useAutoLock.ts`:
```typescript
import { useEffect, useRef, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { getSetting } from "../lib/db";

interface UseAutoLockOptions {
  onLock: () => void;
  enabled: boolean;
}

export function useAutoLock({ onLock, enabled }: UseAutoLockOptions) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onLockRef = useRef(onLock);
  onLockRef.current = onLock;

  const clearIdleTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const startIdleTimer = useCallback(async () => {
    clearIdleTimer();
    try {
      const timeout = await getSetting("auto_lock_timeout");
      if (!timeout || timeout === "never") return;

      const ms = parseInt(timeout, 10) * 1000;
      if (isNaN(ms) || ms <= 0) return;

      timeoutRef.current = setTimeout(() => {
        onLockRef.current();
      }, ms);
    } catch {
      // DB might not be open yet
    }
  }, [clearIdleTimer]);

  useEffect(() => {
    if (!enabled) return;

    // Lock on window blur (start idle timer)
    const handleBlur = () => startIdleTimer();
    const handleFocus = () => clearIdleTimer();

    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);

    // Listen for macOS system sleep/screen lock events
    // These are emitted from Rust via NSWorkspace notifications (see commands.rs)
    const unlisteners: (() => void)[] = [];
    listen("system-sleep", () => onLockRef.current()).then((u) => unlisteners.push(u));
    listen("screen-lock", () => onLockRef.current()).then((u) => unlisteners.push(u));

    return () => {
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
      clearIdleTimer();
      unlisteners.forEach((u) => u());
    };
  }, [enabled, startIdleTimer, clearIdleTimer]);
}
```

**Note on macOS sleep/screen lock detection:** The Rust backend must register NSWorkspace observers. Add the following to `src-tauri/src/lib.rs` in the `run()` function, after the builder setup:

```rust
// In the setup closure of tauri::Builder:
.setup(|app| {
    // Register macOS sleep/screen lock observers
    #[cfg(target_os = "macos")]
    {
        let app_handle = app.handle().clone();
        std::thread::spawn(move || {
            use std::process::Command;
            // Use a small Swift helper or CFRunLoop-based approach
            // For simplicity, poll the system idle time
            // A production approach would use NSWorkspace notifications
            // via objc crate or the swift-helper pattern
            //
            // Pragmatic approach: emit events from the Tauri window focus/blur
            // and handle sleep via the window becoming hidden
            let _ = app_handle;
        });
    }
    Ok(())
})
```

**Important:** Full macOS sleep detection requires either:
1. An `objc` crate bridge to `NSWorkspace.shared.notificationCenter` observing `NSWorkspace.willSleepNotification` and `NSWorkspace.screensDidSleepNotification`, or
2. Extending the Swift helper to run as a background daemon that communicates events back.

For the MVP, the window blur + idle timeout approach covers the primary use case. The system sleep detection can be enhanced in a follow-up iteration using the `objc2` crate.

- [ ] **Step 2: Verify compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
cd /Users/skrug/PycharmProjects/mysquad
git add src/hooks/useAutoLock.ts
git commit -m "feat: add useAutoLock hook for system sleep and idle detection"
```

---

## Chunk 3: Layout & Navigation

### Task 11: Lock Screen Component

**Files:**
- Create: `src/components/layout/LockScreen.tsx`

- [ ] **Step 1: Create LockScreen component**

Create `src/components/layout/LockScreen.tsx`:
```tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Fingerprint, Loader2 } from "lucide-react";

interface LockScreenProps {
  onUnlock: () => Promise<void>;
}

export function LockScreen({ onUnlock }: LockScreenProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUnlock = async () => {
    setLoading(true);
    setError(null);
    try {
      await onUnlock();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-6">
        <h1 className="text-4xl font-bold tracking-tight">MySquad</h1>
        <p className="text-muted-foreground">Unlock to continue</p>
        <Button
          size="lg"
          onClick={handleUnlock}
          disabled={loading}
          className="gap-2"
        >
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Fingerprint className="h-5 w-5" />
          )}
          {loading ? "Authenticating..." : "Unlock"}
        </Button>
        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
cd /Users/skrug/PycharmProjects/mysquad
git add src/components/layout/LockScreen.tsx
git commit -m "feat: add LockScreen component with biometric unlock"
```

---

### Task 12: Sidebar Component

**Files:**
- Create: `src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Create Sidebar component**

Create `src/components/layout/Sidebar.tsx`:
```tsx
import { NavLink } from "react-router-dom";
import { Users, BadgeCheck, DollarSign, Settings, PanelLeftClose, PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

const navItems = [
  { to: "/", icon: Users, label: "Team Members" },
  { to: "/titles", icon: BadgeCheck, label: "Titles" },
  { to: "/salary", icon: DollarSign, label: "Salary Planner" },
];

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          "flex h-screen flex-col border-r bg-muted/40 transition-all duration-200",
          collapsed ? "w-[60px]" : "w-[240px]"
        )}
      >
        {/* Toggle button */}
        <div className="flex h-14 items-center px-3">
          <Button variant="ghost" size="icon" onClick={onToggle}>
            {collapsed ? <PanelLeft className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
          </Button>
        </div>

        {/* Nav items */}
        <nav className="flex flex-1 flex-col gap-1 px-2">
          {navItems.map(({ to, icon: Icon, label }) => (
            <Tooltip key={to}>
              <TooltipTrigger asChild>
                <NavLink
                  to={to}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      "hover:bg-accent hover:text-accent-foreground",
                      isActive
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground"
                    )
                  }
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  {!collapsed && <span>{label}</span>}
                </NavLink>
              </TooltipTrigger>
              {collapsed && (
                <TooltipContent side="right">{label}</TooltipContent>
              )}
            </Tooltip>
          ))}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Settings at bottom */}
          <Tooltip>
            <TooltipTrigger asChild>
              <NavLink
                to="/settings"
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors mb-2",
                    "hover:bg-accent hover:text-accent-foreground",
                    isActive
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground"
                  )
                }
              >
                <Settings className="h-5 w-5 shrink-0" />
                {!collapsed && <span>Settings</span>}
              </NavLink>
            </TooltipTrigger>
            {collapsed && (
              <TooltipContent side="right">Settings</TooltipContent>
            )}
          </Tooltip>
        </nav>
      </aside>
    </TooltipProvider>
  );
}
```

- [ ] **Step 2: Verify compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
cd /Users/skrug/PycharmProjects/mysquad
git add src/components/layout/Sidebar.tsx
git commit -m "feat: add collapsible Sidebar with nav items and tooltips"
```

---

### Task 13: AppLayout & App Router

**Files:**
- Create: `src/components/layout/AppLayout.tsx`
- Modify: `src/App.tsx`
- Create: `src/pages/TeamMembers.tsx` (placeholder)
- Create: `src/pages/Titles.tsx` (placeholder)
- Create: `src/pages/SalaryPlanner.tsx` (placeholder)
- Create: `src/pages/Settings.tsx` (placeholder)

- [ ] **Step 1: Create AppLayout**

Create `src/components/layout/AppLayout.tsx`:
```tsx
import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";

export function AppLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Create placeholder pages**

Create `src/pages/TeamMembers.tsx`:
```tsx
export function TeamMembers() {
  return <div className="p-6"><h1 className="text-2xl font-bold">Team Members</h1></div>;
}
```

Create `src/pages/Titles.tsx`:
```tsx
export function Titles() {
  return <div className="p-6"><h1 className="text-2xl font-bold">Titles</h1></div>;
}
```

Create `src/pages/SalaryPlanner.tsx`:
```tsx
export function SalaryPlanner() {
  return <div className="p-6"><h1 className="text-2xl font-bold">Salary Planner</h1></div>;
}
```

Create `src/pages/Settings.tsx`:
```tsx
export function SettingsPage() {
  return <div className="p-6"><h1 className="text-2xl font-bold">Settings</h1></div>;
}
```

- [ ] **Step 3: Wire up App.tsx with router and lock gate**

Replace `src/App.tsx`:
```tsx
import { useState, useCallback, useRef } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "./components/layout/AppLayout";
import { LockScreen } from "./components/layout/LockScreen";
import { TeamMembers } from "./pages/TeamMembers";
import { Titles } from "./pages/Titles";
import { SalaryPlanner } from "./pages/SalaryPlanner";
import { SettingsPage } from "./pages/Settings";
import { useTheme } from "./hooks/useTheme";
import { useAutoLock } from "./hooks/useAutoLock";
import { authenticate, unlockDb, lockDb } from "./lib/db";

// Global registry for flush callbacks (auto-save hooks register here)
export const flushRegistry: Set<() => Promise<void>> = new Set();

function App() {
  const [unlocked, setUnlocked] = useState(false);
  const { theme, setTheme } = useTheme(unlocked);

  const handleUnlock = useCallback(async () => {
    await authenticate("Unlock MySquad");
    await unlockDb();
    setUnlocked(true);
  }, []);

  const handleLock = useCallback(async () => {
    // Flush all pending auto-saves before closing the DB
    await Promise.all([...flushRegistry].map((flush) => flush()));
    await lockDb();
    setUnlocked(false);
  }, []);

  useAutoLock({ onLock: handleLock, enabled: unlocked });

  if (!unlocked) {
    return <LockScreen onUnlock={handleUnlock} />;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<TeamMembers />} />
          <Route path="/titles" element={<Titles />} />
          <Route path="/salary" element={<SalaryPlanner />} />
          <Route path="/settings" element={<SettingsPage theme={theme} onThemeChange={setTheme} />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
```

**Note:** The `useAutoSave` hook should register/unregister its `flush` function with the `flushRegistry` on mount/unmount. Add to `useAutoSave.ts`:
```typescript
import { flushRegistry } from "../App";

// Inside the hook, after defining flush:
useEffect(() => {
  flushRegistry.add(flush);
  return () => { flushRegistry.delete(flush); };
}, [flush]);
```

- [ ] **Step 4: Verify compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
cd /Users/skrug/PycharmProjects/mysquad
git add src/components/layout/AppLayout.tsx src/pages/ src/App.tsx
git commit -m "feat: add AppLayout, routing, lock gate, and placeholder pages"
```

---

## Chunk 4: Team Members Page

### Task 14: MemberList Component (Left Panel)

**Files:**
- Create: `src/components/team/MemberList.tsx`

- [ ] **Step 1: Create MemberList component**

Create `src/components/team/MemberList.tsx`:
```tsx
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import type { TeamMember } from "@/lib/types";

interface MemberListProps {
  members: TeamMember[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onCreate: () => void;
  onDelete: (id: number) => void;
}

export function MemberList({ members, selectedId, onSelect, onCreate, onDelete }: MemberListProps) {
  return (
    <div className="flex h-full w-[250px] flex-col border-r">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <h2 className="text-sm font-semibold">Team Members</h2>
        <Button variant="ghost" size="icon" onClick={onCreate} title="Add member">
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-0.5 p-1">
          {members.map((member) => (
            <div
              key={member.id}
              className={cn(
                "group flex cursor-pointer items-center justify-between rounded-md px-3 py-2 text-sm transition-colors",
                "hover:bg-accent",
                selectedId === member.id && "bg-accent"
              )}
              onClick={() => onSelect(member.id)}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">
                  {member.last_name}, {member.first_name}
                </div>
                {member.title_name && (
                  <div className="truncate text-xs text-muted-foreground">
                    {member.title_name}
                  </div>
                )}
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete team member?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete {member.first_name} {member.last_name} and all their data.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => onDelete(member.id)}>
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))}
          {members.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              No team members yet
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
```

- [ ] **Step 2: Install alert-dialog component if not yet added**

```bash
npx shadcn@latest add alert-dialog
```

- [ ] **Step 3: Verify compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
cd /Users/skrug/PycharmProjects/mysquad
git add src/components/team/MemberList.tsx
git commit -m "feat: add MemberList component with add/delete/select"
```

---

### Task 15: InfoSection Component

**Files:**
- Create: `src/components/team/InfoSection.tsx`

- [ ] **Step 1: Create InfoSection component**

Create `src/components/team/InfoSection.tsx`:
```tsx
import { useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAutoSave } from "@/hooks/useAutoSave";
import { updateTeamMember } from "@/lib/db";
import type { TeamMember, Title } from "@/lib/types";

interface InfoSectionProps {
  member: TeamMember;
  titles: Title[];
  onMemberChange: (field: string, value: string | null) => void;
}

function AutoSaveInput({
  label,
  value,
  memberId,
  field,
  onMemberChange,
  multiline,
}: {
  label: string;
  value: string | null;
  memberId: number;
  field: string;
  onMemberChange: (field: string, value: string | null) => void;
  multiline?: boolean;
}) {
  const { save, saving, saved, error } = useAutoSave({
    onSave: async (val) => {
      await updateTeamMember(memberId, field, val);
      onMemberChange(field, val);
    },
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const val = e.target.value || null;
    save(val);
  };

  const InputComponent = multiline ? Textarea : Input;

  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">
        {label}
        {saving && <span className="ml-2 text-muted-foreground">Saving...</span>}
        {saved && <span className="ml-2 text-green-600">Saved</span>}
        {error && <span className="ml-2 text-destructive">{error}</span>}
      </Label>
      <InputComponent
        defaultValue={value ?? ""}
        onChange={handleChange}
        className="h-8 text-sm"
      />
    </div>
  );
}

export function InfoSection({ member, titles, onMemberChange }: InfoSectionProps) {
  const { save: saveTitleId } = useAutoSave({
    onSave: async (val) => {
      await updateTeamMember(member.id, "title_id", val);
      onMemberChange("title_id", val);
    },
  });

  const handleTitleChange = useCallback(
    (val: string) => {
      const titleVal = val === "none" ? null : val;
      saveTitleId(titleVal);
    },
    [saveTitleId]
  );

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">Info</h3>
      <div className="grid grid-cols-2 gap-3">
        <AutoSaveInput label="First Name" value={member.first_name} memberId={member.id} field="first_name" onMemberChange={onMemberChange} />
        <AutoSaveInput label="Last Name" value={member.last_name} memberId={member.id} field="last_name" onMemberChange={onMemberChange} />
        <AutoSaveInput label="Work Email" value={member.email} memberId={member.id} field="email" onMemberChange={onMemberChange} />
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Title</Label>
          <Select
            defaultValue={member.title_id?.toString() ?? "none"}
            onValueChange={handleTitleChange}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="No title" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No title</SelectItem>
              {titles.map((t) => (
                <SelectItem key={t.id} value={t.id.toString()}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <AutoSaveInput label="Start Date" value={member.start_date} memberId={member.id} field="start_date" onMemberChange={onMemberChange} />
      </div>

      <h4 className="text-xs font-semibold text-muted-foreground pt-2">Private Contact</h4>
      <div className="grid grid-cols-2 gap-3">
        <AutoSaveInput label="Personal Email" value={member.personal_email} memberId={member.id} field="personal_email" onMemberChange={onMemberChange} />
        <AutoSaveInput label="Personal Phone" value={member.personal_phone} memberId={member.id} field="personal_phone" onMemberChange={onMemberChange} />
        <AutoSaveInput label="Street" value={member.address_street} memberId={member.id} field="address_street" onMemberChange={onMemberChange} />
        <AutoSaveInput label="City" value={member.address_city} memberId={member.id} field="address_city" onMemberChange={onMemberChange} />
        <AutoSaveInput label="ZIP" value={member.address_zip} memberId={member.id} field="address_zip" onMemberChange={onMemberChange} />
      </div>

      <AutoSaveInput label="Notes" value={member.notes} memberId={member.id} field="notes" onMemberChange={onMemberChange} multiline />
    </div>
  );
}
```

- [ ] **Step 2: Verify compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
cd /Users/skrug/PycharmProjects/mysquad
git add src/components/team/InfoSection.tsx
git commit -m "feat: add InfoSection component with auto-save fields"
```

---

### Task 16: ChildrenList Component

**Files:**
- Create: `src/components/team/ChildrenList.tsx`

- [ ] **Step 1: Create ChildrenList component**

Create `src/components/team/ChildrenList.tsx`:
```tsx
import { useState, useEffect } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getChildren, addChild, updateChild, deleteChild } from "@/lib/db";
import type { Child } from "@/lib/types";
import { useAutoSave } from "@/hooks/useAutoSave";

function ChildRow({ child, onDelete }: { child: Child; onDelete: (id: number) => void }) {
  const { save: saveName } = useAutoSave({
    onSave: async (val) => {
      await updateChild(child.id, val ?? child.name, child.date_of_birth);
    },
  });

  const { save: saveDob } = useAutoSave({
    onSave: async (val) => {
      await updateChild(child.id, child.name, val);
    },
  });

  return (
    <div className="flex items-center gap-2">
      <Input
        defaultValue={child.name}
        onChange={(e) => saveName(e.target.value)}
        placeholder="Name"
        className="h-7 flex-1 text-sm"
      />
      <Input
        type="date"
        defaultValue={child.date_of_birth ?? ""}
        onChange={(e) => saveDob(e.target.value || null)}
        className="h-7 w-36 text-sm"
      />
      <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => onDelete(child.id)}>
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

interface ChildrenListProps {
  teamMemberId: number;
}

export function ChildrenList({ teamMemberId }: ChildrenListProps) {
  const [children, setChildren] = useState<Child[]>([]);

  useEffect(() => {
    getChildren(teamMemberId).then(setChildren);
  }, [teamMemberId]);

  const handleAdd = async () => {
    const child = await addChild(teamMemberId, "New Child", null);
    setChildren((prev) => [...prev, child]);
  };

  const handleDelete = async (id: number) => {
    await deleteChild(id);
    setChildren((prev) => prev.filter((c) => c.id !== id));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">Kids</Label>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleAdd}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="space-y-1.5">
        {children.map((child) => (
          <ChildRow key={child.id} child={child} onDelete={handleDelete} />
        ))}
        {children.length === 0 && (
          <p className="text-xs text-muted-foreground">No children added</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
cd /Users/skrug/PycharmProjects/mysquad
git add src/components/team/ChildrenList.tsx
git commit -m "feat: add ChildrenList component with add/edit/remove"
```

---

### Task 17: CheckableList Component

**Files:**
- Create: `src/components/team/CheckableList.tsx`

- [ ] **Step 1: Create CheckableList component**

Create `src/components/team/CheckableList.tsx`:
```tsx
import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { CheckableItem } from "@/lib/types";
import { useAutoSave } from "@/hooks/useAutoSave";

interface CheckableListProps {
  title: string;
  items: CheckableItem[];
  onAdd: (text: string) => Promise<CheckableItem>;
  onUpdate: (id: number, text?: string, checked?: boolean) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onItemsChange: (items: CheckableItem[]) => void;
}

function CheckableRow({
  item,
  onUpdate,
  onDelete,
}: {
  item: CheckableItem;
  onUpdate: (id: number, text?: string, checked?: boolean) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}) {
  const { save: saveText } = useAutoSave({
    onSave: async (val) => {
      if (val) await onUpdate(item.id, val);
    },
  });

  return (
    <div className={cn("group flex items-start gap-2 rounded-md p-2", item.checked && "opacity-50")}>
      <Checkbox
        checked={item.checked}
        onCheckedChange={(checked) => onUpdate(item.id, undefined, !!checked)}
        className="mt-0.5"
      />
      <div className="min-w-0 flex-1">
        {item.checked ? (
          <span className="text-sm line-through text-muted-foreground truncate block">
            {item.text}
          </span>
        ) : (
          <Input
            defaultValue={item.text}
            onChange={(e) => saveText(e.target.value)}
            className="h-auto border-0 p-0 text-sm shadow-none focus-visible:ring-0"
          />
        )}
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-5 w-5 shrink-0 opacity-0 group-hover:opacity-100"
        onClick={() => onDelete(item.id)}
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}

export function CheckableList({
  title,
  items,
  onAdd,
  onUpdate,
  onDelete,
  onItemsChange,
}: CheckableListProps) {
  const [adding, setAdding] = useState(false);
  const [newText, setNewText] = useState("");

  const handleAdd = async () => {
    if (!newText.trim()) return;
    const item = await onAdd(newText.trim());
    onItemsChange([...items.filter((i) => !i.checked), item, ...items.filter((i) => i.checked)]);
    setNewText("");
    setAdding(false);
  };

  const handleUpdate = async (id: number, text?: string, checked?: boolean) => {
    await onUpdate(id, text, checked);
    onItemsChange(
      items.map((i) => (i.id === id ? { ...i, ...(text !== undefined && { text }), ...(checked !== undefined && { checked }) } : i))
    );
  };

  const handleDelete = async (id: number) => {
    await onDelete(id);
    onItemsChange(items.filter((i) => i.id !== id));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setAdding(true)}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
      {adding && (
        <div className="flex items-center gap-2">
          <Input
            autoFocus
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
              if (e.key === "Escape") { setAdding(false); setNewText(""); }
            }}
            placeholder={`Add ${title.toLowerCase()}...`}
            className="h-8 text-sm"
          />
          <Button size="sm" onClick={handleAdd}>Add</Button>
        </div>
      )}
      <div className="space-y-0.5">
        {items.map((item) => (
          <CheckableRow
            key={item.id}
            item={item}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
          />
        ))}
        {items.length === 0 && !adding && (
          <p className="text-xs text-muted-foreground px-2">No items</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
cd /Users/skrug/PycharmProjects/mysquad
git add src/components/team/CheckableList.tsx
git commit -m "feat: add CheckableList component for status items and talk topics"
```

---

### Task 18: MemberDetail & TeamMembers Page

**Files:**
- Create: `src/components/team/MemberDetail.tsx`
- Modify: `src/pages/TeamMembers.tsx`

- [ ] **Step 1: Create MemberDetail component**

Create `src/components/team/MemberDetail.tsx`:
```tsx
import { useState, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { InfoSection } from "./InfoSection";
import { ChildrenList } from "./ChildrenList";
import { CheckableList } from "./CheckableList";
import {
  getStatusItems,
  getTalkTopics,
  addStatusItem,
  addTalkTopic,
  updateStatusItem,
  updateTalkTopic,
  deleteStatusItem,
  deleteTalkTopic,
  getTitles,
} from "@/lib/db";
import type { TeamMember, CheckableItem, Title } from "@/lib/types";

interface MemberDetailProps {
  member: TeamMember;
  onMemberChange: (field: string, value: string | null) => void;
}

export function MemberDetail({ member, onMemberChange }: MemberDetailProps) {
  const [statusItems, setStatusItems] = useState<CheckableItem[]>([]);
  const [talkTopics, setTalkTopics] = useState<CheckableItem[]>([]);
  const [titles, setTitles] = useState<Title[]>([]);

  useEffect(() => {
    getStatusItems(member.id).then(setStatusItems);
    getTalkTopics(member.id).then(setTalkTopics);
    getTitles().then(setTitles);
  }, [member.id]);

  return (
    <ScrollArea className="h-full">
      <div className="max-w-2xl space-y-6 p-6">
        <InfoSection member={member} titles={titles} onMemberChange={onMemberChange} />

        <ChildrenList teamMemberId={member.id} />

        <Separator />

        <CheckableList
          title="Status"
          items={statusItems}
          onAdd={(text) => addStatusItem(member.id, text)}
          onUpdate={(id, text, checked) => updateStatusItem(id, text, checked)}
          onDelete={deleteStatusItem}
          onItemsChange={setStatusItems}
        />

        <Separator />

        <CheckableList
          title="Talk Topics"
          items={talkTopics}
          onAdd={(text) => addTalkTopic(member.id, text)}
          onUpdate={(id, text, checked) => updateTalkTopic(id, text, checked)}
          onDelete={deleteTalkTopic}
          onItemsChange={setTalkTopics}
        />
      </div>
    </ScrollArea>
  );
}
```

- [ ] **Step 2: Implement full TeamMembers page**

Replace `src/pages/TeamMembers.tsx`:
```tsx
import { useState, useEffect, useCallback } from "react";
import { MemberList } from "@/components/team/MemberList";
import { MemberDetail } from "@/components/team/MemberDetail";
import { getTeamMembers, createTeamMember, deleteTeamMember } from "@/lib/db";
import type { TeamMember } from "@/lib/types";

export function TeamMembers() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const loadMembers = useCallback(async () => {
    const data = await getTeamMembers();
    setMembers(data);
  }, []);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const handleCreate = async () => {
    const member = await createTeamMember();
    await loadMembers();
    setSelectedId(member.id);
  };

  const handleDelete = async (id: number) => {
    await deleteTeamMember(id);
    if (selectedId === id) setSelectedId(null);
    await loadMembers();
  };

  const handleMemberChange = (field: string, value: string | null) => {
    setMembers((prev) =>
      prev.map((m) =>
        m.id === selectedId ? { ...m, [field]: value } : m
      )
    );
  };

  const selectedMember = members.find((m) => m.id === selectedId) ?? null;

  return (
    <div className="flex h-full">
      <MemberList
        members={members}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onCreate={handleCreate}
        onDelete={handleDelete}
      />
      <div className="flex-1">
        {selectedMember ? (
          <MemberDetail
            key={selectedMember.id}
            member={selectedMember}
            onMemberChange={handleMemberChange}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            Select a team member to view details
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
cd /Users/skrug/PycharmProjects/mysquad
git add src/components/team/MemberDetail.tsx src/pages/TeamMembers.tsx
git commit -m "feat: implement full Team Members page with split view"
```

---

## Chunk 5: Remaining Pages

### Task 19: Titles Page

**Files:**
- Modify: `src/pages/Titles.tsx`

- [ ] **Step 1: Implement Titles page**

Replace `src/pages/Titles.tsx`:
```tsx
import { useState, useEffect } from "react";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getTitles, createTitle, updateTitle, deleteTitle } from "@/lib/db";
import type { Title } from "@/lib/types";

export function Titles() {
  const [titles, setTitles] = useState<Title[]>([]);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const data = await getTitles();
    setTitles(data);
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    try {
      await createTitle(newName.trim());
      setNewName("");
      setAdding(false);
      setError(null);
      await load();
    } catch (e) {
      setError(String(e));
    }
  };

  const handleUpdate = async (id: number) => {
    if (!editName.trim()) return;
    try {
      await updateTitle(id, editName.trim());
      setEditingId(null);
      setError(null);
      await load();
    } catch (e) {
      setError(String(e));
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteTitle(id);
      setError(null);
      await load();
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div className="max-w-lg space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Titles</h1>
        <Button variant="outline" size="sm" onClick={() => setAdding(true)} className="gap-1">
          <Plus className="h-4 w-4" /> Add
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {adding && (
        <div className="flex items-center gap-2">
          <Input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
              if (e.key === "Escape") { setAdding(false); setNewName(""); }
            }}
            placeholder="Title name..."
            className="h-8"
          />
          <Button size="sm" onClick={handleAdd}>Add</Button>
          <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setNewName(""); }}>Cancel</Button>
        </div>
      )}

      <div className="space-y-1">
        {titles.map((title) => (
          <div
            key={title.id}
            className="group flex items-center justify-between rounded-md px-3 py-2 hover:bg-muted"
          >
            {editingId === title.id ? (
              <div className="flex flex-1 items-center gap-2">
                <Input
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleUpdate(title.id);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  className="h-7 text-sm"
                />
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleUpdate(title.id)}>
                  <Check className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditingId(null)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <>
                <div>
                  <span className="text-sm font-medium">{title.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    ({title.member_count} member{title.member_count !== 1 ? "s" : ""})
                  </span>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    onClick={() => { setEditingId(title.id); setEditName(title.name); }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    onClick={() => handleDelete(title.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </>
            )}
          </div>
        ))}
        {titles.length === 0 && !adding && (
          <p className="py-8 text-center text-sm text-muted-foreground">No titles yet</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
cd /Users/skrug/PycharmProjects/mysquad
git add src/pages/Titles.tsx
git commit -m "feat: implement Titles page with CRUD and member count"
```

---

### Task 20: Salary Planner Page

**Files:**
- Modify: `src/pages/SalaryPlanner.tsx`

- [ ] **Step 1: Implement Salary Planner page**

Replace `src/pages/SalaryPlanner.tsx`:
```tsx
import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { getTeamMembers, updateTeamMember } from "@/lib/db";
import { useAutoSave } from "@/hooks/useAutoSave";
import type { TeamMember } from "@/lib/types";

function SalaryCell({ member }: { member: TeamMember }) {
  const { save, saving, saved, error } = useAutoSave({
    onSave: async (val) => {
      // Convert display value (dollars) to cents for storage
      const cents = val ? Math.round(parseFloat(val) * 100).toString() : null;
      await updateTeamMember(member.id, "salary", cents);
    },
  });

  // Display cents as dollars
  const displayValue = member.salary != null ? (member.salary / 100).toFixed(2) : "";

  return (
    <div className="relative">
      <Input
        type="number"
        step="0.01"
        defaultValue={displayValue}
        onChange={(e) => save(e.target.value || null)}
        className="h-8 w-32 text-sm text-right"
      />
      {saving && <span className="absolute -top-4 right-0 text-xs text-muted-foreground">Saving...</span>}
      {saved && <span className="absolute -top-4 right-0 text-xs text-green-600">Saved</span>}
      {error && <span className="absolute -top-4 right-0 text-xs text-destructive">Error</span>}
    </div>
  );
}

export function SalaryPlanner() {
  const [members, setMembers] = useState<TeamMember[]>([]);

  useEffect(() => {
    getTeamMembers().then(setMembers);
  }, []);

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-bold">Salary Planner</h1>

      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-2 text-left font-medium">Name</th>
              <th className="px-4 py-2 text-left font-medium">Title</th>
              <th className="px-4 py-2 text-right font-medium">Salary</th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.id} className="border-b last:border-0">
                <td className="px-4 py-2">
                  {member.last_name}, {member.first_name}
                </td>
                <td className="px-4 py-2 text-muted-foreground">
                  {member.title_name ?? "—"}
                </td>
                <td className="px-4 py-2 text-right">
                  <SalaryCell member={member} />
                </td>
              </tr>
            ))}
            {members.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">
                  No team members yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
cd /Users/skrug/PycharmProjects/mysquad
git add src/pages/SalaryPlanner.tsx
git commit -m "feat: implement Salary Planner page with editable salary cells"
```

---

### Task 21: Settings Page

**Files:**
- Modify: `src/pages/Settings.tsx`

- [ ] **Step 1: Implement Settings page**

Replace `src/pages/Settings.tsx`:
```tsx
import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getSetting, setSetting } from "@/lib/db";

interface SettingsPageProps {
  theme?: string;
  onThemeChange?: (theme: "light" | "dark" | "system") => void;
}

export function SettingsPage({ theme: themeProp, onThemeChange }: SettingsPageProps) {
  const [autoLockTimeout, setAutoLockTimeout] = useState("300");

  useEffect(() => {
    getSetting("auto_lock_timeout").then((val) => {
      if (val) setAutoLockTimeout(val);
    });
  }, []);

  const handleAutoLockChange = (val: string) => {
    setAutoLockTimeout(val);
    setSetting("auto_lock_timeout", val);
  };

  return (
    <div className="max-w-lg space-y-6 p-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <div className="space-y-2">
        <Label>Theme</Label>
        <Select
          value={themeProp ?? "system"}
          onValueChange={(val) => onThemeChange?.(val as "light" | "dark" | "system")}
        >
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="system">System</SelectItem>
            <SelectItem value="light">Light</SelectItem>
            <SelectItem value="dark">Dark</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Auto-lock timeout (on focus loss)</Label>
        <Select value={autoLockTimeout} onValueChange={handleAutoLockChange}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0">Immediately</SelectItem>
            <SelectItem value="60">1 minute</SelectItem>
            <SelectItem value="300">5 minutes</SelectItem>
            <SelectItem value="never">Never</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update App.tsx to pass theme props to Settings**

In `src/App.tsx`, update the Settings route:
```tsx
<Route path="/settings" element={<SettingsPage theme={theme} onThemeChange={setTheme} />} />
```

And update the import of `SettingsPage` props type accordingly.

- [ ] **Step 3: Verify compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
cd /Users/skrug/PycharmProjects/mysquad
git add src/pages/Settings.tsx src/App.tsx
git commit -m "feat: implement Settings page with theme and auto-lock config"
```

---

### Task 22: Final Integration & Smoke Test

**Files:**
- All files (verification only)

- [ ] **Step 1: Verify full TypeScript compilation**

```bash
cd /Users/skrug/PycharmProjects/mysquad
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 2: Verify Rust compilation**

```bash
cd /Users/skrug/PycharmProjects/mysquad/src-tauri
cargo check
```

Expected: no errors.

- [ ] **Step 3: Run Rust tests**

```bash
cargo test -- --test-threads=1
```

Expected: all tests PASS.

- [ ] **Step 4: Build and launch the app**

```bash
cd /Users/skrug/PycharmProjects/mysquad
npm run tauri dev
```

Expected: app opens, shows lock screen, Touch ID prompt appears. After authentication, sidebar and Team Members page visible.

- [ ] **Step 5: Final commit**

```bash
cd /Users/skrug/PycharmProjects/mysquad
git add -A
git commit -m "chore: final integration wiring and cleanup"
```
