use crate::state::ShellState;
use serde_json::Value;
use std::sync::Mutex;
use tauri::menu::{
  CheckMenuItemBuilder, MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder,
};
use tauri::{AppHandle, Emitter, Manager, Runtime, WebviewWindow};
use tauri_plugin_opener::OpenerExt;

/// Public source repository (shown in Help → About).
const PROJECT_REPO_URL: &str = "https://github.com/y8gao/excalidraw-x";

const LOCALES_JSON: &str = include_str!("../../locales/desktop-ui.json");

fn locale_strings(lang: &str) -> serde_json::Map<String, Value> {
  let root: Value = serde_json::from_str(LOCALES_JSON).unwrap_or(Value::Null);
  let en = root.get("en").and_then(|v| v.as_object()).cloned().unwrap_or_default();
  if lang == "en" {
    return en;
  }
  let ov = root
    .get(lang)
    .and_then(|v| v.as_object())
    .cloned()
    .unwrap_or_default();
  let mut out = en;
  for (k, v) in ov {
    out.insert(k, v);
  }
  out
}

fn t(map: &serde_json::Map<String, Value>, key: &str) -> String {
  map
    .get(key)
    .and_then(|v| v.as_str())
    .unwrap_or(key)
    .to_string()
}

fn normalize_lang(code: &str) -> String {
  match code {
    "zh-Hans" => "zh-CN".into(),
    "zh-HK" => "zh-TW".into(),
    c if c.starts_with("zh-CN") => "zh-CN".into(),
    c if c.starts_with("zh-TW") => "zh-TW".into(),
    c => {
      let root: Value = serde_json::from_str(LOCALES_JSON).unwrap_or(Value::Null);
      if root.get(c).is_some() {
        c.to_string()
      } else {
        "en".into()
      }
    }
  }
}

/// Send synthetic key events to the webview (undo / zoom / find).
pub fn emit_canvas_key<R: Runtime>(win: &WebviewWindow<R>, key: &str, shift: bool) {
  let (primary, primary_val) = if cfg!(target_os = "macos") {
    ("metaKey", "true")
  } else {
    ("ctrlKey", "true")
  };
  let shift_js = if shift { "true" } else { "false" };
  let js = format!(
    r#"(function() {{
      const ev = (type) => {{
        const e = new KeyboardEvent(type, {{
          key: '{key}',
          code: 'Key{uc}',
          bubbles: true,
          {primary}: {primary_val},
          shiftKey: {shift_js},
        }});
        window.dispatchEvent(e);
        document.activeElement && document.activeElement.dispatchEvent(e);
      }};
      ev('keydown');
      ev('keyup');
    }})();"#,
    key = key,
    uc = key.to_uppercase(),
    primary = primary,
    primary_val = primary_val,
    shift_js = shift_js,
  );
  let _ = win.eval(&js);
}

fn emit_action<R: Runtime>(win: &WebviewWindow<R>, action: impl Into<String>) {
  let _ = win.emit("menu-action", action.into());
}

