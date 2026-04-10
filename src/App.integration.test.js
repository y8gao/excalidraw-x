import { __mock, serializeLibraryAsJSON } from '@excalidraw/excalidraw'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import App from './App'

jest.mock('@excalidraw/excalidraw', () => {
  const ReactLib = require('react')

  const mockState = {
    onChange: null,
    menuAction: null,
    elements: [],
    appState: {
      theme: 'light',
      viewBackgroundColor: '#ffffff',
      name: null,
      zenModeEnabled: false,
      gridModeEnabled: false,
      objectsSnapModeEnabled: false,
      viewModeEnabled: false,
    },
    files: {},
  }

  const api = {
    updateLibrary: jest.fn(async () => {}),
    setToast: jest.fn(),
    updateScene: (scene) => {
      if (scene.elements) mockState.elements = scene.elements
      if (scene.files) mockState.files = scene.files
      if (scene.appState) mockState.appState = { ...mockState.appState, ...scene.appState }
      if (mockState.onChange) mockState.onChange(mockState.elements, mockState.appState)
    },
    resetScene: () => {
      mockState.elements = []
      mockState.files = {}
      mockState.appState = {
        ...mockState.appState,
        name: null,
        viewBackgroundColor: '#ffffff',
      }
      if (mockState.onChange) mockState.onChange(mockState.elements, mockState.appState)
    },
    scrollToContent: () => {},
    toggleSidebar: jest.fn(),
    getSceneElements: () => mockState.elements,
    getAppState: () => mockState.appState,
    getFiles: () => mockState.files,
  }

  const Excalidraw = ({ onChange, excalidrawAPI, onLibraryChange, children }) => {
    ReactLib.useEffect(() => {
      mockState.onChange = onChange
      excalidrawAPI(api)
      onLibraryChange?.([
        { id: 'lib-row-1', status: 'unpublished', elements: [{ id: 'e1', type: 'rectangle', versionNonce: 1 }] },
      ])
    }, [onChange, excalidrawAPI, onLibraryChange])
    return ReactLib.createElement('div', { 'data-testid': 'excalidraw-root' }, children)
  }

  const wrap = (tag = 'div', omitProps = []) => ({ children, ...props }) => {
    const domProps = { ...props }
    omitProps.forEach((key) => {
      delete domProps[key]
    })
    return ReactLib.createElement(tag, domProps, children)
  }
  const buttonWrap = () => ({ children, onSelect, onClick, ...props }) => ReactLib.createElement('button', { onClick: onClick || onSelect, ...props }, children)

  const MainMenu = wrap()
  MainMenu.ItemCustom = wrap()
  MainMenu.DefaultItems = {
    ChangeCanvasBackground: wrap(),
  }

  const DefaultSidebar = wrap('div', ['docked', 'onDock'])
  DefaultSidebar.TabTriggers = wrap()
  DefaultSidebar.Trigger = buttonWrap()

  const Sidebar = wrap()
  Sidebar.Tab = wrap()
  Sidebar.TabTrigger = buttonWrap()
  Sidebar.Header = wrap()

  const WelcomeScreen = wrap()
  WelcomeScreen.Center = wrap()
  WelcomeScreen.Center.Logo = wrap()
  WelcomeScreen.Center.Heading = wrap()
  WelcomeScreen.Center.Menu = wrap()
  WelcomeScreen.Center.MenuItem = buttonWrap()
  WelcomeScreen.Center.MenuItemHelp = buttonWrap()
  WelcomeScreen.Hints = {
    ToolbarHint: wrap(),
    HelpHint: wrap(),
  }

  const MIME_TYPES = {
    excalidraw: 'application/vnd.excalidraw+json',
    excalidrawlib: 'application/vnd.excalidrawlib+json',
  }

  const defaultLibraryBlobResult = () => ({
    type: MIME_TYPES.excalidrawlib,
    data: { libraryItems: [] },
  })

  const loadSceneOrLibraryFromBlob = jest.fn(async () => defaultLibraryBlobResult())

  return {
    Excalidraw,
    MainMenu,
    WelcomeScreen,
    DefaultSidebar,
    Sidebar,
    languages: [{ code: 'en', label: 'English' }],
    MIME_TYPES,
    loadSceneOrLibraryFromBlob,
    loadFromBlob: jest.fn(async () => ({
      elements: [{ id: 'opened-1', type: 'rectangle', x: 1, y: 1, width: 10, height: 10 }],
      appState: { viewBackgroundColor: '#ffffff', name: 'opened', theme: 'light' },
      files: {},
    })),
    serializeAsJSON: jest.fn(() => '{"ok":true}'),
    serializeLibraryAsJSON: jest.fn(() => '{"type":"excalidrawlib","libraryItems":[]}'),
    exportToBlob: jest.fn(async () => new Blob(['abc'], { type: 'image/png' })),
    __mock: {
      emitChange: (elements, appState, files = mockState.files) => {
        mockState.elements = elements
        mockState.appState = { ...mockState.appState, ...appState }
        mockState.files = files
        if (mockState.onChange) mockState.onChange(mockState.elements, mockState.appState)
      },
      reset: () => {
        mockState.elements = []
        mockState.files = {}
        mockState.appState = {
          theme: 'light',
          viewBackgroundColor: '#ffffff',
          name: null,
          zenModeEnabled: false,
          gridModeEnabled: false,
          objectsSnapModeEnabled: false,
          viewModeEnabled: false,
        }
        mockState.onChange = null
        loadSceneOrLibraryFromBlob.mockReset()
        loadSceneOrLibraryFromBlob.mockImplementation(async () => defaultLibraryBlobResult())
        api.updateLibrary.mockClear()
        api.toggleSidebar.mockClear()
        api.setToast.mockClear()
      },
      getExcalidrawApi: () => api,
    },
  }
})

