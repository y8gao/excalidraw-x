#![recursion_limit = "256"]

mod commands;
mod menu;
mod paths;
mod state;

use state::ShellState;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

macro_rules! debug_eprintln {
  ($($arg:tt)*) => {
    if cfg!(debug_assertions) {
      eprintln!($($arg)*);
    }
  };
}
pub(crate) use debug_eprintln;

fn apply_theme_for_appearance(win: &tauri::WebviewWindow, appearance: &str) {
  match appearance {
    "light" => {
      let _ = win.set_theme(Some(tauri::Theme::Light));
    }
    "dark" => {
      let _ = win.set_theme(Some(tauri::Theme::Dark));
    }
    _ => {
      let _ = win.set_theme(None);
    }
  }
}

/// Windows/Linux: file path is usually in `argv` → `ShellState.pending_open_file` → `take_pending_os_file`.
/// macOS: Launch Services delivers **no reliable argv** for "Open With"; use [`RunEvent::Opened`] instead.
///
/// Always queue `pending_open_file` when the path is valid: `WebviewWindow::emit` can succeed while the
/// frontend has not yet subscribed to `open-file-path`, which would drop the event. The shell still
/// emits for the hot path (app already running, listener registered).
fn deliver_open_file_path(app: &AppHandle, path: String) {
  let p = Path::new(&path);
  if !state::is_excalidraw_document_path(p) || p.is_dir() {
    debug_eprintln!(
      "[excalidraw-x] deliver_open_file_path REJECTED path={path} ext={ext:?} is_dir={is_dir}",
      ext = p.extension(),
      is_dir = p.is_dir()
    );
    return;
  }
  debug_eprintln!("[excalidraw-x] deliver_open_file_path ACCEPTED path={path}");
  if let Ok(mut s) = app.state::<Mutex<ShellState>>().lock() {
    s.pending_open_file = Some(path.clone());
    debug_eprintln!("[excalidraw-x] pending_open_file SET to={path}");
  } else {
    debug_eprintln!("[excalidraw-x] pending_open_file LOCK FAILED for path={path}");
  }
  if let Some(w) = app.get_webview_window("main") {
    let _ = w.emit("open-file-path", path.as_str());
    debug_eprintln!("[excalidraw-x] emitted open-file-path event for={path}");
  } else {
    debug_eprintln!("[excalidraw-x] NO main webview window, cannot emit open-file-path");
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
      debug_eprintln!("[excalidraw-x] single_instance callback: argv={argv:?}");
      if let Some(w) = app.get_webview_window("main") {
        let _ = w.set_focus();
      }
      for arg in argv {
        if arg.starts_with('-') {
          continue;
        }
        let p = PathBuf::from(&arg);
        if state::is_excalidraw_document_path(&p) && !p.is_dir() {
          debug_eprintln!("[excalidraw-x] single_instance: delivering path={arg}");
          deliver_open_file_path(app, arg);
        }
      }
    }))
    .manage(Mutex::new(ShellState::new()))
    .invoke_handler(tauri::generate_handler![
      commands::open_allowed_url,
      commands::dialog_open_file,
      commands::dialog_open_library_file,
      commands::dialog_save_file,
      commands::fs_read_file,
      commands::fs_write_text,
      commands::fs_write_binary,
      commands::library_read_cache,
      commands::library_write_cache,
      commands::library_clear_cache,
      commands::get_app_settings,
      commands::menu_state_update,
      commands::menu_set_languages,
      commands::menu_add_recent,
      commands::get_recent_files,
      commands::set_dirty,
      commands::set_window_title,
      commands::toggle_fullscreen,
      commands::set_theme,
      commands::close_window_confirmed,
      commands::relaunch_app,
      commands::take_pending_os_file,
      commands::js_log,
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        let _ = app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        );
      }

      {
        let state = app.state::<Mutex<ShellState>>();
        let st = state.lock().expect("state");
        let appearance = st.menu_state.appearance.clone();
        drop(st);

        if let Some(win) = app.get_webview_window("main") {
          apply_theme_for_appearance(&win, &appearance);
        }
      }

      menu::rebuild_menu(app.handle())?;

      let win = app
        .get_webview_window("main")
        .expect("main window must exist");

      let app_handle = app.handle().clone();
      win.on_window_event(move |ev| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = ev {
          let dirty = app_handle
            .state::<Mutex<ShellState>>()
            .lock()
            .map(|s| s.is_dirty)
            .unwrap_or(false);
          if dirty {
            api.prevent_close();
            if let Some(w) = app_handle.get_webview_window("main") {
              let _ = w.emit("menu-action", "confirm-close");
            }
          }
        }
      });

      #[cfg(target_os = "macos")]
      {
        // Cold start: `RunEvent::Opened` can queue `pending_open_file` before the webview subscribes to
        // `open-file-path`, and the first emit is dropped. Re-emit while pending is still set so the
        // listener can pick it up (UTI / Launch Services fixes in `tauri.conf.json` also help delivery).
        let app_handle = app.handle().clone();
        std::thread::spawn(move || {
          // Re-emit at increasing intervals; once the frontend consumes pending_open_file via
          // take_pending_os_file, the loop stops naturally (pending becomes None).
          let delays: [u64; 10] = [150, 350, 600, 900, 1300, 1800, 2500, 3500, 5000, 7500];
          for (idx, &delay_ms) in delays.iter().enumerate() {
            std::thread::sleep(Duration::from_millis(delay_ms));
            let pending = app_handle
              .try_state::<Mutex<ShellState>>()
              .and_then(|st| st.lock().ok().and_then(|s| s.pending_open_file.clone()));
            let Some(path) = pending else {
              debug_eprintln!("[excalidraw-x] re-emit #{idx} @{delay_ms}ms: pending_open_file consumed, stopping");
              return;
            };
            debug_eprintln!("[excalidraw-x] re-emit #{idx} @{delay_ms}ms: emitting open-file-path for={path}");
            if let Some(w) = app_handle.get_webview_window("main") {
              let _ = w.emit("open-file-path", path.as_str());
            } else {
              debug_eprintln!("[excalidraw-x] re-emit #{idx} @{delay_ms}ms: no main window yet");
            }
          }
          // After all scheduled re-emits, keep trying every 1000ms as long as pending is still set.
          // This covers very slow webview loads where the initial schedule wasn't enough.
          let mut extra = 0u32;
          loop {
            std::thread::sleep(Duration::from_millis(1000));
            extra += 1;
            let pending = app_handle
              .try_state::<Mutex<ShellState>>()
              .and_then(|st| st.lock().ok().and_then(|s| s.pending_open_file.clone()));
            let Some(path) = pending else {
              debug_eprintln!("[excalidraw-x] re-emit extra #{extra}: pending_open_file consumed, stopping");
              return;
            };
            if extra > 30 {
              debug_eprintln!("[excalidraw-x] re-emit extra #{extra}: giving up after 30 extra attempts");
              return;
            }
            debug_eprintln!("[excalidraw-x] re-emit extra #{extra}: still pending, re-emitting for={path}");
            if let Some(w) = app_handle.get_webview_window("main") {
              let _ = w.emit("open-file-path", path.as_str());
            }
          }
        });
      }

      Ok(())
    })
    .on_menu_event(|app, event| {
      menu::handle_menu_event(app, &event);
    })
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    .run(|app, event| {
      #[cfg(target_os = "macos")]
      match &event {
        tauri::RunEvent::Ready => {
          debug_eprintln!("[excalidraw-x] RunEvent::Ready - app fully initialized");
          // On cold start, Opened may fire very early. Check if we already have a pending file
          // and re-emit in case the first emit was dropped (webview not ready yet).
          let pending = app
            .state::<Mutex<ShellState>>()
            .lock()
            .ok()
            .and_then(|s| s.pending_open_file.clone());
          if let Some(ref path) = pending {
            debug_eprintln!("[excalidraw-x] RunEvent::Ready: pending_open_file already set to={path}, re-emitting");
            if let Some(w) = app.get_webview_window("main") {
              let _ = w.emit("open-file-path", path.as_str());
            }
          }
        }
        tauri::RunEvent::Opened { urls } => {
          debug_eprintln!("[excalidraw-x] RunEvent::Opened with {} urls", urls.len());
          for (i, opened) in urls.iter().enumerate() {
            debug_eprintln!(
              "[excalidraw-x] Opened url[{i}]: scheme={scheme}, path={path}",
              scheme = opened.scheme(),
              path = opened.path()
            );
            let path = if opened.scheme() == "file" {
              opened.to_file_path().ok().or_else(|| {
                debug_eprintln!("[excalidraw-x] Opened url[{i}]: to_file_path failed, trying path() fallback");
                let raw = opened.path();
                (!raw.is_empty()).then(|| PathBuf::from(raw))
              })
            } else {
              debug_eprintln!("[excalidraw-x] Opened url[{i}]: scheme is not 'file', skipping");
              None
            };
            let Some(path) = path else {
              debug_eprintln!("[excalidraw-x] Opened url[{i}]: no valid file path, skipping");
              continue;
            };
            let ext = path.extension().and_then(|e| e.to_str());
            let is_dir = path.is_dir();
            debug_eprintln!(
              "[excalidraw-x] Opened url[{i}]: resolved_path={path} ext={ext:?} is_dir={is_dir}",
              path = path.display()
            );
            if state::is_excalidraw_document_path(&path) && !path.is_dir() {
              debug_eprintln!("[excalidraw-x] Opened url[{i}]: delivering path");
              deliver_open_file_path(app, path.to_string_lossy().into_owned());
            } else {
              debug_eprintln!("[excalidraw-x] Opened url[{i}]: rejected (not .excalidraw or is dir)");
            }
          }
        }
        _ => {}
      }
    });
}
