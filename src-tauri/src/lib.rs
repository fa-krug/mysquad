pub mod biometric;
pub mod commands;
pub mod db;
pub mod keychain;

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