const flush = async () => {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0))
  })
}

describe('App integration: menu + dirty IPC', () => {
  let menuHandler

  beforeEach(() => {
    __mock.reset()
    menuHandler = null

    window.electron = {
      setTheme: jest.fn(),
      onMenuAction: jest.fn((cb) => {
        menuHandler = cb
        return () => {}
      }),
      openFile: jest.fn(async () => ({ canceled: true })),
      saveFile: jest.fn(async () => ({ canceled: true })),
      writeText: jest.fn(async () => {}),
      writeBinary: jest.fn(async () => {}),
      sendMenuState: jest.fn(),
      setLanguages: jest.fn(),
      setDirty: jest.fn(),
      setWindowTitle: jest.fn(),
      closeWindow: jest.fn(),
      readFile: jest.fn(async () => '{"ok":true}'),
      addRecentFile: jest.fn(),
      getRecentFiles: jest.fn(async () => []),
      openLibraryFile: jest.fn(async () => ({ canceled: true })),
      readLibraryCache: jest.fn(async () => ({ exists: false })),
      writeLibraryCache: jest.fn(async () => {}),
      clearLibraryCache: jest.fn(async () => {}),
    }
  })

  it('opens file directly when clean (no dialog)', async () => {
    render(React.createElement(App))
    await flush()

    await act(async () => {
      await menuHandler('open')
    })

    expect(window.electron.openFile).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument()
  })

  it('shows save/discard dialog before open when dirty', async () => {
    render(React.createElement(App))
    await flush()

    act(() => {
      __mock.emitChange(
        [{ id: 'u1', type: 'rectangle', x: 2, y: 3, width: 12, height: 14 }],
        { viewBackgroundColor: '#ffffff', name: null },
      )
    })

    await waitFor(() => expect(window.electron.setDirty).toHaveBeenCalledWith(true))

    await act(async () => {
      await menuHandler('open')
    })

    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
    expect(window.electron.openFile).toHaveBeenCalledTimes(0)

    await act(async () => {
      fireEvent.click(screen.getByText('Discard'))
    })

    expect(window.electron.openFile).toHaveBeenCalledTimes(1)
  })

  it('discard on close clears dirty and closes window', async () => {
    render(React.createElement(App))
    await flush()

    act(() => {
      __mock.emitChange(
        [{ id: 'u2', type: 'ellipse', x: 4, y: 5, width: 8, height: 8 }],
        { viewBackgroundColor: '#ffffff', name: null },
      )
    })

    await waitFor(() => expect(window.electron.setDirty).toHaveBeenCalledWith(true))

    await act(async () => {
      await menuHandler('confirm-close')
    })

    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByText('Discard'))
    })

    expect(window.electron.setDirty).toHaveBeenCalledWith(false)
    expect(window.electron.closeWindow).toHaveBeenCalledTimes(1)
  })

  it('renders recent files block with heading and separators in welcome menu', async () => {
    window.electron.getRecentFiles = jest.fn(async () => [
      'C:/drawings/alpha.excalidraw',
      'C:/drawings/beta.excalidraw',
    ])

    render(React.createElement(App))
    await flush()

    expect(screen.getByText('Recent files')).toBeInTheDocument()
    expect(screen.getByText('alpha.excalidraw')).toBeInTheDocument()
    expect(screen.getByText('beta.excalidraw')).toBeInTheDocument()
    expect(screen.getAllByRole('separator')).toHaveLength(2)
  })

  it('save-library-as writes serialized library when path chosen', async () => {
    window.electron.saveFile = jest.fn(async () => ({ canceled: false, filePath: 'C:/lib.excalidrawlib' }))

    render(React.createElement(App))
    await flush()

    await act(async () => {
      await menuHandler('save-library-as')
    })

    expect(serializeLibraryAsJSON).toHaveBeenCalled()
    expect(window.electron.writeText).toHaveBeenCalledWith(
      'C:/lib.excalidrawlib',
      '{"type":"excalidrawlib","libraryItems":[]}',
    )
  })

  it('toggle-sidebar opens canvas-settings tab', async () => {
    render(React.createElement(App))
    await flush()

    const api = __mock.getExcalidrawApi()

    await act(async () => {
      await menuHandler('toggle-sidebar')
    })

    expect(api.toggleSidebar).toHaveBeenCalledWith({ name: 'default', tab: 'canvas-settings' })
  })

  it('toggle-library pins sidebar and opens library tab', async () => {
    render(React.createElement(App))
    await flush()

    const api = __mock.getExcalidrawApi()

    await act(async () => {
      await menuHandler('toggle-library')
    })

    expect(api.toggleSidebar).toHaveBeenCalledWith({ name: 'default', tab: 'library' })
  })

  it('reset-library confirm calls updateLibrary to drop unpublished items', async () => {
    render(React.createElement(App))
    await flush()

    const api = __mock.getExcalidrawApi()

    await act(async () => {
      await menuHandler('reset-library')
    })

    expect(screen.getByText('Reset library')).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    })

    expect(api.updateLibrary).toHaveBeenCalledWith(
      expect.objectContaining({
        merge: false,
        libraryItems: expect.any(Function),
      }),
    )
  })
})

