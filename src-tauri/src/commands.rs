use crate::db::{self, AppDb};
use crate::platform::{self, NativeSecurity, PlatformSecurity};
use chrono::Datelike;
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use tauri::{Manager, State};

// ── Auth commands ──

#[tauri::command(rename_all = "snake_case")]
pub fn authenticate(reason: String) -> Result<(), String> {
    NativeSecurity::authenticate(&reason)
}

#[tauri::command(rename_all = "snake_case")]
pub fn unlock_db(db: State<AppDb>) -> Result<(), String> {
    let key = match NativeSecurity::retrieve_key() {
        Ok(k) => k,
        Err(_) => {
            let new_key = platform::generate_key();
            NativeSecurity::store_key(&new_key)?;
            new_key
        }
    };

    let db_path = get_db_path()?;
    let conn = db::open_db_with_key(&db_path, &key)
        .map_err(|e| format!("Failed to open database: {}", e))?;
    db::run_migrations(&conn).map_err(|e| format!("Failed to run migrations: {}", e))?;

    let mut guard = db.conn.lock();
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
    let keychain_key = match NativeSecurity::retrieve_key() {
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
    let keychain_key = NativeSecurity::retrieve_key()
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
    pub current_title_id: Option<i64>,
    pub current_title_name: Option<String>,
    pub current_title_data_point_id: Option<i64>,
    pub start_date: Option<String>,
    pub notes: Option<String>,
    pub picture_path: Option<String>,
    pub exclude_from_salary: bool,
    pub left_date: Option<String>,
    pub lead_id: Option<i64>,
    pub lead_name: Option<String>,
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_team_members(db: State<AppDb>) -> Result<Vec<TeamMember>, String> {
    let guard = db.conn.lock();
    let conn = guard.as_ref().ok_or("Database not open")?;
    let mut stmt = conn
        .prepare(
            "SELECT m.id, m.first_name, m.last_name, m.email, m.personal_email,
                    m.personal_phone, m.address_street, m.address_city, m.address_zip,
                    m.title_id, t.name as title_name, m.start_date, m.notes, m.picture_path,
                    m.exclude_from_salary, m.left_date,
                    m.lead_id, lead.first_name || ' ' || lead.last_name as lead_name,
                    promo.promoted_title_id, pt.name as promoted_title_name,
                    promo.data_point_id as promo_data_point_id
             FROM team_members m
             LEFT JOIN titles t ON m.title_id = t.id
             LEFT JOIN team_members lead ON m.lead_id = lead.id AND lead.deleted_at IS NULL
             LEFT JOIN (
                 SELECT sdpm.member_id, sdpm.promoted_title_id, sdpm.data_point_id
                 FROM salary_data_point_members sdpm
                 INNER JOIN (
                     SELECT member_id, MAX(data_point_id) as max_dp_id
                     FROM salary_data_point_members
                     WHERE is_promoted = 1 AND promoted_title_id IS NOT NULL
                     GROUP BY member_id
                 ) latest ON sdpm.member_id = latest.member_id AND sdpm.data_point_id = latest.max_dp_id
             ) promo ON promo.member_id = m.id
             LEFT JOIN titles pt ON pt.id = promo.promoted_title_id
             WHERE m.deleted_at IS NULL
             ORDER BY m.last_name ASC, m.first_name ASC",
        )
        .map_err(|e| e.to_string())?;

    let members = stmt
        .query_map([], |row| {
            let title_id: Option<i64> = row.get(9)?;
            let title_name: Option<String> = row.get(10)?;
            let lead_id: Option<i64> = row.get(16)?;
            let lead_name: Option<String> = row.get(17)?;
            let promoted_title_id: Option<i64> = row.get(18)?;
            let promoted_title_name: Option<String> = row.get(19)?;
            let promo_data_point_id: Option<i64> = row.get(20)?;
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
                title_id,
                title_name: title_name.clone(),
                current_title_id: if promoted_title_id.is_some() {
                    promoted_title_id
                } else {
                    title_id
                },
                current_title_name: if promoted_title_name.is_some() {
                    promoted_title_name
                } else {
                    title_name
                },
                current_title_data_point_id: promo_data_point_id,
                start_date: row.get(11)?,
                notes: row.get(12)?,
                picture_path: row.get(13)?,
                exclude_from_salary: row.get(14)?,
                left_date: row.get(15)?,
                lead_id,
                lead_name,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(members)
}

#[tauri::command(rename_all = "snake_case")]
pub fn create_team_member(db: State<AppDb>) -> Result<TeamMember, String> {
    let guard = db.conn.lock();
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
        current_title_id: None,
        current_title_name: None,
        current_title_data_point_id: None,
        start_date: None,
        notes: None,
        picture_path: None,
        exclude_from_salary: false,
        left_date: None,
        lead_id: None,
        lead_name: None,
    })
}

#[tauri::command(rename_all = "snake_case")]
pub fn update_team_member(
    db: State<AppDb>,
    id: i64,
    field: String,
    value: Option<String>,
) -> Result<(), String> {
    let guard = db.conn.lock();
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
        "left_date",
        "lead_id",
    ];
    if !allowed.contains(&field.as_str()) {
        return Err(format!("Invalid field: {}", field));
    }
    if field == "lead_id" {
        // Self-reference check
        if let Some(ref val) = value {
            let lead_id: i64 = val.parse().map_err(|_| "Invalid lead_id".to_string())?;
            if lead_id == id {
                return Err("A member cannot be their own lead".to_string());
            }
            // Cycle detection: walk up from proposed lead to root
            let mut current = lead_id;
            loop {
                let parent: Option<i64> = conn
                    .query_row(
                        "SELECT lead_id FROM team_members WHERE id = ?1",
                        params![current],
                        |row| row.get(0),
                    )
                    .map_err(|e| e.to_string())?;
                match parent {
                    Some(p) if p == id => {
                        return Err("This assignment would create a cycle".to_string());
                    }
                    Some(p) => current = p,
                    None => break,
                }
            }
        }
    }
    let sql = format!("UPDATE team_members SET {} = ?1 WHERE id = ?2", field);
    conn.execute(&sql, params![value, id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn delete_team_member(db: State<AppDb>, id: i64) -> Result<(), String> {
    let guard = db.conn.lock();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute(
        "UPDATE team_members SET deleted_at = datetime('now') WHERE id = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
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
    let guard = db.conn.lock();
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
    let guard = db.conn.lock();
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
    let guard = db.conn.lock();
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
    let guard = db.conn.lock();
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
    let guard = db.conn.lock();
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
    let guard = db.conn.lock();
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
    let guard = db.conn.lock();
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

#[tauri::command(rename_all = "snake_case")]
pub fn get_talk_topic_by_id(db: State<AppDb>, id: i64) -> Result<CheckableItem, String> {
    let guard = db.conn.lock();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.query_row(
        "SELECT id, team_member_id, text, checked, created_at FROM talk_topics WHERE id = ?1",
        [id],
        |row| {
            Ok(CheckableItem {
                id: row.get(0)?,
                team_member_id: row.get(1)?,
                text: row.get(2)?,
                checked: row.get(3)?,
                created_at: row.get(4)?,
            })
        },
    )
    .map_err(|e| e.to_string())
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
    let guard = db.conn.lock();
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
    let guard = db.conn.lock();
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
    let guard = db.conn.lock();
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
    let guard = db.conn.lock();
    let conn = guard.as_ref().ok_or("Database not open")?;
    let mut stmt = conn.prepare(
        "SELECT t.id, t.name, COUNT(m.id) as member_count
         FROM titles t
         LEFT JOIN team_members m ON m.deleted_at IS NULL
             AND COALESCE(
                 (SELECT sdpm.promoted_title_id
                  FROM salary_data_point_members sdpm
                  INNER JOIN (
                      SELECT member_id, MAX(data_point_id) as max_dp_id
                      FROM salary_data_point_members
                      WHERE is_promoted = 1 AND promoted_title_id IS NOT NULL
                      GROUP BY member_id
                  ) latest ON sdpm.member_id = latest.member_id AND sdpm.data_point_id = latest.max_dp_id
                  WHERE sdpm.member_id = m.id
                 ),
                 m.title_id
             ) = t.id
         WHERE t.deleted_at IS NULL
         GROUP BY t.id
         ORDER BY t.name ASC"
    ).map_err(|e| e.to_string())?;
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
    let guard = db.conn.lock();
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
    let guard = db.conn.lock();
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
    let guard = db.conn.lock();
    let conn = guard.as_ref().ok_or("Database not open")?;
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM team_members WHERE title_id = ?1 AND deleted_at IS NULL",
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
    conn.execute(
        "UPDATE titles SET deleted_at = datetime('now') WHERE id = ?1",
        params![id],
    )
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
    let guard = db.conn.lock();
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
    let guard = db.conn.lock();
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
    let guard = db.conn.lock();
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
    let guard = db.conn.lock();
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
    let guard = db.conn.lock();
    let conn = guard.as_ref().ok_or("Database not open")?;
    let mut stmt = conn
        .prepare(
            "SELECT pm.id, pm.project_id, pm.team_member_id, m.first_name, m.last_name
             FROM project_members pm
             JOIN team_members m ON m.id = pm.team_member_id
             WHERE pm.project_id = ?1 AND m.deleted_at IS NULL
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
    let guard = db.conn.lock();
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
    let guard = db.conn.lock();
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
    let guard = db.conn.lock();
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
    let guard = db.conn.lock();
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
    let guard = db.conn.lock();
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
    let guard = db.conn.lock();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute(
        "DELETE FROM project_status_items WHERE id = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ── Project Link commands ──

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProjectLink {
    pub id: i64,
    pub project_id: i64,
    pub url: String,
    pub label: Option<String>,
    pub sort_order: i64,
    pub created_at: String,
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_project_links(db: State<AppDb>, project_id: i64) -> Result<Vec<ProjectLink>, String> {
    let guard = db.conn.lock();
    let conn = guard.as_ref().ok_or("Database not open")?;
    let mut stmt = conn
        .prepare(
            "SELECT id, project_id, url, label, sort_order, created_at
             FROM project_links
             WHERE project_id = ?1
             ORDER BY sort_order ASC",
        )
        .map_err(|e| e.to_string())?;
    let items = stmt
        .query_map(params![project_id], |row| {
            Ok(ProjectLink {
                id: row.get(0)?,
                project_id: row.get(1)?,
                url: row.get(2)?,
                label: row.get(3)?,
                sort_order: row.get(4)?,
                created_at: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(items)
}

#[tauri::command(rename_all = "snake_case")]
pub fn add_project_link(
    db: State<AppDb>,
    project_id: i64,
    url: String,
    label: Option<String>,
) -> Result<ProjectLink, String> {
    let guard = db.conn.lock();
    let conn = guard.as_ref().ok_or("Database not open")?;
    let max_order: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(sort_order), -1) FROM project_links WHERE project_id = ?1",
            params![project_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO project_links (project_id, url, label, sort_order) VALUES (?1, ?2, ?3, ?4)",
        params![project_id, url, label, max_order + 1],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    let created_at: String = conn
        .query_row(
            "SELECT created_at FROM project_links WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(ProjectLink {
        id,
        project_id,
        url,
        label,
        sort_order: max_order + 1,
        created_at,
    })
}

#[tauri::command(rename_all = "snake_case")]
pub fn update_project_link(
    db: State<AppDb>,
    id: i64,
    url: Option<String>,
    label: Option<String>,
) -> Result<(), String> {
    let guard = db.conn.lock();
    let conn = guard.as_ref().ok_or("Database not open")?;
    if let Some(u) = url {
        conn.execute(
            "UPDATE project_links SET url = ?1 WHERE id = ?2",
            params![u, id],
        )
        .map_err(|e| e.to_string())?;
    }
    // Empty string clears label to null
    if let Some(l) = label {
        let val = if l.is_empty() { None } else { Some(l) };
        conn.execute(
            "UPDATE project_links SET label = ?1 WHERE id = ?2",
            params![val, id],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn delete_project_link(db: State<AppDb>, id: i64) -> Result<(), String> {
    let guard = db.conn.lock();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute("DELETE FROM project_links WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn reorder_project_links(
    db: State<AppDb>,
    project_id: i64,
    link_ids: Vec<i64>,
) -> Result<(), String> {
    let guard = db.conn.lock();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute_batch("BEGIN").map_err(|e| e.to_string())?;
    for (i, lid) in link_ids.iter().enumerate() {
        if let Err(e) = conn.execute(
            "UPDATE project_links SET sort_order = ?1 WHERE id = ?2 AND project_id = ?3",
            params![i as i64, lid, project_id],
        ) {
            let _ = conn.execute_batch("ROLLBACK");
            return Err(e.to_string());
        }
    }
    conn.execute_batch("COMMIT").map_err(|e| e.to_string())?;
    Ok(())
}

// ── Settings commands ──

#[tauri::command(rename_all = "snake_case")]
pub fn get_setting(db: State<AppDb>, key: String) -> Result<Option<String>, String> {
    let guard = db.conn.lock();
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
    let guard = db.conn.lock();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute("INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value", params![key, value]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn toggle_devtools(window: tauri::WebviewWindow) {
    if window.is_devtools_open() {
        window.close_devtools();
    } else {
        window.open_devtools();
    }
}

// ── Salary data point structs ──

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SalaryDataPointSummary {
    pub id: i64,
    pub name: String,
    pub budget: Option<i64>,
    pub previous_data_point_id: Option<i64>,
    pub created_at: String,
    pub scenario_group_id: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SalaryDataPointDetail {
    pub id: i64,
    pub name: String,
    pub budget: Option<i64>,
    pub previous_data_point_id: Option<i64>,
    pub scenario_group_id: Option<i64>,
    pub template_path: Option<String>,
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
    pub promoted_title_id: Option<i64>,
    pub promoted_title_name: Option<String>,
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

// ── Salary data point commands ──

#[tauri::command(rename_all = "snake_case")]
pub fn get_salary_data_points(db: State<AppDb>) -> Result<Vec<SalaryListItem>, String> {
    let guard = db.conn.lock();
    let conn = guard.as_ref().ok_or("Database not open")?;

    let mut dp_stmt = conn
        .prepare("SELECT id, name, budget, previous_data_point_id, created_at FROM salary_data_points WHERE scenario_group_id IS NULL AND deleted_at IS NULL ORDER BY id DESC")
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

    let mut sg_stmt = conn
        .prepare("SELECT id, name, budget, previous_data_point_id, created_at FROM scenario_groups WHERE deleted_at IS NULL ORDER BY id DESC")
        .map_err(|e| e.to_string())?;
    #[allow(clippy::type_complexity)]
    let groups: Vec<(i64, String, Option<i64>, Option<i64>, String)> = sg_stmt
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

    // Batch-fetch ALL scenario children in one query (avoids N+1)
    let group_ids: Vec<i64> = groups.iter().map(|(id, ..)| *id).collect();
    let mut children_map: HashMap<i64, Vec<SalaryDataPointSummary>> = HashMap::new();

    if !group_ids.is_empty() {
        let placeholders: Vec<String> = (1..=group_ids.len()).map(|i| format!("?{}", i)).collect();
        let sql = format!(
            "SELECT id, name, budget, previous_data_point_id, created_at, scenario_group_id \
             FROM salary_data_points WHERE scenario_group_id IN ({}) AND deleted_at IS NULL ORDER BY id ASC",
            placeholders.join(", ")
        );
        let params: Vec<&dyn rusqlite::types::ToSql> = group_ids
            .iter()
            .map(|id| id as &dyn rusqlite::types::ToSql)
            .collect();
        let mut child_stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let rows = child_stmt
            .query_map(params.as_slice(), |row| {
                Ok(SalaryDataPointSummary {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    budget: row.get(2)?,
                    previous_data_point_id: row.get(3)?,
                    created_at: row.get(4)?,
                    scenario_group_id: row.get(5)?,
                })
            })
            .map_err(|e| e.to_string())?;
        for row in rows {
            let child = row.map_err(|e| e.to_string())?;
            if let Some(sg_id) = child.scenario_group_id {
                children_map.entry(sg_id).or_default().push(child);
            }
        }
    }

    let mut scenario_groups: Vec<ScenarioGroup> = Vec::new();
    for (sg_id, sg_name, sg_budget, sg_prev, sg_created) in groups {
        scenario_groups.push(ScenarioGroup {
            id: sg_id,
            name: sg_name,
            budget: sg_budget,
            previous_data_point_id: sg_prev,
            created_at: sg_created,
            children: children_map.remove(&sg_id).unwrap_or_default(),
        });
    }

    // Sort by compare-target chains: newest (leaves) at top, oldest (roots) at bottom.
    // Standalone items (no chain connection) at the very bottom, alphabetically.
    //
    // Strategy: find leaves (items nobody points to that have a prev_id),
    // then follow prev_id links backwards to collect each chain leaf→root.

    let mut all_items: Vec<SalaryListItem> = Vec::new();
    let mut dp_id_to_idx: HashMap<i64, usize> = HashMap::new();

    for dp in normal_points {
        let idx = all_items.len();
        dp_id_to_idx.insert(dp.id, idx);
        all_items.push(SalaryListItem::DataPoint { data_point: dp });
    }
    for sg in scenario_groups {
        all_items.push(SalaryListItem::ScenarioGroup { scenario_group: sg });
    }

    // Set of data_point_ids that are targeted by something (i.e. appear as someone's prev)
    let mut targeted_ids: HashSet<i64> = HashSet::new();
    for item in &all_items {
        let prev = match item {
            SalaryListItem::DataPoint { data_point } => data_point.previous_data_point_id,
            SalaryListItem::ScenarioGroup { scenario_group } => {
                scenario_group.previous_data_point_id
            }
        };
        if let Some(pid) = prev {
            targeted_ids.insert(pid);
        }
    }

    // Find leaves: items that have a prev_id but whose own id is NOT targeted
    // For scenario groups, they can never be targeted (prev always points to data_points)
    let mut leaves: Vec<usize> = Vec::new();
    for (idx, item) in all_items.iter().enumerate() {
        let (has_prev, own_dp_id) = match item {
            SalaryListItem::DataPoint { data_point } => (
                data_point.previous_data_point_id.is_some(),
                Some(data_point.id),
            ),
            SalaryListItem::ScenarioGroup { scenario_group } => {
                (scenario_group.previous_data_point_id.is_some(), None)
            }
        };
        if has_prev {
            let is_targeted = own_dp_id.is_some_and(|id| targeted_ids.contains(&id));
            if !is_targeted {
                leaves.push(idx);
            }
        }
    }
    // Sort leaves alphabetically
    leaves.sort_by(|&a, &b| {
        let name_a = match &all_items[a] {
            SalaryListItem::DataPoint { data_point } => &data_point.name,
            SalaryListItem::ScenarioGroup { scenario_group } => &scenario_group.name,
        };
        let name_b = match &all_items[b] {
            SalaryListItem::DataPoint { data_point } => &data_point.name,
            SalaryListItem::ScenarioGroup { scenario_group } => &scenario_group.name,
        };
        name_a.cmp(name_b)
    });

    let mut placed = vec![false; all_items.len()];
    let mut ordered_indices: Vec<usize> = Vec::new();

    // For each leaf, walk backwards through the chain via prev_id
    for &leaf_idx in &leaves {
        let mut current = Some(leaf_idx);
        while let Some(idx) = current {
            if placed[idx] {
                break;
            }
            placed[idx] = true;
            ordered_indices.push(idx);
            // Follow prev_id to the parent
            let prev_id = match &all_items[idx] {
                SalaryListItem::DataPoint { data_point } => data_point.previous_data_point_id,
                SalaryListItem::ScenarioGroup { scenario_group } => {
                    scenario_group.previous_data_point_id
                }
            };
            current = prev_id.and_then(|pid| dp_id_to_idx.get(&pid).copied());
        }
    }

    // Standalone items: not yet placed (no prev AND not targeted, or orphan roots)
    let mut standalone: Vec<usize> = Vec::new();
    for (idx, &is_placed) in placed.iter().enumerate() {
        if !is_placed {
            standalone.push(idx);
        }
    }
    standalone.sort_by(|&a, &b| {
        let name_a = match &all_items[a] {
            SalaryListItem::DataPoint { data_point } => &data_point.name,
            SalaryListItem::ScenarioGroup { scenario_group } => &scenario_group.name,
        };
        let name_b = match &all_items[b] {
            SalaryListItem::DataPoint { data_point } => &data_point.name,
            SalaryListItem::ScenarioGroup { scenario_group } => &scenario_group.name,
        };
        name_a.cmp(name_b)
    });
    ordered_indices.extend(standalone);

    // Build final result
    let mut items: Vec<Option<SalaryListItem>> = all_items.into_iter().map(Some).collect();
    let mut final_items: Vec<SalaryListItem> = Vec::new();
    for idx in ordered_indices {
        if let Some(item) = items[idx].take() {
            final_items.push(item);
        }
    }

    Ok(final_items)
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_salary_data_point(db: State<AppDb>, id: i64) -> Result<SalaryDataPointDetail, String> {
    let guard = db.conn.lock();
    let conn = guard.as_ref().ok_or("Database not open")?;

    let (name, mut budget, mut previous_data_point_id, scenario_group_id, template_path): (String, Option<i64>, Option<i64>, Option<i64>, Option<String>) = conn
        .query_row(
            "SELECT name, budget, previous_data_point_id, scenario_group_id, template_path FROM salary_data_points WHERE id = ?1",
            params![id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
        )
        .map_err(|e| e.to_string())?;

    // For scenarios in a group, inherit budget and previous_data_point_id from the group
    if let Some(sg_id) = scenario_group_id {
        let (sg_budget, sg_prev): (Option<i64>, Option<i64>) = conn
            .query_row(
                "SELECT budget, previous_data_point_id FROM scenario_groups WHERE id = ?1",
                params![sg_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|e| e.to_string())?;
        if budget.is_none() {
            budget = sg_budget;
        }
        if previous_data_point_id.is_none() {
            previous_data_point_id = sg_prev;
        }
    }

    // For scenario children, read member attributes from the group-level table
    let member_query = if scenario_group_id.is_some() {
        "SELECT sdpm.id, sdpm.member_id, m.first_name, m.last_name,
                m.title_id, t.name as title_name,
                COALESCE(sgm.is_active, sdpm.is_active) as is_active,
                COALESCE(sgm.is_promoted, sdpm.is_promoted) as is_promoted,
                COALESCE(sgm.promoted_title_id, sdpm.promoted_title_id) as promoted_title_id,
                pt.name as promoted_title_name
         FROM salary_data_point_members sdpm
         JOIN team_members m ON m.id = sdpm.member_id
         LEFT JOIN titles t ON t.id = m.title_id
         LEFT JOIN scenario_group_members sgm ON sgm.member_id = sdpm.member_id
             AND sgm.scenario_group_id = (SELECT scenario_group_id FROM salary_data_points WHERE id = ?1)
         LEFT JOIN titles pt ON pt.id = COALESCE(sgm.promoted_title_id, sdpm.promoted_title_id)
         WHERE sdpm.data_point_id = ?1
         ORDER BY m.last_name ASC, m.first_name ASC"
    } else {
        "SELECT sdpm.id, sdpm.member_id, m.first_name, m.last_name,
                m.title_id, t.name as title_name, sdpm.is_active, sdpm.is_promoted,
                sdpm.promoted_title_id, pt.name as promoted_title_name
         FROM salary_data_point_members sdpm
         JOIN team_members m ON m.id = sdpm.member_id
         LEFT JOIN titles t ON t.id = m.title_id
         LEFT JOIN titles pt ON pt.id = sdpm.promoted_title_id
         WHERE sdpm.data_point_id = ?1
         ORDER BY m.last_name ASC, m.first_name ASC"
    };
    let mut member_stmt = conn.prepare(member_query).map_err(|e| e.to_string())?;

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
                promoted_title_id: row.get(8)?,
                promoted_title_name: row.get(9)?,
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

    let ranges: Vec<SalaryRange> =
        if let Some(sg_id) = scenario_group_id {
            let mut range_stmt = conn.prepare(
            "SELECT sgr.id, sgr.title_id, t.name as title_name, sgr.min_salary, sgr.max_salary
             FROM scenario_group_ranges sgr
             JOIN titles t ON t.id = sgr.title_id
             WHERE sgr.scenario_group_id = ?1
             ORDER BY t.name ASC",
        ).map_err(|e| e.to_string())?;
            let result = range_stmt
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
                .map_err(|e| e.to_string())?;
            result
        } else {
            let mut range_stmt = conn
                .prepare(
                    "SELECT sr.id, sr.title_id, t.name as title_name, sr.min_salary, sr.max_salary
                 FROM salary_ranges sr
                 JOIN titles t ON t.id = sr.title_id
                 WHERE sr.data_point_id = ?1
                 ORDER BY t.name ASC",
                )
                .map_err(|e| e.to_string())?;

            let result = range_stmt
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
            result
        };

    Ok(SalaryDataPointDetail {
        id,
        name,
        budget,
        previous_data_point_id,
        scenario_group_id,
        template_path,
        members,
        ranges,
    })
}

#[tauri::command(rename_all = "snake_case")]
pub fn create_salary_data_point(db: State<AppDb>) -> Result<SalaryDataPointSummary, String> {
    let guard = db.conn.lock();
    let conn = guard.as_ref().ok_or("Database not open")?;

    let today = chrono::Local::now().format("%Y-%m-%d").to_string();

    let prev_id: Option<i64> = conn
        .query_row(
            "SELECT id FROM salary_data_points WHERE scenario_group_id IS NULL AND deleted_at IS NULL ORDER BY id DESC LIMIT 1",
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
                "INSERT INTO salary_data_points (name, budget, previous_data_point_id) VALUES (?1, ?2, ?3)",
                params![today, prev_budget, prev],
            )
            .map_err(|e| e.to_string())?;
            let new_id = conn.last_insert_rowid();

            conn.execute(
                "INSERT INTO salary_data_point_members (data_point_id, member_id, is_active, is_promoted, promoted_title_id)
                 SELECT ?1, sdpm.member_id, sdpm.is_active, sdpm.is_promoted, sdpm.promoted_title_id
                 FROM salary_data_point_members sdpm
                 JOIN team_members m ON m.id = sdpm.member_id
                 WHERE sdpm.data_point_id = ?2 AND m.exclude_from_salary = 0 AND m.left_date IS NULL AND m.deleted_at IS NULL",
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
                previous_data_point_id: Some(prev),
                created_at,
                scenario_group_id: None,
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
                 SELECT ?1, id, 1, 0 FROM team_members WHERE exclude_from_salary = 0 AND left_date IS NULL AND deleted_at IS NULL",
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
                previous_data_point_id: None,
                created_at,
                scenario_group_id: None,
            })
        }
    })();

    match &result {
        Ok(_) => conn.execute_batch("COMMIT").map_err(|e| e.to_string())?,
        Err(_) => {
            if let Err(e) = conn.execute_batch("ROLLBACK") {
                eprintln!("[WARN] ROLLBACK failed: {}", e);
            }
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
    let guard = db.conn.lock();
    let conn = guard.as_ref().ok_or("Database not open")?;
    let allowed = ["name", "budget", "previous_data_point_id"];
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
    let guard = db.conn.lock();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute(
        "UPDATE salary_data_points SET deleted_at = datetime('now') WHERE id = ?1",
        params![id],
    )
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
    let guard = db.conn.lock();
    let conn = guard.as_ref().ok_or("Database not open")?;
    let allowed = ["is_active", "is_promoted", "promoted_title_id"];
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
pub fn open_presentation_window(
    app: tauri::AppHandle,
    data_point_id: i64,
    member_id: i64,
) -> Result<(), String> {
    let label = format!("presentation-{}-{}", data_point_id, member_id);

    // If window already exists, focus it
    if let Some(window) = app.get_webview_window(&label) {
        window.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    let url = format!("/presentation/{}/{}", data_point_id, member_id);
    tauri::WebviewWindowBuilder::new(&app, &label, tauri::WebviewUrl::App(url.into()))
        .title("Salary Presentation")
        .inner_size(900.0, 700.0)
        .min_inner_size(600.0, 400.0)
        .build()
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn create_salary_part(
    db: State<AppDb>,
    data_point_member_id: i64,
) -> Result<SalaryPart, String> {
    let guard = db.conn.lock();
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
    let guard = db.conn.lock();
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
    let guard = db.conn.lock();
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
    let guard = db.conn.lock();
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
    let guard = db.conn.lock();
    let conn = guard.as_ref().ok_or("Database not open")?;

    // Look up the explicit previous_data_point_id, inheriting from scenario group if needed
    let (prev_dp_id, scenario_group_id): (Option<i64>, Option<i64>) = conn
        .query_row(
            "SELECT previous_data_point_id, scenario_group_id FROM salary_data_points WHERE id = ?1",
            params![data_point_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| e.to_string())?;

    let prev_dp_id = match prev_dp_id {
        Some(id) => id,
        None => {
            // For scenarios, inherit from the group
            if let Some(sg_id) = scenario_group_id {
                match conn.query_row(
                    "SELECT previous_data_point_id FROM scenario_groups WHERE id = ?1",
                    params![sg_id],
                    |row| row.get::<_, Option<i64>>(0),
                ) {
                    Ok(Some(id)) => id,
                    _ => return Ok(None),
                }
            } else {
                return Ok(None);
            }
        }
    };

    let prev_sdpm_id: Option<i64> = conn
        .query_row(
            "SELECT sdpm.id
             FROM salary_data_point_members sdpm
             WHERE sdpm.member_id = ?1
               AND sdpm.data_point_id = ?2
               AND sdpm.is_active = 1",
            params![member_id, prev_dp_id],
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

/// Batch version: returns previous salary parts for ALL members in a data point.
#[tauri::command(rename_all = "snake_case")]
pub fn get_all_previous_member_data(
    db: State<AppDb>,
    data_point_id: i64,
) -> Result<HashMap<i64, Vec<SalaryPart>>, String> {
    let guard = db.conn.lock();
    let conn = guard.as_ref().ok_or("Database not open")?;

    // Resolve the previous data point id (inherit from scenario group if needed)
    let (prev_dp_id, scenario_group_id): (Option<i64>, Option<i64>) = conn
        .query_row(
            "SELECT previous_data_point_id, scenario_group_id FROM salary_data_points WHERE id = ?1",
            params![data_point_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| e.to_string())?;

    let prev_dp_id = match prev_dp_id {
        Some(id) => id,
        None => {
            if let Some(sg_id) = scenario_group_id {
                match conn.query_row(
                    "SELECT previous_data_point_id FROM scenario_groups WHERE id = ?1",
                    params![sg_id],
                    |row| row.get::<_, Option<i64>>(0),
                ) {
                    Ok(Some(id)) => id,
                    _ => return Ok(HashMap::new()),
                }
            } else {
                return Ok(HashMap::new());
            }
        }
    };

    // Get all active members in the previous data point and their salary parts in one query
    let mut stmt = conn
        .prepare(
            "SELECT sdpm.member_id, sp.id, sp.name, sp.amount, sp.frequency, sp.is_variable, sp.sort_order
             FROM salary_data_point_members sdpm
             JOIN salary_parts sp ON sp.data_point_member_id = sdpm.id
             WHERE sdpm.data_point_id = ?1 AND sdpm.is_active = 1
             ORDER BY sdpm.member_id, sp.sort_order ASC, sp.id ASC",
        )
        .map_err(|e| e.to_string())?;

    let mut result: HashMap<i64, Vec<SalaryPart>> = HashMap::new();
    let rows = stmt
        .query_map(params![prev_dp_id], |row| {
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
        let (member_id, part) = row.map_err(|e| e.to_string())?;
        result.entry(member_id).or_default().push(part);
    }

    Ok(result)
}

/// Batch version: returns scenario member comparisons for ALL members in a scenario group.
#[tauri::command(rename_all = "snake_case")]
pub fn get_all_scenario_member_comparisons(
    db: State<AppDb>,
    scenario_group_id: i64,
) -> Result<HashMap<i64, Vec<ScenarioMemberComparison>>, String> {
    let guard = db.conn.lock();
    let conn = guard.as_ref().ok_or("Database not open")?;

    let mut stmt = conn
        .prepare(
            "SELECT sdpm.member_id, sdp.id, sdp.name,
                    COALESCE(SUM(sp.amount * sp.frequency), 0) as annual_total
             FROM salary_data_points sdp
             JOIN salary_data_point_members sdpm ON sdpm.data_point_id = sdp.id
             LEFT JOIN salary_parts sp ON sp.data_point_member_id = sdpm.id
             WHERE sdp.scenario_group_id = ?1
             GROUP BY sdpm.member_id, sdp.id
             ORDER BY sdpm.member_id, sdp.id ASC",
        )
        .map_err(|e| e.to_string())?;

    let mut result: HashMap<i64, Vec<ScenarioMemberComparison>> = HashMap::new();
    let rows = stmt
        .query_map(params![scenario_group_id], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                ScenarioMemberComparison {
                    data_point_id: row.get(1)?,
                    data_point_name: row.get(2)?,
                    annual_total: row.get(3)?,
                },
            ))
        })
        .map_err(|e| e.to_string())?;

    for row in rows {
        let (member_id, comparison) = row.map_err(|e| e.to_string())?;
        result.entry(member_id).or_default().push(comparison);
    }

    Ok(result)
}

// ── Salary over time command ──

#[derive(Serialize)]
pub struct SalaryOverTimeMember {
    pub member_id: i64,
    pub first_name: String,
    pub last_name: String,
    pub left_date: Option<String>,
    pub annual_total: i64,
}

#[derive(Serialize)]
pub struct SalaryOverTimePoint {
    pub data_point_id: i64,
    pub data_point_name: String,
    pub members: Vec<SalaryOverTimeMember>,
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_salary_over_time(db: State<AppDb>) -> Result<Vec<SalaryOverTimePoint>, String> {
    let guard = db.conn.lock();
    let conn = guard.as_ref().ok_or("Database not open")?;

    let mut dp_stmt = conn
        .prepare(
            "SELECT id, name FROM salary_data_points WHERE scenario_group_id IS NULL AND deleted_at IS NULL ORDER BY id",
        )
        .map_err(|e| e.to_string())?;

    let data_points: Vec<(i64, String)> = dp_stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    // Fetch all members across all relevant data points in a single query (avoids N+1)
    let dp_ids: Vec<i64> = data_points.iter().map(|(id, _)| *id).collect();
    let placeholders: Vec<String> = dp_ids
        .iter()
        .enumerate()
        .map(|(i, _)| format!("?{}", i + 1))
        .collect();
    let sql = format!(
        "SELECT sdpm.data_point_id, sdpm.member_id, m.first_name, m.last_name, m.left_date,
                COALESCE(SUM(sp.amount * sp.frequency), 0) as annual_total
         FROM salary_data_point_members sdpm
         JOIN team_members m ON m.id = sdpm.member_id
         LEFT JOIN salary_parts sp ON sp.data_point_member_id = sdpm.id
         WHERE sdpm.data_point_id IN ({}) AND sdpm.is_active = 1
         GROUP BY sdpm.data_point_id, sdpm.member_id
         ORDER BY sdpm.data_point_id, m.last_name, m.first_name",
        placeholders.join(", ")
    );

    let mut member_stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let params_vec: Vec<Box<dyn rusqlite::types::ToSql>> = dp_ids
        .iter()
        .map(|id| Box::new(*id) as Box<dyn rusqlite::types::ToSql>)
        .collect();
    let param_refs: Vec<&dyn rusqlite::types::ToSql> =
        params_vec.iter().map(|p| p.as_ref()).collect();

    let mut members_by_dp: HashMap<i64, Vec<SalaryOverTimeMember>> = HashMap::new();
    let rows = member_stmt
        .query_map(param_refs.as_slice(), |row| {
            Ok((
                row.get::<_, i64>(0)?,
                SalaryOverTimeMember {
                    member_id: row.get(1)?,
                    first_name: row.get(2)?,
                    last_name: row.get(3)?,
                    left_date: row.get(4)?,
                    annual_total: row.get(5)?,
                },
            ))
        })
        .map_err(|e| e.to_string())?;

    for row in rows {
        let (dp_id, member) = row.map_err(|e| e.to_string())?;
        members_by_dp.entry(dp_id).or_default().push(member);
    }

    let result = data_points
        .into_iter()
        .map(|(dp_id, dp_name)| SalaryOverTimePoint {
            data_point_id: dp_id,
            data_point_name: dp_name,
            members: members_by_dp.remove(&dp_id).unwrap_or_default(),
        })
        .collect();

    Ok(result)
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_salary_lineage(
    db: State<AppDb>,
    data_point_id: i64,
) -> Result<Vec<SalaryOverTimePoint>, String> {
    let guard = db.conn.lock();
    let conn = guard.as_ref().ok_or("Database not open")?;

    // Resolve the effective previous_data_point_id: for scenario children, inherit from the group
    let (start_id, start_name): (i64, String) = conn
        .query_row(
            "SELECT sdp.id, sdp.name FROM salary_data_points sdp WHERE sdp.id = ?1",
            params![data_point_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| e.to_string())?;

    // Walk the previous_data_point_id chain backwards, collecting IDs
    // For scenario children, previous_data_point_id comes from the group
    let mut chain: Vec<(i64, String)> = vec![(start_id, start_name)];
    let mut current_id = data_point_id;
    loop {
        let prev: Option<(i64, String)> = conn
            .query_row(
                "SELECT prev.id, prev.name
                 FROM salary_data_points sdp
                 LEFT JOIN scenario_groups sg ON sg.id = sdp.scenario_group_id
                 JOIN salary_data_points prev ON prev.id = COALESCE(sg.previous_data_point_id, sdp.previous_data_point_id)
                 WHERE sdp.id = ?1 AND prev.deleted_at IS NULL",
                params![current_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()
            .map_err(|e| e.to_string())?;

        match prev {
            Some((prev_id, prev_name)) => {
                // Guard against cycles
                if chain.iter().any(|(id, _)| *id == prev_id) {
                    break;
                }
                chain.push((prev_id, prev_name));
                current_id = prev_id;
            }
            None => break,
        }
    }

    // Reverse so oldest is first
    chain.reverse();

    let mut member_stmt = conn
        .prepare(
            "SELECT sdpm.member_id, m.first_name, m.last_name, m.left_date,
                    COALESCE(SUM(sp.amount * sp.frequency), 0) as annual_total
             FROM salary_data_point_members sdpm
             JOIN team_members m ON m.id = sdpm.member_id
             LEFT JOIN salary_parts sp ON sp.data_point_member_id = sdpm.id
             WHERE sdpm.data_point_id = ?1 AND sdpm.is_active = 1
             GROUP BY sdpm.member_id
             ORDER BY m.last_name, m.first_name",
        )
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for (dp_id, dp_name) in chain {
        let members = member_stmt
            .query_map(params![dp_id], |row| {
                Ok(SalaryOverTimeMember {
                    member_id: row.get(0)?,
                    first_name: row.get(1)?,
                    last_name: row.get(2)?,
                    left_date: row.get(3)?,
                    annual_total: row.get(4)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;

        result.push(SalaryOverTimePoint {
            data_point_id: dp_id,
            data_point_name: dp_name,
            members,
        });
    }

    Ok(result)
}

// ── Combined detail loader (detail + lineage + previous member data) ──

#[derive(Serialize)]
pub struct SalaryDataPointFull {
    pub detail: SalaryDataPointDetail,
    pub lineage: Vec<SalaryOverTimePoint>,
    pub previous_data: HashMap<i64, Vec<SalaryPart>>,
    pub previous_data_point_name: Option<String>,
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_salary_data_point_full(
    db: State<AppDb>,
    id: i64,
) -> Result<SalaryDataPointFull, String> {
    let detail = get_salary_data_point(db.clone(), id)?;
    let lineage = get_salary_lineage(db.clone(), id)?;
    let previous_data = get_all_previous_member_data(db.clone(), id)?;

    // Resolve the previous data point's name
    let previous_data_point_name = detail.previous_data_point_id.and_then(|prev_id| {
        let guard = db.conn.lock();
        let conn = guard.as_ref()?;
        conn.query_row(
            "SELECT name FROM salary_data_points WHERE id = ?1",
            params![prev_id],
            |row| row.get(0),
        )
        .ok()
    });

    Ok(SalaryDataPointFull {
        detail,
        lineage,
        previous_data,
        previous_data_point_name,
    })
}

// ── Scenario group commands ──

#[tauri::command(rename_all = "snake_case")]
pub fn create_scenario_group(
    db: State<AppDb>,
    previous_data_point_id: Option<i64>,
    count: i64,
) -> Result<ScenarioGroup, String> {
    let guard = db.conn.lock();
    let conn = guard.as_ref().ok_or("Database not open")?;

    if count < 2 {
        return Err("Scenario group must have at least 2 scenarios".to_string());
    }

    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let group_name = format!("{} Scenarios", today);

    conn.execute_batch("BEGIN").map_err(|e| e.to_string())?;

    let result: Result<ScenarioGroup, String> = (|| {
        let prev_budget: Option<i64> = previous_data_point_id.and_then(|prev_id| {
            conn.query_row(
                "SELECT budget FROM salary_data_points WHERE id = ?1",
                params![prev_id],
                |row| row.get(0),
            )
            .ok()
        });

        conn.execute(
            "INSERT INTO scenario_groups (name, budget, previous_data_point_id) VALUES (?1, ?2, ?3)",
            params![group_name, prev_budget, previous_data_point_id],
        ).map_err(|e| e.to_string())?;
        let group_id = conn.last_insert_rowid();

        if let Some(prev_id) = previous_data_point_id {
            conn.execute(
                "INSERT INTO scenario_group_ranges (scenario_group_id, title_id, min_salary, max_salary)
                 SELECT ?1, title_id, min_salary, max_salary
                 FROM salary_ranges WHERE data_point_id = ?2",
                params![group_id, prev_id],
            ).map_err(|e| e.to_string())?;
            // Populate group-level member attributes from the previous data point
            conn.execute(
                "INSERT INTO scenario_group_members (scenario_group_id, member_id, is_active, is_promoted, promoted_title_id)
                 SELECT ?1, sdpm.member_id, sdpm.is_active, sdpm.is_promoted, sdpm.promoted_title_id
                 FROM salary_data_point_members sdpm
                 JOIN team_members m ON m.id = sdpm.member_id
                 WHERE sdpm.data_point_id = ?2 AND m.exclude_from_salary = 0 AND m.left_date IS NULL AND m.deleted_at IS NULL",
                params![group_id, prev_id],
            ).map_err(|e| e.to_string())?;
        }

        let mut children = Vec::new();
        for i in 1..=count {
            let child_name = format!("Scenario {}", i);

            if let Some(prev_id) = previous_data_point_id {
                conn.execute(
                    "INSERT INTO salary_data_points (name, scenario_group_id) VALUES (?1, ?2)",
                    params![child_name, group_id],
                )
                .map_err(|e| e.to_string())?;
                let child_id = conn.last_insert_rowid();

                conn.execute(
                    "INSERT INTO salary_data_point_members (data_point_id, member_id, is_active, is_promoted, promoted_title_id)
                     SELECT ?1, sdpm.member_id, sdpm.is_active, sdpm.is_promoted, sdpm.promoted_title_id
                     FROM salary_data_point_members sdpm
                     JOIN team_members m ON m.id = sdpm.member_id
                     WHERE sdpm.data_point_id = ?2 AND m.exclude_from_salary = 0 AND m.left_date IS NULL AND m.deleted_at IS NULL",
                    params![child_id, prev_id],
                ).map_err(|e| e.to_string())?;

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
                    .query_row(
                        "SELECT created_at FROM salary_data_points WHERE id = ?1",
                        params![child_id],
                        |row| row.get(0),
                    )
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
                )
                .map_err(|e| e.to_string())?;
                let child_id = conn.last_insert_rowid();

                conn.execute(
                    "INSERT INTO salary_data_point_members (data_point_id, member_id, is_active, is_promoted)
                     SELECT ?1, id, 1, 0 FROM team_members WHERE exclude_from_salary = 0 AND left_date IS NULL AND deleted_at IS NULL",
                    params![child_id],
                ).map_err(|e| e.to_string())?;

                let created_at: String = conn
                    .query_row(
                        "SELECT created_at FROM salary_data_points WHERE id = ?1",
                        params![child_id],
                        |row| row.get(0),
                    )
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
            .query_row(
                "SELECT created_at FROM scenario_groups WHERE id = ?1",
                params![group_id],
                |row| row.get(0),
            )
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
        Err(_) => {
            if let Err(e) = conn.execute_batch("ROLLBACK") {
                eprintln!("[WARN] ROLLBACK failed: {}", e);
            }
        }
    }

    result
}

#[tauri::command(rename_all = "snake_case")]
pub fn delete_scenario_group(db: State<AppDb>, id: i64) -> Result<(), String> {
    let guard = db.conn.lock();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute(
        "UPDATE scenario_groups SET deleted_at = datetime('now') WHERE id = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE salary_data_points SET deleted_at = datetime('now') WHERE scenario_group_id = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn update_scenario_group(
    db: State<AppDb>,
    id: i64,
    field: String,
    value: Option<String>,
) -> Result<(), String> {
    let guard = db.conn.lock();
    let conn = guard.as_ref().ok_or("Database not open")?;
    let allowed = ["name", "budget", "previous_data_point_id"];
    if !allowed.contains(&field.as_str()) {
        return Err(format!("Invalid field: {}", field));
    }
    let sql = format!("UPDATE scenario_groups SET {} = ?1 WHERE id = ?2", field);
    conn.execute(&sql, params![value, id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn update_scenario_group_range(
    db: State<AppDb>,
    scenario_group_id: i64,
    title_id: i64,
    min_salary: i64,
    max_salary: i64,
) -> Result<(), String> {
    let guard = db.conn.lock();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute(
        "INSERT INTO scenario_group_ranges (scenario_group_id, title_id, min_salary, max_salary)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(scenario_group_id, title_id) DO UPDATE SET min_salary = excluded.min_salary, max_salary = excluded.max_salary",
        params![scenario_group_id, title_id, min_salary, max_salary],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn update_scenario_group_member(
    db: State<AppDb>,
    scenario_group_id: i64,
    member_id: i64,
    field: String,
    value: Option<String>,
) -> Result<(), String> {
    let guard = db.conn.lock();
    let conn = guard.as_ref().ok_or("Database not open")?;
    let allowed = ["is_active", "is_promoted", "promoted_title_id"];
    if !allowed.contains(&field.as_str()) {
        return Err(format!("Invalid field: {}", field));
    }
    // Update group-level member
    let sql = format!(
        "UPDATE scenario_group_members SET {} = ?1 WHERE scenario_group_id = ?2 AND member_id = ?3",
        field
    );
    conn.execute(&sql, params![value, scenario_group_id, member_id])
        .map_err(|e| e.to_string())?;
    // Propagate to all child data points
    let sql = format!(
        "UPDATE salary_data_point_members SET {} = ?1
         WHERE member_id = ?2 AND data_point_id IN (
             SELECT id FROM salary_data_points WHERE scenario_group_id = ?3
         )",
        field
    );
    conn.execute(&sql, params![value, member_id, scenario_group_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn add_scenario(
    db: State<AppDb>,
    scenario_group_id: i64,
) -> Result<SalaryDataPointSummary, String> {
    let guard = db.conn.lock();
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
        )
        .map_err(|e| e.to_string())?;
        let new_id = conn.last_insert_rowid();

        // Copy members from group-level member attributes
        conn.execute(
            "INSERT INTO salary_data_point_members (data_point_id, member_id, is_active, is_promoted, promoted_title_id)
             SELECT ?1, member_id, is_active, is_promoted, promoted_title_id
             FROM scenario_group_members WHERE scenario_group_id = ?2",
            params![new_id, scenario_group_id],
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
            .query_row(
                "SELECT created_at FROM salary_data_points WHERE id = ?1",
                params![new_id],
                |row| row.get(0),
            )
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
        Err(_) => {
            if let Err(e) = conn.execute_batch("ROLLBACK") {
                eprintln!("[WARN] ROLLBACK failed: {}", e);
            }
        }
    }

    result
}

#[tauri::command(rename_all = "snake_case")]
pub fn remove_scenario(db: State<AppDb>, data_point_id: i64) -> Result<(), String> {
    let guard = db.conn.lock();
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

    conn.execute(
        "DELETE FROM salary_data_points WHERE id = ?1",
        params![data_point_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Add a team member to a data point (or scenario group + all its children)
#[tauri::command(rename_all = "snake_case")]
pub fn add_member_to_data_point(
    db: State<AppDb>,
    data_point_id: i64,
    member_id: i64,
) -> Result<(), String> {
    let guard = db.conn.lock();
    let conn = guard.as_ref().ok_or("Database not open")?;

    let scenario_group_id: Option<i64> = conn
        .query_row(
            "SELECT scenario_group_id FROM salary_data_points WHERE id = ?1",
            params![data_point_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    conn.execute_batch("BEGIN").map_err(|e| e.to_string())?;
    let result: Result<(), String> = (|| {
        if let Some(sg_id) = scenario_group_id {
            // Scenario: add to group-level table and all children
            conn.execute(
                "INSERT OR IGNORE INTO scenario_group_members (scenario_group_id, member_id, is_active, is_promoted)
                 VALUES (?1, ?2, 1, 0)",
                params![sg_id, member_id],
            ).map_err(|e| e.to_string())?;

            let child_ids: Vec<i64> = {
                let mut stmt = conn
                    .prepare("SELECT id FROM salary_data_points WHERE scenario_group_id = ?1")
                    .map_err(|e| e.to_string())?;
                let ids = stmt
                    .query_map(params![sg_id], |row| row.get(0))
                    .map_err(|e| e.to_string())?
                    .collect::<Result<Vec<_>, _>>()
                    .map_err(|e| e.to_string())?;
                ids
            };
            for child_id in child_ids {
                conn.execute(
                    "INSERT OR IGNORE INTO salary_data_point_members (data_point_id, member_id, is_active, is_promoted)
                     VALUES (?1, ?2, 1, 0)",
                    params![child_id, member_id],
                ).map_err(|e| e.to_string())?;
            }
        } else {
            // Regular data point
            conn.execute(
                "INSERT OR IGNORE INTO salary_data_point_members (data_point_id, member_id, is_active, is_promoted)
                 VALUES (?1, ?2, 1, 0)",
                params![data_point_id, member_id],
            ).map_err(|e| e.to_string())?;
        }
        Ok(())
    })();

    match &result {
        Ok(_) => conn.execute_batch("COMMIT").map_err(|e| e.to_string())?,
        Err(_) => {
            if let Err(e) = conn.execute_batch("ROLLBACK") {
                eprintln!("[WARN] ROLLBACK failed: {}", e);
            }
        }
    }
    result
}

/// Remove a team member from a data point (or scenario group + all its children)
#[tauri::command(rename_all = "snake_case")]
pub fn remove_member_from_data_point(
    db: State<AppDb>,
    data_point_id: i64,
    member_id: i64,
) -> Result<(), String> {
    let guard = db.conn.lock();
    let conn = guard.as_ref().ok_or("Database not open")?;

    let scenario_group_id: Option<i64> = conn
        .query_row(
            "SELECT scenario_group_id FROM salary_data_points WHERE id = ?1",
            params![data_point_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    conn.execute_batch("BEGIN").map_err(|e| e.to_string())?;
    let result: Result<(), String> = (|| {
        if let Some(sg_id) = scenario_group_id {
            // Scenario: remove from group-level table and all children (CASCADE handles salary_parts)
            conn.execute(
                "DELETE FROM scenario_group_members WHERE scenario_group_id = ?1 AND member_id = ?2",
                params![sg_id, member_id],
            ).map_err(|e| e.to_string())?;

            // Delete from all children; ON DELETE CASCADE on salary_parts handles part cleanup
            conn.execute(
                "DELETE FROM salary_data_point_members
                 WHERE member_id = ?1
                   AND data_point_id IN (SELECT id FROM salary_data_points WHERE scenario_group_id = ?2)",
                params![member_id, sg_id],
            ).map_err(|e| e.to_string())?;
        } else {
            // Regular data point; ON DELETE CASCADE on salary_parts handles part cleanup
            conn.execute(
                "DELETE FROM salary_data_point_members WHERE data_point_id = ?1 AND member_id = ?2",
                params![data_point_id, member_id],
            )
            .map_err(|e| e.to_string())?;
        }
        Ok(())
    })();

    match &result {
        Ok(_) => conn.execute_batch("COMMIT").map_err(|e| e.to_string())?,
        Err(_) => {
            if let Err(e) = conn.execute_batch("ROLLBACK") {
                eprintln!("[WARN] ROLLBACK failed: {}", e);
            }
        }
    }
    result
}

#[tauri::command(rename_all = "snake_case")]
pub fn promote_scenario(db: State<AppDb>, data_point_id: i64) -> Result<(), String> {
    let guard = db.conn.lock();
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
        )
        .map_err(|e| e.to_string())?;

        // 3. Set previous_data_point_id from group
        conn.execute(
            "UPDATE salary_data_points SET previous_data_point_id = ?1 WHERE id = ?2",
            params![sg_prev, data_point_id],
        )
        .map_err(|e| e.to_string())?;

        // 4. Set budget from group
        conn.execute(
            "UPDATE salary_data_points SET budget = ?1 WHERE id = ?2",
            params![sg_budget, data_point_id],
        )
        .map_err(|e| e.to_string())?;

        // 5. Copy group ranges to salary_ranges
        conn.execute(
            "INSERT INTO salary_ranges (data_point_id, title_id, min_salary, max_salary)
             SELECT ?1, title_id, min_salary, max_salary
             FROM scenario_group_ranges WHERE scenario_group_id = ?2",
            params![data_point_id, sg_id],
        )
        .map_err(|e| e.to_string())?;

        // 6. Delete group (CASCADE removes siblings and group ranges)
        conn.execute("DELETE FROM scenario_groups WHERE id = ?1", params![sg_id])
            .map_err(|e| e.to_string())?;

        Ok(())
    })();

    match &result {
        Ok(_) => conn.execute_batch("COMMIT").map_err(|e| e.to_string())?,
        Err(_) => {
            if let Err(e) = conn.execute_batch("ROLLBACK") {
                eprintln!("[WARN] ROLLBACK failed: {}", e);
            }
        }
    }

    result
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_scenario_summaries(
    db: State<AppDb>,
    scenario_group_id: i64,
) -> Result<Vec<ScenarioSummary>, String> {
    let guard = db.conn.lock();
    let conn = guard.as_ref().ok_or("Database not open")?;

    // Use scenario_group_members for is_active/is_promoted (source of truth for scenarios)
    let mut stmt = conn
        .prepare(
            "SELECT sdp.id, sdp.name,
                    COALESCE(SUM(CASE WHEN sgm.is_active = 1 AND sgm.is_promoted = 0 THEN sp.amount * sp.frequency ELSE 0 END), 0) as total_salary
             FROM salary_data_points sdp
             LEFT JOIN salary_data_point_members sdpm ON sdpm.data_point_id = sdp.id
             LEFT JOIN scenario_group_members sgm ON sgm.scenario_group_id = ?1 AND sgm.member_id = sdpm.member_id
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

    // Headcount is the same for all scenarios in the group — query once before the loop
    let headcount: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM scenario_group_members WHERE scenario_group_id = ?1 AND is_active = 1 AND is_promoted = 0",
            params![scenario_group_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for (dp_id, dp_name, total_salary) in summaries {
        result.push(ScenarioSummary {
            data_point_id: dp_id,
            data_point_name: dp_name,
            total_salary,
            headcount,
        });
    }

    Ok(result)
}

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
    let guard = db.conn.lock();
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
    let guard = db.conn.lock();
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
    let guard = db.conn.lock();
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
    let guard = db.conn.lock();
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
    let guard = db.conn.lock();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute("DELETE FROM reports WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_report_detail(db: State<AppDb>, id: i64) -> Result<ReportDetail, String> {
    let guard = db.conn.lock();
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
                "SELECT m.id, m.first_name, m.last_name,
                        COALESCE(pt.name, t.name) as current_title,
                        m.exclude_from_salary
                 FROM team_members m
                 LEFT JOIN titles t ON t.id = m.title_id
                 LEFT JOIN (
                     SELECT sdpm.member_id, sdpm.promoted_title_id
                     FROM salary_data_point_members sdpm
                     INNER JOIN (
                         SELECT member_id, MAX(data_point_id) as max_dp_id
                         FROM salary_data_point_members
                         WHERE is_promoted = 1 AND promoted_title_id IS NOT NULL
                         GROUP BY member_id
                     ) latest ON sdpm.member_id = latest.member_id AND sdpm.data_point_id = latest.max_dp_id
                 ) promo ON promo.member_id = m.id
                 LEFT JOIN titles pt ON pt.id = promo.promoted_title_id
                 WHERE m.deleted_at IS NULL
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

// ── Report Block commands ──

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ReportBlock {
    pub id: i64,
    pub report_id: i64,
    pub block_type: String,
    pub sort_order: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ReportBlockData {
    pub id: i64,
    pub block_type: String,
    pub sort_order: i64,
    pub data: serde_json::Value,
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_report_blocks(db: State<AppDb>, report_id: i64) -> Result<Vec<ReportBlock>, String> {
    let guard = db.conn.lock();
    let conn = guard.as_ref().ok_or("Database not open")?;
    let mut stmt = conn
        .prepare(
            "SELECT id, report_id, block_type, sort_order
             FROM report_blocks WHERE report_id = ?1
             ORDER BY sort_order ASC, id ASC",
        )
        .map_err(|e| e.to_string())?;
    let blocks = stmt
        .query_map(params![report_id], |row| {
            Ok(ReportBlock {
                id: row.get(0)?,
                report_id: row.get(1)?,
                block_type: row.get(2)?,
                sort_order: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(blocks)
}

#[tauri::command(rename_all = "snake_case")]
pub fn add_report_block(
    db: State<AppDb>,
    report_id: i64,
    block_type: String,
) -> Result<ReportBlock, String> {
    let guard = db.conn.lock();
    let conn = guard.as_ref().ok_or("Database not open")?;
    let next_order: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM report_blocks WHERE report_id = ?1",
            params![report_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO report_blocks (report_id, block_type, sort_order) VALUES (?1, ?2, ?3)",
        params![report_id, block_type, next_order],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    Ok(ReportBlock {
        id,
        report_id,
        block_type,
        sort_order: next_order,
    })
}

#[tauri::command(rename_all = "snake_case")]
pub fn remove_report_block(db: State<AppDb>, id: i64) -> Result<(), String> {
    let guard = db.conn.lock();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute("DELETE FROM report_blocks WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn reorder_report_blocks(
    db: State<AppDb>,
    report_id: i64,
    block_ids: Vec<i64>,
) -> Result<(), String> {
    let guard = db.conn.lock();
    let conn = guard.as_ref().ok_or("Database not open")?;
    for (i, bid) in block_ids.iter().enumerate() {
        conn.execute(
            "UPDATE report_blocks SET sort_order = ?1 WHERE id = ?2 AND report_id = ?3",
            params![i as i64, bid, report_id],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_report_block_data(
    db: State<AppDb>,
    report_id: i64,
) -> Result<Vec<ReportBlockData>, String> {
    let guard = db.conn.lock();
    let conn = guard.as_ref().ok_or("Database not open")?;

    let mut stmt = conn
        .prepare(
            "SELECT id, block_type, sort_order FROM report_blocks
             WHERE report_id = ?1 ORDER BY sort_order ASC, id ASC",
        )
        .map_err(|e| e.to_string())?;
    let blocks: Vec<(i64, String, i64)> = stmt
        .query_map(params![report_id], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for (block_id, block_type, sort_order) in blocks {
        let data = match block_type.as_str() {
            "team_overview" => build_team_overview(conn)?,
            "member_statuses" => build_member_statuses(conn)?,
            "open_escalations" => build_open_escalations(conn)?,
            "project_status" => build_project_status(conn)?,
            "salary_summary" => build_salary_summary(conn)?,
            "one_on_one_coverage" => build_one_on_one_coverage(conn)?,
            "upcoming_birthdays" => build_upcoming_birthdays(conn)?,
            "salary_over_time" => build_salary_over_time(conn)?,
            _ => serde_json::json!({}),
        };
        result.push(ReportBlockData {
            id: block_id,
            block_type,
            sort_order,
            data,
        });
    }
    Ok(result)
}

fn build_team_overview(conn: &rusqlite::Connection) -> Result<serde_json::Value, String> {
    let active_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM team_members WHERE left_date IS NULL AND deleted_at IS NULL",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let left_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM team_members WHERE left_date IS NOT NULL AND deleted_at IS NULL",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT COALESCE(t.name, 'No Title') as title_name, COUNT(*) as cnt
             FROM team_members m
             LEFT JOIN titles t ON t.id = m.title_id
             WHERE m.left_date IS NULL AND m.deleted_at IS NULL
             GROUP BY title_name
             ORDER BY cnt DESC",
        )
        .map_err(|e| e.to_string())?;
    let title_breakdown: Vec<serde_json::Value> = stmt
        .query_map([], |row| {
            Ok(serde_json::json!({
                "title_name": row.get::<_, String>(0)?,
                "count": row.get::<_, i64>(1)?
            }))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "active_count": active_count,
        "left_count": left_count,
        "title_breakdown": title_breakdown
    }))
}

fn build_member_statuses(conn: &rusqlite::Connection) -> Result<serde_json::Value, String> {
    let mut member_stmt = conn
        .prepare(
            "SELECT m.id, m.first_name, m.last_name
             FROM team_members m
             WHERE m.left_date IS NULL AND m.deleted_at IS NULL
             ORDER BY m.last_name ASC, m.first_name ASC",
        )
        .map_err(|e| e.to_string())?;
    let members: Vec<(i64, String, String)> = member_stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let member_ids: Vec<i64> = members.iter().map(|(id, ..)| *id).collect();
    let mut status_map: HashMap<i64, Vec<serde_json::Value>> = HashMap::new();

    if !member_ids.is_empty() {
        let placeholders: Vec<String> = (1..=member_ids.len()).map(|i| format!("?{}", i)).collect();
        let sql = format!(
            "SELECT team_member_id, id, text FROM status_items
             WHERE team_member_id IN ({}) AND checked = 0
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
                    serde_json::json!({
                        "id": row.get::<_, i64>(1)?,
                        "text": row.get::<_, String>(2)?
                    }),
                ))
            })
            .map_err(|e| e.to_string())?;
        for row in rows {
            let (mid, item) = row.map_err(|e| e.to_string())?;
            status_map.entry(mid).or_default().push(item);
        }
    }

    let result: Vec<serde_json::Value> = members
        .into_iter()
        .filter_map(|(id, first, last)| {
            let statuses = status_map.remove(&id).unwrap_or_default();
            if statuses.is_empty() {
                return None;
            }
            Some(serde_json::json!({
                "member_id": id,
                "first_name": first,
                "last_name": last,
                "statuses": statuses
            }))
        })
        .collect();

    Ok(serde_json::json!({ "members": result }))
}

fn build_open_escalations(conn: &rusqlite::Connection) -> Result<serde_json::Value, String> {
    let mut stmt = conn
        .prepare(
            "SELECT tt.id, tt.text, m.first_name || ' ' || m.last_name as member_name, tt.escalated_at
             FROM talk_topics tt
             JOIN team_members m ON m.id = tt.team_member_id
             WHERE tt.escalated = 1 AND tt.resolved = 0 AND m.deleted_at IS NULL
             ORDER BY tt.escalated_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let escalations: Vec<serde_json::Value> = stmt
        .query_map([], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, i64>(0)?,
                "text": row.get::<_, String>(1)?,
                "member_name": row.get::<_, String>(2)?,
                "escalated_at": row.get::<_, Option<String>>(3)?
            }))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(serde_json::json!({ "escalations": escalations }))
}

fn build_project_status(conn: &rusqlite::Connection) -> Result<serde_json::Value, String> {
    let mut stmt = conn
        .prepare(
            "SELECT p.id, p.name,
                    COUNT(psi.id) as total,
                    SUM(CASE WHEN psi.checked = 1 THEN 1 ELSE 0 END) as done
             FROM projects p
             LEFT JOIN project_status_items psi ON psi.project_id = p.id
             WHERE p.end_date IS NULL OR p.end_date >= date('now')
             GROUP BY p.id
             ORDER BY p.name ASC",
        )
        .map_err(|e| e.to_string())?;
    let projects: Vec<serde_json::Value> = stmt
        .query_map([], |row| {
            Ok(serde_json::json!({
                "project_id": row.get::<_, i64>(0)?,
                "name": row.get::<_, String>(1)?,
                "total": row.get::<_, i64>(2)?,
                "done": row.get::<_, i64>(3)?
            }))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(serde_json::json!({ "projects": projects }))
}

fn build_salary_summary(conn: &rusqlite::Connection) -> Result<serde_json::Value, String> {
    // Get the latest non-scenario data point
    let dp: Option<(i64, String, Option<f64>)> = conn
        .query_row(
            "SELECT id, name, budget FROM salary_data_points
             WHERE scenario_group_id IS NULL AND deleted_at IS NULL
             ORDER BY id DESC LIMIT 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .ok();

    if let Some((dp_id, dp_name, budget)) = dp {
        let mut stmt = conn
            .prepare(
                "SELECT sdpm.id, sdpm.is_active
                 FROM salary_data_point_members sdpm
                 WHERE sdpm.data_point_id = ?1",
            )
            .map_err(|e| e.to_string())?;
        let dp_members: Vec<(i64, bool)> = stmt
            .query_map(params![dp_id], |row| Ok((row.get(0)?, row.get(1)?)))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;

        let active_member_ids: Vec<i64> = dp_members
            .iter()
            .filter(|(_, active)| *active)
            .map(|(id, _)| *id)
            .collect();
        let headcount = active_member_ids.len() as i64;

        let mut total_salary: f64 = 0.0;
        if !active_member_ids.is_empty() {
            let placeholders: Vec<String> = (1..=active_member_ids.len())
                .map(|i| format!("?{}", i))
                .collect();
            let sql = format!(
                "SELECT COALESCE(SUM(amount * frequency), 0)
                 FROM salary_parts
                 WHERE data_point_member_id IN ({})",
                placeholders.join(", ")
            );
            let params: Vec<&dyn rusqlite::types::ToSql> = active_member_ids
                .iter()
                .map(|id| id as &dyn rusqlite::types::ToSql)
                .collect();
            total_salary = conn
                .query_row(&sql, params.as_slice(), |row| row.get(0))
                .map_err(|e| e.to_string())?;
        }

        Ok(serde_json::json!({
            "data_point_name": dp_name,
            "total_salary": total_salary,
            "budget": budget,
            "headcount": headcount
        }))
    } else {
        let none_str: Option<String> = None;
        let none_f64: Option<f64> = None;
        Ok(serde_json::json!({
            "data_point_name": none_str,
            "total_salary": 0,
            "budget": none_f64,
            "headcount": 0
        }))
    }
}

fn build_one_on_one_coverage(conn: &rusqlite::Connection) -> Result<serde_json::Value, String> {
    let mut stmt = conn
        .prepare(
            "SELECT m.id, m.first_name, m.last_name,
                    (SELECT MAX(mt.date) FROM meetings mt WHERE mt.team_member_id = m.id) as last_meeting_date
             FROM team_members m
             WHERE m.left_date IS NULL AND m.deleted_at IS NULL
             ORDER BY last_meeting_date ASC NULLS FIRST",
        )
        .map_err(|e| e.to_string())?;
    let members: Vec<serde_json::Value> = stmt
        .query_map([], |row| {
            Ok(serde_json::json!({
                "member_id": row.get::<_, i64>(0)?,
                "first_name": row.get::<_, String>(1)?,
                "last_name": row.get::<_, String>(2)?,
                "last_meeting_date": row.get::<_, Option<String>>(3)?
            }))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(serde_json::json!({ "members": members }))
}

fn build_upcoming_birthdays(conn: &rusqlite::Connection) -> Result<serde_json::Value, String> {
    // Get children with birthdays, calculate days until next birthday
    let mut stmt = conn
        .prepare(
            "SELECT c.name, c.date_of_birth, m.first_name || ' ' || m.last_name as parent_name
             FROM children c
             JOIN team_members m ON m.id = c.team_member_id
             WHERE c.date_of_birth IS NOT NULL AND m.left_date IS NULL AND m.deleted_at IS NULL
             ORDER BY c.date_of_birth",
        )
        .map_err(|e| e.to_string())?;
    let rows: Vec<(String, String, String)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let today = chrono::Local::now().date_naive();
    let mut birthdays: Vec<serde_json::Value> = Vec::new();

    for (child_name, dob_str, parent_name) in rows {
        if let Ok(dob) = chrono::NaiveDate::parse_from_str(&dob_str, "%Y-%m-%d") {
            // Calculate next birthday
            let mut next_bday = dob.with_year(today.year()).unwrap_or(dob);
            if next_bday < today {
                next_bday = dob.with_year(today.year() + 1).unwrap_or(next_bday);
            }
            let days_until = (next_bday - today).num_days();
            if days_until <= 90 {
                birthdays.push(serde_json::json!({
                    "child_name": child_name,
                    "date_of_birth": dob_str,
                    "parent_name": parent_name,
                    "days_until": days_until
                }));
            }
        }
    }

    birthdays.sort_by_key(|b| b["days_until"].as_i64().unwrap_or(999));

    Ok(serde_json::json!({ "birthdays": birthdays }))
}

fn build_salary_over_time(conn: &rusqlite::Connection) -> Result<serde_json::Value, String> {
    let mut dp_stmt = conn
        .prepare(
            "SELECT id, name FROM salary_data_points WHERE scenario_group_id IS NULL AND deleted_at IS NULL ORDER BY id",
        )
        .map_err(|e| e.to_string())?;

    let data_points: Vec<(i64, String)> = dp_stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let mut member_stmt = conn
        .prepare(
            "SELECT sdpm.member_id, m.first_name, m.last_name, m.left_date,
                    COALESCE(SUM(sp.amount * sp.frequency), 0) as annual_total
             FROM salary_data_point_members sdpm
             JOIN team_members m ON m.id = sdpm.member_id
             LEFT JOIN salary_parts sp ON sp.data_point_member_id = sdpm.id
             WHERE sdpm.data_point_id = ?1 AND sdpm.is_active = 1
             GROUP BY sdpm.member_id
             ORDER BY m.last_name, m.first_name",
        )
        .map_err(|e| e.to_string())?;

    let mut points = Vec::new();
    for (dp_id, dp_name) in data_points {
        let members: Vec<serde_json::Value> = member_stmt
            .query_map(params![dp_id], |row| {
                Ok(serde_json::json!({
                    "member_id": row.get::<_, i64>(0)?,
                    "first_name": row.get::<_, String>(1)?,
                    "last_name": row.get::<_, String>(2)?,
                    "left_date": row.get::<_, Option<String>>(3)?,
                    "annual_total": row.get::<_, i64>(4)?
                }))
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;

        points.push(serde_json::json!({
            "data_point_id": dp_id,
            "data_point_name": dp_name,
            "members": members
        }));
    }

    Ok(serde_json::json!(points))
}

// ── Meeting commands ──

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Meeting {
    pub id: i64,
    pub team_member_id: i64,
    pub date: String,
    pub created_at: String,
    pub update_count: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MeetingTalkTopic {
    pub id: i64,
    pub team_member_id: i64,
    pub text: String,
    pub checked: bool,
    pub created_at: String,
    pub escalated: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MeetingDetail {
    pub id: i64,
    pub team_member_id: i64,
    pub date: String,
    pub member: MeetingMemberInfo,
    pub previous_updates: Vec<CheckableItem>,
    pub talk_topics: Vec<MeetingTalkTopic>,
    pub meeting_updates: Vec<CheckableItem>,
    pub meeting_talk_topics: Vec<MeetingTalkTopic>,
    pub escalated_with_response: Vec<EscalatedTopic>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MeetingMemberInfo {
    pub first_name: String,
    pub last_name: String,
    pub title_name: Option<String>,
    pub start_date: Option<String>,
    pub email: Option<String>,
    pub picture_path: Option<String>,
    pub lead_name: Option<String>,
}

#[tauri::command(rename_all = "snake_case")]
pub fn create_meeting(db: State<AppDb>, team_member_id: i64) -> Result<Meeting, String> {
    let guard = db.conn.lock();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute(
        "INSERT INTO meetings (team_member_id) VALUES (?1)",
        params![team_member_id],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    let (date, created_at): (String, String) = conn
        .query_row(
            "SELECT date, created_at FROM meetings WHERE id = ?1",
            params![id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| e.to_string())?;
    Ok(Meeting {
        id,
        team_member_id,
        date,
        created_at,
        update_count: 0,
    })
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_meetings(db: State<AppDb>, team_member_id: i64) -> Result<Vec<Meeting>, String> {
    let guard = db.conn.lock();
    let conn = guard.as_ref().ok_or("Database not open")?;
    let mut stmt = conn
        .prepare(
            "SELECT m.id, m.team_member_id, m.date, m.created_at,
                    (SELECT COUNT(*) FROM status_items si WHERE si.meeting_id = m.id) as update_count
             FROM meetings m
             WHERE m.team_member_id = ?1
             ORDER BY m.date DESC, m.created_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let meetings = stmt
        .query_map(params![team_member_id], |row| {
            Ok(Meeting {
                id: row.get(0)?,
                team_member_id: row.get(1)?,
                date: row.get(2)?,
                created_at: row.get(3)?,
                update_count: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(meetings)
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_meeting_detail(db: State<AppDb>, id: i64) -> Result<MeetingDetail, String> {
    let guard = db.conn.lock();
    let conn = guard.as_ref().ok_or("Database not open")?;

    let (meeting_id, team_member_id, date): (i64, i64, String) = conn
        .query_row(
            "SELECT id, team_member_id, date FROM meetings WHERE id = ?1",
            params![id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|e| e.to_string())?;

    // Member info
    let member: MeetingMemberInfo = conn
        .query_row(
            "SELECT m.first_name, m.last_name,
                    COALESCE(pt.name, t.name) as current_title,
                    m.start_date, m.email, m.picture_path,
                    lead.first_name || ' ' || lead.last_name as lead_name
             FROM team_members m
             LEFT JOIN titles t ON t.id = m.title_id
             LEFT JOIN (
                 SELECT sdpm.member_id, sdpm.promoted_title_id
                 FROM salary_data_point_members sdpm
                 INNER JOIN (
                     SELECT member_id, MAX(data_point_id) as max_dp_id
                     FROM salary_data_point_members
                     WHERE is_promoted = 1 AND promoted_title_id IS NOT NULL
                     GROUP BY member_id
                 ) latest ON sdpm.member_id = latest.member_id AND sdpm.data_point_id = latest.max_dp_id
             ) promo ON promo.member_id = m.id
             LEFT JOIN titles pt ON pt.id = promo.promoted_title_id
             LEFT JOIN team_members lead ON lead.id = m.lead_id
             WHERE m.id = ?1",
            params![team_member_id],
            |row| {
                Ok(MeetingMemberInfo {
                    first_name: row.get(0)?,
                    last_name: row.get(1)?,
                    title_name: row.get(2)?,
                    start_date: row.get(3)?,
                    email: row.get(4)?,
                    picture_path: row.get(5)?,
                    lead_name: row.get(6)?,
                })
            },
        )
        .map_err(|e| e.to_string())?;

    // Previous updates: unchecked status_items NOT from this meeting (recent first, limit 20)
    let mut prev_stmt = conn
        .prepare(
            "SELECT id, team_member_id, text, checked, created_at
             FROM status_items
             WHERE team_member_id = ?1 AND (meeting_id IS NULL OR meeting_id != ?2)
             ORDER BY created_at DESC
             LIMIT 20",
        )
        .map_err(|e| e.to_string())?;
    let previous_updates: Vec<CheckableItem> = prev_stmt
        .query_map(params![team_member_id, meeting_id], |row| {
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

    // Open talk topics (unchecked, not yet linked to this meeting)
    let mut topic_stmt = conn
        .prepare(
            "SELECT id, team_member_id, text, checked, created_at, escalated
             FROM talk_topics
             WHERE team_member_id = ?1 AND checked = 0 AND (meeting_id IS NULL OR meeting_id != ?2)
             ORDER BY created_at ASC",
        )
        .map_err(|e| e.to_string())?;
    let talk_topics: Vec<MeetingTalkTopic> = topic_stmt
        .query_map(params![team_member_id, meeting_id], |row| {
            Ok(MeetingTalkTopic {
                id: row.get(0)?,
                team_member_id: row.get(1)?,
                text: row.get(2)?,
                checked: row.get(3)?,
                created_at: row.get(4)?,
                escalated: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    // Updates created during this meeting
    let mut meeting_updates_stmt = conn
        .prepare(
            "SELECT id, team_member_id, text, checked, created_at
             FROM status_items
             WHERE meeting_id = ?1
             ORDER BY created_at ASC",
        )
        .map_err(|e| e.to_string())?;
    let meeting_updates: Vec<CheckableItem> = meeting_updates_stmt
        .query_map(params![meeting_id], |row| {
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

    // Talk topics checked off during this meeting
    let mut meeting_topics_stmt = conn
        .prepare(
            "SELECT id, team_member_id, text, checked, created_at, escalated
             FROM talk_topics
             WHERE meeting_id = ?1
             ORDER BY created_at ASC",
        )
        .map_err(|e| e.to_string())?;
    let meeting_talk_topics: Vec<MeetingTalkTopic> = meeting_topics_stmt
        .query_map(params![meeting_id], |row| {
            Ok(MeetingTalkTopic {
                id: row.get(0)?,
                team_member_id: row.get(1)?,
                text: row.get(2)?,
                checked: row.get(3)?,
                created_at: row.get(4)?,
                escalated: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    // Escalated topics that have been discussed (escalated=1, resolved=0) for this member
    let mut escalated_stmt = conn
        .prepare(
            "SELECT id, team_member_id, text, checked, escalated, escalated_at,
                    resolved, resolved_at, created_at
             FROM talk_topics
             WHERE team_member_id = ?1 AND escalated = 1 AND resolved = 0
                   AND team_meeting_id IS NOT NULL
             ORDER BY escalated_at ASC",
        )
        .map_err(|e| e.to_string())?;
    let escalated_with_response: Vec<EscalatedTopic> = escalated_stmt
        .query_map(params![team_member_id], |row| {
            Ok(EscalatedTopic {
                id: row.get(0)?,
                team_member_id: row.get(1)?,
                text: row.get(2)?,
                checked: row.get(3)?,
                escalated: row.get(4)?,
                escalated_at: row.get(5)?,
                resolved: row.get(6)?,
                resolved_at: row.get(7)?,
                created_at: row.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(MeetingDetail {
        id: meeting_id,
        team_member_id,
        date,
        member,
        previous_updates,
        talk_topics,
        meeting_updates,
        meeting_talk_topics,
        escalated_with_response,
    })
}

#[tauri::command(rename_all = "snake_case")]
pub fn add_meeting_update(
    db: State<AppDb>,
    meeting_id: i64,
    team_member_id: i64,
    text: String,
) -> Result<CheckableItem, String> {
    let guard = db.conn.lock();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute(
        "INSERT INTO status_items (team_member_id, text, meeting_id) VALUES (?1, ?2, ?3)",
        params![team_member_id, text, meeting_id],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    let created_at: String = conn
        .query_row(
            "SELECT created_at FROM status_items WHERE id = ?1",
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
pub fn check_talk_topic_in_meeting(
    db: State<AppDb>,
    topic_id: i64,
    meeting_id: i64,
    checked: bool,
) -> Result<(), String> {
    let guard = db.conn.lock();
    let conn = guard.as_ref().ok_or("Database not open")?;
    if checked {
        conn.execute(
            "UPDATE talk_topics SET checked = 1, meeting_id = ?1 WHERE id = ?2",
            params![meeting_id, topic_id],
        )
        .map_err(|e| e.to_string())?;
    } else {
        conn.execute(
            "UPDATE talk_topics SET checked = 0, meeting_id = NULL WHERE id = ?1",
            params![topic_id],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn delete_meeting(db: State<AppDb>, id: i64) -> Result<(), String> {
    let guard = db.conn.lock();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute("DELETE FROM meetings WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ── Team Meeting commands ──

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TeamMeeting {
    pub id: i64,
    pub date: String,
    pub created_at: String,
    pub escalated_topic_count: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EscalatedTopic {
    pub id: i64,
    pub team_member_id: i64,
    pub text: String,
    pub checked: bool,
    pub escalated: bool,
    pub escalated_at: Option<String>,
    pub resolved: bool,
    pub resolved_at: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TeamMeetingMemberGroup {
    pub member_id: i64,
    pub first_name: String,
    pub last_name: String,
    pub title_name: Option<String>,
    pub picture_path: Option<String>,
    pub escalated_topics: Vec<EscalatedTopic>,
    pub updates: Vec<ReportStatusItem>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TeamMeetingProjectGroup {
    pub project_id: i64,
    pub project_name: String,
    pub updates: Vec<ReportStatusItem>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TeamMeetingDetail {
    pub id: i64,
    pub date: String,
    pub member_groups: Vec<TeamMeetingMemberGroup>,
    pub project_groups: Vec<TeamMeetingProjectGroup>,
}

#[tauri::command(rename_all = "snake_case")]
pub fn create_team_meeting(db: State<AppDb>) -> Result<TeamMeeting, String> {
    let guard = db.conn.lock();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute("INSERT INTO team_meetings DEFAULT VALUES", [])
        .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    let (date, created_at): (String, String) = conn
        .query_row(
            "SELECT date, created_at FROM team_meetings WHERE id = ?1",
            params![id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| e.to_string())?;
    Ok(TeamMeeting {
        id,
        date,
        created_at,
        escalated_topic_count: 0,
    })
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_team_meetings(db: State<AppDb>) -> Result<Vec<TeamMeeting>, String> {
    let guard = db.conn.lock();
    let conn = guard.as_ref().ok_or("Database not open")?;
    let mut stmt = conn
        .prepare(
            "SELECT tm.id, tm.date, tm.created_at,
                    (SELECT COUNT(*) FROM talk_topics tt WHERE tt.team_meeting_id = tm.id) as topic_count
             FROM team_meetings tm
             ORDER BY tm.date DESC, tm.created_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let meetings = stmt
        .query_map([], |row| {
            Ok(TeamMeeting {
                id: row.get(0)?,
                date: row.get(1)?,
                created_at: row.get(2)?,
                escalated_topic_count: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(meetings)
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_team_meeting_detail(db: State<AppDb>, id: i64) -> Result<TeamMeetingDetail, String> {
    let guard = db.conn.lock();
    let conn = guard.as_ref().ok_or("Database not open")?;

    let date: String = conn
        .query_row(
            "SELECT date FROM team_meetings WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    // Get all escalated + unresolved topics, grouped by member
    let mut topic_stmt = conn
        .prepare(
            "SELECT tt.id, tt.team_member_id, tt.text, tt.checked, tt.escalated,
                    tt.escalated_at, tt.resolved, tt.resolved_at, tt.created_at,
                    m.first_name, m.last_name,
                    COALESCE(pt.name, t.name) as current_title,
                    m.picture_path
             FROM talk_topics tt
             INNER JOIN team_members m ON m.id = tt.team_member_id
             LEFT JOIN titles t ON t.id = m.title_id
             LEFT JOIN (
                 SELECT sdpm.member_id, sdpm.promoted_title_id
                 FROM salary_data_point_members sdpm
                 INNER JOIN (
                     SELECT member_id, MAX(data_point_id) as max_dp_id
                     FROM salary_data_point_members
                     WHERE is_promoted = 1 AND promoted_title_id IS NOT NULL
                     GROUP BY member_id
                 ) latest ON sdpm.member_id = latest.member_id AND sdpm.data_point_id = latest.max_dp_id
             ) promo ON promo.member_id = m.id
             LEFT JOIN titles pt ON pt.id = promo.promoted_title_id
             WHERE tt.escalated = 1 AND tt.resolved = 0 AND m.deleted_at IS NULL
             ORDER BY m.last_name ASC, m.first_name ASC, tt.created_at ASC",
        )
        .map_err(|e| e.to_string())?;

    #[allow(clippy::type_complexity)]
    let topic_rows: Vec<(
        EscalatedTopic,
        i64,
        String,
        String,
        Option<String>,
        Option<String>,
    )> = topic_stmt
        .query_map([], |row| {
            Ok((
                EscalatedTopic {
                    id: row.get(0)?,
                    team_member_id: row.get(1)?,
                    text: row.get(2)?,
                    checked: row.get(3)?,
                    escalated: row.get(4)?,
                    escalated_at: row.get(5)?,
                    resolved: row.get(6)?,
                    resolved_at: row.get(7)?,
                    created_at: row.get(8)?,
                },
                row.get::<_, i64>(1)?,             // member_id
                row.get::<_, String>(9)?,          // first_name
                row.get::<_, String>(10)?,         // last_name
                row.get::<_, Option<String>>(11)?, // title_name
                row.get::<_, Option<String>>(12)?, // picture_path
            ))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    // Group topics by member, preserving order
    let mut member_groups: Vec<TeamMeetingMemberGroup> = Vec::new();
    let mut seen_members: HashMap<i64, usize> = HashMap::new();

    for (topic, member_id, first_name, last_name, title_name, picture_path) in topic_rows {
        if let Some(&idx) = seen_members.get(&member_id) {
            member_groups[idx].escalated_topics.push(topic);
        } else {
            seen_members.insert(member_id, member_groups.len());
            member_groups.push(TeamMeetingMemberGroup {
                member_id,
                first_name,
                last_name,
                title_name,
                picture_path,
                escalated_topics: vec![topic],
                updates: Vec::new(),
            });
        }
    }

    // Get member updates (status_items) for all members who have escalated topics,
    // plus all other members with unchecked updates
    let mut update_stmt = conn
        .prepare(
            "SELECT si.team_member_id, si.id, si.text, si.checked,
                    m.first_name, m.last_name,
                    COALESCE(pt.name, t.name) as current_title,
                    m.picture_path
             FROM status_items si
             INNER JOIN team_members m ON m.id = si.team_member_id
             LEFT JOIN titles t ON t.id = m.title_id
             LEFT JOIN (
                 SELECT sdpm.member_id, sdpm.promoted_title_id
                 FROM salary_data_point_members sdpm
                 INNER JOIN (
                     SELECT member_id, MAX(data_point_id) as max_dp_id
                     FROM salary_data_point_members
                     WHERE is_promoted = 1 AND promoted_title_id IS NOT NULL
                     GROUP BY member_id
                 ) latest ON sdpm.member_id = latest.member_id AND sdpm.data_point_id = latest.max_dp_id
             ) promo ON promo.member_id = m.id
             LEFT JOIN titles pt ON pt.id = promo.promoted_title_id
             WHERE m.deleted_at IS NULL
             ORDER BY m.last_name ASC, m.first_name ASC, si.created_at DESC",
        )
        .map_err(|e| e.to_string())?;

    #[allow(clippy::type_complexity)]
    let update_rows: Vec<(
        i64,
        ReportStatusItem,
        String,
        String,
        Option<String>,
        Option<String>,
    )> = update_stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?, // member_id
                ReportStatusItem {
                    id: row.get(1)?,
                    text: row.get(2)?,
                    checked: row.get(3)?,
                },
                row.get::<_, String>(4)?,         // first_name
                row.get::<_, String>(5)?,         // last_name
                row.get::<_, Option<String>>(6)?, // title_name
                row.get::<_, Option<String>>(7)?, // picture_path
            ))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    for (member_id, update, first_name, last_name, title_name, picture_path) in update_rows {
        if let Some(&idx) = seen_members.get(&member_id) {
            member_groups[idx].updates.push(update);
        } else {
            seen_members.insert(member_id, member_groups.len());
            member_groups.push(TeamMeetingMemberGroup {
                member_id,
                first_name,
                last_name,
                title_name,
                picture_path,
                escalated_topics: Vec::new(),
                updates: vec![update],
            });
        }
    }

    // Get active project updates
    let mut proj_stmt = conn
        .prepare(
            "SELECT p.id, p.name, psi.id, psi.text, psi.checked
             FROM projects p
             LEFT JOIN project_status_items psi ON psi.project_id = p.id
             WHERE p.end_date IS NULL OR p.end_date >= date('now')
             ORDER BY p.name ASC, psi.created_at DESC",
        )
        .map_err(|e| e.to_string())?;

    #[allow(clippy::type_complexity)]
    let proj_rows: Vec<(i64, String, Option<i64>, Option<String>, Option<bool>)> = proj_stmt
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

    let mut project_groups: Vec<TeamMeetingProjectGroup> = Vec::new();
    let mut seen_projects: HashMap<i64, usize> = HashMap::new();

    for (project_id, project_name, status_id, status_text, status_checked) in proj_rows {
        let idx = if let Some(&idx) = seen_projects.get(&project_id) {
            idx
        } else {
            seen_projects.insert(project_id, project_groups.len());
            project_groups.push(TeamMeetingProjectGroup {
                project_id,
                project_name,
                updates: Vec::new(),
            });
            project_groups.len() - 1
        };

        if let (Some(sid), Some(stext), Some(schecked)) = (status_id, status_text, status_checked) {
            project_groups[idx].updates.push(ReportStatusItem {
                id: sid,
                text: stext,
                checked: schecked,
            });
        }
    }

    Ok(TeamMeetingDetail {
        id,
        date,
        member_groups,
        project_groups,
    })
}

#[tauri::command(rename_all = "snake_case")]
pub fn delete_team_meeting(db: State<AppDb>, id: i64) -> Result<(), String> {
    let guard = db.conn.lock();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute("DELETE FROM team_meetings WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn escalate_talk_topic(db: State<AppDb>, topic_id: i64) -> Result<(), String> {
    let guard = db.conn.lock();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute(
        "UPDATE talk_topics SET escalated = 1, escalated_at = datetime('now') WHERE id = ?1",
        params![topic_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn unescalate_talk_topic(db: State<AppDb>, topic_id: i64) -> Result<(), String> {
    let guard = db.conn.lock();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute(
        "UPDATE talk_topics SET escalated = 0, escalated_at = NULL, team_meeting_id = NULL WHERE id = ?1",
        params![topic_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn resolve_escalated_topic(db: State<AppDb>, topic_id: i64) -> Result<(), String> {
    let guard = db.conn.lock();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute(
        "UPDATE talk_topics SET resolved = 1, resolved_at = datetime('now') WHERE id = ?1",
        params![topic_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn unresolve_escalated_topic(db: State<AppDb>, topic_id: i64) -> Result<(), String> {
    let guard = db.conn.lock();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute(
        "UPDATE talk_topics SET resolved = 0, resolved_at = NULL WHERE id = ?1",
        params![topic_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
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

// ── Data Point Salary Export / Import ──

#[derive(Serialize, Deserialize)]
struct SalaryExportMember {
    email: String,
    first_name: String,
    last_name: String,
    parts: Vec<SalaryExportPart>,
}

#[derive(Serialize, Deserialize)]
struct SalaryExportPart {
    name: Option<String>,
    amount: f64,
    frequency: i64,
    is_variable: bool,
}

#[derive(Serialize, Deserialize)]
struct SalaryExportData {
    data_point_name: String,
    members: Vec<SalaryExportMember>,
}

#[tauri::command(rename_all = "snake_case")]
pub fn export_data_point_salaries(
    db: State<AppDb>,
    data_point_id: i64,
    file_path: String,
) -> Result<(), String> {
    let guard = db.conn.lock();
    let conn = guard.as_ref().ok_or("Database not open")?;

    let dp_name: String = conn
        .query_row(
            "SELECT name FROM salary_data_points WHERE id = ?1",
            params![data_point_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT sdpm.id, tm.email, tm.first_name, tm.last_name
             FROM salary_data_point_members sdpm
             JOIN team_members tm ON tm.id = sdpm.member_id
             WHERE sdpm.data_point_id = ?1
             ORDER BY tm.last_name, tm.first_name",
        )
        .map_err(|e| e.to_string())?;

    let rows: Vec<(i64, Option<String>, String, String)> = stmt
        .query_map(params![data_point_id], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let mut members = Vec::new();
    for (sdpm_id, email, first_name, last_name) in rows {
        let mut parts_stmt = conn
            .prepare(
                "SELECT name, amount, frequency, is_variable FROM salary_parts
                 WHERE data_point_member_id = ?1 ORDER BY sort_order",
            )
            .map_err(|e| e.to_string())?;
        let parts: Vec<SalaryExportPart> = parts_stmt
            .query_map(params![sdpm_id], |row| {
                let amount_cents: i64 = row.get(1)?;
                Ok(SalaryExportPart {
                    name: row.get(0)?,
                    amount: amount_cents as f64 / 100.0,
                    frequency: row.get(2)?,
                    is_variable: row.get(3)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;

        members.push(SalaryExportMember {
            email: email.unwrap_or_default(),
            first_name,
            last_name,
            parts,
        });
    }

    let data = SalaryExportData {
        data_point_name: dp_name,
        members,
    };
    let json =
        serde_json::to_string_pretty(&data).map_err(|e| format!("Failed to serialize: {}", e))?;
    std::fs::write(&file_path, json).map_err(|e| format!("Failed to write file: {}", e))?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn import_data_point_salaries(
    db: State<AppDb>,
    data_point_id: i64,
    file_path: String,
) -> Result<String, String> {
    let json =
        std::fs::read_to_string(&file_path).map_err(|e| format!("Failed to read file: {}", e))?;
    let data: SalaryExportData =
        serde_json::from_str(&json).map_err(|e| format!("Failed to parse file: {}", e))?;

    let guard = db.conn.lock();
    let conn = guard.as_ref().ok_or("Database not open")?;

    conn.execute_batch("BEGIN").map_err(|e| e.to_string())?;

    let result: Result<String, String> = (|| {
        let mut updated = 0;
        let mut skipped = Vec::new();

        for member in &data.members {
            // Find team member by email
            let tm_id: Option<i64> = if member.email.is_empty() {
                None
            } else {
                conn.query_row(
                    "SELECT id FROM team_members WHERE email = ?1 AND deleted_at IS NULL",
                    params![member.email],
                    |row| row.get(0),
                )
                .ok()
            };

            let tm_id = match tm_id {
                Some(id) => id,
                None => {
                    skipped.push(format!(
                        "{} {} ({})",
                        member.first_name,
                        member.last_name,
                        if member.email.is_empty() {
                            "no email"
                        } else {
                            "email not found"
                        }
                    ));
                    continue;
                }
            };

            // Find their salary_data_point_member entry
            let sdpm_id: Option<i64> = conn
                .query_row(
                    "SELECT id FROM salary_data_point_members WHERE data_point_id = ?1 AND member_id = ?2",
                    params![data_point_id, tm_id],
                    |row| row.get(0),
                )
                .ok();

            let sdpm_id = match sdpm_id {
                Some(id) => id,
                None => {
                    skipped.push(format!(
                        "{} {} (not in data point)",
                        member.first_name, member.last_name
                    ));
                    continue;
                }
            };

            // Delete existing salary parts
            conn.execute(
                "DELETE FROM salary_parts WHERE data_point_member_id = ?1",
                params![sdpm_id],
            )
            .map_err(|e| e.to_string())?;

            // Insert new salary parts
            for (i, part) in member.parts.iter().enumerate() {
                let amount_cents = (part.amount * 100.0).round() as i64;
                conn.execute(
                    "INSERT INTO salary_parts (data_point_member_id, name, amount, frequency, is_variable, sort_order)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                    params![sdpm_id, part.name, amount_cents, part.frequency, part.is_variable, i as i64],
                )
                .map_err(|e| e.to_string())?;
            }

            updated += 1;
        }

        let mut msg = format!("Updated {} member(s)", updated);
        if !skipped.is_empty() {
            msg.push_str(&format!(". Skipped: {}", skipped.join(", ")));
        }
        Ok(msg)
    })();

    match &result {
        Ok(_) => conn.execute_batch("COMMIT").map_err(|e| e.to_string())?,
        Err(_) => {
            if let Err(e) = conn.execute_batch("ROLLBACK") {
                eprintln!("[WARN] ROLLBACK failed: {}", e);
            }
        }
    }

    result
}

// ── Export / Import commands ──

#[tauri::command(rename_all = "snake_case")]
pub fn export_data(db: State<AppDb>, file_path: String) -> Result<(), String> {
    let guard = db.conn.lock();
    let conn = guard.as_ref().ok_or("Database not open")?;
    let data = crate::export_import::export_all_data(conn)?;
    let json = serde_json::to_string_pretty(&data)
        .map_err(|e| format!("Failed to serialize data: {}", e))?;
    std::fs::write(&file_path, json).map_err(|e| format!("Failed to write file: {}", e))?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn import_data(db: State<AppDb>, file_path: String, mode: String) -> Result<(), String> {
    let json =
        std::fs::read_to_string(&file_path).map_err(|e| format!("Failed to read file: {}", e))?;
    let data: crate::export_import::ExportData =
        serde_json::from_str(&json).map_err(|e| format!("Failed to parse import file: {}", e))?;
    if data.version != 1 {
        return Err(format!("Unsupported export version: {}", data.version));
    }
    let guard = db.conn.lock();
    let conn = guard.as_ref().ok_or("Database not open")?;
    crate::export_import::import_all_data(conn, data, &mode)
}

// ── Global search ──

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SearchResult {
    pub id: i64,
    pub category: String,
    pub title: String,
    pub subtitle: Option<String>,
    pub parent_id: Option<i64>,
}

#[tauri::command(rename_all = "snake_case")]
pub fn global_search(db: State<AppDb>, query: String) -> Result<Vec<SearchResult>, String> {
    let guard = db.conn.lock();
    let conn = guard.as_ref().ok_or("Database not open")?;

    if query.trim().len() < 2 {
        return Ok(vec![]);
    }

    let pattern = format!("%{}%", query.trim());

    let mut stmt = conn
        .prepare(
            "SELECT id, 'team_member' AS category,
                    first_name || ' ' || last_name AS title,
                    (SELECT name FROM titles WHERE id = m.title_id) AS subtitle,
                    NULL AS parent_id
             FROM team_members m
             WHERE m.deleted_at IS NULL AND (first_name LIKE ?1 OR last_name LIKE ?1 OR email LIKE ?1
                   OR (first_name || ' ' || last_name) LIKE ?1 OR notes LIKE ?1)

             UNION ALL

             SELECT id, 'project', name, SUBSTR(notes, 1, 60), NULL
             FROM projects
             WHERE name LIKE ?1 OR notes LIKE ?1

             UNION ALL

             SELECT id, 'title', name, NULL, NULL
             FROM titles
             WHERE deleted_at IS NULL AND name LIKE ?1

             UNION ALL

             SELECT id, 'report', name, NULL, NULL
             FROM reports
             WHERE name LIKE ?1

             UNION ALL

             SELECT tt.id, 'talk_topic', tt.text,
                    m2.first_name || ' ' || m2.last_name,
                    tt.team_member_id
             FROM talk_topics tt
             JOIN team_members m2 ON m2.id = tt.team_member_id
             WHERE m2.deleted_at IS NULL AND tt.text LIKE ?1

             UNION ALL

             SELECT si.id, 'status_item', si.text,
                    m3.first_name || ' ' || m3.last_name,
                    si.team_member_id
             FROM status_items si
             JOIN team_members m3 ON m3.id = si.team_member_id
             WHERE m3.deleted_at IS NULL AND si.text LIKE ?1

             UNION ALL

             SELECT id, 'salary_data_point', name, NULL, NULL
             FROM salary_data_points
             WHERE deleted_at IS NULL AND name LIKE ?1

             UNION ALL

             SELECT id, 'scenario_group', name, NULL, NULL
             FROM scenario_groups
             WHERE deleted_at IS NULL AND name LIKE ?1

             LIMIT 50",
        )
        .map_err(|e| e.to_string())?;

    let results = stmt
        .query_map(params![pattern], |row| {
            Ok(SearchResult {
                id: row.get(0)?,
                category: row.get(1)?,
                title: row.get(2)?,
                subtitle: row.get(3)?,
                parent_id: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(results)
}

// ── Salary Template / DOCX Export ──

fn get_templates_dir() -> Result<std::path::PathBuf, String> {
    let templates_dir = get_app_data_dir()?.join("templates");
    std::fs::create_dir_all(&templates_dir)
        .map_err(|e| format!("Failed to create templates directory: {}", e))?;
    Ok(templates_dir)
}

#[tauri::command(rename_all = "snake_case")]
pub fn upload_salary_template(
    db: State<AppDb>,
    data_point_id: i64,
    file_path: String,
) -> Result<(), String> {
    let templates_dir = get_templates_dir()?;
    let filename = format!("dp_{}.docx", data_point_id);
    let dest_path = templates_dir.join(&filename);

    std::fs::copy(&file_path, &dest_path).map_err(|e| format!("Failed to copy template: {}", e))?;

    let guard = db.conn.lock();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute(
        "UPDATE salary_data_points SET template_path = ?1 WHERE id = ?2",
        params![filename, data_point_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn delete_salary_template(db: State<AppDb>, data_point_id: i64) -> Result<(), String> {
    let guard = db.conn.lock();
    let conn = guard.as_ref().ok_or("Database not open")?;

    let template_path: Option<String> = conn
        .query_row(
            "SELECT template_path FROM salary_data_points WHERE id = ?1",
            params![data_point_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    if let Some(filename) = template_path {
        let templates_dir = get_templates_dir()?;
        let file = templates_dir.join(&filename);
        if file.exists() {
            std::fs::remove_file(&file).map_err(|e| format!("Failed to delete template: {}", e))?;
        }
    }

    conn.execute(
        "UPDATE salary_data_points SET template_path = NULL WHERE id = ?1",
        params![data_point_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

fn format_cents_for_template(cents: i64) -> String {
    let euros = cents as f64 / 100.0;
    let whole = (euros.abs().floor()) as i64;
    let frac = ((euros.abs() - whole as f64) * 100.0).round() as i64;

    let whole_str = {
        let s = whole.to_string();
        let mut result = String::new();
        for (i, c) in s.chars().rev().enumerate() {
            if i > 0 && i % 3 == 0 {
                result.push('.');
            }
            result.push(c);
        }
        result.chars().rev().collect::<String>()
    };

    if frac > 0 {
        format!("{},{:02} \u{20ac}", whole_str, frac)
    } else {
        format!("{} \u{20ac}", whole_str)
    }
}

#[tauri::command(rename_all = "snake_case")]
pub fn export_member_salary_docx(
    db: State<AppDb>,
    data_point_id: i64,
    member_id: i64,
    output_path: String,
) -> Result<(), String> {
    let guard = db.conn.lock();
    let conn = guard.as_ref().ok_or("Database not open")?;

    // Get template path
    let template_path: Option<String> = conn
        .query_row(
            "SELECT template_path FROM salary_data_points WHERE id = ?1",
            params![data_point_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let template_filename = template_path.ok_or("No template uploaded for this data point")?;
    let templates_dir = get_templates_dir()?;
    let template_file = templates_dir.join(&template_filename);

    if !template_file.exists() {
        return Err("Template file not found".into());
    }

    // Get data point name
    let dp_name: String = conn
        .query_row(
            "SELECT name FROM salary_data_points WHERE id = ?1",
            params![data_point_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    // Get member data
    let (first_name, last_name, title_name, start_date, email): (
        String,
        String,
        Option<String>,
        Option<String>,
        Option<String>,
    ) = conn
        .query_row(
            "SELECT m.first_name, m.last_name, t.name, m.start_date, m.email
             FROM salary_data_point_members sdpm
             JOIN team_members m ON m.id = sdpm.member_id
             LEFT JOIN titles t ON t.id = m.title_id
             WHERE sdpm.data_point_id = ?1 AND sdpm.member_id = ?2",
            params![data_point_id, member_id],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                ))
            },
        )
        .map_err(|e| format!("Member not found in data point: {}", e))?;

    // Check if promoted
    let (is_promoted, promoted_title_name): (bool, Option<String>) = conn
        .query_row(
            "SELECT sdpm.is_promoted, pt.name
             FROM salary_data_point_members sdpm
             LEFT JOIN titles pt ON pt.id = sdpm.promoted_title_id
             WHERE sdpm.data_point_id = ?1 AND sdpm.member_id = ?2",
            params![data_point_id, member_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| e.to_string())?;

    let effective_title = if is_promoted {
        promoted_title_name.or(title_name.clone())
    } else {
        title_name.clone()
    };

    // Get salary parts
    let sdpm_id: i64 = conn
        .query_row(
            "SELECT id FROM salary_data_point_members WHERE data_point_id = ?1 AND member_id = ?2",
            params![data_point_id, member_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let mut parts_stmt = conn
        .prepare(
            "SELECT name, amount, frequency, is_variable FROM salary_parts
             WHERE data_point_member_id = ?1 ORDER BY sort_order ASC",
        )
        .map_err(|e| e.to_string())?;

    struct PartInfo {
        name: Option<String>,
        amount: i64,
        frequency: i64,
        is_variable: bool,
    }

    let parts: Vec<PartInfo> = parts_stmt
        .query_map(params![sdpm_id], |row| {
            Ok(PartInfo {
                name: row.get(0)?,
                amount: row.get(1)?,
                frequency: row.get(2)?,
                is_variable: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let annual_total: i64 = parts.iter().map(|p| p.amount * p.frequency).sum();
    let fixed_total: i64 = parts
        .iter()
        .filter(|p| !p.is_variable)
        .map(|p| p.amount * p.frequency)
        .sum();
    let variable_total: i64 = parts
        .iter()
        .filter(|p| p.is_variable)
        .map(|p| p.amount * p.frequency)
        .sum();

    // Build plain text parts list
    let parts_text: String = parts
        .iter()
        .map(|p| {
            let name = p.name.clone().unwrap_or_else(|| "Unnamed".to_string());
            let annual = format_cents_for_template(p.amount * p.frequency);
            let var_label = if p.is_variable { " (variable)" } else { "" };
            format!("{}: {}{}", name, annual, var_label)
        })
        .collect::<Vec<_>>()
        .join(", ");

    // Build replacements map
    let replacements: Vec<(&str, String)> = vec![
        ("{{first_name}}", first_name.clone()),
        ("{{last_name}}", last_name.clone()),
        ("{{full_name}}", format!("{} {}", first_name, last_name)),
        ("{{title}}", effective_title.unwrap_or_default()),
        ("{{original_title}}", title_name.unwrap_or_default()),
        ("{{email}}", email.unwrap_or_default()),
        ("{{start_date}}", start_date.unwrap_or_default()),
        ("{{data_point_name}}", dp_name),
        ("{{annual_total}}", format_cents_for_template(annual_total)),
        ("{{fixed_total}}", format_cents_for_template(fixed_total)),
        (
            "{{variable_total}}",
            format_cents_for_template(variable_total),
        ),
        ("{{parts_text}}", parts_text),
    ];

    // Build condition context for {{#if var}} blocks
    let mut if_context: std::collections::HashMap<String, String> =
        std::collections::HashMap::new();
    // All template variables are available as conditions (truthy if non-empty)
    for (placeholder, value) in &replacements {
        // Strip {{ and }} to get the variable name
        let name = &placeholder[2..placeholder.len() - 2];
        if_context.insert(name.to_string(), value.clone());
    }
    // Additional boolean conditions
    if_context.insert(
        "is_promoted".to_string(),
        if is_promoted {
            "true".to_string()
        } else {
            String::new()
        },
    );
    if_context.insert(
        "has_variable_parts".to_string(),
        if variable_total > 0 {
            "true".to_string()
        } else {
            String::new()
        },
    );
    // part_count so templates can check {{#if part_3_name}} etc.
    if_context.insert("part_count".to_string(), parts.len().to_string());

    // Add individual salary part placeholders: {{part_1_name}}, {{part_1_amount}}, etc.
    let mut extra_replacements: Vec<(String, String)> = Vec::new();
    for (i, p) in parts.iter().enumerate() {
        let n = i + 1;
        extra_replacements.push((
            format!("{{{{part_{}_name}}}}", n),
            p.name.clone().unwrap_or_default(),
        ));
        extra_replacements.push((
            format!("{{{{part_{}_amount}}}}", n),
            format_cents_for_template(p.amount),
        ));
        extra_replacements.push((
            format!("{{{{part_{}_frequency}}}}", n),
            p.frequency.to_string(),
        ));
        extra_replacements.push((
            format!("{{{{part_{}_annual}}}}", n),
            format_cents_for_template(p.amount * p.frequency),
        ));
        extra_replacements.push((
            format!("{{{{part_{}_type}}}}", n),
            if p.is_variable {
                "Variable".to_string()
            } else {
                "Fixed".to_string()
            },
        ));
    }

    // Add extra replacement variables to if_context
    for (placeholder, value) in &extra_replacements {
        let name = &placeholder[2..placeholder.len() - 2];
        if_context.insert(name.to_string(), value.clone());
    }

    // Process DOCX (ZIP) file - replace placeholders in XML files
    let template_bytes =
        std::fs::read(&template_file).map_err(|e| format!("Failed to read template: {}", e))?;

    let reader = std::io::Cursor::new(&template_bytes);
    let mut archive = zip::ZipArchive::new(reader)
        .map_err(|e| format!("Failed to open template as ZIP: {}", e))?;

    let output_file = std::fs::File::create(&output_path)
        .map_err(|e| format!("Failed to create output file: {}", e))?;
    let mut writer = zip::ZipWriter::new(output_file);

    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = file.name().to_string();

        let mut content = Vec::new();
        std::io::Read::read_to_end(&mut file, &mut content).map_err(|e| e.to_string())?;

        // Only process XML files in the docx
        let should_process = name.ends_with(".xml") || name.ends_with(".xml.rels");

        let final_content = if should_process {
            let mut text = String::from_utf8(content)
                .map_err(|e| format!("Invalid UTF-8 in {}: {}", name, e))?;

            for (placeholder, value) in &replacements {
                let escaped = value
                    .replace('&', "&amp;")
                    .replace('<', "&lt;")
                    .replace('>', "&gt;")
                    .replace('"', "&quot;")
                    .replace('\'', "&apos;");
                text = text.replace(placeholder, &escaped);
            }
            for (placeholder, value) in &extra_replacements {
                let escaped = value
                    .replace('&', "&amp;")
                    .replace('<', "&lt;")
                    .replace('>', "&gt;")
                    .replace('"', "&quot;")
                    .replace('\'', "&apos;");
                text = text.replace(placeholder, &escaped);
            }

            // Handle split placeholders
            let text = collapse_split_placeholders(&text, &replacements, &extra_replacements);

            // Process {{#if var}}...{{else}}...{{/if}} conditional blocks
            let text = process_if_blocks(&text, &if_context);

            text.into_bytes()
        } else {
            content
        };

        let options = zip::write::SimpleFileOptions::default()
            .compression_method(file.compression())
            .large_file(file.size() > u32::MAX as u64);

        writer
            .start_file(&name, options)
            .map_err(|e| format!("Failed to write to output: {}", e))?;
        std::io::Write::write_all(&mut writer, &final_content)
            .map_err(|e| format!("Failed to write content: {}", e))?;
    }

    writer
        .finish()
        .map_err(|e| format!("Failed to finalize output: {}", e))?;

    Ok(())
}

/// Handle placeholders that Word may have split across multiple XML runs.
fn collapse_split_placeholders(
    xml: &str,
    replacements: &[(&str, String)],
    extra_replacements: &[(String, String)],
) -> String {
    if !xml.contains("{{") {
        return xml.to_string();
    }

    let result = xml.to_string();
    let mut output = String::with_capacity(result.len());
    let mut pos = 0;

    while pos < result.len() {
        if let Some(p_start) = result[pos..]
            .find("<w:p>")
            .or_else(|| result[pos..].find("<w:p "))
        {
            let p_start = pos + p_start;
            if let Some(p_end_rel) = result[p_start..].find("</w:p>") {
                let p_end = p_start + p_end_rel + "</w:p>".len();
                let paragraph = &result[p_start..p_end];

                // Extract all text content from <w:t> tags
                let mut full_text = String::new();
                let mut t_pos = 0;
                while t_pos < paragraph.len() {
                    if let Some(t_start) =
                        paragraph[t_pos..].find("<w:t>").map(|p| p + 5).or_else(|| {
                            paragraph[t_pos..]
                                .find("<w:t ")
                                .and_then(|p| paragraph[t_pos + p..].find('>').map(|q| p + q + 1))
                        })
                    {
                        let t_start = t_pos + t_start;
                        if let Some(t_end) = paragraph[t_start..].find("</w:t>") {
                            full_text.push_str(&paragraph[t_start..t_start + t_end]);
                            t_pos = t_start + t_end + "</w:t>".len();
                        } else {
                            break;
                        }
                    } else {
                        break;
                    }
                }

                let mut has_placeholder = false;
                let mut replaced_text = full_text.clone();
                for (placeholder, value) in replacements {
                    if replaced_text.contains(placeholder) {
                        let escaped = value
                            .replace('&', "&amp;")
                            .replace('<', "&lt;")
                            .replace('>', "&gt;")
                            .replace('"', "&quot;")
                            .replace('\'', "&apos;");
                        replaced_text = replaced_text.replace(placeholder, &escaped);
                        has_placeholder = true;
                    }
                }
                for (placeholder, value) in extra_replacements {
                    if replaced_text.contains(placeholder) {
                        let escaped = value
                            .replace('&', "&amp;")
                            .replace('<', "&lt;")
                            .replace('>', "&gt;")
                            .replace('"', "&quot;")
                            .replace('\'', "&apos;");
                        replaced_text = replaced_text.replace(placeholder, &escaped);
                        has_placeholder = true;
                    }
                }

                if has_placeholder {
                    let ppr = extract_tag(paragraph, "w:pPr");
                    let rpr = extract_first_rpr(paragraph);

                    let new_paragraph = format!(
                        "<w:p>{}<w:r>{}<w:t xml:space=\"preserve\">{}</w:t></w:r></w:p>",
                        ppr.unwrap_or_default(),
                        rpr.unwrap_or_default(),
                        replaced_text,
                    );
                    output.push_str(&result[pos..p_start]);
                    output.push_str(&new_paragraph);
                } else {
                    output.push_str(&result[pos..p_end]);
                }
                pos = p_end;
                continue;
            }
        }
        output.push_str(&result[pos..]);
        break;
    }

    output
}

/// Process `{{#if var}}...{{else}}...{{/if}}` conditional blocks in template text.
///
/// Works on the full XML string after placeholder replacement. Handles both:
/// - Inline blocks (within a single `<w:t>` tag's text)
/// - Cross-paragraph blocks (spanning multiple `<w:p>` elements)
///
/// For cross-paragraph blocks, the paragraphs containing only the if/else/endif
/// tags are removed entirely. A variable is considered truthy if it exists in
/// the context map and is non-empty.
fn process_if_blocks(xml: &str, context: &std::collections::HashMap<String, String>) -> String {
    let mut result = xml.to_string();

    // Process from innermost blocks outward to handle nesting
    while let Some(if_tag_start) = find_innermost_if(&result) {
        let if_tag_end = match result[if_tag_start..].find("}}") {
            Some(p) => if_tag_start + p + 2,
            None => break,
        };

        // Extract variable name
        let tag_content = &result[if_tag_start + 6..if_tag_end - 2]; // skip "{{#if " and "}}"
        let var_name = tag_content.trim();

        // Find matching {{/if}}
        let endif_start = match result[if_tag_end..].find("{{/if}}") {
            Some(p) => if_tag_end + p,
            None => break,
        };
        let endif_end = endif_start + 7; // "{{/if}}".len()

        // Find optional {{else}} between if and endif
        let body = &result[if_tag_end..endif_start];
        let else_pos = body.find("{{else}}");

        let (if_body, else_body) = match else_pos {
            Some(ep) => (&body[..ep], &body[ep + 8..]), // 8 = "{{else}}".len()
            None => (body, ""),
        };

        // Evaluate condition: truthy if variable exists and is non-empty
        let is_truthy = context
            .get(var_name)
            .map(|v| !v.is_empty() && v != "0")
            .unwrap_or(false);

        let chosen_body = if is_truthy { if_body } else { else_body };

        // Build replacement — but first check if we should clean up whole paragraphs
        // containing only the if/else/endif tags
        let replacement = clean_if_block_paragraphs(
            &result,
            &IfBlockRange {
                if_start: if_tag_start,
                if_end: if_tag_end,
                endif_start,
                endif_end,
                else_range: else_pos.map(|ep| (if_tag_end + ep, if_tag_end + ep + 8)),
            },
            chosen_body,
            is_truthy,
        );

        match replacement {
            IfBlockReplacement::FullRange { start, end, text } => {
                result = format!("{}{}{}", &result[..start], text, &result[end..]);
            }
            IfBlockReplacement::Simple(text) => {
                result = format!(
                    "{}{}{}",
                    &result[..if_tag_start],
                    text,
                    &result[endif_end..]
                );
            }
        }
    }

    result
}

/// Find the start position of the innermost `{{#if ...}}` (one that has no nested `{{#if` before its `{{/if}}`).
fn find_innermost_if(xml: &str) -> Option<usize> {
    let mut last_if = None;
    let mut search_start = 0;

    while let Some(pos) = xml[search_start..].find("{{#if ") {
        let abs_pos = search_start + pos;
        // Check if there's a {{/if}} before the next {{#if}}
        let after = abs_pos + 6;
        let next_if = xml[after..].find("{{#if ");
        let next_endif = xml[after..].find("{{/if}}");

        match (next_if, next_endif) {
            (Some(ni), Some(ne)) if ni < ne => {
                // There's another #if before the endif — this one isn't innermost, keep searching
                last_if = Some(abs_pos);
                search_start = after;
            }
            _ => {
                // This #if's endif comes before any nested #if — it's innermost
                return Some(abs_pos);
            }
        }
    }

    // If we found #if tags but none were "innermost" by the above logic,
    // return the last one found (it must be innermost since we exhausted the search)
    last_if
}

enum IfBlockReplacement {
    /// Replace a wider range (e.g., including surrounding paragraph tags)
    FullRange {
        start: usize,
        end: usize,
        text: String,
    },
    /// Simple inline replacement (just the if-tag to endif-tag range)
    Simple(String),
}

struct IfBlockRange {
    if_start: usize,
    if_end: usize,
    endif_start: usize,
    endif_end: usize,
    else_range: Option<(usize, usize)>,
}

/// Determine whether to remove whole `<w:p>` paragraphs that contain only the if/else/endif tags,
/// or just do inline replacement.
fn clean_if_block_paragraphs(
    xml: &str,
    range: &IfBlockRange,
    chosen_body: &str,
    is_truthy: bool,
) -> IfBlockReplacement {
    let IfBlockRange {
        if_start,
        if_end,
        endif_start,
        endif_end,
        else_range,
    } = *range;
    // Try to find enclosing <w:p> for the if-tag
    let if_para = find_enclosing_paragraph(xml, if_start, if_end);
    let endif_para = find_enclosing_paragraph(xml, endif_start, endif_end);

    // Check if the if/endif tags are the sole text content of their paragraphs
    let if_is_solo = if_para
        .map(|(ps, pe)| paragraph_text_is_only(xml, ps, pe, "{{#if "))
        .unwrap_or(false);
    let endif_is_solo = endif_para
        .map(|(ps, pe)| paragraph_text_is_only(xml, ps, pe, "{{/if}}"))
        .unwrap_or(false);

    // Check else paragraph too
    let else_is_solo = else_range
        .and_then(|(es, ee)| {
            find_enclosing_paragraph(xml, es, ee)
                .map(|(ps, pe)| paragraph_text_is_only(xml, ps, pe, "{{else}}"))
        })
        .unwrap_or(false);

    if if_is_solo && endif_is_solo {
        let (if_p_start, if_p_end) = if_para.unwrap();
        let (endif_p_start, endif_p_end) = endif_para.unwrap();

        if is_truthy {
            // Keep the if-body content, remove if-paragraph, endif-paragraph, and else-paragraph if solo
            let mut body_content = if let (Some((es, ee)), true) = (else_range, else_is_solo) {
                let else_para = find_enclosing_paragraph(xml, es, ee).unwrap();
                // Content is: between if-para-end and else-para-start + between else-para-end and endif-para-start
                format!(
                    "{}{}",
                    &xml[if_p_end..else_para.0],
                    &xml[else_para.1..endif_p_start]
                )
            } else if let Some((es, _ee)) = else_range {
                // else not solo — keep content from if-para end to else tag, drop else to endif
                xml[if_p_end..es].to_string()
            } else {
                xml[if_p_end..endif_p_start].to_string()
            };

            // Trim leading/trailing newlines from body
            if body_content.starts_with('\n') {
                body_content = body_content[1..].to_string();
            }
            if body_content.ends_with('\n') {
                body_content = body_content[..body_content.len() - 1].to_string();
            }

            IfBlockReplacement::FullRange {
                start: if_p_start,
                end: endif_p_end,
                text: body_content,
            }
        } else {
            // Keep the else-body content if present
            let body_content = if let (Some((_es, ee)), true) = (else_range, else_is_solo) {
                let else_para = find_enclosing_paragraph(xml, _es, ee).unwrap();
                xml[else_para.1..endif_p_start].to_string()
            } else if let Some((_es, ee)) = else_range {
                xml[ee..endif_p_start].to_string()
            } else {
                String::new()
            };

            IfBlockReplacement::FullRange {
                start: if_p_start,
                end: endif_p_end,
                text: body_content,
            }
        }
    } else {
        // Inline: just replace the tag range with chosen body
        IfBlockReplacement::Simple(chosen_body.to_string())
    }
}

/// Find the `<w:p>` ... `</w:p>` range enclosing a given position.
fn find_enclosing_paragraph(xml: &str, start: usize, end: usize) -> Option<(usize, usize)> {
    // Search backwards from start for <w:p> or <w:p ...>
    let before = &xml[..start];
    let p_open = before.rfind("<w:p>").or_else(|| before.rfind("<w:p "));
    let p_open = p_open?;

    // Search forward from end for </w:p>
    let after_pos = xml[end..].find("</w:p>")?;
    let p_close = end + after_pos + "</w:p>".len();

    Some((p_open, p_close))
}

/// Check if a paragraph's text content consists only of a specific tag (e.g., "{{#if ...}}").
fn paragraph_text_is_only(xml: &str, p_start: usize, p_end: usize, tag_prefix: &str) -> bool {
    let paragraph = &xml[p_start..p_end];
    // Extract all text from <w:t> tags
    let mut full_text = String::new();
    let mut pos = 0;
    while pos < paragraph.len() {
        if let Some(t_start) = paragraph[pos..].find("<w:t>").map(|p| p + 5).or_else(|| {
            paragraph[pos..]
                .find("<w:t ")
                .and_then(|p| paragraph[pos + p..].find('>').map(|q| p + q + 1))
        }) {
            let t_start = pos + t_start;
            if let Some(t_end) = paragraph[t_start..].find("</w:t>") {
                full_text.push_str(&paragraph[t_start..t_start + t_end]);
                pos = t_start + t_end + "</w:t>".len();
            } else {
                break;
            }
        } else {
            break;
        }
    }

    let trimmed = full_text.trim();
    trimmed.starts_with(tag_prefix) && trimmed.ends_with("}}")
        || trimmed == "{{else}}"
        || trimmed == "{{/if}}"
}

fn extract_tag(xml: &str, tag: &str) -> Option<String> {
    let open = format!("<{}", tag);
    if let Some(start) = xml.find(&open) {
        let close = format!("</{}>", tag);
        if let Some(end) = xml[start..].find(&close) {
            return Some(xml[start..start + end + close.len()].to_string());
        }
    }
    None
}

fn extract_first_rpr(xml: &str) -> Option<String> {
    extract_tag(xml, "w:rPr")
}

// ── Trash / Restore / Permanent Delete commands ──

#[tauri::command(rename_all = "snake_case")]
pub fn restore_team_member(db: State<AppDb>, id: i64) -> Result<(), String> {
    let guard = db.conn.lock();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute(
        "UPDATE team_members SET deleted_at = NULL WHERE id = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn restore_title(db: State<AppDb>, id: i64) -> Result<(), String> {
    let guard = db.conn.lock();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute(
        "UPDATE titles SET deleted_at = NULL WHERE id = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn restore_salary_data_point(db: State<AppDb>, id: i64) -> Result<(), String> {
    let guard = db.conn.lock();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute(
        "UPDATE salary_data_points SET deleted_at = NULL WHERE id = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn restore_scenario_group(db: State<AppDb>, id: i64) -> Result<(), String> {
    let guard = db.conn.lock();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute(
        "UPDATE scenario_groups SET deleted_at = NULL WHERE id = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE salary_data_points SET deleted_at = NULL WHERE scenario_group_id = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn permanent_delete_team_member(db: State<AppDb>, id: i64) -> Result<(), String> {
    let guard = db.conn.lock();
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
pub fn permanent_delete_title(db: State<AppDb>, id: i64) -> Result<(), String> {
    let guard = db.conn.lock();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute("DELETE FROM titles WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn permanent_delete_salary_data_point(db: State<AppDb>, id: i64) -> Result<(), String> {
    let guard = db.conn.lock();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute("DELETE FROM salary_data_points WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn permanent_delete_scenario_group(db: State<AppDb>, id: i64) -> Result<(), String> {
    let guard = db.conn.lock();
    let conn = guard.as_ref().ok_or("Database not open")?;
    conn.execute("DELETE FROM scenario_groups WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_trashed_team_members(db: State<AppDb>) -> Result<Vec<TeamMember>, String> {
    let guard = db.conn.lock();
    let conn = guard.as_ref().ok_or("Database not open")?;
    let mut stmt = conn
        .prepare(
            "SELECT m.id, m.first_name, m.last_name, m.email, m.personal_email,
                    m.personal_phone, m.address_street, m.address_city, m.address_zip,
                    m.title_id, t.name as title_name, m.start_date, m.notes, m.picture_path,
                    m.exclude_from_salary, m.left_date,
                    m.lead_id, lead.first_name || ' ' || lead.last_name as lead_name,
                    promo.promoted_title_id, pt.name as promoted_title_name,
                    promo.data_point_id as promo_data_point_id
             FROM team_members m
             LEFT JOIN titles t ON m.title_id = t.id
             LEFT JOIN team_members lead ON m.lead_id = lead.id AND lead.deleted_at IS NULL
             LEFT JOIN (
                 SELECT sdpm.member_id, sdpm.promoted_title_id, sdpm.data_point_id
                 FROM salary_data_point_members sdpm
                 INNER JOIN (
                     SELECT member_id, MAX(data_point_id) as max_dp_id
                     FROM salary_data_point_members
                     WHERE is_promoted = 1 AND promoted_title_id IS NOT NULL
                     GROUP BY member_id
                 ) latest ON sdpm.member_id = latest.member_id AND sdpm.data_point_id = latest.max_dp_id
             ) promo ON promo.member_id = m.id
             LEFT JOIN titles pt ON pt.id = promo.promoted_title_id
             WHERE m.deleted_at IS NOT NULL
             ORDER BY m.deleted_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let members = stmt
        .query_map([], |row| {
            let title_id: Option<i64> = row.get(9)?;
            let title_name: Option<String> = row.get(10)?;
            let lead_id: Option<i64> = row.get(16)?;
            let lead_name: Option<String> = row.get(17)?;
            let promoted_title_id: Option<i64> = row.get(18)?;
            let promoted_title_name: Option<String> = row.get(19)?;
            let promo_data_point_id: Option<i64> = row.get(20)?;
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
                title_id,
                title_name: title_name.clone(),
                current_title_id: if promoted_title_id.is_some() {
                    promoted_title_id
                } else {
                    title_id
                },
                current_title_name: if promoted_title_name.is_some() {
                    promoted_title_name
                } else {
                    title_name
                },
                current_title_data_point_id: promo_data_point_id,
                start_date: row.get(11)?,
                notes: row.get(12)?,
                picture_path: row.get(13)?,
                exclude_from_salary: row.get(14)?,
                left_date: row.get(15)?,
                lead_id,
                lead_name,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(members)
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_trashed_titles(db: State<AppDb>) -> Result<Vec<Title>, String> {
    let guard = db.conn.lock();
    let conn = guard.as_ref().ok_or("Database not open")?;
    let mut stmt = conn
        .prepare(
            "SELECT t.id, t.name, 0 as member_count FROM titles t WHERE t.deleted_at IS NOT NULL ORDER BY t.deleted_at DESC",
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

#[tauri::command(rename_all = "snake_case")]
pub fn get_trashed_salary_data_points(db: State<AppDb>) -> Result<Vec<SalaryListItem>, String> {
    let guard = db.conn.lock();
    let conn = guard.as_ref().ok_or("Database not open")?;

    let mut dp_stmt = conn
        .prepare("SELECT id, name, budget, previous_data_point_id, created_at FROM salary_data_points WHERE scenario_group_id IS NULL AND deleted_at IS NOT NULL ORDER BY deleted_at DESC")
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

    let mut sg_stmt = conn
        .prepare("SELECT id, name, budget, previous_data_point_id, created_at FROM scenario_groups WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC")
        .map_err(|e| e.to_string())?;
    #[allow(clippy::type_complexity)]
    let groups: Vec<(i64, String, Option<i64>, Option<i64>, String)> = sg_stmt
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn ctx(entries: &[(&str, &str)]) -> HashMap<String, String> {
        entries
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect()
    }

    #[test]
    fn test_if_block_truthy_inline() {
        let input = "Hello {{#if name}}dear {{name}}{{/if}}!";
        let context = ctx(&[("name", "Alice")]);
        let result = process_if_blocks(input, &context);
        assert_eq!(result, "Hello dear {{name}}!");
    }

    #[test]
    fn test_if_block_falsy_inline() {
        let input = "Hello {{#if name}}dear {{name}}{{/if}}!";
        let context = ctx(&[("name", "")]);
        let result = process_if_blocks(input, &context);
        assert_eq!(result, "Hello !");
    }

    #[test]
    fn test_if_else_block_truthy() {
        let input = "Title: {{#if is_promoted}}promoted{{else}}current{{/if}}";
        let context = ctx(&[("is_promoted", "true")]);
        let result = process_if_blocks(input, &context);
        assert_eq!(result, "Title: promoted");
    }

    #[test]
    fn test_if_else_block_falsy() {
        let input = "Title: {{#if is_promoted}}promoted{{else}}current{{/if}}";
        let context = ctx(&[("is_promoted", "")]);
        let result = process_if_blocks(input, &context);
        assert_eq!(result, "Title: current");
    }

    #[test]
    fn test_if_block_missing_variable() {
        let input = "{{#if unknown}}shown{{/if}}rest";
        let context = ctx(&[]);
        let result = process_if_blocks(input, &context);
        assert_eq!(result, "rest");
    }

    #[test]
    fn test_if_block_zero_is_falsy() {
        let input = "{{#if count}}has items{{else}}empty{{/if}}";
        let context = ctx(&[("count", "0")]);
        let result = process_if_blocks(input, &context);
        assert_eq!(result, "empty");
    }

    #[test]
    fn test_nested_if_blocks() {
        let input = "{{#if a}}A{{#if b}}B{{/if}}C{{/if}}";
        let context = ctx(&[("a", "yes"), ("b", "yes")]);
        let result = process_if_blocks(input, &context);
        assert_eq!(result, "ABC");
    }

    #[test]
    fn test_nested_if_blocks_inner_false() {
        let input = "{{#if a}}A{{#if b}}B{{/if}}C{{/if}}";
        let context = ctx(&[("a", "yes"), ("b", "")]);
        let result = process_if_blocks(input, &context);
        assert_eq!(result, "AC");
    }

    #[test]
    fn test_if_block_paragraph_removal() {
        let input = r#"<w:p><w:r><w:t>{{#if is_promoted}}</w:t></w:r></w:p><w:p><w:r><w:t>You got promoted!</w:t></w:r></w:p><w:p><w:r><w:t>{{/if}}</w:t></w:r></w:p>"#;
        let context = ctx(&[("is_promoted", "true")]);
        let result = process_if_blocks(input, &context);
        assert_eq!(
            result,
            r#"<w:p><w:r><w:t>You got promoted!</w:t></w:r></w:p>"#
        );
    }

    #[test]
    fn test_if_block_paragraph_removal_falsy() {
        let input = r#"<w:p><w:r><w:t>{{#if is_promoted}}</w:t></w:r></w:p><w:p><w:r><w:t>You got promoted!</w:t></w:r></w:p><w:p><w:r><w:t>{{/if}}</w:t></w:r></w:p>"#;
        let context = ctx(&[("is_promoted", "")]);
        let result = process_if_blocks(input, &context);
        assert_eq!(result, "");
    }

    #[test]
    fn test_no_if_blocks_passthrough() {
        let input = "Just some {{placeholder}} text";
        let context = ctx(&[]);
        let result = process_if_blocks(input, &context);
        assert_eq!(result, "Just some {{placeholder}} text");
    }
}
