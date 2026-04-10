# ExcalidrawX

[![CI](https://github.com/y8gao/excalidraw-x/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/y8gao/excalidraw-x/actions/workflows/ci.yml)

**ExcalidrawX** is a desktop application that wraps [Excalidraw](https://excalidraw.com/) in [Electron](https://www.electronjs.org/). You get the same infinite canvas, shapes, collaboration-oriented workflow, and library as the web app, but with a **native menu bar**, **real file paths**, **offline-friendly bundling**, and **OS-integrated** behavior suited to daily use on Windows, macOS, or Linux.

Excalidraw itself is an open-source virtual whiteboard. This repository only adds the **desktop shell and integrations** described below; all drawing features come from `@excalidraw/excalidraw`.

---

## Features on top of Excalidraw

| Area | What ExcalidrawX adds |
|------|------------------------|
| **Files** | **Open / Save / Save As** for `.excalidraw` (and JSON) via native dialogs; **Export PNG** to a chosen path; **Print** through the system print dialog. |
| **Recent files** | **Open Recent** in the menu and on the **welcome screen**; list persisted under the app user-data folder; **clear recent** from the menu. |
| **Unsaved changes** | **Dirty tracking** so the window close flow and **New / Open** can prompt to **Save**, **Discard**, or **Cancel** before losing work. |
| **Window & title** | **Title bar** shows `ExcalidrawX - <filename>` or **Untitled**; integrates with the OS close guard when there are unsaved changes. |
| **Native menu** | Full **File**, **Edit**, **View**, **Library**, **Window**, and **Help** menus with standard accelerators (e.g. Ctrl+O/S, zoom, find on canvas). Menu **checkboxes** stay in sync with Excalidraw (zen, grid, snap, view mode). |
| **Appearance** | **Auto / Light / Dark** under **Window → Appearance**, tied to **Excalidraw’s theme** and the OS when Auto is selected. |
| **Language** | **Window → Language** submenu built from Excalidraw’s built-in locale list. |
| **Canvas** | **View → Reset canvas** with a confirmation dialog; **Canvas Settings** side panel tab (custom tab + Excalidraw’s change-canvas-background control). **View → Toggle Sidebar** (Ctrl/Cmd+B) opens the sidebar on the **Canvas Settings** tab. |
| **Library** | Dedicated **Library** menu: browse the official libraries site in the **system browser**, **import** / **save** `.excalidrawlib` files, **reset** personal library items (with confirmation), and **toggle** the library sidebar (docked). See [Library menu & cache](#library-menu--cache) below. |
| **Library cache** | The full library (built-in rows, imports, and unsaved changes) is **persisted automatically** under the app **user data** directory as `library-cache.excalidrawlib` and **restored on the next launch**. Invalid cache files are discarded. This is **per device** (not cloud-synced). |
| **UX polish** | In-app **hamburger menu** is hidden so actions live in the **native menubar**; **modal dialogs** (reset canvas / reset library / unsaved) support **Escape**, **backdrop click**, and **focus trap**. Opening **libraries.excalidraw.com** from the app uses the **default browser**, not an in-app window. |
| **Distribution** | From source you can produce **ZIP** packages per platform with **Electron Forge**; optional **Windows code signing**. Details are in the [Development guide](DEVELOPMENT.md). |
| **Quality** | **Jest** and **ESLint** in the repository; the UI bundle includes fonts and assets **without relying on a public CDN** for the app shell. See [Development guide](DEVELOPMENT.md) to run tests and lint. |

---

## Library menu & cache

### Menu actions

| Item | Shortcut (Windows / Linux) | Shortcut (macOS) | What it does |
|------|---------------------------|------------------|--------------|
| **Browse libraries (web)…** | Ctrl+Alt+B | ⌥⌘B | Opens [libraries.excalidraw.com](https://libraries.excalidraw.com/) in the **system browser**. |
| **Import Library…** | Ctrl+Shift+O | ⇧⌘O | Native file picker for `.excalidrawlib` (or JSON); merges into the current library. |
| **Save to…** | Ctrl+Alt+E | ⌥⌘E | Saves the **entire** current library to a file you choose (same format as import). |
| **Reset Library** | Ctrl+Shift+Backspace | ⇧⌘⌫ | After confirmation, removes **personal** library rows; built-in Excalidraw library items stay. |
| **Toggle Library** | Ctrl+Alt+L | ⌥⌘L | Opens the sidebar, switches to the **Library** tab, and **pins** (docks) it. |

Use **Cmd** instead of **Ctrl** on macOS where the table says Ctrl (Electron uses `CmdOrCtrl` in the menu).

**Why not Ctrl+Shift+L for import?** In upstream Excalidraw, **Ctrl/Cmd+Shift+L** is reserved for **locking selected elements**. Import uses **Ctrl/Cmd+Shift+O** instead (open file, analogous to **Open** for drawings).

### Automatic library cache

- **Location:** `{userData}/library-cache.excalidrawlib`, where `{userData}` is Electron’s [app userData path](https://www.electronjs.org/docs/latest/api/app#appgetpathname) for your OS (e.g. `%APPDATA%` on Windows, `~/Library/Application Support/…` on macOS, `~/.config/…` or XDG on Linux).
- **When it updates:** After library changes, writes are **debounced**; the cache is also **flushed when the document becomes hidden** (e.g. switching away or closing) so recent edits are less likely to be lost.
- **Scope:** One cache file **per install / user profile** on that machine. To copy a library to another computer, use **Save to…** and **Import Library…**, or copy the cache file manually.

---

## Usage

1. **From source:** clone the repository, run `npm install`, then either run **`npm run dev`** (live-reload development) or **`npm run build`** followed by **`npm run prod`** to run a production build locally.
2. **Packaging:** to create **ZIP** installers or configure signing, see the **[Development guide](DEVELOPMENT.md)**.

---

## License & links

- This project is licensed under the **[MIT License](LICENSE)**.
- **Contributors:** setup, scripts, tests, and packaging — **[Development guide](DEVELOPMENT.md)**.
- Excalidraw is a separate project with its own license; see the [Excalidraw repository](https://github.com/excalidraw/excalidraw) for details.
