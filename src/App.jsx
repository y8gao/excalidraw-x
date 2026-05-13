import {
  DefaultSidebar,
  Excalidraw,
  MainMenu,
  Sidebar,
  WelcomeScreen,
  exportToBlob,
  languages,
  loadFromBlob,
  loadSceneOrLibraryFromBlob,
  MIME_TYPES,
  serializeAsJSON,
  serializeLibraryAsJSON,
} from '@excalidraw/excalidraw'
import React from 'react'
import { flushSync } from 'react-dom'
import {
  ConfirmModal,
  DIALOG_BTN_DANGER,
  DIALOG_BTN_PRIMARY,
  DIALOG_BTN_SECONDARY,
} from './components/ConfirmModal.jsx'
import { createSceneSnapshot, isSceneDirty } from './sceneDirty'
import { getDesktopApi, terminalLog } from './desktopApi.js'
import { getUiStrings } from './desktopUiStrings.js'

// Hide the Excalidraw hamburger trigger — native menubar owns file actions. Do not hide library
// sidebar controls (tab, search, overflow menu): a broad [aria-label*="library"] rule breaks that UI.
const HIDE_HAMBURGER_CSS = `
  button.dropdown-menu-button,
  button[aria-label="Menu"],
  .main-menu-button {
    display: none !important;
  }
`

const EXCALIDRAW_SAVE_FILTERS = [
  { name: 'Excalidraw', extensions: ['excalidraw'] },
  { name: 'JSON', extensions: ['json'] },
]

const UNSAVED_DIALOG_SAVE_FILTERS = [{ name: 'Excalidraw', extensions: ['excalidraw'] }]

const LIBRARY_SAVE_FILTERS = [{ name: 'Excalidraw Library', extensions: ['excalidrawlib'] }]

/** Matches Excalidraw `DEFAULT_SIDEBAR` / `LIBRARY_SIDEBAR_TAB` (@excalidraw/common). */
const SIDEBAR_NAME_DEFAULT = 'default'
const SIDEBAR_TAB_LIBRARY = 'library'
/** Custom `DefaultSidebar` tab in this app (Canvas Settings / preferences). */
const SIDEBAR_TAB_CANVAS_SETTINGS = 'canvas-settings'

const LIBRARY_CACHE_SAVE_DEBOUNCE_MS = 450

/**
 * macOS cold start: Launch Services may deliver the file via `RunEvent::Opened` after the webview is
 * already running — same race family as Electron (`open-file` vs `did-finish-load`). We poll
 * `take_pending_os_file` long enough for the shell to queue the path; Jest uses a short window.
 */
function getOsOpenPollConfig() {
  try {
    if (typeof process !== 'undefined' && process.env.JEST_WORKER_ID != null) {
      return { maxAttempts: 24, delayMs: 50 }
    }
  } catch {
    /* ignore */
  }
  return { maxAttempts: 120, delayMs: 100 }
}

/** Light/dark canvas UI: follows Window → Appearance (`auto` uses OS preference). */
function resolveCanvasThemeFromAppearance(appearance) {
  if (appearance === 'auto') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return appearance
}

const SidebarSettingsIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="1.25"
    aria-hidden="true"
  >
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <path d="M14 6m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
    <path d="M4 6l8 0" />
    <path d="M16 6l4 0" />
    <path d="M8 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
    <path d="M4 12l2 0" />
    <path d="M10 12l10 0" />
    <path d="M17 18m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
    <path d="M4 18l11 0" />
    <path d="M19 18l1 0" />
  </svg>
)

const SidebarTriggerIcon = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="1.75"
    aria-hidden="true"
  >
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <path d="M4 4m0 2a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z" />
    <path d="M15 4l0 16" />
  </svg>
)

/** Matches Excalidraw's internal isUniqueItem comparison (order-sensitive). */
function libraryItemElementSignature(item, indexForEmpty = 0) {
  const els = item?.elements
  if (!Array.isArray(els) || els.length === 0) {
    return `empty:${item?.id ?? `i${indexForEmpty}`}`
  }
  return els.map((e) => `${e.id}:${e.versionNonce}`).join('\n')
}

/**
 * - Drop duplicate row ids (fixes React keys).
 * - For personal (non-published) rows, drop repeats that match an earlier item's element fingerprint
 *   (same shape, new library id — e.g. re-adding to library). Published defaults are kept first.
 */
function dedupeLibraryItems(items) {
  const seenIds = new Set()
  const seenSigs = new Set()
  const out = []
  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx]
    const id = item?.id
    if (id != null && id !== '' && seenIds.has(id)) continue

    const sig = libraryItemElementSignature(item, idx)
    const isPublished = item.status === 'published'

    if (isPublished) {
      if (id != null && id !== '') seenIds.add(id)
      seenSigs.add(sig)
      out.push(item)
      continue
    }

    if (seenSigs.has(sig)) continue
    if (id != null && id !== '') seenIds.add(id)
    seenSigs.add(sig)
    out.push(item)
  }
  return out
}