pub fn rebuild_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
  let Some(state) = app.try_state::<Mutex<ShellState>>() else {
    return Ok(());
  };
  let st = state.lock().expect("shell state lock");
  let lang = normalize_lang(&st.menu_state.lang_code);
  let labels = locale_strings(&lang);

  let file_menu = {
    let mut b = SubmenuBuilder::new(app, t(&labels, "menuFile"));
    b = b.item(
      &MenuItemBuilder::with_id("file_open", t(&labels, "menuOpen"))
        .accelerator("CmdOrCtrl+O")
        .build(app)?,
    );
    if st.recent_files.is_empty() {
      b = b.item(
        &MenuItemBuilder::with_id("file_recent_none", t(&labels, "menuNoRecentItems"))
          .enabled(false)
          .build(app)?,
      );
    } else {
      let mut recent = SubmenuBuilder::new(app, t(&labels, "menuOpenRecent"));
      for (i, fp) in st.recent_files.iter().enumerate() {
        let base = std::path::Path::new(fp)
          .file_name()
          .and_then(|s| s.to_str())
          .unwrap_or("?");
        let id = format!("recent:{i}");
        recent = recent.item(&MenuItemBuilder::with_id(&id, base).build(app)?);
      }
      recent = recent.separator();
      recent = recent.item(
        &MenuItemBuilder::with_id("file_clear_recent", t(&labels, "menuClearRecentItems")).build(app)?,
      );
      b = b.item(&recent.build()?);
    }
    b = b.separator();
    b = b.item(
      &MenuItemBuilder::with_id("file_save", t(&labels, "menuSave"))
        .accelerator("CmdOrCtrl+S")
        .build(app)?,
    );
    b = b.item(
      &MenuItemBuilder::with_id("file_save_as", t(&labels, "menuSaveAs"))
        .accelerator("CmdOrCtrl+Shift+S")
        .build(app)?,
    );
    b = b.separator();
    b = b.item(
      &MenuItemBuilder::with_id("file_export_image", t(&labels, "menuExportImage"))
        .accelerator("CmdOrCtrl+Shift+E")
        .build(app)?,
    );
    b = b.separator();
    b = b.item(&PredefinedMenuItem::quit(app, None::<&str>)?);
    b.build()?
  };

  let edit_menu = {
    let mut b = SubmenuBuilder::new(app, t(&labels, "menuEdit"));
    b = b.item(
      &MenuItemBuilder::with_id("edit_undo", t(&labels, "menuUndo"))
        .accelerator("CmdOrCtrl+Z")
        .build(app)?,
    );
    b = b.item(
      &MenuItemBuilder::with_id("edit_redo", t(&labels, "menuRedo"))
        .accelerator("CmdOrCtrl+Shift+Z")
        .build(app)?,
    );
    b = b.separator();
    b = b.cut();
    b = b.copy();
    b = b.paste();
    b = b.select_all();
    b = b.separator();
    b = b.item(
      &MenuItemBuilder::with_id("edit_find", t(&labels, "menuFindOnCanvas"))
        .accelerator("CmdOrCtrl+F")
        .build(app)?,
    );
    b.build()?
  };

  let view_menu = {
    let mut b = SubmenuBuilder::new(app, t(&labels, "menuView"));
    b = b.item(
      &CheckMenuItemBuilder::with_id("view_view_mode", t(&labels, "menuViewMode"))
        .checked(st.menu_state.view_mode)
        .accelerator("Alt+R")
        .build(app)?,
    );
    b = b.item(
      &CheckMenuItemBuilder::with_id("view_zen_mode", t(&labels, "menuZenMode"))
        .checked(st.menu_state.zen_mode)
        .accelerator("Alt+Z")
        .build(app)?,
    );
    b = b.item(
      &CheckMenuItemBuilder::with_id("view_grid", t(&labels, "menuGrid"))
        .checked(st.menu_state.grid_mode)
        .accelerator("CmdOrCtrl+'")
        .build(app)?,
    );
    b = b.item(
      &CheckMenuItemBuilder::with_id("view_snap", t(&labels, "menuSnapToObjects"))
        .checked(st.menu_state.snap_mode)
        .accelerator("Alt+S")
        .build(app)?,
    );
    b = b.separator();
    b = b.item(
      &MenuItemBuilder::with_id("view_zoom_in", t(&labels, "menuZoomIn"))
        .accelerator("CmdOrCtrl+=")
        .build(app)?,
    );
    b = b.item(
      &MenuItemBuilder::with_id("view_zoom_out", t(&labels, "menuZoomOut"))
        .accelerator("CmdOrCtrl+-")
        .build(app)?,
    );
    b = b.item(
      &MenuItemBuilder::with_id("view_zoom_reset", t(&labels, "menuResetZoom"))
        .accelerator("CmdOrCtrl+0")
        .build(app)?,
    );
    b = b.separator();
    b = b.item(
      &MenuItemBuilder::with_id("view_reset_canvas", t(&labels, "menuResetCanvas"))
        .accelerator("CmdOrCtrl+Delete")
        .build(app)?,
    );
    b = b.separator();
    b = b.item(
      &MenuItemBuilder::with_id("view_toggle_sidebar", t(&labels, "menuToggleSidebar"))
        .accelerator("CmdOrCtrl+B")
        .build(app)?,
    );
    b.build()?
  };

  let library_menu = {
    let mut b = SubmenuBuilder::new(app, t(&labels, "menuLibrary"));
    b = b.item(
      &MenuItemBuilder::with_id("lib_browse_web", t(&labels, "menuBrowseLibrariesWeb"))
        .accelerator("CmdOrCtrl+Alt+B")
        .build(app)?,
    );
    b = b.separator();
    b = b.item(
      &MenuItemBuilder::with_id("lib_import", t(&labels, "menuImportLibrary"))
        .accelerator("CmdOrCtrl+Shift+O")
        .build(app)?,
    );
    b = b.item(
      &MenuItemBuilder::with_id("lib_save_as", t(&labels, "menuSaveLibraryAs"))
        .accelerator("CmdOrCtrl+Alt+E")
        .build(app)?,
    );
    b = b.separator();
    b = b.item(
      &MenuItemBuilder::with_id("lib_reset", t(&labels, "menuResetLibrary"))
        .accelerator("CmdOrCtrl+Shift+Backspace")
        .build(app)?,
    );
    b = b.separator();
    b = b.item(
      &MenuItemBuilder::with_id("lib_toggle", t(&labels, "menuToggleLibrary"))
        .accelerator("CmdOrCtrl+Alt+L")
        .build(app)?,
    );
    b.build()?
  };

  let window_menu = {
    let mut b = SubmenuBuilder::new(app, t(&labels, "menuWindow"));
    let mut appearance = SubmenuBuilder::new(app, t(&labels, "menuAppearance"));
    appearance = appearance.item(
      &CheckMenuItemBuilder::with_id("app_appearance_auto", t(&labels, "menuAppearanceAuto"))
        .checked(st.menu_state.appearance == "auto")
        .build(app)?,
    );
    appearance = appearance.item(
      &CheckMenuItemBuilder::with_id("app_appearance_light", t(&labels, "menuAppearanceLight"))
        .checked(st.menu_state.appearance == "light")
        .build(app)?,
    );
    appearance = appearance.item(
      &CheckMenuItemBuilder::with_id("app_appearance_dark", t(&labels, "menuAppearanceDark"))
        .checked(st.menu_state.appearance == "dark")
        .build(app)?,
    );
    b = b.item(&appearance.build()?);
    if !st.menu_state.languages.is_empty() {
      let mut lang_sub = SubmenuBuilder::new(app, t(&labels, "menuLanguage"));
      for lang_ent in &st.menu_state.languages {
        let id = format!("lang_pick:{}", lang_ent.code);
        let checked = st.menu_state.lang_code == lang_ent.code;
        lang_sub = lang_sub.item(
          &CheckMenuItemBuilder::with_id(&id, &lang_ent.label)
            .checked(checked)
            .build(app)?,
        );
      }
      b = b.item(&lang_sub.build()?);
    }
    b = b.separator();
    b = b.fullscreen();
    b.build()?
  };

  let help_menu = {
    let mut b = SubmenuBuilder::new(app, t(&labels, "menuHelp"));
    b = b.item(
      &MenuItemBuilder::with_id("help_shortcuts", t(&labels, "menuShortcuts")).build(app)?,
    );
    b = b.item(
      &MenuItemBuilder::with_id("help_command_palette", t(&labels, "menuCommandPalette"))
        .accelerator("CmdOrCtrl+/")
        .build(app)?,
    );
    b = b.separator();
    b = b.item(
      &MenuItemBuilder::with_id("help_about", t(&labels, "menuAboutExcalidrawX")).build(app)?,
    );
    b.build()?
  };

  let menu = MenuBuilder::new(app)
    .items(&[&file_menu, &edit_menu, &view_menu, &library_menu, &window_menu, &help_menu])
    .build()?;
  app.set_menu(menu)?;
  Ok(())
}

