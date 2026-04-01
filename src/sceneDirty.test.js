import { createSceneSnapshot, isSceneDirty } from './sceneDirty'

describe('scene dirty tracking', () => {
  const baseElements = [
    { id: '1', type: 'rectangle', x: 10, y: 20, width: 100, height: 80 },
  ]

  const baseAppState = {
    name: 'drawing',
    viewBackgroundColor: '#ffffff',
    theme: 'light',
    zoom: { value: 1 },
    openDialog: null,
  }

  const baseFiles = {
    fileA: { mimeType: 'image/png', id: 'fileA', dataURL: 'data:image/png;base64,abc' },
  }

  it('returns not dirty for unchanged scene', () => {
    const clean = createSceneSnapshot(baseElements, baseAppState, baseFiles)
    expect(isSceneDirty(clean, baseElements, baseAppState, baseFiles)).toBe(false)
  })

  it('returns dirty when elements change', () => {
    const clean = createSceneSnapshot(baseElements, baseAppState, baseFiles)
    const changedElements = [...baseElements, { id: '2', type: 'ellipse', x: 1, y: 1, width: 20, height: 20 }]
    expect(isSceneDirty(clean, changedElements, baseAppState, baseFiles)).toBe(true)
  })

  it('returns dirty when background color changes', () => {
    const clean = createSceneSnapshot(baseElements, baseAppState, baseFiles)
    const changedAppState = { ...baseAppState, viewBackgroundColor: '#ff0000' }
    expect(isSceneDirty(clean, baseElements, changedAppState, baseFiles)).toBe(true)
  })

  it('returns dirty when document name changes', () => {
    const clean = createSceneSnapshot(baseElements, baseAppState, baseFiles)
    const changedAppState = { ...baseAppState, name: 'new-name' }
    expect(isSceneDirty(clean, baseElements, changedAppState, baseFiles)).toBe(true)
  })

  it('ignores transient UI state not included in snapshot', () => {
    const clean = createSceneSnapshot(baseElements, baseAppState, baseFiles)
    const transientChanged = {
      ...baseAppState,
      theme: 'dark',
      zoom: { value: 1.2 },
      openDialog: { name: 'help' },
      openSidebar: { name: 'default', tab: 'library' },
    }
    expect(isSceneDirty(clean, baseElements, transientChanged, baseFiles)).toBe(false)
  })

  it('returns dirty when files payload changes', () => {
    const clean = createSceneSnapshot(baseElements, baseAppState, baseFiles)
    const changedFiles = {
      ...baseFiles,
      fileB: { mimeType: 'image/png', id: 'fileB', dataURL: 'data:image/png;base64,xyz' },
    }
    expect(isSceneDirty(clean, baseElements, baseAppState, changedFiles)).toBe(true)
  })
})