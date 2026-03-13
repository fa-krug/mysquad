use crate::biometric;
use crate::db::{self, AppDb};
use crate::keychain;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::State;

// ── Auth commands ──

#[tauri::command(rename_all = "snake_case")]
pub fn authenticate(reason: String) -> Result<(), String> {
    biometric::authenticate(&reason)
}

#[tauri::command(rename_all = "snake_case")]
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
    db::run_migrations(&conn).map_err(|e| format!("Failed to run migrations: {}", e))?;

    let mut guard = db.conn.lock().unwrap();
    *guard = Some(conn);
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn lock_db(db: State<AppDb>) -> Result<(), String> {
    db::close_db(&db);
    Ok(())
}

// ── Config commands ──

#[tauri::command(rename_all = "snake_case")]
pub fn get_config(key: String) -> Result<Option<String>, String> {
    let config_path = get_app_data_dir()?.join("config.json");
    let keychain_key = match crate::keychain::retrieve_key() {
        Ok(k) => k,
        Err(_) => return Ok(None), // No key yet = first launch, default behavior
    };
    Ok(crate::config::read_config(
        &config_path,
        &keychain_key,
        &key,
    ))
}

#[tauri::command(rename_all = "snake_case")]
pub fn set_config(key: String, value: String) -> Result<(), String> {
    let config_path = get_app_data_dir()?.join("config.json");
    let keychain_key = crate::keychain::retrieve_key()
        .map_err(|_| "Cannot save config: encryption key not found".to_string())?;
    crate::config::write_config(&config_path, &keychain_key, &key, &value)
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
    pub start_date: Option<String>,
    pub notes: Option<String>,
    pub picture_path: Option<String>,
    pub exclude_from_salary: bool,
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_team_members(db: State<AppDb>) -> Result<Vec<TeamMember>, String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    let mut stmt = conn
        .prepare(
            "SELECT m.id, m.first_name, m.last_name, m.email, m.personal_email,
                    m.personal_phone, m.address_street, m.address_city, m.address_zip,
                    m.title_id, t.name as title_name, m.start_date, m.notes, m.picture_path,
                    m.exclude_from_salary
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
                picture_path: row.get(13)?,
                exclude_from_salary: row.get(14)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(members)
}

#[tauri::command(rename_all = "snake_case")]
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
        start_date: None,
        notes: None,
        picture_path: None,
        exclude_from_salary: false,
    })
}

