use crate::paths;
use crate::state::ShellState;
use serde::{Deserialize, Serialize};
use std::fs;
use std::sync::Mutex;
use tauri::Manager;
use tauri::State;
use tauri_plugin_opener::OpenerExt;

use crate::debug_eprintln;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileFilter {
  pub name: String,
  pub extensions: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveFileOpts {
  pub default_path: String,
  pub filters: Vec<FileFilter>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveFileResult {
  pub canceled: bool,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub file_path: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenFileResult {
  pub canceled: bool,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub data: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub file_path: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryPickResult {
  pub canceled: bool,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub data: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryCacheResult {
  pub exists: bool,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub data: Option<String>,
}

fn rfd_apply_filters(mut dlg: rfd::FileDialog, filters: &[FileFilter]) -> rfd::FileDialog {
  for f in filters {
    let exts: Vec<String> = f
      .extensions
      .iter()
      .map(|e| {
        let e = e.trim();
        if e == "*" {
          "*".into()
        } else {
          e.trim_start_matches('.').to_string()
        }
      })
      .collect();
    let ext_refs: Vec<&str> = exts.iter().map(|s| s.as_str()).collect();
    dlg = dlg.add_filter(&f.name, &ext_refs);
  }
  dlg
}

#[tauri::command]
pub fn open_allowed_url(app: tauri::AppHandle, url: String) -> Result<(), String> {
  if !url.contains("libraries.excalidraw.com") {
    return Err("URL not allowed".into());
  }
  app
    .opener()
    .open_url(url, Option::<&str>::None)
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn dialog_open_file() -> Result<OpenFileResult, String> {
  let pick = rfd::FileDialog::new()
    .add_filter("Excalidraw", &["excalidraw", "json"])
    .add_filter("All Files", &["*"])
    .pick_file();
  let Some(path) = pick else {
    return Ok(OpenFileResult {
      canceled: true,
      data: None,
      file_path: None,
    });
  };
  let file_path = path.to_string_lossy().into_owned();
  let data = fs::read_to_string(&path).map_err(|e| e.to_string())?;
  Ok(OpenFileResult {
    canceled: false,
    data: Some(data),
    file_path: Some(file_path),
  })
}

#[tauri::command]
pub fn dialog_open_library_file() -> Result<LibraryPickResult, String> {
  let pick = rfd::FileDialog::new()
    .add_filter("Excalidraw library", &["excalidrawlib", "json"])
    .add_filter("All Files", &["*"])
    .pick_file();
  let Some(path) = pick else {
    return Ok(LibraryPickResult {
      canceled: true,
      data: None,
    });
  };
  let data = fs::read_to_string(&path).map_err(|e| e.to_string())?;
  Ok(LibraryPickResult {
    canceled: false,
    data: Some(data),
  })
}

#[tauri::command]
pub fn dialog_save_file(opts: SaveFileOpts) -> Result<SaveFileResult, String> {
  let mut dlg = rfd::FileDialog::new().set_file_name(&opts.default_path);
  if !opts.filters.is_empty() {
    dlg = rfd_apply_filters(dlg, &opts.filters);
  }
  let pick = dlg.save_file();
  let Some(path) = pick else {
    return Ok(SaveFileResult {
      canceled: true,
      file_path: None,
    });
  };
  Ok(SaveFileResult {
    canceled: false,
    file_path: Some(path.to_string_lossy().into_owned()),
  })
}

#[tauri::command]
pub fn fs_read_file(file_path: String) -> Result<String, String> {
  fs::read_to_string(&file_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn fs_write_text(file_path: String, data: String) -> Result<(), String> {
  fs::write(&file_path, data).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn fs_write_binary(file_path: String, data: Vec<u8>) -> Result<(), String> {
  fs::write(&file_path, data).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn library_read_cache() -> Result<LibraryCacheResult, String> {
  let p = paths::library_cache_path();
  if !p.is_file() {
    return Ok(LibraryCacheResult {
      exists: false,
      data: None,
    });
  }
  match fs::read_to_string(&p) {
    Ok(data) => Ok(LibraryCacheResult {
      exists: true,
      data: Some(data),
    }),
    Err(_) => Ok(LibraryCacheResult {
      exists: false,
      data: None,
    }),
  }
}

#[tauri::command]
pub fn library_write_cache(data: String) -> Result<(), String> {
  let _ = fs::create_dir_all(paths::legacy_user_data_dir());
  fs::write(paths::library_cache_path(), data).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn library_clear_cache() -> Result<(), String> {
  let p = paths::library_cache_path();
  if p.is_file() {
    fs::remove_file(p).map_err(|e| e.to_string())?;
  }
  Ok(())
}

#[tauri::command]
pub fn get_app_settings(state: State<'_, Mutex<ShellState>>) -> Result<crate::state::AppSettingsDto, String> {
  let s = state.lock().map_err(|e| e.to_string())?;
  Ok(s.app_settings_dto())
}

#[tauri::command]
pub fn menu_state_update(
  app: tauri::AppHandle,
  state: State<'_, Mutex<ShellState>>,
  state_payload: serde_json::Value,
) -> Result<(), String> {
  let mut s = state.lock().map_err(|e| e.to_string())?;
  if let Some(z) = state_payload.get("zenMode").and_then(|v| v.as_bool()) {
    s.menu_state.zen_mode = z;
  }
  if let Some(g) = state_payload.get("gridMode").and_then(|v| v.as_bool()) {
    s.menu_state.grid_mode = g;
  }
  if let Some(sn) = state_payload.get("snapMode").and_then(|v| v.as_bool()) {
    s.menu_state.snap_mode = sn;
  }
  if let Some(v) = state_payload.get("viewMode").and_then(|v| v.as_bool()) {
    s.menu_state.view_mode = v;
  }
  s.save_app_settings_disk();
  drop(s);
  crate::menu::rebuild_menu(&app).map_err(|e| e.to_string())?;
  Ok(())
}

#[tauri::command]
pub fn menu_set_languages(
  app: tauri::AppHandle,
  state: State<'_, Mutex<ShellState>>,
  languages: Vec<crate::state::LangEntry>,
) -> Result<(), String> {
  let mut s = state.lock().map_err(|e| e.to_string())?;
  s.menu_state.languages = languages;
  drop(s);
  crate::menu::rebuild_menu(&app).map_err(|e| e.to_string())?;
  Ok(())
}

#[tauri::command]
pub fn menu_add_recent(
  app: tauri::AppHandle,
  state: State<'_, Mutex<ShellState>>,
  file_path: String,
) -> Result<(), String> {
  let mut s = state.lock().map_err(|e| e.to_string())?;
  s.add_recent_file(file_path);
  drop(s);
  crate::menu::rebuild_menu(&app).map_err(|e| e.to_string())?;
  Ok(())
}

#[tauri::command]
pub fn get_recent_files(state: State<'_, Mutex<ShellState>>) -> Result<Vec<String>, String> {
  let s = state.lock().map_err(|e| e.to_string())?;
  Ok(s.recent_files.clone())
}

#[tauri::command]
pub fn set_dirty(state: State<'_, Mutex<ShellState>>, dirty: bool) -> Result<(), String> {
  let mut s = state.lock().map_err(|e| e.to_string())?;
  s.is_dirty = dirty;
  Ok(())
}

#[tauri::command]
pub fn set_window_title(app: tauri::AppHandle, title: String) -> Result<(), String> {
  if let Some(w) = app.get_webview_window("main") {
    w.set_title(&title).map_err(|e| e.to_string())?;
  }
  Ok(())
}

#[tauri::command]
pub fn toggle_fullscreen(app: tauri::AppHandle) -> Result<(), String> {
  if let Some(w) = app.get_webview_window("main") {
    let next = !w.is_fullscreen().map_err(|e| e.to_string())?;
    w.set_fullscreen(next).map_err(|e| e.to_string())?;
  }
  Ok(())
}

#[tauri::command]
pub fn set_theme(app: tauri::AppHandle, theme: String, state: State<'_, Mutex<ShellState>>) -> Result<(), String> {
  let appearance = {
    let s = state.lock().map_err(|e| e.to_string())?;
    s.menu_state.appearance.clone()
  };
  if appearance != "auto" {
    if let Some(w) = app.get_webview_window("main") {
      let t = if theme == "dark" {
        tauri::Theme::Dark
      } else {
        tauri::Theme::Light
      };
      let _ = w.set_theme(Some(t));
    }
  }
  Ok(())
}

#[tauri::command]
pub fn close_window_confirmed(app: tauri::AppHandle, state: State<'_, Mutex<ShellState>>) -> Result<(), String> {
  let mut s = state.lock().map_err(|e| e.to_string())?;
  s.is_dirty = false;
  drop(s);
  if let Some(w) = app.get_webview_window("main") {
    w.close().map_err(|e| e.to_string())?;
  }
  Ok(())
}

#[tauri::command]
pub fn relaunch_app(app: tauri::AppHandle) {
  tauri::process::restart(&app.env());
}

#[tauri::command]
pub fn take_pending_os_file(state: State<'_, Mutex<ShellState>>) -> Option<String> {
  let path = state.lock().ok()?.pending_open_file.take();
  debug_eprintln!("[excalidraw-x] take_pending_os_file returning={path:?}");
  path
}

/// Bridge so critical JS-side diagnostic messages appear in the terminal alongside Rust logs.
#[tauri::command]
pub fn js_log(level: String, message: String) {
  debug_eprintln!("[excalidraw-x] JS:{level}: {message}");
}
