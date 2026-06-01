# ExcalidrawX — Development guide

This document is for **contributors and maintainers**: environment setup, scripts, packaging, and repository layout. For what the app does and how to use it, see the [README](README.md). Licensing: [MIT License](LICENSE).

---

## Requirements

- **Node.js** (LTS recommended)
- **npm** (or another compatible client)
- **Rust** (stable) and platform build prerequisites for [Tauri 2](https://v2.tauri.app/start/prerequisites/) when running `tauri dev` / `tauri build`

---

## Quick start

```bash
git clone https://github.com/<your-org>/excalidraw-x.git
cd excalidraw-x
npm install
```

### Development

Runs the webpack dev server (port **3000**) and the Tauri shell with HMR:

```bash
npm run dev
```

To run only the web UI in a browser (no desktop shell):

```bash
npm run dev:web
```

### Production bundle (webpack only)

```bash
npm run build
```

The desktop app loads the static output from `build/` (see `src-tauri/tauri.conf.json` `frontendDist`).

### Package installers / bundles

```bash
# Webpack production build + Tauri bundle for the current OS
npm run package

# macOS Intel (x86_64) cross-build from Apple Silicon (adds the Rust target first)
npm run package:x64
```

Artifacts appear under `src-tauri/target/<triple>/bundle/` (format depends on OS: `.app`, `.dmg`, `.msi`, `.deb`, etc., per `tauri.conf.json`).

---

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Webpack dev server + Tauri (`beforeDevCommand` → port **3000**) |
| `npm run dev:web` | Webpack dev server only |
| `npm run build` | Webpack production build → `build/` |
| `npm run tauri` | Passthrough to `@tauri-apps/cli` |
| `npm run tauri:build` | Tauri build (expects `build/` already present) |
| `npm run package` | `build` + `tauri build` for current host |
| `npm run package:x64` | `build` + `tauri build --target x86_64-apple-darwin` |
| `npm test` | Jest |
| `npm run lint` | ESLint |

---

## Project structure (overview)

```text
excalidraw-x/
├── README.md
├── DEVELOPMENT.md
├── LICENSE
├── src-tauri/              # Tauri 2 Rust app (commands, menu, paths, bundler)
│   ├── src/
│   ├── capabilities/
│   └── tauri.conf.json
├── webpack.config.js
├── index.html
├── assets/                 # App icons: icon.png, icon.icns, icon.ico (see `bundle.icon` in tauri.conf.json)
├── locales/              # Shared desktop UI strings (JSON) for JS + Rust menu
├── public/                 # Static assets for dev server / copies
├── src/
│   ├── index.jsx           # React entry
│   ├── App.jsx             # Excalidraw shell, desktop bridge, dialogs, welcome screen
│   ├── desktopApi.js       # Tauri invoke/listen adapter for the shell
│   ├── desktopUiStrings.js # Loads locales for the renderer
│   ├── sceneDirty.js       # Snapshot-based dirty detection
│   └── components/
│       └── ConfirmModal.jsx
└── build/                  # Webpack output (generated)
```

---

## Tech stack

- **React** & **React DOM** — UI shell
- **@excalidraw/excalidraw** — drawing application
- **Tauri 2** — desktop runtime (Rust + system webview)
- **Webpack 5** — bundling
- **Jest** & **Testing Library** — tests
- **ESLint** — linting

Exact versions are pinned in `package.json` and `src-tauri/Cargo.toml`.

---

## Git: what to commit

**Commit:** application source (`src/`, `src-tauri/src/`, `assets/`, `locales/`, `public/`, config files, `package-lock.json`, `Cargo.toml`, etc.).

**Do not commit (see root `.gitignore`):**

| Path / pattern | Why |
|----------------|-----|
| `node_modules/` | npm install |
| `build/`, `dist/` | Webpack production output (`npm run build`) |
| `src-tauri/target/` | Rust compile and Tauri bundle output |
| `out/` | Legacy Electron Forge output (removed in Tauri-only workflow) |
| `.env*` (local) | Secrets |
| IDE/OS junk, logs, `coverage/`, `.eslintcache` | Local only |

You still **need** a `build/` folder on disk before `tauri build` or when pointing Tauri at the static app — it is just regenerated from source, not versioned.

---

## Configuration notes

- **Icons:** The release bundle uses **`assets/icon.png`**, **`assets/icon.icns`**, and **`assets/icon.ico`** (`src-tauri/tauri.conf.json` → `bundle.icon`). To regenerate standard sizes from a master PNG, run `npm exec tauri icon ./assets/icon.png -o ./assets` (optional; adds e.g. `32x32.png` next to the source files).
- **Code signing:** Follow Tauri’s platform docs for Windows/macOS signing when publishing releases.