const App = () => {
  const desktopApi = getDesktopApi()
  const [excalidrawAPI, setExcalidrawAPI] = React.useState(null)
  const [langCode, setLangCode] = React.useState('en')
  const ui = React.useMemo(() => getUiStrings(langCode), [langCode])
  const [appearance, setAppearance] = React.useState('auto')
  const [settingsHydrated, setSettingsHydrated] = React.useState(
    () => typeof desktopApi?.getAppSettings !== 'function',
  )
  const [closeDialogOpen, setCloseDialogOpen] = React.useState(false)
  const [resetDialogOpen, setResetDialogOpen] = React.useState(false)
  const [resetLibraryDialogOpen, setResetLibraryDialogOpen] = React.useState(false)
  const [languageRestartOpen, setLanguageRestartOpen] = React.useState(false)
  const pendingCloseActionRef = React.useRef('close') // 'close' | 'new'
  const lastThemeRef = React.useRef(null)
  const colorInputRef = React.useRef(null)
  const currentBgRef = React.useRef('#ffffff')
  const lastMenuStateRef = React.useRef({ zenMode: false, gridMode: false, snapMode: false, viewMode: false })
  const bootSettingsRef = React.useRef({
    zenMode: false,
    gridMode: false,
    snapMode: false,
    viewMode: false,
  })
  const didBootstrapExcalidrawRef = React.useRef(false)
  const currentFilePathRef = React.useRef(null)  // path of the last opened/saved .excalidraw file
  const isDirtyRef = React.useRef(false)          // true when there are unsaved changes
  // While true, onChange calls are ignored (programmatic scene updates)
  const suppressDirtyRef = React.useRef(true)     // start true to absorb initial mount onChange(s)
  const cleanSceneSnapshotRef = React.useRef('')  // serialized clean snapshot for dirty comparison
  const hasCleanSnapshotRef = React.useRef(false) // becomes true after first clean scene is recorded
  const pendingOpenPathRef = React.useRef(null)   // stores filePath when confirming before open
  /** OS file open received before Excalidraw onReady; flushed when excalidrawAPI is set. */
  const pendingOsLaunchPathRef = React.useRef(null)
  const openFromOsRef = React.useRef(async () => {})
  /** Same path may arrive via `take_pending_os_file` and `open-file-path` before read completes. */
  const osOpenInFlightRef = React.useRef(null)
  const [sidebarDocked, setSidebarDocked] = React.useState(false)
  const [recentFiles, setRecentFiles] = React.useState([])
  const excalidrawApiRef = React.useRef(null)
  const libraryDedupeBusyRef = React.useRef(false)
  const libraryItemsRef = React.useRef([])
  const libraryCacheReadyRef = React.useRef(false)
  const libraryRestoreBusyRef = React.useRef(false)
  const libraryRestoreGenerationRef = React.useRef(0)
  const librarySaveTimerRef = React.useRef(0)

  const flushLibraryCacheNow = React.useCallback(async () => {
    if (!libraryCacheReadyRef.current || libraryRestoreBusyRef.current) return
    if (!desktopApi?.writeLibraryCache) return
    window.clearTimeout(librarySaveTimerRef.current)
    librarySaveTimerRef.current = 0
    try {
      await desktopApi.writeLibraryCache(serializeLibraryAsJSON(libraryItemsRef.current))
    } catch (err) {
      console.error('Library cache write failed:', err)
    }
  }, [])

  const scheduleLibraryCacheSave = React.useCallback(() => {
    if (!libraryCacheReadyRef.current || libraryRestoreBusyRef.current) return
    if (!desktopApi?.writeLibraryCache) return
    window.clearTimeout(librarySaveTimerRef.current)
    librarySaveTimerRef.current = window.setTimeout(() => {
      flushLibraryCacheNow()
    }, LIBRARY_CACHE_SAVE_DEBOUNCE_MS)
  }, [flushLibraryCacheNow])

  const handleLibraryChange = React.useCallback((libraryItems) => {
    libraryItemsRef.current = libraryItems
    scheduleLibraryCacheSave()
    const api = excalidrawApiRef.current
    if (!api || libraryDedupeBusyRef.current) return
    const deduped = dedupeLibraryItems(libraryItems)
    if (deduped.length === libraryItems.length) return
    libraryDedupeBusyRef.current = true
    queueMicrotask(() => {
      api
        .updateLibrary({ libraryItems: deduped, merge: false })
        .catch(() => {})
        .finally(() => {
          libraryDedupeBusyRef.current = false
        })
    })
  }, [scheduleLibraryCacheSave])

  // Run fn() without marking canvas dirty (clears the flag after all sync onChange calls settle)
  const withoutDirty = React.useCallback((fn) => {
    suppressDirtyRef.current = true
    fn()
    setTimeout(() => { suppressDirtyRef.current = false }, 0)
  }, [])

  // Update dirty state and sync to main process (only on transitions to avoid IPC spam)
  const markDirty = React.useCallback((val) => {
    if (isDirtyRef.current === val) return
    isDirtyRef.current = val
    desktopApi?.setDirty(val)
  }, [])

  // Update window title: "ExcalidrawX - filename" or localized untitled name
  const updateTitle = React.useCallback((filePath) => {
    const strings = getUiStrings(langCode)
    const name = filePath ? filePath.split(/[/\\]/).pop() : strings.windowUntitled
    desktopApi?.setWindowTitle(`ExcalidrawX - ${name}`)
  }, [langCode])

  const rememberCleanScene = React.useCallback((elements, appState, files) => {
    cleanSceneSnapshotRef.current = createSceneSnapshot(elements, appState, files)
    hasCleanSnapshotRef.current = true
    isDirtyRef.current = false
    // Always sync main — markDirty(false) skips IPC when already false, which breaks close guard after save.
    desktopApi?.setDirty(false)
  }, [])

  const rememberCurrentSceneClean = React.useCallback(() => {
    if (!excalidrawAPI) return
    rememberCleanScene(
      excalidrawAPI.getSceneElements(),
      excalidrawAPI.getAppState(),
      excalidrawAPI.getFiles(),
    )
  }, [excalidrawAPI, rememberCleanScene])

  const rememberCurrentSceneCleanSoon = React.useCallback(() => {
    setTimeout(() => {
      if (excalidrawAPI) {
        rememberCurrentSceneClean()
      }
    }, 0)
  }, [excalidrawAPI, rememberCurrentSceneClean])

  const applyLoadedScene = React.useCallback((loaded, filePath) => {
    if (!excalidrawAPI) return
    const theme = resolveCanvasThemeFromAppearance(appearance)
    withoutDirty(() => excalidrawAPI.updateScene({
      elements: loaded.elements,
      appState: { ...loaded.appState, theme, collaborators: new Map() },
      files: loaded.files,
      commitToHistory: false,
    }))
    excalidrawAPI.scrollToContent()
    currentFilePathRef.current = filePath
    rememberCleanScene(loaded.elements, { ...loaded.appState, theme }, loaded.files)
    updateTitle(filePath)
    if (filePath) {
      desktopApi?.addRecentFile(filePath)
      setRecentFiles(prev => [filePath, ...prev.filter(f => f !== filePath)].slice(0, 10))
    }
  }, [appearance, excalidrawAPI, rememberCleanScene, updateTitle, withoutDirty])

  const doOpenFile = React.useCallback(async (result) => {
    if (!excalidrawAPI || result.canceled) return
    try {
      const blob = new Blob([result.data], { type: 'application/json' })
      const loaded = await loadFromBlob(blob, null, null)
      applyLoadedScene(loaded, result.filePath)
    } catch (err) {
      console.error('Failed to open file:', err)
    }
  }, [applyLoadedScene, excalidrawAPI])

  const doOpenFilePath = React.useCallback(async (filePath) => {
    if (!excalidrawAPI) {
      console.log('[excalidraw-x] doOpenFilePath: no excalidrawAPI, returning')
      terminalLog('warn', 'doOpenFilePath: no excalidrawAPI')
      return
    }
    console.log('[excalidraw-x] doOpenFilePath: reading file', filePath)
    terminalLog('info', 'doOpenFilePath: reading ' + filePath)
    try {
      const data = await desktopApi.readFile(filePath)
      console.log('[excalidraw-x] doOpenFilePath: read', data.length, 'bytes')
      terminalLog('info', 'doOpenFilePath: read ' + data.length + ' bytes')
      const blob = new Blob([data], { type: 'application/json' })
      const loaded = await loadFromBlob(blob, null, null)
      console.log('[excalidraw-x] doOpenFilePath: loaded, elements=', loaded.elements?.length, 'appState keys=', Object.keys(loaded.appState || {}))
      terminalLog('info', 'doOpenFilePath: loaded ' + (loaded.elements?.length || 0) + ' elements')
      applyLoadedScene(loaded, filePath)
    } catch (err) {
      console.error('[excalidraw-x] doOpenFilePath: FAILED to open file', err)
      terminalLog('error', 'doOpenFilePath FAILED: ' + String(err))
    } finally {
      if (osOpenInFlightRef.current === filePath) {
        osOpenInFlightRef.current = null
      }
    }
  }, [applyLoadedScene, excalidrawAPI])

  const saveDrawing = React.useCallback(async (elements, appState, files, { pickPath, filters }) => {
    try {
      const json = serializeAsJSON(elements, appState, files, 'local')
      if (pickPath === 'if-needed' && currentFilePathRef.current) {
        await desktopApi.writeText(currentFilePathRef.current, json)
        rememberCleanScene(elements, appState, files)
        return { ok: true }
      }
      const defaultPath = currentFilePathRef.current || (appState.name || 'drawing') + '.excalidraw'
      const result = await desktopApi.saveFile({ defaultPath, filters })
      if (result.canceled) return { ok: false, canceled: true }
      await desktopApi.writeText(result.filePath, json)
      currentFilePathRef.current = result.filePath
      rememberCleanScene(elements, appState, files)
      updateTitle(result.filePath)
      desktopApi?.addRecentFile(result.filePath)
      return { ok: true }
    } catch (err) {
      console.error('Failed to save file:', err)
      return { ok: false }
    }
  }, [rememberCleanScene, updateTitle])

  // Open a file, guarding dirty state first (used by WelcomeScreen Open button)
  const triggerOpenFile = React.useCallback(async () => {
    if (isDirtyRef.current) {
      pendingCloseActionRef.current = 'open'
      pendingOpenPathRef.current = null
      setCloseDialogOpen(true)
      return
    }
    const result = await desktopApi.openFile()
    if (!result.canceled) await doOpenFile(result)
  }, [doOpenFile])

  // Open a recent file, guarding dirty state first (used by WelcomeScreen recent items)
  const triggerOpenFilePath = React.useCallback(async (filePath) => {
    if (isDirtyRef.current) {
      pendingCloseActionRef.current = 'open'
      pendingOpenPathRef.current = filePath
      setCloseDialogOpen(true)
      return
    }
    await doOpenFilePath(filePath)
  }, [doOpenFilePath])

  /** Rust may both fill `take_pending_os_file` and emit `open-file-path` for the same path. */
  const scheduleOsFileOpen = React.useCallback((filePath) => {
    if (!filePath) return
    if (osOpenInFlightRef.current === filePath) {
      console.log('[excalidraw-x] scheduleOsFileOpen: dedup, already in flight for', filePath)
      return
    }
    console.log('[excalidraw-x] scheduleOsFileOpen: scheduling', filePath)
    terminalLog('info', 'scheduleOsFileOpen: ' + filePath)
    osOpenInFlightRef.current = filePath
    try {
      queueMicrotask(() => {
        void openFromOsRef.current(filePath)
      })
    } catch (err) {
      console.error('[excalidraw-x] scheduleOsFileOpen: queueMicrotask failed, falling back to setTimeout', err)
      terminalLog('error', 'scheduleOsFileOpen: queueMicrotask failed: ' + String(err))
      osOpenInFlightRef.current = null
      setTimeout(() => {
        void openFromOsRef.current(filePath)
      }, 0)
    }
  }, [])

  // Load persisted menu preferences (appearance, language, view toggles) before first paint of Excalidraw
  React.useEffect(() => {
    if (typeof desktopApi?.getAppSettings !== 'function') return undefined
    let cancelled = false
    desktopApi
      .getAppSettings()
      .then((s) => {
        if (cancelled || !s) return
        if (typeof s.langCode === 'string' && s.langCode) setLangCode(s.langCode)
        if (s.appearance === 'auto' || s.appearance === 'light' || s.appearance === 'dark') {
          setAppearance(s.appearance)
        }
        bootSettingsRef.current = {
          zenMode: Boolean(s.zenMode),
          gridMode: Boolean(s.gridMode),
          snapMode: Boolean(s.snapMode),
          viewMode: Boolean(s.viewMode),
        }
        lastMenuStateRef.current = { ...bootSettingsRef.current }
        setSettingsHydrated(true)
      })
      .catch(() => {
        if (!cancelled) setSettingsHydrated(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Load recent files on mount
  React.useEffect(() => {
    desktopApi?.getRecentFiles?.().then(files => {
      if (Array.isArray(files)) setRecentFiles(files)
    })
  }, [])

  // argv / "Open with" / macOS open-file: subscribe on mount (desktop may deliver path before the webview is ready).
  React.useEffect(() => {
    openFromOsRef.current = async (filePath) => {
      console.log('[excalidraw-x] openFromOsRef: filePath=', filePath, 'excalidrawAPI=', !!excalidrawAPI, 'isDirty=', isDirtyRef.current)
      terminalLog('info', 'openFromOsRef api=' + !!excalidrawAPI + ' dirty=' + isDirtyRef.current + ' path=' + (filePath || '(none)'))
      if (!filePath) return
      if (!excalidrawAPI) {
        console.log('[excalidraw-x] openFromOsRef: excalidrawAPI not ready, storing in pendingOsLaunchPathRef')
        terminalLog('info', 'openFromOsRef: storing in pendingOsLaunchPathRef')
        pendingOsLaunchPathRef.current = filePath
        return
      }
      if (isDirtyRef.current) {
        console.log('[excalidraw-x] openFromOsRef: canvas dirty, showing save dialog')
        return
      }
      console.log('[excalidraw-x] openFromOsRef: calling doOpenFilePath for', filePath)
      terminalLog('info', 'openFromOsRef: calling doOpenFilePath')
      await doOpenFilePath(filePath)
    }
  }, [excalidrawAPI, doOpenFilePath])

  React.useEffect(() => {
    if (!excalidrawAPI) return
    const pending = pendingOsLaunchPathRef.current
    if (!pending) return
    console.log('[excalidraw-x] flush pendingOsLaunchPathRef:', pending)
    terminalLog('info', 'flush pendingOsLaunchPathRef: ' + pending)
    pendingOsLaunchPathRef.current = null
    void openFromOsRef.current(pending)
  }, [excalidrawAPI])

  React.useEffect(() => {
    if (!desktopApi?.onOpenFilePath) {
      console.log('[excalidraw-x] onOpenFilePath: no desktopApi, skipping')
      return undefined
    }
    console.log('[excalidraw-x] onOpenFilePath: registering consumer')
    terminalLog('info', 'onOpenFilePath consumer registered (event channel active)')
    return desktopApi.onOpenFilePath((filePath) => {
      console.log('[excalidraw-x] onOpenFilePath consumer: received', filePath)
      terminalLog('info', 'onOpenFilePath event received: ' + filePath)
      scheduleOsFileOpen(filePath)
    })
  }, [scheduleOsFileOpen])

  React.useEffect(() => {
    if (!desktopApi?.takePendingOsFile) {
      console.log('[excalidraw-x] takePendingOsFile poll: no desktopApi, skipping')
      return undefined
    }
    let cancelled = false
    const { maxAttempts, delayMs } = getOsOpenPollConfig()
    console.log('[excalidraw-x] takePendingOsFile poll: starting, maxAttempts=', maxAttempts, 'delayMs=', delayMs)
    terminalLog('info', 'takePendingOsFile poll starting (max=' + maxAttempts + ' delay=' + delayMs + 'ms)')

    const poll = (attempt) => {
      if (cancelled || attempt >= maxAttempts) {
        if (attempt >= maxAttempts) {
          console.log('[excalidraw-x] takePendingOsFile poll: exhausted after', attempt, 'attempts')
          terminalLog('warn', 'takePendingOsFile poll exhausted after ' + attempt + ' attempts')
        }
        return
      }
      desktopApi
        .takePendingOsFile()
        .then((path) => {
          // IMPORTANT: if we got a path, always process it — even if this effect was
          // cancelled (React StrictMode double-mount). The Rust side consumed
          // pending_open_file via .take(), so losing the path means it's gone forever.
          if (path) {
            console.log('[excalidraw-x] takePendingOsFile poll: GOT path=', path, 'at attempt=', attempt, 'cancelled=', cancelled)
            terminalLog('info', 'takePendingOsFile poll GOT path at attempt=' + attempt + ': ' + path)
            try {
              scheduleOsFileOpen(path)
            } catch (err) {
              console.error('[excalidraw-x] takePendingOsFile poll: scheduleOsFileOpen threw', err)
              terminalLog('error', 'takePendingOsFile poll: scheduleOsFileOpen threw: ' + String(err))
            }
            return
          }
          if (cancelled) return
          if (attempt === 0 || attempt % 20 === 0) {
            console.log('[excalidraw-x] takePendingOsFile poll: no path yet, attempt=', attempt)
          }
          window.setTimeout(() => poll(attempt + 1), delayMs)
        })
        .catch((err) => {
          console.error('[excalidraw-x] takePendingOsFile poll: invoke failed at attempt=', attempt, err)
          terminalLog('error', 'takePendingOsFile poll invoke failed at attempt=' + attempt + ': ' + String(err))
          if (!cancelled && attempt + 1 < maxAttempts) {
            window.setTimeout(() => poll(attempt + 1), delayMs)
          }
        })
    }

    poll(0)
    return () => {
      cancelled = true
      console.log('[excalidraw-x] takePendingOsFile poll: cancelled')
    }
  }, [scheduleOsFileOpen])

  // Apply the correct theme to Excalidraw based on appearance + OS setting
  const applyTheme = React.useCallback((currentAppearance) => {
    if (!excalidrawAPI) return
    const theme = resolveCanvasThemeFromAppearance(currentAppearance)
    withoutDirty(() => excalidrawAPI.updateScene({ appState: { theme } }))
  }, [excalidrawAPI, withoutDirty])

  // First paint after settings load: theme + persisted view toggles in one update, then clean snapshot
  // before other effects (e.g. [appearance, applyTheme]) run another theme pass.
  React.useEffect(() => {
    if (!excalidrawAPI || !settingsHydrated || didBootstrapExcalidrawRef.current) return
    didBootstrapExcalidrawRef.current = true
    const b = bootSettingsRef.current
    const theme = resolveCanvasThemeFromAppearance(appearance)
    withoutDirty(() =>
      excalidrawAPI.updateScene({
        appState: {
          theme,
          zenModeEnabled: b.zenMode,
          gridModeEnabled: b.gridMode,
          objectsSnapModeEnabled: b.snapMode,
          viewModeEnabled: b.viewMode,
        },
      }),
    )
    rememberCurrentSceneClean()
  }, [appearance, excalidrawAPI, rememberCurrentSceneClean, settingsHydrated, withoutDirty])

  // Restore library from app data dir on startup; keep cache updated from onLibraryChange.
  React.useEffect(() => {
    if (!excalidrawAPI) return

    const read = desktopApi?.readLibraryCache
    if (!read) {
      libraryCacheReadyRef.current = true
      queueMicrotask(() => scheduleLibraryCacheSave())
      return undefined
    }

    const gen = ++libraryRestoreGenerationRef.current
    let cancelled = false

    const finishEnableCache = () => {
      if (cancelled || libraryRestoreGenerationRef.current !== gen) return
      libraryRestoreBusyRef.current = false
      libraryCacheReadyRef.current = true
      queueMicrotask(() => scheduleLibraryCacheSave())
    }

    ;(async () => {
      try {
        const res = await read()
        if (cancelled || libraryRestoreGenerationRef.current !== gen) return

        if (!res?.exists || !res.data) {
          return
        }

        libraryRestoreBusyRef.current = true
        const blob = new Blob([res.data], { type: MIME_TYPES.excalidrawlib })
        const contents = await loadSceneOrLibraryFromBlob(blob, null, null)
        if (cancelled || libraryRestoreGenerationRef.current !== gen) return

        if (contents.type !== MIME_TYPES.excalidrawlib) {
          await desktopApi?.clearLibraryCache?.()
        } else {
          const libData = contents.data
          const rawItems = libData.libraryItems ?? libData.library ?? []
          const api = excalidrawApiRef.current
          if (api) {
            await api.updateLibrary({ libraryItems: rawItems, merge: false })
          }
        }
      } catch (err) {
        console.error('Library cache restore failed:', err)
        try {
          await desktopApi?.clearLibraryCache?.()
        } catch {
          /* ignore */
        }
      } finally {
        finishEnableCache()
      }
    })()

    return () => {
      cancelled = true
      libraryRestoreGenerationRef.current += 1
    }
  }, [excalidrawAPI, scheduleLibraryCacheSave])

  // Flush debounced library cache when the window is hidden (e.g. quit).
  React.useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden') flushLibraryCacheNow()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [flushLibraryCacheNow])

  // Re-apply when appearance setting changes
  React.useEffect(() => {
    applyTheme(appearance)
  }, [appearance, applyTheme])

  // Listen for OS theme changes and apply when in auto mode
  React.useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => {
      if (appearance === 'auto') applyTheme('auto')
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [appearance, applyTheme])

  const handleChange = React.useCallback((elements, appState) => {
    if (!suppressDirtyRef.current && hasCleanSnapshotRef.current) {
      const dirty = isSceneDirty(cleanSceneSnapshotRef.current, elements, appState, excalidrawAPI?.getFiles?.() || {})
      markDirty(dirty)
    }

    const theme = appState.theme
    if (theme !== lastThemeRef.current) {
      lastThemeRef.current = theme
      desktopApi?.setTheme(theme)
    }
    currentBgRef.current = appState.viewBackgroundColor || '#ffffff'

    // Keep menu checkmarks in sync with appState
    const next = {
      zenMode: appState.zenModeEnabled ?? false,
      gridMode: appState.gridModeEnabled ?? false,
      snapMode: appState.objectsSnapModeEnabled ?? false,
      viewMode: appState.viewModeEnabled ?? false,
    }
    const prev = lastMenuStateRef.current
    if (next.zenMode !== prev.zenMode || next.gridMode !== prev.gridMode ||
        next.snapMode !== prev.snapMode || next.viewMode !== prev.viewMode) {
      lastMenuStateRef.current = next
      desktopApi?.sendMenuState(next)
    }
  }, [excalidrawAPI, markDirty])

  React.useEffect(() => {
    if (!excalidrawAPI) return

    // Send language list to main process so it can build the Language submenu
    if (languages && languages.length > 0) {
      desktopApi?.setLanguages(languages.map(({ code, label }) => ({ code, label })))
    }

    const cleanup = desktopApi?.onMenuAction(async (action) => {
      const elements = excalidrawAPI.getSceneElements()
      const appState = excalidrawAPI.getAppState()
      const files = excalidrawAPI.getFiles()

      // Split parameterised actions like 'zen-mode:true', 'appearance:dark', 'lang:en'
      const colonIdx = action.indexOf(':')
      const actionName = colonIdx >= 0 ? action.substring(0, colonIdx) : action
      const actionValue = colonIdx >= 0 ? action.substring(colonIdx + 1) : null

      switch (actionName) {
        case 'confirm-close': {
          pendingCloseActionRef.current = 'close'
          setCloseDialogOpen(true)
          break
        }

        case 'new': {
          if (isDirtyRef.current) {
            pendingCloseActionRef.current = 'new'
            setCloseDialogOpen(true)
            break
          }
          withoutDirty(() => excalidrawAPI.resetScene())
          currentFilePathRef.current = null
          updateTitle(null)
          rememberCurrentSceneCleanSoon()
          break
        }
        case 'open': {
          if (isDirtyRef.current) {
            pendingCloseActionRef.current = 'open'
            pendingOpenPathRef.current = null
            setCloseDialogOpen(true)
            break
          }
          const result = await desktopApi.openFile()
          if (!result.canceled) await doOpenFile(result)
          break
        }

        case 'open-recent': {
          const filePath = actionValue
          if (isDirtyRef.current) {
            pendingCloseActionRef.current = 'open'
            pendingOpenPathRef.current = filePath
            setCloseDialogOpen(true)
            break
          }
          await doOpenFilePath(filePath)
          break
        }

        case 'recent-cleared': {
          setRecentFiles([])
          break
        }

        case 'import-library': {
          if (!excalidrawAPI || !desktopApi?.openLibraryFile) break
          try {
            const pick = await desktopApi.openLibraryFile()
            if (pick.canceled) break
            // Use the official library MIME so updateLibrary's Blob path runs
            // loadLibraryFromBlob → parseLibraryJSON, which supports both
            // `libraryItems` and legacy `library` keys (spreading contents.data does not).
            const blob = new Blob([pick.data], { type: MIME_TYPES.excalidrawlib })
            const contents = await loadSceneOrLibraryFromBlob(blob, null, null)
            if (contents.type === MIME_TYPES.excalidrawlib) {
              // Skip rows already in the library by id (and within-file dupes). Shape-level dedupe for
              // personal items runs in onLibraryChange via dedupeLibraryItems.
              const libData = contents.data
              const rawItems = libData.libraryItems ?? libData.library ?? []
              await excalidrawAPI.updateLibrary({
                libraryItems: async (currentItems) => {
                  const taken = new Set(currentItems.map((item) => item.id))
                  const seenInFile = new Set()
                  return rawItems.filter((item) => {
                    if (Array.isArray(item)) return true
                    const id = item?.id
                    if (id == null || id === '') return true
                    if (taken.has(id) || seenInFile.has(id)) return false
                    seenInFile.add(id)
                    return true
                  })
                },
                merge: true,
                openLibraryMenu: true,
              })
            } else {
              excalidrawAPI.setToast?.({
                message: 'That file is a drawing, not a library. Download a .excalidrawlib from the libraries site.',
                closable: true,
              })
            }
          } catch (err) {
            console.error('Import library failed:', err)
            excalidrawAPI.setToast?.({
              message: 'Could not import library. Use a valid .excalidrawlib file.',
              closable: true,
            })
          }
          break
        }

        case 'reset-library': {
          setResetLibraryDialogOpen(true)
          break
        }

        case 'save-library-as': {
          if (!desktopApi?.saveFile || !desktopApi?.writeText) break
          try {
            const json = serializeLibraryAsJSON(libraryItemsRef.current)
            const result = await desktopApi.saveFile({
              defaultPath: 'library.excalidrawlib',
              filters: LIBRARY_SAVE_FILTERS,
            })
            if (!result.canceled) {
              await desktopApi.writeText(result.filePath, json)
            }
          } catch (err) {
            console.error('Save library failed:', err)
            excalidrawAPI.setToast?.({
              message: 'Could not save library file.',
              closable: true,
            })
          }
          break
        }

        case 'save': {
          await saveDrawing(elements, appState, files, {
            pickPath: 'if-needed',
            filters: EXCALIDRAW_SAVE_FILTERS,
          })
          break
        }

        case 'save-as': {
          await saveDrawing(elements, appState, files, {
            pickPath: 'always',
            filters: EXCALIDRAW_SAVE_FILTERS,
          })
          break
        }

        case 'export-image': {
          try {
            const blob = await exportToBlob({
              elements,
              appState: { ...appState, exportBackground: true },
              files,
              mimeType: 'image/png',
            })
            const result = await desktopApi.saveFile({
              defaultPath: (appState.name || 'drawing') + '.png',
              filters: [{ name: 'PNG Image', extensions: ['png'] }],
            })
            if (!result.canceled) {
              const buf = await blob.arrayBuffer()
              await desktopApi.writeBinary(result.filePath, Array.from(new Uint8Array(buf)))
            }
          } catch (err) {
            console.error('Failed to export image:', err)
          }
          break
        }

        case 'reset-canvas': {
          setResetDialogOpen(true)
          break
        }

        case 'toggle-sidebar': {
          if (excalidrawAPI) {
            excalidrawAPI.toggleSidebar({
              name: SIDEBAR_NAME_DEFAULT,
              tab: SIDEBAR_TAB_CANVAS_SETTINGS,
            })
          }
          break
        }

        case 'toggle-library': {
          if (!excalidrawAPI) break
          flushSync(() => setSidebarDocked(true))
          excalidrawAPI.toggleSidebar({ name: SIDEBAR_NAME_DEFAULT, tab: SIDEBAR_TAB_LIBRARY })
          break
        }

        case 'appearance': {
          setAppearance(actionValue)
          break
        }

        case 'lang': {
          setLangCode((prev) => {
            if (prev !== actionValue) {
              queueMicrotask(() => setLanguageRestartOpen(true))
            }
            return actionValue
          })
          break
        }

        case 'canvas-background': {
          if (colorInputRef.current) {
            colorInputRef.current.value = currentBgRef.current
            colorInputRef.current.click()
          }
          break
        }

        case 'view-mode': {
          withoutDirty(() => excalidrawAPI.updateScene({ appState: { viewModeEnabled: actionValue === 'true' } }))
          break
        }

        case 'zen-mode': {
          withoutDirty(() => excalidrawAPI.updateScene({ appState: { zenModeEnabled: actionValue === 'true' } }))
          break
        }

        case 'grid': {
          withoutDirty(() => excalidrawAPI.updateScene({ appState: { gridModeEnabled: actionValue === 'true' } }))
          break
        }

        case 'snap': {
          withoutDirty(() => excalidrawAPI.updateScene({ appState: { objectsSnapModeEnabled: actionValue === 'true' } }))
          break
        }

        case 'command-palette': {
          withoutDirty(() => excalidrawAPI.updateScene({ appState: { openDialog: { name: 'commandPalette' } } }))
          break
        }

        case 'help': {
          withoutDirty(() => excalidrawAPI.updateScene({ appState: { openDialog: { name: 'help' } } }))
          break
        }

        default:
          console.warn('Unhandled menu action:', action)
      }
    })

    return cleanup
  }, [doOpenFile, doOpenFilePath, excalidrawAPI, rememberCurrentSceneCleanSoon, saveDrawing, updateTitle, withoutDirty])

  const handleBgColorChange = React.useCallback((e) => {
    if (!excalidrawAPI) return
    excalidrawAPI.updateScene({ appState: { viewBackgroundColor: e.target.value } })
  }, [excalidrawAPI])

  // ── Close-guard helpers ─────────────────────────────────────────────
  const handleCloseSave = React.useCallback(async () => {
    if (!excalidrawAPI) return
    setCloseDialogOpen(false)
    const elements = excalidrawAPI.getSceneElements()
    const appState = excalidrawAPI.getAppState()
    const files = excalidrawAPI.getFiles()
    const action = pendingCloseActionRef.current
    const hadPath = !!currentFilePathRef.current
    const result = await saveDrawing(elements, appState, files, {
      pickPath: hadPath ? 'if-needed' : 'always',
      filters: hadPath ? EXCALIDRAW_SAVE_FILTERS : UNSAVED_DIALOG_SAVE_FILTERS,
    })
    if (!result.ok) {
      if (result.canceled) setCloseDialogOpen(true)
      return
    }
    if (action === 'close') {
      desktopApi.closeWindow()
    } else if (action === 'new') {
      withoutDirty(() => excalidrawAPI.resetScene())
      currentFilePathRef.current = null
      updateTitle(null)
      rememberCurrentSceneCleanSoon()
    } else if (action === 'open') {
      if (pendingOpenPathRef.current) {
        await doOpenFilePath(pendingOpenPathRef.current)
        pendingOpenPathRef.current = null
      } else {
        const openResult = await desktopApi.openFile()
        if (!openResult.canceled) await doOpenFile(openResult)
      }
    }
  }, [doOpenFile, doOpenFilePath, excalidrawAPI, rememberCurrentSceneCleanSoon, saveDrawing, updateTitle, withoutDirty])

  const handleCloseDiscard = React.useCallback(async () => {
    const action = pendingCloseActionRef.current
    setCloseDialogOpen(false)
    markDirty(false)
    if (action === 'close') {
      desktopApi.closeWindow()
    } else if (action === 'new') {
      if (excalidrawAPI) {
        withoutDirty(() => excalidrawAPI.resetScene())
        currentFilePathRef.current = null
        updateTitle(null)
        rememberCurrentSceneCleanSoon()
      }
    } else if (action === 'open') {
      if (pendingOpenPathRef.current) {
        await doOpenFilePath(pendingOpenPathRef.current)
        pendingOpenPathRef.current = null
      } else {
        const result = await desktopApi.openFile()
        if (!result.canceled) await doOpenFile(result)
      }
    }
  }, [doOpenFile, doOpenFilePath, excalidrawAPI, markDirty, rememberCurrentSceneCleanSoon, updateTitle, withoutDirty])

  const handleCloseCancel = React.useCallback(() => {
    setCloseDialogOpen(false)
  }, [])

  const dismissResetDialog = React.useCallback(() => {
    setResetDialogOpen(false)
  }, [])

  const dismissResetLibraryDialog = React.useCallback(() => {
    setResetLibraryDialogOpen(false)
  }, [])

  const dismissLanguageRestart = React.useCallback(() => {
    setLanguageRestartOpen(false)
  }, [])

  const handleLanguageRestartNow = React.useCallback(() => {
    setLanguageRestartOpen(false)
    desktopApi?.relaunchApp?.()
  }, [])
  // ───────────────────────────────────────────────────────

  if (!settingsHydrated) {
    return <div style={{ width: '100vw', height: '100vh' }} aria-busy="true" />
  }

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <style>{HIDE_HAMBURGER_CSS}</style>
      <input
        ref={colorInputRef}
        type="color"
        style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }}
        onChange={handleBgColorChange}
      />

      <ConfirmModal
        open={languageRestartOpen}
        title={ui.languageRestartTitle}
        onRequestClose={dismissLanguageRestart}
        actions={(
          <>
            <button type="button" onClick={dismissLanguageRestart} style={DIALOG_BTN_SECONDARY}>{ui.languageRestartLater}</button>
            <button type="button" onClick={handleLanguageRestartNow} style={DIALOG_BTN_PRIMARY}>{ui.languageRestartNow}</button>
          </>
        )}
      >
        {ui.languageRestartBody}
      </ConfirmModal>

      <ConfirmModal
        open={resetLibraryDialogOpen}
        title={ui.confirmResetLibraryTitle}
        onRequestClose={dismissResetLibraryDialog}
        actions={(
          <>
            <button type="button" onClick={dismissResetLibraryDialog} style={DIALOG_BTN_SECONDARY}>{ui.confirmResetLibraryCancel}</button>
            <button
              type="button"
              onClick={() => {
                dismissResetLibraryDialog()
                if (!excalidrawAPI) return
                excalidrawAPI
                  .updateLibrary({
                    libraryItems: async (currentItems) =>
                      currentItems.filter((item) => item.status === 'published'),
                    merge: false,
                  })
                  .catch(() => {})
              }}
              style={DIALOG_BTN_DANGER}
            >
              {ui.confirmResetLibraryReset}
            </button>
          </>
        )}
      >
        {ui.confirmResetLibraryBody}
      </ConfirmModal>

      <ConfirmModal
        open={resetDialogOpen}
        title={ui.confirmResetCanvasTitle}
        onRequestClose={dismissResetDialog}
        actions={(
          <>
            <button type="button" onClick={dismissResetDialog} style={DIALOG_BTN_SECONDARY}>{ui.confirmResetCanvasCancel}</button>
            <button
              type="button"
              onClick={() => {
                dismissResetDialog()
                withoutDirty(() => excalidrawAPI.resetScene())
                currentFilePathRef.current = null
                updateTitle(null)
                rememberCurrentSceneCleanSoon()
              }}
              style={DIALOG_BTN_DANGER}
            >
              {ui.confirmResetCanvasReset}
            </button>
          </>
        )}
      >
        {ui.confirmResetCanvasBody}
      </ConfirmModal>

      <ConfirmModal
        open={closeDialogOpen}
        title={ui.confirmUnsavedTitle}
        onRequestClose={handleCloseCancel}
        actions={(
          <>
            <button type="button" onClick={handleCloseCancel} style={DIALOG_BTN_SECONDARY}>{ui.confirmUnsavedCancel}</button>
            <button type="button" onClick={handleCloseDiscard} style={DIALOG_BTN_DANGER}>{ui.confirmUnsavedDiscard}</button>
            <button type="button" onClick={handleCloseSave} style={DIALOG_BTN_PRIMARY}>{ui.confirmUnsavedSave}</button>
          </>
        )}
      >
        {pendingCloseActionRef.current === 'new'
          ? ui.confirmUnsavedMsgNew
          : pendingCloseActionRef.current === 'open'
            ? ui.confirmUnsavedMsgOpen
            : ui.confirmUnsavedMsgClose}
        {' '}
        {ui.confirmUnsavedSuffix}
      </ConfirmModal>
      <Excalidraw
          onChange={handleChange}
          onLibraryChange={handleLibraryChange}
          langCode={langCode}
          excalidrawAPI={(api) => {
            excalidrawApiRef.current = api
            setExcalidrawAPI(api)
          }}
          UIOptions={{ dockedSidebarBreakpoint: 0 }}
        >
          <MainMenu />
          {/* Custom sidebar: Canvas Settings tab + built-in Library (📚) + Find on Canvas (🔍) tabs */}
          <DefaultSidebar docked={sidebarDocked} onDock={setSidebarDocked}>
            <DefaultSidebar.TabTriggers>
              <Sidebar.TabTrigger tab="canvas-settings" title={ui.sidebarCanvasSettings}>
                <SidebarSettingsIcon />
              </Sidebar.TabTrigger>
            </DefaultSidebar.TabTriggers>
            <Sidebar.Tab tab="canvas-settings" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginTop: 4 }}>{ui.sidebarCanvasSettings}</div>
              <MainMenu.DefaultItems.ChangeCanvasBackground />
            </Sidebar.Tab>
          </DefaultSidebar>
          {/* Trigger button — renders into the top-right corner via Excalidraw's tunnel */}
          <DefaultSidebar.Trigger title={ui.sidebarCanvasSettings} icon={SidebarTriggerIcon} />
          <WelcomeScreen>
            <WelcomeScreen.Center>
              <WelcomeScreen.Center.Logo />
              <WelcomeScreen.Center.Heading>
                {ui.welcomeHeading}
              </WelcomeScreen.Center.Heading>
              <WelcomeScreen.Center.Menu>
                <WelcomeScreen.Center.MenuItem
                  onSelect={triggerOpenFile}
                  shortcut="Ctrl+O"
                >
                  {ui.welcomeOpenFile}
                </WelcomeScreen.Center.MenuItem>
                {recentFiles.length > 0 && (
                  <>
                    <hr style={{ border: 'none', borderTop: '1px solid var(--color-border, rgba(0,0,0,0.1))', margin: '4px 0' }} />
                    <div style={{
                      fontSize: 12,
                      fontWeight: 600,
                      opacity: 0.75,
                      padding: '2px 8px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}>
                      {ui.welcomeRecentFiles}
                    </div>
                    {recentFiles.slice(0, 5).map(fp => (
                      <WelcomeScreen.Center.MenuItem
                        key={fp}
                        onSelect={() => triggerOpenFilePath(fp)}
                        title={fp}
                      >
                        {fp.split(/[/\\]/).pop()}
                      </WelcomeScreen.Center.MenuItem>
                    ))}
                    <hr style={{ border: 'none', borderTop: '1px solid var(--color-border, rgba(0,0,0,0.1))', margin: '4px 0' }} />
                  </>
                )}
                <WelcomeScreen.Center.MenuItemHelp />
              </WelcomeScreen.Center.Menu>
            </WelcomeScreen.Center>
            <WelcomeScreen.Hints.ToolbarHint />
            <WelcomeScreen.Hints.HelpHint />
          </WelcomeScreen>
        </Excalidraw>
    </div>
  )
}

export default App