describe('App integration: library cache persistence', () => {
  afterEach(() => {
    jest.useRealTimers()
  })

  beforeEach(() => {
    __mock.reset()
    window.electron = {
      setTheme: jest.fn(),
      onMenuAction: jest.fn(() => () => {}),
      openFile: jest.fn(async () => ({ canceled: true })),
      saveFile: jest.fn(async () => ({ canceled: true })),
      writeText: jest.fn(async () => {}),
      writeBinary: jest.fn(async () => {}),
      sendMenuState: jest.fn(),
      setLanguages: jest.fn(),
      setDirty: jest.fn(),
      setWindowTitle: jest.fn(),
      closeWindow: jest.fn(),
      readFile: jest.fn(async () => '{"ok":true}'),
      addRecentFile: jest.fn(),
      getRecentFiles: jest.fn(async () => []),
      openLibraryFile: jest.fn(async () => ({ canceled: true })),
      readLibraryCache: jest.fn(async () => ({ exists: false })),
      writeLibraryCache: jest.fn(async () => {}),
      clearLibraryCache: jest.fn(async () => {}),
    }
  })

  it('restores library from local cache with merge false', async () => {
    const excalidraw = require('@excalidraw/excalidraw')
    window.electron.readLibraryCache = jest.fn(async () => ({
      exists: true,
      data: '{"type":"excalidrawlib","libraryItems":[]}',
    }))
    excalidraw.loadSceneOrLibraryFromBlob.mockResolvedValue({
      type: excalidraw.MIME_TYPES.excalidrawlib,
      data: {
        libraryItems: [{ id: 'cached-item', status: 'unpublished', elements: [] }],
      },
    })

    render(React.createElement(App))
    await act(async () => {
      await flush()
    })

    expect(excalidraw.loadSceneOrLibraryFromBlob).toHaveBeenCalled()
    expect(__mock.getExcalidrawApi().updateLibrary).toHaveBeenCalledWith(
      expect.objectContaining({
        merge: false,
        libraryItems: [{ id: 'cached-item', status: 'unpublished', elements: [] }],
      }),
    )
  })

  it('clears library cache file when cached payload is not excalidrawlib', async () => {
    const excalidraw = require('@excalidraw/excalidraw')
    window.electron.readLibraryCache = jest.fn(async () => ({ exists: true, data: '{}' }))
    excalidraw.loadSceneOrLibraryFromBlob.mockResolvedValue({
      type: excalidraw.MIME_TYPES.excalidraw,
      data: {},
    })

    render(React.createElement(App))
    await act(async () => {
      await flush()
    })

    expect(window.electron.clearLibraryCache).toHaveBeenCalled()
  })

  it('clears library cache when restore throws', async () => {
    const excalidraw = require('@excalidraw/excalidraw')
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    window.electron.readLibraryCache = jest.fn(async () => ({ exists: true, data: 'bad' }))
    excalidraw.loadSceneOrLibraryFromBlob.mockRejectedValue(new Error('parse failed'))

    render(React.createElement(App))
    await act(async () => {
      await flush()
    })

    expect(window.electron.clearLibraryCache).toHaveBeenCalled()
    errSpy.mockRestore()
  })

  it('writes library cache after debounce when cache becomes ready', async () => {
    render(React.createElement(App))
    await flush()
    await waitFor(
      () => {
        expect(window.electron.writeLibraryCache).toHaveBeenCalled()
      },
      { timeout: 4000 },
    )
    expect(window.electron.writeLibraryCache).toHaveBeenCalledWith(
      '{"type":"excalidrawlib","libraryItems":[]}',
    )
  })

  it('flushes library cache when document becomes hidden', async () => {
    render(React.createElement(App))
    await flush()
    await waitFor(() => expect(window.electron.writeLibraryCache).toHaveBeenCalled(), { timeout: 4000 })
    window.electron.writeLibraryCache.mockClear()

    await act(async () => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        writable: true,
        value: 'hidden',
      })
      document.dispatchEvent(new Event('visibilitychange'))
    })

    await waitFor(() => expect(window.electron.writeLibraryCache).toHaveBeenCalled(), { timeout: 3000 })

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      writable: true,
      value: 'visible',
    })
  })
})

