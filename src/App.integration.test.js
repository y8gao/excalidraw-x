import { __mock } from '@excalidraw/excalidraw'
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
    toggleSidebar: () => {},
    getSceneElements: () => mockState.elements,
    getAppState: () => mockState.appState,
    getFiles: () => mockState.files,
  }

  const Excalidraw = ({ onChange, excalidrawAPI, children }) => {
    ReactLib.useEffect(() => {
      mockState.onChange = onChange
      excalidrawAPI(api)
    }, [onChange, excalidrawAPI])
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

  return {
    Excalidraw,
    MainMenu,
    WelcomeScreen,
    DefaultSidebar,
    Sidebar,
    languages: [{ code: 'en', label: 'English' }],
    loadFromBlob: jest.fn(async () => ({
      elements: [{ id: 'opened-1', type: 'rectangle', x: 1, y: 1, width: 10, height: 10 }],
      appState: { viewBackgroundColor: '#ffffff', name: 'opened', theme: 'light' },
      files: {},
    })),
    serializeAsJSON: jest.fn(() => '{"ok":true}'),
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
      },
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
})
