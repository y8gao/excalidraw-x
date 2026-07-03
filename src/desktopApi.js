import { invoke, isTauri } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

let openPatched = false
let libraryAnchorClickPatched = false
let desktopApiSingleton = null

/**
 * Send a diagnostic message to the Rust backend so it appears in the terminal
 * alongside the Rust logs. Used at critical points in the file-open path.
 * Resilient: silently no-ops if Tauri IPC is not available yet.
 */
export function terminalLog(level, message) {
  if (typeof window !== 'undefined' && !window.__TAURI_INTERNALS__) return
  try {
    invoke('js_log', { level, message }).catch(() => {})
  } catch {
    /* IPC not ready yet */
  }
}

/** Queue + consumer for `open-file-path` (must be module-level so `prepareDesktopApi` can attach early). */
const openFilePathQueue = []
let openFilePathConsumer = null
let openFilePathListenPromise = null

function patchWindowOpenForLibraries() {
  if (openPatched || typeof window === 'undefined') return
  openPatched = true
  const orig = window.open
  window.open = function openPatchedFn(url, target, features) {
    try {
      const s = url != null ? String(url) : ''
      if (s.includes('libraries.excalidraw.com')) {
        openAllowedLibraryUrl(s)
        return null
      }
    } catch {
      /* ignore */
    }
    return orig.call(window, url, target, features)
  }
}

function openAllowedLibraryUrl(url) {
  invoke('open_allowed_url', { url }).catch(() => {})
}

function patchLibraryAnchorClicks() {
  if (libraryAnchorClickPatched || typeof document === 'undefined') return
  libraryAnchorClickPatched = true
  document.addEventListener('click', (event) => {
    const anchor = event.target?.closest?.('a[href*="libraries.excalidraw.com"]')
    if (!anchor) return
    event.preventDefault()
    openAllowedLibraryUrl(anchor.href)
  }, true)
}

function onOpenFilePathEvent(e) {
  const filePath = typeof e.payload === 'string' ? e.payload : e.payload?.path
  if (!filePath) {
    console.log('[excalidraw-x] onOpenFilePathEvent: empty payload, skipping; payload=', e.payload)
    return
  }
  console.log('[excalidraw-x] onOpenFilePathEvent: received path=', filePath, 'hasConsumer=', !!openFilePathConsumer)
  if (openFilePathConsumer) {
    openFilePathConsumer(filePath)
  } else {
    openFilePathQueue.push(filePath)
    console.log('[excalidraw-x] onOpenFilePathEvent: queued path (no consumer yet), queue size=', openFilePathQueue.length)
  }
}

/**
 * Await before first React paint in Tauri so `open-file-path` events from a cold document open
 * are not dropped (Rust can emit before the webview subscribes if `listen()` is still pending).
 */
function ensureOpenFilePathListener() {
  if (!isTauri() || typeof window === 'undefined') {
    console.log('[excalidraw-x] ensureOpenFilePathListener: not Tauri or no window, skipping')
    return Promise.resolve()
  }
  if (!openFilePathListenPromise) {
    console.log('[excalidraw-x] ensureOpenFilePathListener: registering listen("open-file-path")')
    openFilePathListenPromise = listen('open-file-path', onOpenFilePathEvent)
      .then((unlisten) => {
        console.log('[excalidraw-x] ensureOpenFilePathListener: listen() resolved successfully')
        return unlisten
      })
      .catch((err) => {
        console.error('[excalidraw-x] ensureOpenFilePathListener: listen() FAILED', err)
        openFilePathListenPromise = null
        throw err
      })
  }
  return openFilePathListenPromise
}

export async function prepareDesktopApi() {
  if (!isTauri()) {
    console.log('[excalidraw-x] prepareDesktopApi: not running in Tauri (window.__TAURI_INTERNALS__ missing)')
    return
  }
  console.log('[excalidraw-x] prepareDesktopApi: Tauri detected, patching window.open and registering listener')
  patchWindowOpenForLibraries()
  patchLibraryAnchorClicks()
  await ensureOpenFilePathListener()
}

