use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Serialize, Deserialize)]
pub struct ExportData {
    pub version: i32,
    pub exported_at: String,
    pub titles: Vec<ExportTitle>,
    pub team_members: Vec<ExportTeamMember>,
    pub children: Vec<ExportChild>,
    pub status_items: Vec<ExportCheckableItem>,
    pub talk_topics: Vec<ExportCheckableItem>,
    pub settings: Vec<ExportSetting>,
    pub salary_data_points: Vec<ExportSalaryDataPoint>,
    pub salary_data_point_members: Vec<ExportSalaryDataPointMember>,
    pub salary_parts: Vec<ExportSalaryPart>,
    pub salary_ranges: Vec<ExportSalaryRange>,
    pub projects: Vec<ExportProject>,
    pub project_members: Vec<ExportProjectMember>,
    pub project_status_items: Vec<ExportProjectStatusItem>,
    pub project_links: Vec<ExportProjectLink>,
    pub reports: Vec<ExportReport>,
}

#[derive(Serialize, Deserialize)]
pub struct ExportTitle {
    pub id: i64,
    pub name: String,
}

#[derive(Serialize, Deserialize)]
pub struct ExportTeamMember {
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
    pub start_date: Option<String>,
    pub notes: Option<String>,
    pub exclude_from_salary: bool,
    pub left_date: Option<String>,
}

#[derive(Serialize, Deserialize)]
pub struct ExportChild {
    pub id: i64,
    pub team_member_id: i64,
    pub name: String,
    pub date_of_birth: Option<String>,
}

#[derive(Serialize, Deserialize)]
pub struct ExportCheckableItem {
    pub id: i64,
    pub team_member_id: i64,
    pub text: String,
    pub checked: bool,
    pub created_at: String,
}

#[derive(Serialize, Deserialize)]
pub struct ExportSetting {
    pub key: String,
    pub value: String,
}

#[derive(Serialize, Deserialize)]
pub struct ExportSalaryDataPoint {
    pub id: i64,
    pub name: String,
    pub budget: Option<i64>,
    pub previous_data_point_id: Option<i64>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize, Deserialize)]
pub struct ExportSalaryDataPointMember {
    pub id: i64,
    pub data_point_id: i64,
    pub member_id: i64,
    pub is_active: bool,
    pub is_promoted: bool,
    pub promoted_title_id: Option<i64>,
}

#[derive(Serialize, Deserialize)]
pub struct ExportSalaryPart {
    pub id: i64,
    pub data_point_member_id: i64,
    pub name: Option<String>,
    pub amount: i64,
    pub frequency: i64,
    pub is_variable: bool,
    pub sort_order: i64,
}

#[derive(Serialize, Deserialize)]
pub struct ExportSalaryRange {
    pub id: i64,
    pub data_point_id: i64,
    pub title_id: i64,
    pub min_salary: i64,
    pub max_salary: i64,
}

#[derive(Serialize, Deserialize)]
pub struct ExportProject {
    pub id: i64,
    pub name: String,
    pub start_date: String,
    pub end_date: Option<String>,
    pub notes: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize, Deserialize)]
pub struct ExportProjectMember {
    pub id: i64,
    pub project_id: i64,
    pub team_member_id: i64,
}

#[derive(Serialize, Deserialize)]
pub struct ExportProjectStatusItem {
    pub id: i64,
    pub project_id: i64,
    pub text: String,
    pub checked: bool,
    pub created_at: String,
}

#[derive(Serialize, Deserialize)]
pub struct ExportProjectLink {
    pub id: i64,
    pub project_id: i64,
    pub url: String,
    pub label: Option<String>,
    pub sort_order: i64,
    pub created_at: String,
}

#[derive(Serialize, Deserialize)]
pub struct ExportReport {
    pub id: i64,
    pub name: String,
    pub collect_statuses: bool,
    pub include_stakeholders: bool,
    pub include_projects: bool,
    pub created_at: String,
}

pub fn export_all_data(conn: &Connection) -> Result<ExportData, String> {
    let titles = query_titles(conn)?;
    let team_members = query_team_members(conn)?;
    let children = query_children(conn)?;
    let status_items = query_checkable_items(conn, "status_items")?;
    let talk_topics = query_checkable_items(conn, "talk_topics")?;
    let settings = query_settings(conn)?;
    let salary_data_points = query_salary_data_points(conn)?;
    let salary_data_point_members = query_salary_data_point_members(conn)?;
    let salary_parts = query_salary_parts(conn)?;
    let salary_ranges = query_salary_ranges(conn)?;
    let projects = query_projects(conn)?;
    let project_members = query_project_members(conn)?;
    let project_status_items = query_project_status_items(conn)?;
    let project_links = query_project_links(conn)?;
    let reports = query_reports(conn)?;

    Ok(ExportData {
        version: 1,
        exported_at: chrono::Utc::now().to_rfc3339(),
        titles,
        team_members,
        children,
        status_items,
        talk_topics,
        settings,
        salary_data_points,
        salary_data_point_members,
        salary_parts,
        salary_ranges,
        projects,
        project_members,
        project_status_items,
        project_links,
        reports,
    })
}

pub fn import_all_data(conn: &Connection, data: ExportData, mode: &str) -> Result<(), String> {
    conn.execute("BEGIN TRANSACTION", [])
        .map_err(|e| e.to_string())?;

    let result = if mode == "overwrite" {
        import_overwrite(conn, &data)
    } else {
        import_update(conn, &data)
    };

    match result {
        Ok(()) => {
            conn.execute("COMMIT", []).map_err(|e| e.to_string())?;
            Ok(())
        }
        Err(e) => {
            let _ = conn.execute("ROLLBACK", []);
            Err(e)
        }
    }
}

