use std::path::PathBuf;

/// App data directory: `{data_dir}/excalidraw-x` (same layout as the former desktop shell).
pub fn legacy_user_data_dir() -> PathBuf {
  dirs::data_dir()
    .unwrap_or_else(|| PathBuf::from("."))
    .join("excalidraw-x")
}

pub fn recent_files_path() -> PathBuf {
  legacy_user_data_dir().join("recent-files.json")
}

pub fn app_settings_path() -> PathBuf {
  legacy_user_data_dir().join("app-settings.json")
}

pub fn library_cache_path() -> PathBuf {
  legacy_user_data_dir().join("library-cache.excalidrawlib")
}
