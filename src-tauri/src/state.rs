use crate::debug_eprintln;
use crate::paths;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

const MAX_RECENT: usize = 10;

/// `.excalidraw` association / argv / single-instance (shared with `lib.rs`).
pub(crate) fn is_excalidraw_document_path(path: &Path) -> bool {
  path
    .extension()
    .and_then(|e| e.to_str())
    .map(|e| e.eq_ignore_ascii_case("excalidraw"))
    .unwrap_or(false)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LangEntry {
  pub code: String,
  pub label: String,
}

#[derive(Debug, Clone)]
pub struct MenuState {
  pub appearance: String,
  pub zen_mode: bool,
  pub grid_mode: bool,
  pub snap_mode: bool,
  pub view_mode: bool,
  pub lang_code: String,
  pub languages: Vec<LangEntry>,
}

impl Default for MenuState {
  fn default() -> Self {
    Self {
      appearance: "auto".into(),
      zen_mode: false,
      grid_mode: false,
      snap_mode: false,
      view_mode: false,
      lang_code: "en".into(),
      languages: vec![],
    }
  }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettingsDto {
  pub appearance: String,
  pub lang_code: String,
  pub zen_mode: bool,
  pub grid_mode: bool,
  pub snap_mode: bool,
  pub view_mode: bool,
}

#[derive(Debug, Clone)]
pub struct ShellState {
  pub recent_files: Vec<String>,
  pub menu_state: MenuState,
  pub is_dirty: bool,
  pub pending_open_file: Option<String>,
}

impl ShellState {
  pub fn new() -> Self {
    let mut s = Self {
      recent_files: vec![],
      menu_state: MenuState::default(),
      is_dirty: false,
      pending_open_file: None,
    };
    s.load_recent_files();
    s.load_app_settings();
    let raw_args: Vec<String> = std::env::args().collect();
    debug_eprintln!("[excalidraw-x] ShellState::new() argv={raw_args:?}");
    for arg in std::env::args().skip(1) {
      if arg.starts_with('-') {
        continue;
      }
      let p = Path::new(&arg);
      // Match `deliver_open_file_path`: do not require `is_file()` here — argv can race the FS on cold open.
      let ext = p.extension().and_then(|e| e.to_str());
      debug_eprintln!("[excalidraw-x] ShellState::new() checking arg={arg} ext={ext:?}");
      if is_excalidraw_document_path(p) && !p.is_dir() {
        debug_eprintln!("[excalidraw-x] ShellState::new() setting pending_open_file={arg}");
        s.pending_open_file = Some(arg);
        break;
      }
    }
    if s.pending_open_file.is_none() {
      debug_eprintln!("[excalidraw-x] ShellState::new() no .excalidraw path found in argv");
    }
    s
  }

  pub fn load_recent_files(&mut self) {
    let p = paths::recent_files_path();
    if let Ok(text) = fs::read_to_string(&p) {
      if let Ok(parsed) = serde_json::from_str::<Vec<String>>(&text) {
        self.recent_files = parsed
          .into_iter()
          .filter(|f| Path::new(f).is_file())
          .take(MAX_RECENT)
          .collect();
      }
    }
  }

  fn save_recent_files_disk(&self) {
    let _ = fs::create_dir_all(paths::legacy_user_data_dir());
    let p = paths::recent_files_path();
    if let Ok(json) = serde_json::to_string(&self.recent_files) {
      let _ = fs::write(p, json);
    }
  }

  pub fn add_recent_file(&mut self, file_path: String) {
    self.recent_files.retain(|f| f != &file_path);
    self.recent_files.insert(0, file_path);
    self.recent_files.truncate(MAX_RECENT);
    self.save_recent_files_disk();
  }

  pub fn clear_recent_files(&mut self) {
    self.recent_files.clear();
    self.save_recent_files_disk();
  }

  fn load_app_settings(&mut self) {
    let p = paths::app_settings_path();
    let Ok(text) = fs::read_to_string(p) else {
      return;
    };
    let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&text) else {
      return;
    };
    if let Some(a) = parsed.get("appearance").and_then(|v| v.as_str()) {
      if a == "auto" || a == "light" || a == "dark" {
        self.menu_state.appearance = a.into();
      }
    }
    if let Some(l) = parsed.get("langCode").and_then(|v| v.as_str()) {
      if !l.trim().is_empty() {
        self.menu_state.lang_code = l.trim().into();
      }
    }
    if let Some(v) = parsed.get("zenMode").and_then(|v| v.as_bool()) {
      self.menu_state.zen_mode = v;
    }
    if let Some(v) = parsed.get("gridMode").and_then(|v| v.as_bool()) {
      self.menu_state.grid_mode = v;
    }
    if let Some(v) = parsed.get("snapMode").and_then(|v| v.as_bool()) {
      self.menu_state.snap_mode = v;
    }
    if let Some(v) = parsed.get("viewMode").and_then(|v| v.as_bool()) {
      self.menu_state.view_mode = v;
    }
  }

  pub fn save_app_settings_disk(&self) {
    let _ = fs::create_dir_all(paths::legacy_user_data_dir());
    let p = paths::app_settings_path();
    let data = serde_json::json!({
      "appearance": self.menu_state.appearance,
      "langCode": self.menu_state.lang_code,
      "zenMode": self.menu_state.zen_mode,
      "gridMode": self.menu_state.grid_mode,
      "snapMode": self.menu_state.snap_mode,
      "viewMode": self.menu_state.view_mode,
    });
    if let Ok(s) = serde_json::to_string(&data) {
      let _ = fs::write(p, s);
    }
  }

  pub fn app_settings_dto(&self) -> AppSettingsDto {
    AppSettingsDto {
      appearance: self.menu_state.appearance.clone(),
      lang_code: self.menu_state.lang_code.clone(),
      zen_mode: self.menu_state.zen_mode,
      grid_mode: self.menu_state.grid_mode,
      snap_mode: self.menu_state.snap_mode,
      view_mode: self.menu_state.view_mode,
    }
  }
}