fn import_overwrite(conn: &Connection, data: &ExportData) -> Result<(), String> {
    // Delete in reverse dependency order
    conn.execute_batch(
        "DELETE FROM salary_parts;
         DELETE FROM salary_ranges;
         DELETE FROM salary_data_point_members;
         DELETE FROM salary_data_points;
         DELETE FROM project_links;
         DELETE FROM project_status_items;
         DELETE FROM project_members;
         DELETE FROM projects;
         DELETE FROM children;
         DELETE FROM status_items;
         DELETE FROM talk_topics;
         DELETE FROM reports;
         DELETE FROM team_members;
         DELETE FROM titles;
         DELETE FROM settings;",
    )
    .map_err(|e| e.to_string())?;

    insert_all(conn, data)
}

fn import_update(conn: &Connection, data: &ExportData) -> Result<(), String> {
    // Build ID maps by upserting, then use maps for dependent records
    let title_map = upsert_titles(conn, &data.titles)?;
    let member_map = upsert_team_members(conn, &data.team_members, &title_map)?;
    upsert_children(conn, &data.children, &member_map)?;
    upsert_checkable_items(conn, "status_items", &data.status_items, &member_map)?;
    upsert_checkable_items(conn, "talk_topics", &data.talk_topics, &member_map)?;
    upsert_settings(conn, &data.settings)?;
    let dp_map = upsert_salary_data_points(conn, &data.salary_data_points)?;
    // Second pass to fix previous_data_point_id references
    fix_previous_data_point_ids(conn, &data.salary_data_points, &dp_map)?;
    let dpm_map = upsert_salary_data_point_members(
        conn,
        &data.salary_data_point_members,
        &dp_map,
        &member_map,
        &title_map,
    )?;
    upsert_salary_parts(conn, &data.salary_parts, &dpm_map)?;
    upsert_salary_ranges(conn, &data.salary_ranges, &dp_map, &title_map)?;
    let project_map = upsert_projects(conn, &data.projects)?;
    upsert_project_members(conn, &data.project_members, &project_map, &member_map)?;
    upsert_project_status_items(conn, &data.project_status_items, &project_map)?;
    upsert_project_links(conn, &data.project_links, &project_map)?;
    upsert_reports(conn, &data.reports)?;

    Ok(())
}

fn insert_all(conn: &Connection, data: &ExportData) -> Result<(), String> {
    let title_map = insert_titles(conn, &data.titles)?;
    let member_map = insert_team_members(conn, &data.team_members, &title_map)?;
    insert_children(conn, &data.children, &member_map)?;
    insert_checkable_items(conn, "status_items", &data.status_items, &member_map)?;
    insert_checkable_items(conn, "talk_topics", &data.talk_topics, &member_map)?;
    insert_settings(conn, &data.settings)?;
    let dp_map = insert_salary_data_points(conn, &data.salary_data_points)?;
    let dpm_map = insert_salary_data_point_members(
        conn,
        &data.salary_data_point_members,
        &dp_map,
        &member_map,
        &title_map,
    )?;
    insert_salary_parts(conn, &data.salary_parts, &dpm_map)?;
    insert_salary_ranges(conn, &data.salary_ranges, &dp_map, &title_map)?;
    let project_map = insert_projects(conn, &data.projects)?;
    insert_project_members(conn, &data.project_members, &project_map, &member_map)?;
    insert_project_status_items(conn, &data.project_status_items, &project_map)?;
    insert_project_links(conn, &data.project_links, &project_map)?;
    insert_reports(conn, &data.reports)?;
    Ok(())
}

// ── Query functions ──

