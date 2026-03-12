pub mod biometric;
pub mod commands;
pub mod db;
pub mod keychain;

use db::AppDb;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppDb::new())
        .invoke_handler(tauri::generate_handler![
            commands::authenticate,
            commands::unlock_db,
            commands::lock_db,
            commands::get_team_members,
            commands::create_team_member,
            commands::update_team_member,
            commands::delete_team_member,
            commands::upload_member_picture,
            commands::delete_member_picture,
            commands::get_pictures_dir_path,
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
