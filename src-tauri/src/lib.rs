pub mod commands;
pub mod config;
pub mod db;
pub mod export_import;
pub mod platform;

use db::AppDb;
use std::sync::atomic::{AtomicUsize, Ordering};
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{WebviewUrl, WebviewWindowBuilder};

static WINDOW_COUNTER: AtomicUsize = AtomicUsize::new(1);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_sharekit::init())
        .plugin(tauri_plugin_process::init())
        .manage(AppDb::new())
        .setup(|app| {
            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;

            let new_window = MenuItemBuilder::new("New Window")
                .id("new_window")
                .accelerator("CmdOrCtrl+N")
                .build(app)?;

            let file_menu = SubmenuBuilder::new(app, "File").item(&new_window).build()?;

            let menu = MenuBuilder::new(app).item(&file_menu).build()?;

            app.set_menu(menu)?;

            app.on_menu_event(move |app_handle, event| {
                if event.id().0 == "new_window" {
                    let n = WINDOW_COUNTER.fetch_add(1, Ordering::SeqCst);
                    let label = format!("main_{}", n);
                    let _ = WebviewWindowBuilder::new(app_handle, &label, WebviewUrl::default())
                        .title("MySquad")
                        .inner_size(1200.0, 800.0)
                        .min_inner_size(900.0, 600.0)
                        .build();
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::authenticate,
            commands::unlock_db,
            commands::lock_db,
            commands::get_config,
            commands::set_config,
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
            commands::get_salary_over_time,
            commands::get_projects,
            commands::create_project,
            commands::update_project,
            commands::delete_project,
            commands::get_project_members,
            commands::add_project_member,
            commands::remove_project_member,
            commands::get_project_status_items,
            commands::add_project_status_item,
            commands::update_project_status_item,
            commands::delete_project_status_item,
            commands::get_reports,
            commands::create_report,
            commands::update_report,
            commands::delete_report,
            commands::get_report_detail,
            commands::create_scenario_group,
            commands::delete_scenario_group,
            commands::update_scenario_group,
            commands::update_scenario_group_range,
            commands::add_scenario,
            commands::remove_scenario,
            commands::promote_scenario,
            commands::get_scenario_summaries,
            commands::get_scenario_member_comparison,
            commands::create_meeting,
            commands::get_meetings,
            commands::get_meeting_detail,
            commands::add_meeting_update,
            commands::check_talk_topic_in_meeting,
            commands::delete_meeting,
            commands::create_team_meeting,
            commands::get_team_meetings,
            commands::get_team_meeting_detail,
            commands::delete_team_meeting,
            commands::escalate_talk_topic,
            commands::unescalate_talk_topic,
            commands::resolve_escalated_topic,
            commands::unresolve_escalated_topic,
            commands::get_report_blocks,
            commands::add_report_block,
            commands::remove_report_block,
            commands::reorder_report_blocks,
            commands::get_report_block_data,
            commands::export_data,
            commands::import_data,
            commands::export_data_point_salaries,
            commands::import_data_point_salaries,
            commands::get_talk_topic_by_id,
            commands::global_search,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