function createDesktopApi() {
  console.log('[excalidraw-x] createDesktopApi: initializing desktop API bridge')
  patchWindowOpenForLibraries()
  patchLibraryAnchorClicks()
  void ensureOpenFilePathListener()

  const api = {
    setTheme: (theme) => invoke('set_theme', { theme }),

    onMenuAction: (cb) => {
      let active = true
      const p = listen('menu-action', (e) => {
        if (!active) return
        const action = typeof e.payload === 'string' ? e.payload : e.payload?.action
        if (action != null) cb(action)
      })
      return () => {
        active = false
        p.then((un) => un()).catch(() => {})
      }
    },

    onOpenFilePath: (cb) => {
      openFilePathConsumer = cb
      const pending = openFilePathQueue.splice(0, openFilePathQueue.length)
      for (const fp of pending) {
        try {
          cb(fp)
        } catch (err) {
          console.error(err)
        }
      }
      return () => {
        openFilePathConsumer = null
      }
    },

    takePendingOsFile: () => invoke('take_pending_os_file'),

    openFile: () => invoke('dialog_open_file'),

    openLibraryFile: () => invoke('dialog_open_library_file'),

    saveFile: (opts) => invoke('dialog_save_file', { opts }),

    writeText: (filePath, data) => invoke('fs_write_text', { filePath, data }),

    writeBinary: (filePath, data) => invoke('fs_write_binary', { filePath, data }),

    getAppSettings: () => invoke('get_app_settings'),

    sendMenuState: (state) => invoke('menu_state_update', { state }),

    setLanguages: (languages) => invoke('menu_set_languages', { languages }),

    setDirty: (dirty) => invoke('set_dirty', { dirty }),

    setWindowTitle: (title) => invoke('set_window_title', { title }),

    toggleFullscreen: () => invoke('toggle_fullscreen'),

    closeWindow: () => invoke('close_window_confirmed'),

    relaunchApp: () => invoke('relaunch_app'),

    readFile: (filePath) => invoke('fs_read_file', { filePath }),

    addRecentFile: (filePath) => invoke('menu_add_recent', { filePath }),

    getRecentFiles: () => invoke('get_recent_files'),

    readLibraryCache: () => invoke('library_read_cache'),

    writeLibraryCache: (data) => invoke('library_write_cache', { data }),

    clearLibraryCache: () => invoke('library_clear_cache'),

    jsLog: (level, message) => invoke('js_log', { level, message }),
  }

  // Forward JS console errors/warnings to the terminal alongside Rust logs.
  // Defer so the bridge doesn't fire during api construction itself.
  setTimeout(() => bridgeConsoleToTerminal(api), 0)

  return api
}

/**
 * Desktop host API (Tauri `invoke` / `listen`).
 */
export function getDesktopApi() {
  if (!isTauri()) return null
  if (!desktopApiSingleton) desktopApiSingleton = createDesktopApi()
  return desktopApiSingleton
}

export function isDesktopApp() {
  return isTauri()
}

/**
 * Forward console.error and console.warn to the Rust backend so diagnostic messages
 * appear in the terminal alongside Rust logs. Uses a re-entry guard to avoid recursion.
 */
export function bridgeConsoleToTerminal(desktopApi) {
  if (typeof window === 'undefined' || !desktopApi?.jsLog) return

  let bridging = false
  const patch = (level, orig) => {
    window.console[level] = function patchedConsole(...args) {
      const msg = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')
      if (!bridging) {
        bridging = true
        try {
          desktopApi.jsLog(level, msg).catch(() => {})
        } finally {
          bridging = false
        }
      }
      return orig.apply(this, args)
    }
  }

  patch('error', console.error.bind(console))
  patch('warn', console.warn.bind(console))
}