describe('App integration: import library', () => {
  let menuHandler

  afterEach(() => {
    jest.useRealTimers()
  })

  beforeEach(() => {
    __mock.reset()
    menuHandler = null
    window.electron = {
      setTheme: jest.fn(),
      onMenuAction: jest.fn((cb) => {
        menuHandler = cb
        return () => {}
      }),
      openFile: jest.fn(async () => ({ canceled: true })),
      saveFile: jest.fn(async () => ({ canceled: true })),
      writeText: jest.fn(async () => {}),
      writeBinary: jest.fn(async () => {}),
      sendMenuState: jest.fn(),
      setLanguages: jest.fn(),
      setDirty: jest.fn(),
      setWindowTitle: jest.fn(),
      closeWindow: jest.fn(),
      readFile: jest.fn(async () => '{"ok":true}'),
      addRecentFile: jest.fn(),
      getRecentFiles: jest.fn(async () => []),
      openLibraryFile: jest.fn(async () => ({ canceled: true })),
      readLibraryCache: jest.fn(async () => ({ exists: false })),
      writeLibraryCache: jest.fn(async () => {}),
      clearLibraryCache: jest.fn(async () => {}),
    }
  })

  it('import-library merges file and opens library menu', async () => {
    const excalidraw = require('@excalidraw/excalidraw')
    window.electron.openLibraryFile = jest.fn(async () => ({
      canceled: false,
      data: '{"libraryItems":[{"id":"imp","elements":[]}]}',
    }))
    excalidraw.loadSceneOrLibraryFromBlob.mockResolvedValue({
      type: excalidraw.MIME_TYPES.excalidrawlib,
      data: { libraryItems: [{ id: 'imp', elements: [] }] },
    })

    render(React.createElement(App))
    await flush()

    await act(async () => {
      await menuHandler('import-library')
    })

    expect(__mock.getExcalidrawApi().updateLibrary).toHaveBeenCalledWith(
      expect.objectContaining({
        merge: true,
        openLibraryMenu: true,
        libraryItems: expect.any(Function),
      }),
    )
  })

  it('import-library shows toast when file is a drawing not a library', async () => {
    const excalidraw = require('@excalidraw/excalidraw')
    window.electron.openLibraryFile = jest.fn(async () => ({ canceled: false, data: '{}' }))
    excalidraw.loadSceneOrLibraryFromBlob.mockResolvedValue({
      type: excalidraw.MIME_TYPES.excalidraw,
      data: { elements: [] },
    })

    render(React.createElement(App))
    await flush()

    await act(async () => {
      await menuHandler('import-library')
    })

    expect(__mock.getExcalidrawApi().setToast).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringMatching(/drawing|library/i),
        closable: true,
      }),
    )
  })
})