pub fn handle_menu_event<R: Runtime>(app: &AppHandle<R>, event: &tauri::menu::MenuEvent) {
  let id = event.id().as_ref();
  let Some(win) = app.get_webview_window("main") else {
    return;
  };

  let Some(state_mutex) = app.try_state::<Mutex<ShellState>>() else {
    return;
  };

  macro_rules! emit {
    ($a:expr) => {
      emit_action(&win, $a)
    };
  }

  match id {
    "file_open" => emit!("open"),
    "file_save" => emit!("save"),
    "file_save_as" => emit!("save-as"),
    "file_export_image" => emit!("export-image"),
    "file_clear_recent" => {
      if let Ok(mut s) = state_mutex.lock() {
        s.clear_recent_files();
      }
      let _ = rebuild_menu(app);
      emit!("recent-cleared");
    }
    s if s.starts_with("recent:") => {
      let idx: usize = s.trim_start_matches("recent:").parse().unwrap_or(usize::MAX);
      if let Ok(s) = state_mutex.lock() {
        if let Some(fp) = s.recent_files.get(idx) {
          emit!(format!("open-recent:{fp}"));
        }
      }
    }
    "edit_undo" => emit_canvas_key(&win, "z", false),
    "edit_redo" => emit_canvas_key(&win, "z", true),
    "edit_find" => emit_canvas_key(&win, "f", false),
    "view_zoom_in" => emit_canvas_key(&win, "=", false),
    "view_zoom_out" => emit_canvas_key(&win, "-", false),
    "view_zoom_reset" => emit_canvas_key(&win, "0", false),
    "view_reset_canvas" => emit!("reset-canvas"),
    "view_toggle_sidebar" => emit!("toggle-sidebar"),
    "lib_browse_web" => {
      let _ = app
        .opener()
        .open_url("https://libraries.excalidraw.com/", Option::<&str>::None);
    }
    "lib_import" => emit!("import-library"),
    "lib_save_as" => emit!("save-library-as"),
    "lib_reset" => emit!("reset-library"),
    "lib_toggle" => emit!("toggle-library"),
    "help_shortcuts" => emit!("help"),
    "help_command_palette" => emit!("command-palette"),
    "help_about" => {
      // Collect strings while holding the lock briefly, then drop it before
      // the blocking dialog. Holding the mutex across rfd::show() freezes all
      // other IPC (commands, menu rebuilds, the re-emit loop) until the dialog
      // closes — and can deadlock when they flood in on dismiss.
      let (title, detail, ok_lbl, open_lbl) = {
        let Ok(st) = state_mutex.lock() else { return };
        let lang = normalize_lang(&st.menu_state.lang_code);
        let labels = locale_strings(&lang);
        let version = app.package_info().version.to_string();
        let d = format!(
          "{}\n{}: {}\n\n{}\n\n{}: {}\n{}: {}",
          "ExcalidrawX",
          t(&labels, "aboutDialogVersionLine"),
          version,
          t(&labels, "aboutDialogProjectHint"),
          t(&labels, "aboutDialogHostLine"),
          tauri::VERSION,
          t(&labels, "aboutDialogWebViewLine"),
          tauri::webview_version().unwrap_or_else(|_| "?".into()),
        );
        (
          t(&labels, "aboutDialogTitle"),
          d,
          t(&labels, "aboutDialogOk"),
          t(&labels, "aboutDialogOpenGithub"),
        )
      }; // lock dropped here

      // No set_parent: on macOS, attaching to the parent window creates a
      // sheet dialog (beginSheetModalForWindow + semaphore) whose nested
      // event loop conflicts with Tauri's, causing a hang when dismissed.
      let result = rfd::MessageDialog::new()
        .set_title(&title)
        .set_description(&detail)
        .set_buttons(rfd::MessageButtons::OkCancelCustom(
          ok_lbl.clone(),
          open_lbl.clone(),
        ))
        .show();
      if let rfd::MessageDialogResult::Custom(s) = result {
        if s == open_lbl {
          let _ = app
            .opener()
            .open_url(String::from(PROJECT_REPO_URL), Option::<&str>::None);
        }
      }
    }
    "app_appearance_auto" => {
      if let Ok(mut s) = state_mutex.lock() {
        s.menu_state.appearance = "auto".into();
        let _ = win.set_theme(None);
        s.save_app_settings_disk();
      }
      let _ = rebuild_menu(app);
      emit!("appearance:auto");
    }
    "app_appearance_light" => {
      if let Ok(mut s) = state_mutex.lock() {
        s.menu_state.appearance = "light".into();
        let _ = win.set_theme(Some(tauri::Theme::Light));
        s.save_app_settings_disk();
      }
      let _ = rebuild_menu(app);
      emit!("appearance:light");
    }
    "app_appearance_dark" => {
      if let Ok(mut s) = state_mutex.lock() {
        s.menu_state.appearance = "dark".into();
        let _ = win.set_theme(Some(tauri::Theme::Dark));
        s.save_app_settings_disk();
      }
      let _ = rebuild_menu(app);
      emit!("appearance:dark");
    }
    s if s.starts_with("lang_pick:") => {
      let code = s.trim_start_matches("lang_pick:").to_string();
      if let Ok(mut st) = state_mutex.lock() {
        st.menu_state.lang_code = code.clone();
        st.save_app_settings_disk();
      }
      let _ = rebuild_menu(app);
      emit!(format!("lang:{code}"));
    }
    "view_view_mode" => {
      let checked = if let Ok(mut s) = state_mutex.lock() {
        let new_val = !s.menu_state.view_mode;
        s.menu_state.view_mode = new_val;
        s.save_app_settings_disk();
        new_val
      } else {
        return;
      };
      let _ = rebuild_menu(app);
      emit!(format!("view-mode:{checked}"));
    }
    "view_zen_mode" => {
      let checked = if let Ok(mut s) = state_mutex.lock() {
        let new_val = !s.menu_state.zen_mode;
        s.menu_state.zen_mode = new_val;
        s.save_app_settings_disk();
        new_val
      } else {
        return;
      };
      let _ = rebuild_menu(app);
      emit!(format!("zen-mode:{checked}"));
    }
    "view_grid" => {
      let checked = if let Ok(mut s) = state_mutex.lock() {
        let new_val = !s.menu_state.grid_mode;
        s.menu_state.grid_mode = new_val;
        s.save_app_settings_disk();
        new_val
      } else {
        return;
      };
      let _ = rebuild_menu(app);
      emit!(format!("grid:{checked}"));
    }
    "view_snap" => {
      let checked = if let Ok(mut s) = state_mutex.lock() {
        let new_val = !s.menu_state.snap_mode;
        s.menu_state.snap_mode = new_val;
        s.save_app_settings_disk();
        new_val
      } else {
        return;
      };
      let _ = rebuild_menu(app);
      emit!(format!("snap:{checked}"));
    }
    _ => {}
  }
}
