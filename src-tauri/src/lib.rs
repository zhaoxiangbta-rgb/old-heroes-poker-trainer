mod ai;
mod keychain;
mod lan;
mod storage;

use serde::Serialize;
use std::sync::{Mutex, MutexGuard};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

struct Db(Mutex<rusqlite::Connection>);

#[tauri::command]
fn get_lan_mobile_status(service: tauri::State<lan::LanService>) -> lan::LanStatus {
    service.status()
}

#[tauri::command]
fn start_lan_mobile(service: tauri::State<lan::LanService>) -> Result<lan::LanStatus, String> {
    service.start()
}

#[tauri::command]
fn stop_lan_mobile(service: tauri::State<lan::LanService>) -> Result<(), String> {
    service.stop()
}

#[tauri::command]
fn rotate_lan_mobile_token(service: tauri::State<lan::LanService>) -> Result<lan::LanStatus, String> {
    service.rotate()
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportResult {
    cancelled: bool,
    exported: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ImportDialogResult {
    cancelled: bool,
    imported: usize,
    skipped: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    gameplay_settings: Option<storage::GameplaySettings>,
}

fn lock_db<'a>(
    db: &'a tauri::State<'a, Db>,
) -> Result<MutexGuard<'a, rusqlite::Connection>, String> {
    db.0.lock().map_err(|_| "数据库暂时不可用".into())
}

#[tauri::command]
fn save_hand(db: tauri::State<Db>, json: String) -> Result<bool, String> {
    storage::save(&*lock_db(&db)?, &json).map_err(|error| error.to_string())
}

#[tauri::command]
fn replace_hand(db: tauri::State<Db>, json: String) -> Result<(), String> {
    storage::replace(&*lock_db(&db)?, &json).map_err(|error| error.to_string())
}

#[tauri::command]
fn list_hands(db: tauri::State<Db>) -> Result<Vec<String>, String> {
    storage::list(&*lock_db(&db)?).map_err(|_| "读取历史牌局失败".into())
}

#[tauri::command]
fn clear_hands(db: tauri::State<Db>) -> Result<(), String> {
    storage::clear(&*lock_db(&db)?).map_err(|_| "清空历史牌局失败".into())
}

#[tauri::command]
fn get_model_settings(db: tauri::State<Db>) -> Result<storage::ModelSettings, String> {
    storage::load_model_settings(&*lock_db(&db)?).map_err(|error| error.to_string())
}

#[tauri::command]
fn save_model_settings(
    db: tauri::State<Db>,
    settings: storage::ModelSettings,
) -> Result<(), String> {
    storage::save_model_settings(&*lock_db(&db)?, &settings).map_err(|error| error.to_string())
}

#[tauri::command]
fn get_gameplay_settings(db: tauri::State<Db>) -> Result<storage::GameplaySettings, String> {
    storage::load_gameplay_settings(&*lock_db(&db)?).map_err(|error| error.to_string())
}

#[tauri::command]
fn save_gameplay_settings(
    db: tauri::State<Db>,
    settings: storage::GameplaySettings,
) -> Result<(), String> {
    storage::save_gameplay_settings(&*lock_db(&db)?, &settings)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn set_api_key(value: String) -> Result<(), String> {
    keychain::set(&value)
}

#[tauri::command]
fn has_api_key() -> bool {
    keychain::get().is_ok()
}

#[tauri::command]
fn test_ai(base_url: String, model: String) -> Result<ai::ConnectionResult, String> {
    ai::test_connection(&base_url, &model, keychain::get().ok())
}

#[tauri::command]
fn export_hands(app: tauri::AppHandle, db: tauri::State<Db>) -> Result<ExportResult, String> {
    let Some(selected) = app
        .dialog()
        .file()
        .add_filter("JSON", &["json"])
        .set_file_name("老英雄牌局-历史牌局.json")
        .blocking_save_file()
    else {
        return Ok(ExportResult {
            cancelled: true,
            exported: 0,
        });
    };
    let path = selected
        .into_path()
        .map_err(|_| "导出位置无效".to_string())?;
    let exported_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "系统时间无效".to_string())?
        .as_secs()
        .to_string();
    let document = storage::export_document(&*lock_db(&db)?, &exported_at)
        .map_err(|error| error.to_string())?;
    let exported = storage::list(&*lock_db(&db)?)
        .map_err(|_| "读取历史牌局失败".to_string())?
        .len();
    let temporary = path.with_extension(format!("json.{}.tmp", std::process::id()));
    std::fs::write(&temporary, document).map_err(|_| "写入导出文件失败".to_string())?;
    if path.exists() {
        std::fs::remove_file(&path).map_err(|_| "替换导出文件失败".to_string())?;
    }
    std::fs::rename(&temporary, &path).map_err(|_| "完成导出文件失败".to_string())?;
    Ok(ExportResult {
        cancelled: false,
        exported,
    })
}

#[tauri::command]
fn import_hands(app: tauri::AppHandle, db: tauri::State<Db>) -> Result<ImportDialogResult, String> {
    let Some(selected) = app
        .dialog()
        .file()
        .add_filter("JSON", &["json"])
        .blocking_pick_file()
    else {
        return Ok(ImportDialogResult {
            cancelled: true,
            imported: 0,
            skipped: 0,
            gameplay_settings: None,
        });
    };
    let path = selected
        .into_path()
        .map_err(|_| "导入位置无效".to_string())?;
    let document = std::fs::read_to_string(path).map_err(|_| "读取导入文件失败".to_string())?;
    let mut connection = lock_db(&db)?;
    let summary =
        storage::import_document(&mut connection, &document).map_err(|error| error.to_string())?;
    let gameplay_settings = storage::load_gameplay_settings(&connection)
        .map_err(|error| error.to_string())?;
    Ok(ImportDialogResult {
        cancelled: false,
        imported: summary.imported,
        skipped: summary.skipped,
        gameplay_settings: Some(gameplay_settings),
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let directory = app.path().app_data_dir()?;
            std::fs::create_dir_all(&directory)?;
            let connection = rusqlite::Connection::open(directory.join("trainer-v1.sqlite3"))?;
            storage::migrate(&connection)?;
            app.manage(Db(Mutex::new(connection)));
            app.manage(lan::LanService::new(8765));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            save_hand,
            replace_hand,
            list_hands,
            clear_hands,
            get_model_settings,
            save_model_settings,
            get_gameplay_settings,
            save_gameplay_settings,
            set_api_key,
            has_api_key,
            test_ai,
            export_hands,
            import_hands
            ,get_lan_mobile_status
            ,start_lan_mobile
            ,stop_lan_mobile
            ,rotate_lan_mobile_token
        ])
        .run(tauri::generate_context!())
        .expect("应用启动失败")
}
