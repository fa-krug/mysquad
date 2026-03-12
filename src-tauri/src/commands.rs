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
        email: None, personal_email: None, personal_phone: None,
        address_street: None, address_city: None, address_zip: None,
        title_id: None, title_name: None, salary: None,
        start_date: None, notes: None,
    })
}

#[tauri::command]
pub fn update_team_member(db: State<AppDb>, id: i64, field: String, value: Option<String>) -> Result<(), String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    let allowed = [
        "first_name", "last_name", "email", "personal_email", "personal_phone",
        "address_street", "address_city", "address_zip", "title_id", "salary",
        "start_date", "notes",
    ];
    if !allowed.contains(&field.as_str()) {
        return Err(format!("Invalid field: {}", field));
    }
    let sql = format!("UPDATE team_members SET {} = ?1 WHERE id = ?2", field);
    conn.execute(&sql, params![value, id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_team_member(db: State<AppDb>, id: i64) -> Result<(), String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute("DELETE FROM team_members WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
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
            Ok(Child { id: row.get(0)?, team_member_id: row.get(1)?, name: row.get(2)?, date_of_birth: row.get(3)? })
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
    conn.execute("INSERT INTO children (team_member_id, name, date_of_birth) VALUES (?1, ?2, ?3)", params![team_member_id, name, date_of_birth]).map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    Ok(Child { id, team_member_id, name, date_of_birth })
}

#[tauri::command]
pub fn update_child(db: State<AppDb>, id: i64, name: String, date_of_birth: Option<String>) -> Result<(), String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute("UPDATE children SET name = ?1, date_of_birth = ?2 WHERE id = ?3", params![name, date_of_birth, id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_child(db: State<AppDb>, id: i64) -> Result<(), String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute("DELETE FROM children WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

// ── Checkable items (status_items & talk_topics) ──

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
    if !allowed_tables.contains(&table) { return Err(format!("Invalid table: {}", table)); }
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    let sql = format!(
        "SELECT id, team_member_id, text, checked, created_at FROM {} WHERE team_member_id = ?1 ORDER BY checked ASC, CASE WHEN checked = 0 THEN created_at END ASC, CASE WHEN checked = 1 THEN created_at END DESC",
        table
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let items = stmt.query_map(params![team_member_id], |row| {
        Ok(CheckableItem { id: row.get(0)?, team_member_id: row.get(1)?, text: row.get(2)?, checked: row.get(3)?, created_at: row.get(4)? })
    }).map_err(|e| e.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    Ok(items)
}

#[tauri::command]
pub fn get_status_items(db: State<AppDb>, team_member_id: i64) -> Result<Vec<CheckableItem>, String> { get_items(&db, "status_items", team_member_id) }

#[tauri::command]
pub fn get_talk_topics(db: State<AppDb>, team_member_id: i64) -> Result<Vec<CheckableItem>, String> { get_items(&db, "talk_topics", team_member_id) }

fn add_item(db: &AppDb, table: &str, team_member_id: i64, text: String) -> Result<CheckableItem, String> {
    let allowed_tables = ["status_items", "talk_topics"];
    if !allowed_tables.contains(&table) { return Err(format!("Invalid table: {}", table)); }
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute(&format!("INSERT INTO {} (team_member_id, text) VALUES (?1, ?2)", table), params![team_member_id, text]).map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    let created_at: String = conn.query_row(&format!("SELECT created_at FROM {} WHERE id = ?1", table), params![id], |row| row.get(0)).map_err(|e| e.to_string())?;
    Ok(CheckableItem { id, team_member_id, text, checked: false, created_at })
}

#[tauri::command]
pub fn add_status_item(db: State<AppDb>, team_member_id: i64, text: String) -> Result<CheckableItem, String> { add_item(&db, "status_items", team_member_id, text) }

#[tauri::command]
pub fn add_talk_topic(db: State<AppDb>, team_member_id: i64, text: String) -> Result<CheckableItem, String> { add_item(&db, "talk_topics", team_member_id, text) }

fn update_item(db: &AppDb, table: &str, id: i64, text: Option<String>, checked: Option<bool>) -> Result<(), String> {
    let allowed_tables = ["status_items", "talk_topics"];
    if !allowed_tables.contains(&table) { return Err(format!("Invalid table: {}", table)); }
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    if let Some(t) = text { conn.execute(&format!("UPDATE {} SET text = ?1 WHERE id = ?2", table), params![t, id]).map_err(|e| e.to_string())?; }
    if let Some(c) = checked { conn.execute(&format!("UPDATE {} SET checked = ?1 WHERE id = ?2", table), params![c, id]).map_err(|e| e.to_string())?; }
    Ok(())
}

#[tauri::command]
pub fn update_status_item(db: State<AppDb>, id: i64, text: Option<String>, checked: Option<bool>) -> Result<(), String> { update_item(&db, "status_items", id, text, checked) }

#[tauri::command]
pub fn update_talk_topic(db: State<AppDb>, id: i64, text: Option<String>, checked: Option<bool>) -> Result<(), String> { update_item(&db, "talk_topics", id, text, checked) }

fn delete_item(db: &AppDb, table: &str, id: i64) -> Result<(), String> {
    let allowed_tables = ["status_items", "talk_topics"];
    if !allowed_tables.contains(&table) { return Err(format!("Invalid table: {}", table)); }
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute(&format!("DELETE FROM {} WHERE id = ?1", table), params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_status_item(db: State<AppDb>, id: i64) -> Result<(), String> { delete_item(&db, "status_items", id) }

#[tauri::command]
pub fn delete_talk_topic(db: State<AppDb>, id: i64) -> Result<(), String> { delete_item(&db, "talk_topics", id) }

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
    let mut stmt = conn.prepare("SELECT t.id, t.name, COUNT(m.id) as member_count FROM titles t LEFT JOIN team_members m ON m.title_id = t.id GROUP BY t.id ORDER BY t.name ASC").map_err(|e| e.to_string())?;
    let titles = stmt.query_map([], |row| { Ok(Title { id: row.get(0)?, name: row.get(1)?, member_count: row.get(2)? }) }).map_err(|e| e.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    Ok(titles)
}

#[tauri::command]
pub fn create_title(db: State<AppDb>, name: String) -> Result<Title, String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute("INSERT INTO titles (name) VALUES (?1)", params![name]).map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    Ok(Title { id, name, member_count: 0 })
}

#[tauri::command]
pub fn update_title(db: State<AppDb>, id: i64, name: String) -> Result<(), String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute("UPDATE titles SET name = ?1 WHERE id = ?2", params![name, id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_title(db: State<AppDb>, id: i64) -> Result<(), String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM team_members WHERE title_id = ?1", params![id], |row| row.get(0)).map_err(|e| e.to_string())?;
    if count > 0 { return Err(format!("Cannot delete title: {} team member(s) are assigned to it", count)); }
    conn.execute("DELETE FROM titles WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

// ── Settings commands ──

#[tauri::command]
pub fn get_setting(db: State<AppDb>, key: String) -> Result<Option<String>, String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    match conn.query_row("SELECT value FROM settings WHERE key = ?1", params![key], |row| row.get(0)) {
        Ok(val) => Ok(Some(val)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn set_setting(db: State<AppDb>, key: String, value: String) -> Result<(), String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute("INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value", params![key, value]).map_err(|e| e.to_string())?;
    Ok(())
}

// ── Helpers ──

fn get_db_path() -> Result<String, String> {
    let data_dir = dirs::data_local_dir().ok_or("Could not determine app data directory")?;
    let app_dir = data_dir.join("com.mysquad.app");
    std::fs::create_dir_all(&app_dir).map_err(|e| format!("Failed to create app directory: {}", e))?;
    Ok(app_dir.join("mysquad.db").to_string_lossy().into_owned())
}
