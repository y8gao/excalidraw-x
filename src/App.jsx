import { DefaultSidebar, Excalidraw, MainMenu, Sidebar, WelcomeScreen, exportToBlob, languages, loadFromBlob, serializeAsJSON } from '@excalidraw/excalidraw'
import React from 'react'
import {
  ConfirmModal,
  DIALOG_BTN_DANGER,
  DIALOG_BTN_PRIMARY,
  DIALOG_BTN_SECONDARY,
} from './components/ConfirmModal.jsx'
import { createSceneSnapshot, isSceneDirty } from './sceneDirty'

// Hide the Excalidraw hamburger trigger and sidebar trigger — all actions are in the native menubar
const HIDE_HAMBURGER_CSS = `
  button.dropdown-menu-button,
  button[aria-label="Menu"],
  .main-menu-button,
  button[aria-label*="library" i] {
    display: none !important;
  }
`

const EXCALIDRAW_SAVE_FILTERS = [
  { name: 'Excalidraw', extensions: ['excalidraw'] },
  { name: 'JSON', extensions: ['json'] },
]

const UNSAVED_DIALOG_SAVE_FILTERS = [{ name: 'Excalidraw', extensions: ['excalidraw'] }]

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

const App = () => {
  const [excalidrawAPI, setExcalidrawAPI] = React.useState(null)
  const [langCode, setLangCode] = React.useState('en')
  const [appearance, setAppearance] = React.useState('auto')
  const [closeDialogOpen, setCloseDialogOpen] = React.useState(false)
  const [resetDialogOpen, setResetDialogOpen] = React.useState(false)
  const pendingCloseActionRef = React.useRef('close') // 'close' | 'new'
  const lastThemeRef = React.useRef(null)
  const colorInputRef = React.useRef(null)
  const currentBgRef = React.useRef('#ffffff')
  const lastMenuStateRef = React.useRef({ zenMode: false, gridMode: false, snapMode: false, viewMode: false })
  const currentFilePathRef = React.useRef(null)  // path of the last opened/saved .excalidraw file
  const isDirtyRef = React.useRef(false)          // true when there are unsaved changes
  // While true, onChange calls are ignored (programmatic scene updates)
  const suppressDirtyRef = React.useRef(true)     // start true to absorb initial mount onChange(s)
  const cleanSceneSnapshotRef = React.useRef('')  // serialized clean snapshot for dirty comparison
  const hasCleanSnapshotRef = React.useRef(false) // becomes true after first clean scene is recorded
  const pendingOpenPathRef = React.useRef(null)   // stores filePath when confirming before open
  const [sidebarDocked, setSidebarDocked] = React.useState(false)
  const [recentFiles, setRecentFiles] = React.useState([])

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
    window.electron?.setDirty(val)
  }, [])

  // Update window title: "ExcalidrawX - filename" or "ExcalidrawX - Untitled"
  const updateTitle = React.useCallback((filePath) => {
    const name = filePath ? filePath.split(/[/\\]/).pop() : 'Untitled'
    window.electron?.setWindowTitle(`ExcalidrawX - ${name}`)
  }, [])

  const rememberCleanScene = React.useCallback((elements, appState, files) => {
    cleanSceneSnapshotRef.current = createSceneSnapshot(elements, appState, files)
    hasCleanSnapshotRef.current = true
    markDirty(false)
  }, [markDirty])

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
    withoutDirty(() => excalidrawAPI.updateScene({
      elements: loaded.elements,
      appState: { ...loaded.appState, collaborators: new Map() },
      files: loaded.files,
      commitToHistory: false,
    }))
    excalidrawAPI.scrollToContent()
    currentFilePathRef.current = filePath
    rememberCleanScene(loaded.elements, loaded.appState, loaded.files)
    updateTitle(filePath)
    if (filePath) {
      window.electron?.addRecentFile(filePath)
      setRecentFiles(prev => [filePath, ...prev.filter(f => f !== filePath)].slice(0, 10))
    }
  }, [excalidrawAPI, rememberCleanScene, updateTitle, withoutDirty])

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
    if (!excalidrawAPI) return
    try {
      const data = await window.electron.readFile(filePath)
      const blob = new Blob([data], { type: 'application/json' })
      const loaded = await loadFromBlob(blob, null, null)
      applyLoadedScene(loaded, filePath)
    } catch (err) {
      console.error('Failed to open recent file:', err)
    }
  }, [applyLoadedScene, excalidrawAPI])

  const saveDrawing = React.useCallback(async (elements, appState, files, { pickPath, filters }) => {
    try {
      const json = serializeAsJSON(elements, appState, files, 'local')
      if (pickPath === 'if-needed' && currentFilePathRef.current) {
        await window.electron.writeText(currentFilePathRef.current, json)
        rememberCleanScene(elements, appState, files)
        return { ok: true }
      }
      const defaultPath = currentFilePathRef.current || (appState.name || 'drawing') + '.excalidraw'
      const result = await window.electron.saveFile({ defaultPath, filters })
      if (result.canceled) return { ok: false, canceled: true }
      await window.electron.writeText(result.filePath, json)
      currentFilePathRef.current = result.filePath
      rememberCleanScene(elements, appState, files)
      updateTitle(result.filePath)
      window.electron?.addRecentFile(result.filePath)
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
    const result = await window.electron.openFile()
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

  // Load recent files on mount
  React.useEffect(() => {
    window.electron?.getRecentFiles?.().then(files => {
      if (Array.isArray(files)) setRecentFiles(files)
    })
  }, [])

  // Apply the correct theme to Excalidraw based on appearance + OS setting
  const applyTheme = React.useCallback((currentAppearance) => {
    if (!excalidrawAPI) return
    const theme = currentAppearance === 'auto'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : currentAppearance
    withoutDirty(() => excalidrawAPI.updateScene({ appState: { theme } }))
  }, [excalidrawAPI, withoutDirty])

  // Apply initial theme as soon as the API is ready, then record the blank canvas as clean
  React.useEffect(() => {
    if (!excalidrawAPI) return
    applyTheme(appearance)
    rememberCurrentSceneCleanSoon()
  }, [excalidrawAPI]) // eslint-disable-line react-hooks/exhaustive-deps

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
      window.electron?.setTheme(theme)
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
      window.electron?.sendMenuState(next)
    }
  }, [excalidrawAPI, markDirty])

  React.useEffect(() => {
    if (!excalidrawAPI) return

    // Send language list to main process so it can build the Language submenu
    if (languages && languages.length > 0) {
      window.electron?.setLanguages(languages.map(({ code, label }) => ({ code, label })))
    }

    const cleanup = window.electron?.onMenuAction(async (action) => {
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
          const result = await window.electron.openFile()
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
            const result = await window.electron.saveFile({
              defaultPath: (appState.name || 'drawing') + '.png',
              filters: [{ name: 'PNG Image', extensions: ['png'] }],
            })
            if (!result.canceled) {
              const buf = await blob.arrayBuffer()
              await window.electron.writeBinary(result.filePath, Array.from(new Uint8Array(buf)))
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
          if (excalidrawAPI) excalidrawAPI.toggleSidebar({ name: 'default' })
          break
        }

        case 'appearance': {
          setAppearance(actionValue)
          break
        }

        case 'lang': {
          setLangCode(actionValue)
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
      window.electron.closeWindow()
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
        const openResult = await window.electron.openFile()
        if (!openResult.canceled) await doOpenFile(openResult)
      }
    }
  }, [doOpenFile, doOpenFilePath, excalidrawAPI, rememberCurrentSceneCleanSoon, saveDrawing, updateTitle, withoutDirty])

  const handleCloseDiscard = React.useCallback(async () => {
    const action = pendingCloseActionRef.current
    setCloseDialogOpen(false)
    markDirty(false)
    if (action === 'close') {
      window.electron.closeWindow()
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
        const result = await window.electron.openFile()
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
  // ───────────────────────────────────────────────────────

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
        open={resetDialogOpen}
        title="Reset canvas"
        onRequestClose={dismissResetDialog}
        actions={(
          <>
            <button type="button" onClick={dismissResetDialog} style={DIALOG_BTN_SECONDARY}>Cancel</button>
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
              Reset
            </button>
          </>
        )}
      >
        This will clear the whole canvas. All unsaved changes will be lost.
      </ConfirmModal>

      <ConfirmModal
        open={closeDialogOpen}
        title="Unsaved changes"
        onRequestClose={handleCloseCancel}
        actions={(
          <>
            <button type="button" onClick={handleCloseCancel} style={DIALOG_BTN_SECONDARY}>Cancel</button>
            <button type="button" onClick={handleCloseDiscard} style={DIALOG_BTN_DANGER}>Discard</button>
            <button type="button" onClick={handleCloseSave} style={DIALOG_BTN_PRIMARY}>Save</button>
          </>
        )}
      >
        {pendingCloseActionRef.current === 'new'
          ? 'Do you want to save your changes before creating a new drawing?'
          : pendingCloseActionRef.current === 'open'
            ? 'Do you want to save your changes before opening another file?'
            : 'Do you want to save your changes before closing?'}
        {' '}
        Unsaved changes will be lost.
      </ConfirmModal>
      <Excalidraw
          onChange={handleChange}
          langCode={langCode}
          excalidrawAPI={(api) => setExcalidrawAPI(api)}
          UIOptions={{ dockedSidebarBreakpoint: 0 }}
        >
          <MainMenu />
          {/* Custom sidebar: Canvas Settings tab + built-in Library (📚) + Find on Canvas (🔍) tabs */}
          <DefaultSidebar docked={sidebarDocked} onDock={setSidebarDocked}>
            <DefaultSidebar.TabTriggers>
              <Sidebar.TabTrigger tab="canvas-settings" title="Canvas Settings">
                <SidebarSettingsIcon />
              </Sidebar.TabTrigger>
            </DefaultSidebar.TabTriggers>
            <Sidebar.Tab tab="canvas-settings" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginTop: 4 }}>Canvas Settings</div>
              <MainMenu.DefaultItems.ChangeCanvasBackground />
            </Sidebar.Tab>
          </DefaultSidebar>
          {/* Trigger button — renders into the top-right corner via Excalidraw's tunnel */}
          <DefaultSidebar.Trigger title="Canvas Settings" icon={SidebarTriggerIcon} />
          <WelcomeScreen>
            <WelcomeScreen.Center>
              <WelcomeScreen.Center.Logo />
              <WelcomeScreen.Center.Heading>
                Welcome to ExcalidrawX!
              </WelcomeScreen.Center.Heading>
              <WelcomeScreen.Center.Menu>
                <WelcomeScreen.Center.MenuItem
                  onSelect={triggerOpenFile}
                  shortcut="Ctrl+O"
                >
                  Open File...
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
                      Recent files
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
