# ExcalidrawX — Development guide

This document is for **contributors and maintainers**: environment setup, scripts, packaging, and repository layout. For what the app does and how to use it, see the [README](README.md). Licensing: [MIT License](LICENSE).

---

## Requirements

- **Node.js** (LTS recommended)
- **npm** (or another compatible client)

---

## Quick start

```bash
git clone https://github.com/<your-org>/excalidraw-x.git
cd excalidraw-x
npm install
```

### Development

Runs the webpack dev server (port **3000**) and Electron together:

```bash
npm run dev
```

### Production bundle (local run)

```bash
npm run build
npm run prod
```

### Package & distributable ZIP

```bash
# Webpack production build + Forge make (ZIP for current OS)
npm run make

# Windows x64 only (from any OS that supports cross-targeting, or run on Windows)
npm run make:win
```

Artifacts appear under `out/make/zip/…`. Use **`npm run package`** if you only need an unpacked app under `out/` without zipping.

---

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Webpack dev server + Electron with HMR |
| `npm run build` | Webpack production build → `build/` |
| `npm run prod` | Run Electron against `build/` |
| `npm run start` | Electron Forge start (alternative entry) |
| `npm run package` | Build + Forge package (unpacked app) |
| `npm run make` | Build + Forge **ZIP** for current platform |
| `npm run make:win` | Build + Forge ZIP for **win32 x64** |
| `npm test` | Jest |
| `npm run lint` | ESLint |

---

## Project structure (overview)

```text
excalidraw-x/
├── README.md
├── DEVELOPMENT.md
├── LICENSE
├── main.js                 # Electron main: window, menu, IPC, recent files, library cache, close guard
├── preload.js              # contextBridge → window.electron
├── forge.config.js         # Forge packager + ZIP maker + fuses
├── webpack.config.js
├── index.html
├── assets/                 # App / window icons (e.g. icon.ico on Windows)
├── public/                 # Static assets for dev server / copies
├── src/
│   ├── index.jsx           # React entry
│   ├── App.jsx             # Excalidraw shell, IPC, dialogs, welcome screen
│   ├── sceneDirty.js       # Snapshot-based dirty detection
│   └── components/
│       └── ConfirmModal.jsx
└── build/                  # Webpack output (generated)
```

---

## Tech stack

- **React** & **React DOM** — UI shell
- **@excalidraw/excalidraw** — drawing application
- **Electron** — desktop runtime
- **Webpack 5** — bundling; **Electron Forge** — packaging and ZIP makers
- **Jest** & **Testing Library** — tests
- **ESLint** — linting

Exact versions are pinned in `package.json`.

---

## Configuration notes

- **Icons (Windows):** Place **`assets/icon.ico`** (and the base name **`assets/icon`** for electron-packager) for executable and window icons. Maintain these files yourself if you change branding.
- **Code signing (Windows):** Set `WINDOWS_CERTIFICATE_FILE` and optionally `WINDOWS_CERTIFICATE_PASSWORD` before `npm run make` / `make:win` when you sign release binaries.