fn query_titles(conn: &Connection) -> Result<Vec<ExportTitle>, String> {
    let mut stmt = conn
        .prepare("SELECT id, name FROM titles ORDER BY id")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(ExportTitle {
                id: row.get(0)?,
                name: row.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

fn query_team_members(conn: &Connection) -> Result<Vec<ExportTeamMember>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, first_name, last_name, email, personal_email, personal_phone,
                address_street, address_city, address_zip, title_id, start_date, notes,
                exclude_from_salary, left_date
         FROM team_members ORDER BY id",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(ExportTeamMember {
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
                start_date: row.get(10)?,
                notes: row.get(11)?,
                exclude_from_salary: row.get(12)?,
                left_date: row.get(13)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

fn query_children(conn: &Connection) -> Result<Vec<ExportChild>, String> {
    let mut stmt = conn
        .prepare("SELECT id, team_member_id, name, date_of_birth FROM children ORDER BY id")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(ExportChild {
                id: row.get(0)?,
                team_member_id: row.get(1)?,
                name: row.get(2)?,
                date_of_birth: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

fn query_checkable_items(
    conn: &Connection,
    table: &str,
) -> Result<Vec<ExportCheckableItem>, String> {
    let sql = format!(
        "SELECT id, team_member_id, text, checked, created_at FROM {} ORDER BY id",
        table
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(ExportCheckableItem {
                id: row.get(0)?,
                team_member_id: row.get(1)?,
                text: row.get(2)?,
                checked: row.get(3)?,
                created_at: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

fn query_settings(conn: &Connection) -> Result<Vec<ExportSetting>, String> {
    let mut stmt = conn
        .prepare("SELECT key, value FROM settings ORDER BY key")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(ExportSetting {
                key: row.get(0)?,
                value: row.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

fn query_salary_data_points(conn: &Connection) -> Result<Vec<ExportSalaryDataPoint>, String> {
    let mut stmt = conn.prepare(
        "SELECT id, name, budget, previous_data_point_id, created_at, updated_at FROM salary_data_points ORDER BY id"
    ).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(ExportSalaryDataPoint {
                id: row.get(0)?,
                name: row.get(1)?,
                budget: row.get(2)?,
                previous_data_point_id: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

fn query_salary_data_point_members(
    conn: &Connection,
) -> Result<Vec<ExportSalaryDataPointMember>, String> {
    let mut stmt = conn.prepare(
        "SELECT id, data_point_id, member_id, is_active, is_promoted, promoted_title_id FROM salary_data_point_members ORDER BY id"
    ).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(ExportSalaryDataPointMember {
                id: row.get(0)?,
                data_point_id: row.get(1)?,
                member_id: row.get(2)?,
                is_active: row.get(3)?,
                is_promoted: row.get(4)?,
                promoted_title_id: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

fn query_salary_parts(conn: &Connection) -> Result<Vec<ExportSalaryPart>, String> {
    let mut stmt = conn.prepare(
        "SELECT id, data_point_member_id, name, amount, frequency, is_variable, sort_order FROM salary_parts ORDER BY id"
    ).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(ExportSalaryPart {
                id: row.get(0)?,
                data_point_member_id: row.get(1)?,
                name: row.get(2)?,
                amount: row.get(3)?,
                frequency: row.get(4)?,
                is_variable: row.get(5)?,
                sort_order: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

fn query_salary_ranges(conn: &Connection) -> Result<Vec<ExportSalaryRange>, String> {
    let mut stmt = conn.prepare(
        "SELECT id, data_point_id, title_id, min_salary, max_salary FROM salary_ranges ORDER BY id"
    ).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(ExportSalaryRange {
                id: row.get(0)?,
                data_point_id: row.get(1)?,
                title_id: row.get(2)?,
                min_salary: row.get(3)?,
                max_salary: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

fn query_projects(conn: &Connection) -> Result<Vec<ExportProject>, String> {
    let mut stmt = conn.prepare(
        "SELECT id, name, start_date, end_date, notes, created_at, updated_at FROM projects ORDER BY id"
    ).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(ExportProject {
                id: row.get(0)?,
                name: row.get(1)?,
                start_date: row.get(2)?,
                end_date: row.get(3)?,
                notes: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

fn query_project_members(conn: &Connection) -> Result<Vec<ExportProjectMember>, String> {
    let mut stmt = conn
        .prepare("SELECT id, project_id, team_member_id FROM project_members ORDER BY id")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(ExportProjectMember {
                id: row.get(0)?,
                project_id: row.get(1)?,
                team_member_id: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

fn query_project_status_items(conn: &Connection) -> Result<Vec<ExportProjectStatusItem>, String> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, text, checked, created_at FROM project_status_items ORDER BY id"
    ).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(ExportProjectStatusItem {
                id: row.get(0)?,
                project_id: row.get(1)?,
                text: row.get(2)?,
                checked: row.get(3)?,
                created_at: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

fn query_project_links(conn: &Connection) -> Result<Vec<ExportProjectLink>, String> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, url, label, sort_order, created_at FROM project_links ORDER BY id"
    ).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(ExportProjectLink {
                id: row.get(0)?,
                project_id: row.get(1)?,
                url: row.get(2)?,
                label: row.get(3)?,
                sort_order: row.get(4)?,
                created_at: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

fn query_reports(conn: &Connection) -> Result<Vec<ExportReport>, String> {
    let mut stmt = conn.prepare(
        "SELECT id, name, collect_statuses, include_stakeholders, include_projects, created_at FROM reports ORDER BY id"
    ).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(ExportReport {
                id: row.get(0)?,
                name: row.get(1)?,
                collect_statuses: row.get(2)?,
                include_stakeholders: row.get(3)?,
                include_projects: row.get(4)?,
                created_at: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

// ── Insert functions (for overwrite mode) ──

fn insert_titles(conn: &Connection, titles: &[ExportTitle]) -> Result<HashMap<i64, i64>, String> {
    let mut map = HashMap::new();
    for t in titles {
        conn.execute("INSERT INTO titles (name) VALUES (?1)", params![t.name])
            .map_err(|e| e.to_string())?;
        map.insert(t.id, conn.last_insert_rowid());
    }
    Ok(map)
}

fn insert_team_members(
    conn: &Connection,
    members: &[ExportTeamMember],
    title_map: &HashMap<i64, i64>,
) -> Result<HashMap<i64, i64>, String> {
    let mut map = HashMap::new();
    for m in members {
        let new_title_id = m.title_id.and_then(|id| title_map.get(&id).copied());
        conn.execute(
            "INSERT INTO team_members (first_name, last_name, email, personal_email, personal_phone,
                address_street, address_city, address_zip, title_id, start_date, notes,
                exclude_from_salary, left_date)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            params![
                m.first_name, m.last_name, m.email, m.personal_email, m.personal_phone,
                m.address_street, m.address_city, m.address_zip, new_title_id,
                m.start_date, m.notes, m.exclude_from_salary, m.left_date
            ],
        ).map_err(|e| e.to_string())?;
        map.insert(m.id, conn.last_insert_rowid());
    }
    Ok(map)
}

fn insert_children(
    conn: &Connection,
    children: &[ExportChild],
    member_map: &HashMap<i64, i64>,
) -> Result<(), String> {
    for c in children {
        let new_member_id = member_map
            .get(&c.team_member_id)
            .ok_or_else(|| format!("Missing member mapping for id {}", c.team_member_id))?;
        conn.execute(
            "INSERT INTO children (team_member_id, name, date_of_birth) VALUES (?1, ?2, ?3)",
            params![new_member_id, c.name, c.date_of_birth],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn insert_checkable_items(
    conn: &Connection,
    table: &str,
    items: &[ExportCheckableItem],
    member_map: &HashMap<i64, i64>,
) -> Result<(), String> {
    for item in items {
        let new_member_id = member_map
            .get(&item.team_member_id)
            .ok_or_else(|| format!("Missing member mapping for id {}", item.team_member_id))?;
        let sql = format!(
            "INSERT INTO {} (team_member_id, text, checked, created_at) VALUES (?1, ?2, ?3, ?4)",
            table
        );
        conn.execute(
            &sql,
            params![new_member_id, item.text, item.checked, item.created_at],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn insert_settings(conn: &Connection, settings: &[ExportSetting]) -> Result<(), String> {
    for s in settings {
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
            params![s.key, s.value],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn insert_salary_data_points(
    conn: &Connection,
    dps: &[ExportSalaryDataPoint],
) -> Result<HashMap<i64, i64>, String> {
    let mut map = HashMap::new();
    // First pass: insert without previous_data_point_id
    for dp in dps {
        conn.execute(
            "INSERT INTO salary_data_points (name, budget, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
            params![dp.name, dp.budget, dp.created_at, dp.updated_at],
        ).map_err(|e| e.to_string())?;
        map.insert(dp.id, conn.last_insert_rowid());
    }
    // Second pass: update previous_data_point_id references
    for dp in dps {
        if let Some(prev_id) = dp.previous_data_point_id {
            if let Some(&new_prev_id) = map.get(&prev_id) {
                let new_id = map[&dp.id];
                conn.execute(
                    "UPDATE salary_data_points SET previous_data_point_id = ?1 WHERE id = ?2",
                    params![new_prev_id, new_id],
                )
                .map_err(|e| e.to_string())?;
            }
        }
    }
    Ok(map)
}

fn insert_salary_data_point_members(
    conn: &Connection,
    members: &[ExportSalaryDataPointMember],
    dp_map: &HashMap<i64, i64>,
    member_map: &HashMap<i64, i64>,
    title_map: &HashMap<i64, i64>,
) -> Result<HashMap<i64, i64>, String> {
    let mut map = HashMap::new();
    for m in members {
        let new_dp_id = dp_map
            .get(&m.data_point_id)
            .ok_or_else(|| format!("Missing dp mapping for id {}", m.data_point_id))?;
        let new_member_id = member_map
            .get(&m.member_id)
            .ok_or_else(|| format!("Missing member mapping for id {}", m.member_id))?;
        let new_promoted_title_id = m
            .promoted_title_id
            .and_then(|id| title_map.get(&id).copied());
        conn.execute(
            "INSERT INTO salary_data_point_members (data_point_id, member_id, is_active, is_promoted, promoted_title_id)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![new_dp_id, new_member_id, m.is_active, m.is_promoted, new_promoted_title_id],
        ).map_err(|e| e.to_string())?;
        map.insert(m.id, conn.last_insert_rowid());
    }
    Ok(map)
}

fn insert_salary_parts(
    conn: &Connection,
    parts: &[ExportSalaryPart],
    dpm_map: &HashMap<i64, i64>,
) -> Result<(), String> {
    for p in parts {
        let new_dpm_id = dpm_map
            .get(&p.data_point_member_id)
            .ok_or_else(|| format!("Missing dpm mapping for id {}", p.data_point_member_id))?;
        conn.execute(
            "INSERT INTO salary_parts (data_point_member_id, name, amount, frequency, is_variable, sort_order)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![new_dpm_id, p.name, p.amount, p.frequency, p.is_variable, p.sort_order],
        ).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn insert_salary_ranges(
    conn: &Connection,
    ranges: &[ExportSalaryRange],
    dp_map: &HashMap<i64, i64>,
    title_map: &HashMap<i64, i64>,
) -> Result<(), String> {
    for r in ranges {
        let new_dp_id = dp_map
            .get(&r.data_point_id)
            .ok_or_else(|| format!("Missing dp mapping for id {}", r.data_point_id))?;
        let new_title_id = title_map
            .get(&r.title_id)
            .ok_or_else(|| format!("Missing title mapping for id {}", r.title_id))?;
        conn.execute(
            "INSERT INTO salary_ranges (data_point_id, title_id, min_salary, max_salary) VALUES (?1, ?2, ?3, ?4)",
            params![new_dp_id, new_title_id, r.min_salary, r.max_salary],
        ).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn insert_projects(
    conn: &Connection,
    projects: &[ExportProject],
) -> Result<HashMap<i64, i64>, String> {
    let mut map = HashMap::new();
    for p in projects {
        conn.execute(
            "INSERT INTO projects (name, start_date, end_date, notes, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![p.name, p.start_date, p.end_date, p.notes, p.created_at, p.updated_at],
        ).map_err(|e| e.to_string())?;
        map.insert(p.id, conn.last_insert_rowid());
    }
    Ok(map)
}

fn insert_project_members(
    conn: &Connection,
    members: &[ExportProjectMember],
    project_map: &HashMap<i64, i64>,
    member_map: &HashMap<i64, i64>,
) -> Result<(), String> {
    for m in members {
        let new_project_id = project_map
            .get(&m.project_id)
            .ok_or_else(|| format!("Missing project mapping for id {}", m.project_id))?;
        let new_member_id = member_map
            .get(&m.team_member_id)
            .ok_or_else(|| format!("Missing member mapping for id {}", m.team_member_id))?;
        conn.execute(
            "INSERT INTO project_members (project_id, team_member_id) VALUES (?1, ?2)",
            params![new_project_id, new_member_id],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn insert_project_status_items(
    conn: &Connection,
    items: &[ExportProjectStatusItem],
    project_map: &HashMap<i64, i64>,
) -> Result<(), String> {
    for item in items {
        let new_project_id = project_map
            .get(&item.project_id)
            .ok_or_else(|| format!("Missing project mapping for id {}", item.project_id))?;
        conn.execute(
            "INSERT INTO project_status_items (project_id, text, checked, created_at) VALUES (?1, ?2, ?3, ?4)",
            params![new_project_id, item.text, item.checked, item.created_at],
        ).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn insert_project_links(
    conn: &Connection,
    links: &[ExportProjectLink],
    project_map: &HashMap<i64, i64>,
) -> Result<(), String> {
    for l in links {
        if let Some(&new_pid) = project_map.get(&l.project_id) {
            conn.execute(
                "INSERT INTO project_links (project_id, url, label, sort_order, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![new_pid, l.url, l.label, l.sort_order, l.created_at],
            ).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn insert_reports(conn: &Connection, reports: &[ExportReport]) -> Result<(), String> {
    for r in reports {
        conn.execute(
            "INSERT INTO reports (name, collect_statuses, include_stakeholders, include_projects, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![r.name, r.collect_statuses, r.include_stakeholders, r.include_projects, r.created_at],
        ).map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ── Upsert functions (for update mode) ──

fn upsert_titles(conn: &Connection, titles: &[ExportTitle]) -> Result<HashMap<i64, i64>, String> {
    let mut map = HashMap::new();
    for t in titles {
        let existing: Option<i64> = conn
            .query_row(
                "SELECT id FROM titles WHERE name = ?1",
                params![t.name],
                |row| row.get(0),
            )
            .ok();
        let new_id = if let Some(id) = existing {
            id
        } else {
            conn.execute("INSERT INTO titles (name) VALUES (?1)", params![t.name])
                .map_err(|e| e.to_string())?;
            conn.last_insert_rowid()
        };
        map.insert(t.id, new_id);
    }
    Ok(map)
}

fn upsert_team_members(
    conn: &Connection,
    members: &[ExportTeamMember],
    title_map: &HashMap<i64, i64>,
) -> Result<HashMap<i64, i64>, String> {
    let mut map = HashMap::new();
    for m in members {
        let new_title_id = m.title_id.and_then(|id| title_map.get(&id).copied());
        let existing: Option<i64> = conn
            .query_row(
                "SELECT id FROM team_members WHERE first_name = ?1 AND last_name = ?2",
                params![m.first_name, m.last_name],
                |row| row.get(0),
            )
            .ok();
        let new_id = if let Some(id) = existing {
            conn.execute(
                "UPDATE team_members SET email = ?1, personal_email = ?2, personal_phone = ?3,
                    address_street = ?4, address_city = ?5, address_zip = ?6, title_id = ?7,
                    start_date = ?8, notes = ?9, exclude_from_salary = ?10, left_date = ?11
                 WHERE id = ?12",
                params![
                    m.email,
                    m.personal_email,
                    m.personal_phone,
                    m.address_street,
                    m.address_city,
                    m.address_zip,
                    new_title_id,
                    m.start_date,
                    m.notes,
                    m.exclude_from_salary,
                    m.left_date,
                    id
                ],
            )
            .map_err(|e| e.to_string())?;
            id
        } else {
            conn.execute(
                "INSERT INTO team_members (first_name, last_name, email, personal_email, personal_phone,
                    address_street, address_city, address_zip, title_id, start_date, notes,
                    exclude_from_salary, left_date)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
                params![
                    m.first_name, m.last_name, m.email, m.personal_email, m.personal_phone,
                    m.address_street, m.address_city, m.address_zip, new_title_id,
                    m.start_date, m.notes, m.exclude_from_salary, m.left_date
                ],
            ).map_err(|e| e.to_string())?;
            conn.last_insert_rowid()
        };
        map.insert(m.id, new_id);
    }
    Ok(map)
}

fn upsert_children(
    conn: &Connection,
    children: &[ExportChild],
    member_map: &HashMap<i64, i64>,
) -> Result<(), String> {
    for c in children {
        let new_member_id = member_map
            .get(&c.team_member_id)
            .ok_or_else(|| format!("Missing member mapping for id {}", c.team_member_id))?;
        let existing: Option<i64> = conn
            .query_row(
                "SELECT id FROM children WHERE team_member_id = ?1 AND name = ?2",
                params![new_member_id, c.name],
                |row| row.get(0),
            )
            .ok();
        if let Some(id) = existing {
            conn.execute(
                "UPDATE children SET date_of_birth = ?1 WHERE id = ?2",
                params![c.date_of_birth, id],
            )
            .map_err(|e| e.to_string())?;
        } else {
            conn.execute(
                "INSERT INTO children (team_member_id, name, date_of_birth) VALUES (?1, ?2, ?3)",
                params![new_member_id, c.name, c.date_of_birth],
            )
            .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn upsert_checkable_items(
    conn: &Connection,
    table: &str,
    items: &[ExportCheckableItem],
    member_map: &HashMap<i64, i64>,
) -> Result<(), String> {
    for item in items {
        let new_member_id = member_map
            .get(&item.team_member_id)
            .ok_or_else(|| format!("Missing member mapping for id {}", item.team_member_id))?;
        let existing: Option<i64> = conn
            .query_row(
                &format!(
                    "SELECT id FROM {} WHERE team_member_id = ?1 AND text = ?2",
                    table
                ),
                params![new_member_id, item.text],
                |row| row.get(0),
            )
            .ok();
        if let Some(id) = existing {
            conn.execute(
                &format!("UPDATE {} SET checked = ?1 WHERE id = ?2", table),
                params![item.checked, id],
            )
            .map_err(|e| e.to_string())?;
        } else {
            conn.execute(
                &format!("INSERT INTO {} (team_member_id, text, checked, created_at) VALUES (?1, ?2, ?3, ?4)", table),
                params![new_member_id, item.text, item.checked, item.created_at],
            ).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn upsert_settings(conn: &Connection, settings: &[ExportSetting]) -> Result<(), String> {
    for s in settings {
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
            params![s.key, s.value],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn upsert_salary_data_points(
    conn: &Connection,
    dps: &[ExportSalaryDataPoint],
) -> Result<HashMap<i64, i64>, String> {
    let mut map = HashMap::new();
    for dp in dps {
        let existing: Option<i64> = conn
            .query_row(
                "SELECT id FROM salary_data_points WHERE name = ?1",
                params![dp.name],
                |row| row.get(0),
            )
            .ok();
        let new_id = if let Some(id) = existing {
            conn.execute(
                "UPDATE salary_data_points SET budget = ?1 WHERE id = ?2",
                params![dp.budget, id],
            )
            .map_err(|e| e.to_string())?;
            id
        } else {
            conn.execute(
                "INSERT INTO salary_data_points (name, budget, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
                params![dp.name, dp.budget, dp.created_at, dp.updated_at],
            ).map_err(|e| e.to_string())?;
            conn.last_insert_rowid()
        };
        map.insert(dp.id, new_id);
    }
    Ok(map)
}

fn fix_previous_data_point_ids(
    conn: &Connection,
    dps: &[ExportSalaryDataPoint],
    dp_map: &HashMap<i64, i64>,
) -> Result<(), String> {
    for dp in dps {
        if let Some(prev_id) = dp.previous_data_point_id {
            if let Some(&new_prev_id) = dp_map.get(&prev_id) {
                let new_id = dp_map[&dp.id];
                conn.execute(
                    "UPDATE salary_data_points SET previous_data_point_id = ?1 WHERE id = ?2",
                    params![new_prev_id, new_id],
                )
                .map_err(|e| e.to_string())?;
            }
        }
    }
    Ok(())
}

fn upsert_salary_data_point_members(
    conn: &Connection,
    members: &[ExportSalaryDataPointMember],
    dp_map: &HashMap<i64, i64>,
    member_map: &HashMap<i64, i64>,
    title_map: &HashMap<i64, i64>,
) -> Result<HashMap<i64, i64>, String> {
    let mut map = HashMap::new();
    for m in members {
        let new_dp_id = dp_map
            .get(&m.data_point_id)
            .ok_or_else(|| format!("Missing dp mapping for id {}", m.data_point_id))?;
        let new_member_id = member_map
            .get(&m.member_id)
            .ok_or_else(|| format!("Missing member mapping for id {}", m.member_id))?;
        let new_promoted_title_id = m
            .promoted_title_id
            .and_then(|id| title_map.get(&id).copied());
        let existing: Option<i64> = conn.query_row(
            "SELECT id FROM salary_data_point_members WHERE data_point_id = ?1 AND member_id = ?2",
            params![new_dp_id, new_member_id], |row| row.get(0)
        ).ok();
        let new_id = if let Some(id) = existing {
            conn.execute(
                "UPDATE salary_data_point_members SET is_active = ?1, is_promoted = ?2, promoted_title_id = ?3 WHERE id = ?4",
                params![m.is_active, m.is_promoted, new_promoted_title_id, id],
            ).map_err(|e| e.to_string())?;
            id
        } else {
            conn.execute(
                "INSERT INTO salary_data_point_members (data_point_id, member_id, is_active, is_promoted, promoted_title_id)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![new_dp_id, new_member_id, m.is_active, m.is_promoted, new_promoted_title_id],
            ).map_err(|e| e.to_string())?;
            conn.last_insert_rowid()
        };
        map.insert(m.id, new_id);
    }
    Ok(map)
}

fn upsert_salary_parts(
    conn: &Connection,
    parts: &[ExportSalaryPart],
    dpm_map: &HashMap<i64, i64>,
) -> Result<(), String> {
    for p in parts {
        let new_dpm_id = dpm_map
            .get(&p.data_point_member_id)
            .ok_or_else(|| format!("Missing dpm mapping for id {}", p.data_point_member_id))?;
        let existing: Option<i64> = conn
            .query_row(
                "SELECT id FROM salary_parts WHERE data_point_member_id = ?1 AND sort_order = ?2",
                params![new_dpm_id, p.sort_order],
                |row| row.get(0),
            )
            .ok();
        if let Some(id) = existing {
            conn.execute(
                "UPDATE salary_parts SET name = ?1, amount = ?2, frequency = ?3, is_variable = ?4 WHERE id = ?5",
                params![p.name, p.amount, p.frequency, p.is_variable, id],
            ).map_err(|e| e.to_string())?;
        } else {
            conn.execute(
                "INSERT INTO salary_parts (data_point_member_id, name, amount, frequency, is_variable, sort_order)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![new_dpm_id, p.name, p.amount, p.frequency, p.is_variable, p.sort_order],
            ).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn upsert_salary_ranges(
    conn: &Connection,
    ranges: &[ExportSalaryRange],
    dp_map: &HashMap<i64, i64>,
    title_map: &HashMap<i64, i64>,
) -> Result<(), String> {
    for r in ranges {
        let new_dp_id = dp_map
            .get(&r.data_point_id)
            .ok_or_else(|| format!("Missing dp mapping for id {}", r.data_point_id))?;
        let new_title_id = title_map
            .get(&r.title_id)
            .ok_or_else(|| format!("Missing title mapping for id {}", r.title_id))?;
        let existing: Option<i64> = conn
            .query_row(
                "SELECT id FROM salary_ranges WHERE data_point_id = ?1 AND title_id = ?2",
                params![new_dp_id, new_title_id],
                |row| row.get(0),
            )
            .ok();
        if let Some(id) = existing {
            conn.execute(
                "UPDATE salary_ranges SET min_salary = ?1, max_salary = ?2 WHERE id = ?3",
                params![r.min_salary, r.max_salary, id],
            )
            .map_err(|e| e.to_string())?;
        } else {
            conn.execute(
                "INSERT INTO salary_ranges (data_point_id, title_id, min_salary, max_salary) VALUES (?1, ?2, ?3, ?4)",
                params![new_dp_id, new_title_id, r.min_salary, r.max_salary],
            ).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn upsert_projects(
    conn: &Connection,
    projects: &[ExportProject],
) -> Result<HashMap<i64, i64>, String> {
    let mut map = HashMap::new();
    for p in projects {
        let existing: Option<i64> = conn
            .query_row(
                "SELECT id FROM projects WHERE name = ?1",
                params![p.name],
                |row| row.get(0),
            )
            .ok();
        let new_id = if let Some(id) = existing {
            conn.execute(
                "UPDATE projects SET start_date = ?1, end_date = ?2, notes = ?3 WHERE id = ?4",
                params![p.start_date, p.end_date, p.notes, id],
            )
            .map_err(|e| e.to_string())?;
            id
        } else {
            conn.execute(
                "INSERT INTO projects (name, start_date, end_date, notes, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![p.name, p.start_date, p.end_date, p.notes, p.created_at, p.updated_at],
            ).map_err(|e| e.to_string())?;
            conn.last_insert_rowid()
        };
        map.insert(p.id, new_id);
    }
    Ok(map)
}

fn upsert_project_members(
    conn: &Connection,
    members: &[ExportProjectMember],
    project_map: &HashMap<i64, i64>,
    member_map: &HashMap<i64, i64>,
) -> Result<(), String> {
    for m in members {
        let new_project_id = project_map
            .get(&m.project_id)
            .ok_or_else(|| format!("Missing project mapping for id {}", m.project_id))?;
        let new_member_id = member_map
            .get(&m.team_member_id)
            .ok_or_else(|| format!("Missing member mapping for id {}", m.team_member_id))?;
        let existing: Option<i64> = conn
            .query_row(
                "SELECT id FROM project_members WHERE project_id = ?1 AND team_member_id = ?2",
                params![new_project_id, new_member_id],
                |row| row.get(0),
            )
            .ok();
        if existing.is_none() {
            conn.execute(
                "INSERT INTO project_members (project_id, team_member_id) VALUES (?1, ?2)",
                params![new_project_id, new_member_id],
            )
            .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn upsert_project_status_items(
    conn: &Connection,
    items: &[ExportProjectStatusItem],
    project_map: &HashMap<i64, i64>,
) -> Result<(), String> {
    for item in items {
        let new_project_id = project_map
            .get(&item.project_id)
            .ok_or_else(|| format!("Missing project mapping for id {}", item.project_id))?;
        let existing: Option<i64> = conn
            .query_row(
                "SELECT id FROM project_status_items WHERE project_id = ?1 AND text = ?2",
                params![new_project_id, item.text],
                |row| row.get(0),
            )
            .ok();
        if let Some(id) = existing {
            conn.execute(
                "UPDATE project_status_items SET checked = ?1 WHERE id = ?2",
                params![item.checked, id],
            )
            .map_err(|e| e.to_string())?;
        } else {
            conn.execute(
                "INSERT INTO project_status_items (project_id, text, checked, created_at) VALUES (?1, ?2, ?3, ?4)",
                params![new_project_id, item.text, item.checked, item.created_at],
            ).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn upsert_project_links(
    conn: &Connection,
    links: &[ExportProjectLink],
    project_map: &HashMap<i64, i64>,
) -> Result<(), String> {
    for l in links {
        if let Some(&new_pid) = project_map.get(&l.project_id) {
            let existing: Option<i64> = conn
                .query_row(
                    "SELECT id FROM project_links WHERE project_id = ?1 AND url = ?2",
                    params![new_pid, l.url],
                    |row| row.get(0),
                )
                .ok();
            if let Some(eid) = existing {
                conn.execute(
                    "UPDATE project_links SET label = ?1, sort_order = ?2 WHERE id = ?3",
                    params![l.label, l.sort_order, eid],
                )
                .map_err(|e| e.to_string())?;
            } else {
                conn.execute(
                    "INSERT INTO project_links (project_id, url, label, sort_order, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
                    params![new_pid, l.url, l.label, l.sort_order, l.created_at],
                )
                .map_err(|e| e.to_string())?;
            }
        }
    }
    Ok(())
}

fn upsert_reports(conn: &Connection, reports: &[ExportReport]) -> Result<(), String> {
    for r in reports {
        let existing: Option<i64> = conn
            .query_row(
                "SELECT id FROM reports WHERE name = ?1",
                params![r.name],
                |row| row.get(0),
            )
            .ok();
        if let Some(id) = existing {
            conn.execute(
                "UPDATE reports SET collect_statuses = ?1, include_stakeholders = ?2, include_projects = ?3 WHERE id = ?4",
                params![r.collect_statuses, r.include_stakeholders, r.include_projects, id],
            ).map_err(|e| e.to_string())?;
        } else {
            conn.execute(
                "INSERT INTO reports (name, collect_statuses, include_stakeholders, include_projects, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![r.name, r.collect_statuses, r.include_stakeholders, r.include_projects, r.created_at],
            ).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    fn setup_test_db() -> Connection {
        let conn = db::open_db_with_key(":memory:", "test-key-0123456789abcdef").unwrap();
        db::run_migrations(&conn).unwrap();
        conn
    }

    #[test]
    fn test_export_empty_db() {
        let conn = setup_test_db();
        let data = export_all_data(&conn).unwrap();
        assert_eq!(data.version, 1);
        assert!(data.titles.is_empty());
        assert!(data.team_members.is_empty());
    }

    #[test]
    fn test_export_import_roundtrip_overwrite() {
        let conn = setup_test_db();

        // Insert test data
        conn.execute("INSERT INTO titles (name) VALUES ('Engineer')", [])
            .unwrap();
        let title_id = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO team_members (first_name, last_name, title_id) VALUES ('Alice', 'Smith', ?1)",
            params![title_id],
        ).unwrap();
        let member_id = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO children (team_member_id, name, date_of_birth) VALUES (?1, 'Bob', '2020-01-01')",
            params![member_id],
        ).unwrap();
        conn.execute(
            "INSERT INTO status_items (team_member_id, text) VALUES (?1, 'Task 1')",
            params![member_id],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO settings (key, value) VALUES ('theme', 'dark')",
            [],
        )
        .unwrap();

        // Export
        let data = export_all_data(&conn).unwrap();
        assert_eq!(data.titles.len(), 1);
        assert_eq!(data.team_members.len(), 1);
        assert_eq!(data.children.len(), 1);
        assert_eq!(data.status_items.len(), 1);
        assert_eq!(data.settings.len(), 1);

        // Serialize and deserialize (simulates file round-trip)
        let json = serde_json::to_string(&data).unwrap();
        let reimported: ExportData = serde_json::from_str(&json).unwrap();

        // Import into fresh DB (overwrite)
        let conn2 = setup_test_db();
        import_all_data(&conn2, reimported, "overwrite").unwrap();

        // Verify data
        let count: i32 = conn2
            .query_row("SELECT COUNT(*) FROM titles", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1);
        let count: i32 = conn2
            .query_row("SELECT COUNT(*) FROM team_members", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1);
        let count: i32 = conn2
            .query_row("SELECT COUNT(*) FROM children", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1);
        let name: String = conn2
            .query_row("SELECT first_name FROM team_members", [], |r| r.get(0))
            .unwrap();
        assert_eq!(name, "Alice");
        // Verify title_id FK is correct
        let tid: Option<i64> = conn2
            .query_row("SELECT title_id FROM team_members", [], |r| r.get(0))
            .unwrap();
        assert!(tid.is_some());
        let tname: String = conn2
            .query_row(
                "SELECT name FROM titles WHERE id = ?1",
                params![tid.unwrap()],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(tname, "Engineer");
    }

    #[test]
    fn test_import_update_mode() {
        let conn = setup_test_db();

        // Pre-existing data
        conn.execute("INSERT INTO titles (name) VALUES ('Engineer')", [])
            .unwrap();
        conn.execute("INSERT INTO team_members (first_name, last_name, email) VALUES ('Alice', 'Smith', 'old@test.com')", []).unwrap();

        // Build import data that updates Alice and adds a new member
        let data = ExportData {
            version: 1,
            exported_at: "2026-01-01T00:00:00Z".to_string(),
            titles: vec![ExportTitle {
                id: 100,
                name: "Engineer".to_string(),
            }],
            team_members: vec![
                ExportTeamMember {
                    id: 200,
                    first_name: "Alice".to_string(),
                    last_name: "Smith".to_string(),
                    email: Some("new@test.com".to_string()),
                    personal_email: None,
                    personal_phone: None,
                    address_street: None,
                    address_city: None,
                    address_zip: None,
                    title_id: Some(100),
                    start_date: None,
                    notes: None,
                    exclude_from_salary: false,
                    left_date: None,
                },
                ExportTeamMember {
                    id: 201,
                    first_name: "Bob".to_string(),
                    last_name: "Jones".to_string(),
                    email: None,
                    personal_email: None,
                    personal_phone: None,
                    address_street: None,
                    address_city: None,
                    address_zip: None,
                    title_id: None,
                    start_date: None,
                    notes: None,
                    exclude_from_salary: false,
                    left_date: None,
                },
            ],
            children: vec![],
            status_items: vec![],
            talk_topics: vec![],
            settings: vec![],
            salary_data_points: vec![],
            salary_data_point_members: vec![],
            salary_parts: vec![],
            salary_ranges: vec![],
            projects: vec![],
            project_members: vec![],
            project_status_items: vec![],
            project_links: vec![],
            reports: vec![],
        };

        import_all_data(&conn, data, "update").unwrap();

        // Alice should be updated
        let email: String = conn
            .query_row(
                "SELECT email FROM team_members WHERE first_name = 'Alice'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(email, "new@test.com");

        // Bob should be added
        let count: i32 = conn
            .query_row("SELECT COUNT(*) FROM team_members", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 2);

        // Title should not be duplicated
        let title_count: i32 = conn
            .query_row("SELECT COUNT(*) FROM titles", [], |r| r.get(0))
            .unwrap();
        assert_eq!(title_count, 1);
    }
}
