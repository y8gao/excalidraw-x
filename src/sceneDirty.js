export const createSceneSnapshot = (elements, appState, files) => (
  JSON.stringify({
    elements,
    files,
    appState: {
      name: appState?.name || null,
      viewBackgroundColor: appState?.viewBackgroundColor || '#ffffff',
    },
  })
)

export const isSceneDirty = (cleanSnapshot, elements, appState, files) => {
  if (!cleanSnapshot) return false
  return createSceneSnapshot(elements, appState, files) !== cleanSnapshot
}