#[tauri::command(rename_all = "snake_case")]
pub fn update_team_member(
    db: State<AppDb>,
    id: i64,
    field: String,
    value: Option<String>,
) -> Result<(), String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    let allowed = [
        "first_name",
        "last_name",
        "email",
        "personal_email",
        "personal_phone",
        "address_street",
        "address_city",
        "address_zip",
        "title_id",
        "start_date",
        "notes",
        "exclude_from_salary",
    ];
    if !allowed.contains(&field.as_str()) {
        return Err(format!("Invalid field: {}", field));
    }
    let sql = format!("UPDATE team_members SET {} = ?1 WHERE id = ?2", field);
    conn.execute(&sql, params![value, id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn delete_team_member(db: State<AppDb>, id: i64) -> Result<(), String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute("DELETE FROM team_members WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;

    // Clean up picture file
    if let Ok(pictures_dir) = get_pictures_dir() {
        let file_path = pictures_dir.join(format!("{}.jpg", id));
        let _ = std::fs::remove_file(file_path); // Ignore errors — file may not exist
    }

    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn upload_member_picture(
    db: State<AppDb>,
    id: i64,
    file_path: String,
) -> Result<String, String> {
    use image::imageops::FilterType;
    use image::GenericImageView;

    let pictures_dir = get_pictures_dir()?;
    let filename = format!("{}.jpg", id);
    let dest_path = pictures_dir.join(&filename);

    // Load and resize image
    let img = image::open(&file_path).map_err(|e| format!("Failed to open image: {}", e))?;

    // Center crop to square
    let (w, h) = img.dimensions();
    let side = w.min(h);
    let x = (w - side) / 2;
    let y = (h - side) / 2;
    let cropped = img.crop_imm(x, y, side, side);

    // Resize to 256x256
    let resized = cropped.resize_exact(256, 256, FilterType::Lanczos3);

    // Save as JPEG
    resized
        .save(&dest_path)
        .map_err(|e| format!("Failed to save image: {}", e))?;

    // Update DB
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute(
        "UPDATE team_members SET picture_path = ?1 WHERE id = ?2",
        params![filename, id],
    )
    .map_err(|e| e.to_string())?;

    Ok(dest_path.to_string_lossy().into_owned())
}

#[tauri::command(rename_all = "snake_case")]
pub fn delete_member_picture(db: State<AppDb>, id: i64) -> Result<(), String> {
    let pictures_dir = get_pictures_dir()?;
    let filename = format!("{}.jpg", id);
    let file_path = pictures_dir.join(&filename);

    // Remove file if it exists
    if file_path.exists() {
        std::fs::remove_file(&file_path).map_err(|e| format!("Failed to delete picture: {}", e))?;
    }

    // Clear DB
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute(
        "UPDATE team_members SET picture_path = NULL WHERE id = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_pictures_dir_path() -> Result<String, String> {
    let pictures_dir = get_pictures_dir()?;
    Ok(pictures_dir.to_string_lossy().into_owned())
}

// ── Children commands ──

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Child {
    pub id: i64,
    pub team_member_id: i64,
    pub name: String,
    pub date_of_birth: Option<String>,
}

#[tauri::command(rename_all = "snake_case")]
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

#[tauri::command(rename_all = "snake_case")]
pub fn add_child(
    db: State<AppDb>,
    team_member_id: i64,
    name: String,
    date_of_birth: Option<String>,
) -> Result<Child, String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute(
        "INSERT INTO children (team_member_id, name, date_of_birth) VALUES (?1, ?2, ?3)",
        params![team_member_id, name, date_of_birth],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    Ok(Child {
        id,
        team_member_id,
        name,
        date_of_birth,
    })
}

#[tauri::command(rename_all = "snake_case")]
pub fn update_child(
    db: State<AppDb>,
    id: i64,
    name: String,
    date_of_birth: Option<String>,
) -> Result<(), String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute(
        "UPDATE children SET name = ?1, date_of_birth = ?2 WHERE id = ?3",
        params![name, date_of_birth, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn delete_child(db: State<AppDb>, id: i64) -> Result<(), String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute("DELETE FROM children WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
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
    if !allowed_tables.contains(&table) {
        return Err(format!("Invalid table: {}", table));
    }
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    let sql = format!(
        "SELECT id, team_member_id, text, checked, created_at FROM {} WHERE team_member_id = ?1 ORDER BY checked ASC, CASE WHEN checked = 0 THEN created_at END ASC, CASE WHEN checked = 1 THEN created_at END DESC",
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

#[tauri::command(rename_all = "snake_case")]
pub fn get_status_items(
    db: State<AppDb>,
    team_member_id: i64,
) -> Result<Vec<CheckableItem>, String> {
    get_items(&db, "status_items", team_member_id)
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_talk_topics(
    db: State<AppDb>,
    team_member_id: i64,
) -> Result<Vec<CheckableItem>, String> {
    get_items(&db, "talk_topics", team_member_id)
}

fn add_item(
    db: &AppDb,
    table: &str,
    team_member_id: i64,
    text: String,
) -> Result<CheckableItem, String> {
    let allowed_tables = ["status_items", "talk_topics"];
    if !allowed_tables.contains(&table) {
        return Err(format!("Invalid table: {}", table));
    }
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute(
        &format!(
            "INSERT INTO {} (team_member_id, text) VALUES (?1, ?2)",
            table
        ),
        params![team_member_id, text],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    let created_at: String = conn
        .query_row(
            &format!("SELECT created_at FROM {} WHERE id = ?1", table),
            params![id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(CheckableItem {
        id,
        team_member_id,
        text,
        checked: false,
        created_at,
    })
}

#[tauri::command(rename_all = "snake_case")]
pub fn add_status_item(
    db: State<AppDb>,
    team_member_id: i64,
    text: String,
) -> Result<CheckableItem, String> {
    add_item(&db, "status_items", team_member_id, text)
}

#[tauri::command(rename_all = "snake_case")]
pub fn add_talk_topic(
    db: State<AppDb>,
    team_member_id: i64,
    text: String,
) -> Result<CheckableItem, String> {
    add_item(&db, "talk_topics", team_member_id, text)
}

fn update_item(
    db: &AppDb,
    table: &str,
    id: i64,
    text: Option<String>,
    checked: Option<bool>,
) -> Result<(), String> {
    let allowed_tables = ["status_items", "talk_topics"];
    if !allowed_tables.contains(&table) {
        return Err(format!("Invalid table: {}", table));
    }
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    if let Some(t) = text {
        conn.execute(
            &format!("UPDATE {} SET text = ?1 WHERE id = ?2", table),
            params![t, id],
        )
        .map_err(|e| e.to_string())?;
    }
    if let Some(c) = checked {
        conn.execute(
            &format!("UPDATE {} SET checked = ?1 WHERE id = ?2", table),
            params![c, id],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn update_status_item(
    db: State<AppDb>,
    id: i64,
    text: Option<String>,
    checked: Option<bool>,
) -> Result<(), String> {
    update_item(&db, "status_items", id, text, checked)
}

#[tauri::command(rename_all = "snake_case")]
pub fn update_talk_topic(
    db: State<AppDb>,
    id: i64,
    text: Option<String>,
    checked: Option<bool>,
) -> Result<(), String> {
    update_item(&db, "talk_topics", id, text, checked)
}

fn delete_item(db: &AppDb, table: &str, id: i64) -> Result<(), String> {
    let allowed_tables = ["status_items", "talk_topics"];
    if !allowed_tables.contains(&table) {
        return Err(format!("Invalid table: {}", table));
    }
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute(&format!("DELETE FROM {} WHERE id = ?1", table), params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn delete_status_item(db: State<AppDb>, id: i64) -> Result<(), String> {
    delete_item(&db, "status_items", id)
}

#[tauri::command(rename_all = "snake_case")]
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

#[tauri::command(rename_all = "snake_case")]
pub fn get_titles(db: State<AppDb>) -> Result<Vec<Title>, String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    let mut stmt = conn.prepare("SELECT t.id, t.name, COUNT(m.id) as member_count FROM titles t LEFT JOIN team_members m ON m.title_id = t.id GROUP BY t.id ORDER BY t.name ASC").map_err(|e| e.to_string())?;
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

#[tauri::command(rename_all = "snake_case")]
pub fn create_title(db: State<AppDb>, name: String) -> Result<Title, String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute("INSERT INTO titles (name) VALUES (?1)", params![name])
        .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    Ok(Title {
        id,
        name,
        member_count: 0,
    })
}

#[tauri::command(rename_all = "snake_case")]
pub fn update_title(db: State<AppDb>, id: i64, name: String) -> Result<(), String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute(
        "UPDATE titles SET name = ?1 WHERE id = ?2",
        params![name, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn delete_title(db: State<AppDb>, id: i64) -> Result<(), String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM team_members WHERE title_id = ?1",
            params![id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if count > 0 {
        return Err(format!(
            "Cannot delete title: {} team member(s) are assigned to it",
            count
        ));
    }
    conn.execute("DELETE FROM titles WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ── Project commands ──

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Project {
    pub id: i64,
    pub name: String,
    pub start_date: String,
    pub end_date: Option<String>,
    pub notes: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_projects(db: State<AppDb>) -> Result<Vec<Project>, String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    let mut stmt = conn
        .prepare(
            "SELECT id, name, start_date, end_date, notes, created_at, updated_at
             FROM projects
             ORDER BY end_date IS NOT NULL ASC, name ASC",
        )
        .map_err(|e| e.to_string())?;
    let projects = stmt
        .query_map([], |row| {
            Ok(Project {
                id: row.get(0)?,
                name: row.get(1)?,
                start_date: row.get(2)?,
                end_date: row.get(3)?,
                notes: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(projects)
}

#[tauri::command(rename_all = "snake_case")]
pub fn create_project(db: State<AppDb>) -> Result<Project, String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute("INSERT INTO projects (name) VALUES ('')", [])
        .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    let row = conn
        .query_row(
            "SELECT id, name, start_date, end_date, notes, created_at, updated_at FROM projects WHERE id = ?1",
            params![id],
            |row| {
                Ok(Project {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    start_date: row.get(2)?,
                    end_date: row.get(3)?,
                    notes: row.get(4)?,
                    created_at: row.get(5)?,
                    updated_at: row.get(6)?,
                })
            },
        )
        .map_err(|e| e.to_string())?;
    Ok(row)
}

#[tauri::command(rename_all = "snake_case")]
pub fn update_project(
    db: State<AppDb>,
    id: i64,
    field: String,
    value: Option<String>,
) -> Result<(), String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    let allowed = ["name", "end_date", "notes"];
    if !allowed.contains(&field.as_str()) {
        return Err(format!("Invalid field: {}", field));
    }
    let sql = format!("UPDATE projects SET {} = ?1 WHERE id = ?2", field);
    conn.execute(&sql, params![value, id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn delete_project(db: State<AppDb>, id: i64) -> Result<(), String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute("DELETE FROM projects WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProjectMember {
    pub id: i64,
    pub project_id: i64,
    pub team_member_id: i64,
    pub first_name: String,
    pub last_name: String,
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_project_members(
    db: State<AppDb>,
    project_id: i64,
) -> Result<Vec<ProjectMember>, String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    let mut stmt = conn
        .prepare(
            "SELECT pm.id, pm.project_id, pm.team_member_id, m.first_name, m.last_name
             FROM project_members pm
             JOIN team_members m ON m.id = pm.team_member_id
             WHERE pm.project_id = ?1
             ORDER BY m.last_name ASC, m.first_name ASC",
        )
        .map_err(|e| e.to_string())?;
    let members = stmt
        .query_map(params![project_id], |row| {
            Ok(ProjectMember {
                id: row.get(0)?,
                project_id: row.get(1)?,
                team_member_id: row.get(2)?,
                first_name: row.get(3)?,
                last_name: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(members)
}

#[tauri::command(rename_all = "snake_case")]
pub fn add_project_member(
    db: State<AppDb>,
    project_id: i64,
    team_member_id: i64,
) -> Result<ProjectMember, String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute(
        "INSERT INTO project_members (project_id, team_member_id) VALUES (?1, ?2)",
        params![project_id, team_member_id],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    let (first_name, last_name): (String, String) = conn
        .query_row(
            "SELECT first_name, last_name FROM team_members WHERE id = ?1",
            params![team_member_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| e.to_string())?;
    Ok(ProjectMember {
        id,
        project_id,
        team_member_id,
        first_name,
        last_name,
    })
}

#[tauri::command(rename_all = "snake_case")]
pub fn remove_project_member(db: State<AppDb>, id: i64) -> Result<(), String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute("DELETE FROM project_members WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProjectStatusItem {
    pub id: i64,
    pub project_id: i64,
    pub text: String,
    pub checked: bool,
    pub created_at: String,
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_project_status_items(
    db: State<AppDb>,
    project_id: i64,
) -> Result<Vec<ProjectStatusItem>, String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    let mut stmt = conn
        .prepare(
            "SELECT id, project_id, text, checked, created_at
             FROM project_status_items
             WHERE project_id = ?1
             ORDER BY checked ASC, CASE WHEN checked = 0 THEN created_at END ASC, CASE WHEN checked = 1 THEN created_at END DESC",
        )
        .map_err(|e| e.to_string())?;
    let items = stmt
        .query_map(params![project_id], |row| {
            Ok(ProjectStatusItem {
                id: row.get(0)?,
                project_id: row.get(1)?,
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

#[tauri::command(rename_all = "snake_case")]
pub fn add_project_status_item(
    db: State<AppDb>,
    project_id: i64,
    text: String,
) -> Result<ProjectStatusItem, String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute(
        "INSERT INTO project_status_items (project_id, text) VALUES (?1, ?2)",
        params![project_id, text],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    let created_at: String = conn
        .query_row(
            "SELECT created_at FROM project_status_items WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(ProjectStatusItem {
        id,
        project_id,
        text,
        checked: false,
        created_at,
    })
}

#[tauri::command(rename_all = "snake_case")]
pub fn update_project_status_item(
    db: State<AppDb>,
    id: i64,
    text: Option<String>,
    checked: Option<bool>,
) -> Result<(), String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    if let Some(t) = text {
        conn.execute(
            "UPDATE project_status_items SET text = ?1 WHERE id = ?2",
            params![t, id],
        )
        .map_err(|e| e.to_string())?;
    }
    if let Some(c) = checked {
        conn.execute(
            "UPDATE project_status_items SET checked = ?1 WHERE id = ?2",
            params![c, id],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn delete_project_status_item(db: State<AppDb>, id: i64) -> Result<(), String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute(
        "DELETE FROM project_status_items WHERE id = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ── Settings commands ──

#[tauri::command(rename_all = "snake_case")]
pub fn get_setting(db: State<AppDb>, key: String) -> Result<Option<String>, String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    match conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        params![key],
        |row| row.get(0),
    ) {
        Ok(val) => Ok(Some(val)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command(rename_all = "snake_case")]
pub fn set_setting(db: State<AppDb>, key: String, value: String) -> Result<(), String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute("INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value", params![key, value]).map_err(|e| e.to_string())?;
    Ok(())
}

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

// ── Salary data point commands ──

#[tauri::command(rename_all = "snake_case")]
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

#[tauri::command(rename_all = "snake_case")]
pub fn get_salary_data_point(db: State<AppDb>, id: i64) -> Result<SalaryDataPointDetail, String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;

    let (name, budget): (String, Option<i64>) = conn
        .query_row(
            "SELECT name, budget FROM salary_data_points WHERE id = ?1",
            params![id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| e.to_string())?;

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
                parts: Vec::new(),
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    // Batch-fetch all salary_parts for these members in one query
    let member_ids: Vec<i64> = members.iter().map(|m| m.id).collect();
    let mut parts_map: HashMap<i64, Vec<SalaryPart>> = HashMap::new();

    if !member_ids.is_empty() {
        let placeholders: Vec<String> = (1..=member_ids.len()).map(|i| format!("?{}", i)).collect();
        let sql = format!(
            "SELECT data_point_member_id, id, name, amount, frequency, is_variable, sort_order
             FROM salary_parts
             WHERE data_point_member_id IN ({})
             ORDER BY sort_order ASC, id ASC",
            placeholders.join(", ")
        );
        let params: Vec<&dyn rusqlite::types::ToSql> = member_ids
            .iter()
            .map(|id| id as &dyn rusqlite::types::ToSql)
            .collect();
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params.as_slice(), |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    SalaryPart {
                        id: row.get(1)?,
                        name: row.get(2)?,
                        amount: row.get(3)?,
                        frequency: row.get(4)?,
                        is_variable: row.get(5)?,
                        sort_order: row.get(6)?,
                    },
                ))
            })
            .map_err(|e| e.to_string())?;
        for row in rows {
            let (dpm_id, part) = row.map_err(|e| e.to_string())?;
            parts_map.entry(dpm_id).or_default().push(part);
        }
    }

    let members: Vec<SalaryDataPointMember> = members
        .into_iter()
        .map(|mut member| {
            member.parts = parts_map.remove(&member.id).unwrap_or_default();
            member
        })
        .collect();

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

#[tauri::command(rename_all = "snake_case")]
pub fn create_salary_data_point(db: State<AppDb>) -> Result<SalaryDataPointSummary, String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;

    let today = chrono::Local::now().format("%Y-%m-%d").to_string();

    let prev_id: Option<i64> = conn
        .query_row(
            "SELECT id FROM salary_data_points ORDER BY id DESC LIMIT 1",
            [],
            |row| row.get(0),
        )
        .ok();

    conn.execute_batch("BEGIN").map_err(|e| e.to_string())?;

    let result: Result<SalaryDataPointSummary, String> = (|| {
        if let Some(prev) = prev_id {
            let prev_budget: Option<i64> = conn
                .query_row(
                    "SELECT budget FROM salary_data_points WHERE id = ?1",
                    params![prev],
                    |row| row.get(0),
                )
                .map_err(|e| e.to_string())?;

            conn.execute(
                "INSERT INTO salary_data_points (name, budget) VALUES (?1, ?2)",
                params![today, prev_budget],
            )
            .map_err(|e| e.to_string())?;
            let new_id = conn.last_insert_rowid();

            conn.execute(
                "INSERT INTO salary_data_point_members (data_point_id, member_id, is_active, is_promoted)
                 SELECT ?1, sdpm.member_id, sdpm.is_active, sdpm.is_promoted
                 FROM salary_data_point_members sdpm
                 JOIN team_members m ON m.id = sdpm.member_id
                 WHERE sdpm.data_point_id = ?2 AND m.exclude_from_salary = 0",
                params![new_id, prev],
            ).map_err(|e| e.to_string())?;

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

            conn.execute(
                "INSERT INTO salary_ranges (data_point_id, title_id, min_salary, max_salary)
                 SELECT ?1, title_id, min_salary, max_salary
                 FROM salary_ranges WHERE data_point_id = ?2",
                params![new_id, prev],
            )
            .map_err(|e| e.to_string())?;

            let created_at: String = conn
                .query_row(
                    "SELECT created_at FROM salary_data_points WHERE id = ?1",
                    params![new_id],
                    |row| row.get(0),
                )
                .map_err(|e| e.to_string())?;

            Ok(SalaryDataPointSummary {
                id: new_id,
                name: today.clone(),
                budget: prev_budget,
                created_at,
            })
        } else {
            conn.execute(
                "INSERT INTO salary_data_points (name) VALUES (?1)",
                params![today],
            )
            .map_err(|e| e.to_string())?;
            let new_id = conn.last_insert_rowid();

            conn.execute(
                "INSERT INTO salary_data_point_members (data_point_id, member_id, is_active, is_promoted)
                 SELECT ?1, id, 1, 0 FROM team_members WHERE exclude_from_salary = 0",
                params![new_id],
            ).map_err(|e| e.to_string())?;

            let created_at: String = conn
                .query_row(
                    "SELECT created_at FROM salary_data_points WHERE id = ?1",
                    params![new_id],
                    |row| row.get(0),
                )
                .map_err(|e| e.to_string())?;

            Ok(SalaryDataPointSummary {
                id: new_id,
                name: today.clone(),
                budget: None,
                created_at,
            })
        }
    })();

    match &result {
        Ok(_) => conn.execute_batch("COMMIT").map_err(|e| e.to_string())?,
        Err(_) => {
            let _ = conn.execute_batch("ROLLBACK");
        }
    }

    result
}

#[tauri::command(rename_all = "snake_case")]
pub fn update_salary_data_point(
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
    let sql = format!("UPDATE salary_data_points SET {} = ?1 WHERE id = ?2", field);
    conn.execute(&sql, params![value, id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn delete_salary_data_point(db: State<AppDb>, id: i64) -> Result<(), String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute("DELETE FROM salary_data_points WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn update_salary_data_point_member(
    db: State<AppDb>,
    id: i64,
    field: String,
    value: Option<String>,
) -> Result<(), String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    let allowed = ["is_active", "is_promoted"];
    if !allowed.contains(&field.as_str()) {
        return Err(format!("Invalid field: {}", field));
    }
    let sql = format!(
        "UPDATE salary_data_point_members SET {} = ?1 WHERE id = ?2",
        field
    );
    conn.execute(&sql, params![value, id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn create_salary_part(
    db: State<AppDb>,
    data_point_member_id: i64,
) -> Result<SalaryPart, String> {
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
    Ok(SalaryPart {
        id,
        name: None,
        amount: 0,
        frequency: 1,
        is_variable: false,
        sort_order,
    })
}

#[tauri::command(rename_all = "snake_case")]
pub fn update_salary_part(
    db: State<AppDb>,
    id: i64,
    field: String,
    value: Option<String>,
) -> Result<(), String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    let allowed = ["name", "amount", "frequency", "is_variable"];
    if !allowed.contains(&field.as_str()) {
        return Err(format!("Invalid field: {}", field));
    }
    let sql = format!("UPDATE salary_parts SET {} = ?1 WHERE id = ?2", field);
    conn.execute(&sql, params![value, id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn delete_salary_part(db: State<AppDb>, id: i64) -> Result<(), String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute("DELETE FROM salary_parts WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn update_salary_range(
    db: State<AppDb>,
    data_point_id: i64,
    title_id: i64,
    min_salary: i64,
    max_salary: i64,
) -> Result<(), String> {
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

#[tauri::command(rename_all = "snake_case")]
pub fn get_previous_member_data(
    db: State<AppDb>,
    data_point_id: i64,
    member_id: i64,
) -> Result<Option<Vec<SalaryPart>>, String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;

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

// ── Report commands ──

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Report {
    pub id: i64,
    pub name: String,
    pub collect_statuses: bool,
    pub include_stakeholders: bool,
    pub include_projects: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ReportMemberStatus {
    pub member_id: i64,
    pub first_name: String,
    pub last_name: String,
    pub title_name: Option<String>,
    pub is_stakeholder: bool,
    pub statuses: Vec<ReportStatusItem>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ReportStatusItem {
    pub id: i64,
    pub text: String,
    pub checked: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ReportProjectStatus {
    pub project_id: i64,
    pub project_name: String,
    pub statuses: Vec<ReportStatusItem>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ReportDetail {
    pub id: i64,
    pub name: String,
    pub collect_statuses: bool,
    pub include_stakeholders: bool,
    pub include_projects: bool,
    pub stakeholders: Vec<ReportMemberStatus>,
    pub members: Vec<ReportMemberStatus>,
    pub projects: Vec<ReportProjectStatus>,
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_reports(db: State<AppDb>) -> Result<Vec<Report>, String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    let mut stmt = conn
        .prepare(
            "SELECT id, name, collect_statuses, include_stakeholders, include_projects
             FROM reports ORDER BY name ASC",
        )
        .map_err(|e| e.to_string())?;
    let reports = stmt
        .query_map([], |row| {
            Ok(Report {
                id: row.get(0)?,
                name: row.get(1)?,
                collect_statuses: row.get(2)?,
                include_stakeholders: row.get(3)?,
                include_projects: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(reports)
}

#[tauri::command(rename_all = "snake_case")]
pub fn create_report(db: State<AppDb>) -> Result<Report, String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute("INSERT INTO reports (name) VALUES ('New Report')", [])
        .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    Ok(Report {
        id,
        name: "New Report".into(),
        collect_statuses: false,
        include_stakeholders: false,
        include_projects: false,
    })
}

#[tauri::command(rename_all = "snake_case")]
pub fn update_report(
    db: State<AppDb>,
    id: i64,
    field: String,
    value: Option<String>,
) -> Result<(), String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    let allowed = [
        "name",
        "collect_statuses",
        "include_stakeholders",
        "include_projects",
    ];
    if !allowed.contains(&field.as_str()) {
        return Err(format!("Invalid field: {}", field));
    }
    let sql = format!("UPDATE reports SET {} = ?1 WHERE id = ?2", field);
    conn.execute(&sql, params![value, id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn delete_report(db: State<AppDb>, id: i64) -> Result<(), String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute("DELETE FROM reports WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_report_detail(db: State<AppDb>, id: i64) -> Result<ReportDetail, String> {
    let guard = db.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("Database not open")?;

    let (name, collect_statuses, include_stakeholders, include_projects): (
        String,
        bool,
        bool,
        bool,
    ) = conn
        .query_row(
            "SELECT name, collect_statuses, include_stakeholders, include_projects
             FROM reports WHERE id = ?1",
            params![id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .map_err(|e| e.to_string())?;

    let mut stakeholders = Vec::new();
    let mut members = Vec::new();
    let mut projects = Vec::new();

    if collect_statuses {
        let mut member_stmt = conn
            .prepare(
                "SELECT m.id, m.first_name, m.last_name, t.name, m.exclude_from_salary
                 FROM team_members m
                 LEFT JOIN titles t ON t.id = m.title_id
                 ORDER BY m.last_name ASC, m.first_name ASC",
            )
            .map_err(|e| e.to_string())?;

        let all_members: Vec<(i64, String, String, Option<String>, bool)> = member_stmt
            .query_map([], |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                ))
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;

        // Filter to included members, then batch-fetch all their statuses
        let included_members: Vec<&(i64, String, String, Option<String>, bool)> = all_members
            .iter()
            .filter(|(_, _, _, _, is_stakeholder)| !is_stakeholder || include_stakeholders)
            .collect();

        let member_ids: Vec<i64> = included_members.iter().map(|(mid, ..)| *mid).collect();
        let mut status_map: HashMap<i64, Vec<ReportStatusItem>> = HashMap::new();

        if !member_ids.is_empty() {
            let placeholders: Vec<String> =
                (1..=member_ids.len()).map(|i| format!("?{}", i)).collect();
            let sql = format!(
                "SELECT team_member_id, id, text, checked FROM status_items
                 WHERE team_member_id IN ({})
                 ORDER BY created_at DESC",
                placeholders.join(", ")
            );
            let params: Vec<&dyn rusqlite::types::ToSql> = member_ids
                .iter()
                .map(|id| id as &dyn rusqlite::types::ToSql)
                .collect();
            let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map(params.as_slice(), |row| {
                    Ok((
                        row.get::<_, i64>(0)?,
                        ReportStatusItem {
                            id: row.get(1)?,
                            text: row.get(2)?,
                            checked: row.get(3)?,
                        },
                    ))
                })
                .map_err(|e| e.to_string())?;
            for row in rows {
                let (mid, item) = row.map_err(|e| e.to_string())?;
                status_map.entry(mid).or_default().push(item);
            }
        }

        for (mid, first, last, title, is_stakeholder) in included_members {
            let entry = ReportMemberStatus {
                member_id: *mid,
                first_name: first.clone(),
                last_name: last.clone(),
                title_name: title.clone(),
                is_stakeholder: *is_stakeholder,
                statuses: status_map.remove(mid).unwrap_or_default(),
            };

            if *is_stakeholder {
                stakeholders.push(entry);
            } else {
                members.push(entry);
            }
        }
    }

    if include_projects {
        let mut proj_stmt = conn
            .prepare(
                "SELECT id, name FROM projects
                 WHERE end_date IS NULL OR end_date >= date('now')
                 ORDER BY name ASC",
            )
            .map_err(|e| e.to_string())?;

        let proj_rows: Vec<(i64, String)> = proj_stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;

        // Batch-fetch all project status items in one query
        let proj_ids: Vec<i64> = proj_rows.iter().map(|(pid, _)| *pid).collect();
        let mut proj_status_map: HashMap<i64, Vec<ReportStatusItem>> = HashMap::new();

        if !proj_ids.is_empty() {
            let placeholders: Vec<String> =
                (1..=proj_ids.len()).map(|i| format!("?{}", i)).collect();
            let sql = format!(
                "SELECT project_id, id, text, checked FROM project_status_items
                 WHERE project_id IN ({})
                 ORDER BY created_at DESC",
                placeholders.join(", ")
            );
            let params: Vec<&dyn rusqlite::types::ToSql> = proj_ids
                .iter()
                .map(|id| id as &dyn rusqlite::types::ToSql)
                .collect();
            let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map(params.as_slice(), |row| {
                    Ok((
                        row.get::<_, i64>(0)?,
                        ReportStatusItem {
                            id: row.get(1)?,
                            text: row.get(2)?,
                            checked: row.get(3)?,
                        },
                    ))
                })
                .map_err(|e| e.to_string())?;
            for row in rows {
                let (pid, item) = row.map_err(|e| e.to_string())?;
                proj_status_map.entry(pid).or_default().push(item);
            }
        }

        for (pid, pname) in proj_rows {
            projects.push(ReportProjectStatus {
                project_id: pid,
                project_name: pname,
                statuses: proj_status_map.remove(&pid).unwrap_or_default(),
            });
        }
    }

    Ok(ReportDetail {
        id,
        name,
        collect_statuses,
        include_stakeholders,
        include_projects,
        stakeholders,
        members,
        projects,
    })
}

// ── Helpers ──

pub(crate) fn get_app_data_dir() -> Result<std::path::PathBuf, String> {
    let data_dir = dirs::data_local_dir().ok_or("Could not determine app data directory")?;
    let app_dir = data_dir.join("com.mysquad.app");
    std::fs::create_dir_all(&app_dir)
        .map_err(|e| format!("Failed to create app directory: {}", e))?;
    Ok(app_dir)
}

fn get_db_path() -> Result<String, String> {
    Ok(get_app_data_dir()?
        .join("mysquad.db")
        .to_string_lossy()
        .into_owned())
}

fn get_pictures_dir() -> Result<std::path::PathBuf, String> {
    let pictures_dir = get_app_data_dir()?.join("pictures");
    std::fs::create_dir_all(&pictures_dir)
        .map_err(|e| format!("Failed to create pictures directory: {}", e))?;
    Ok(pictures_dir)
}
