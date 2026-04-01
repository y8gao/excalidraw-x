const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  setTheme: (theme) => ipcRenderer.send('set-theme', theme),

  onMenuAction: (cb) => {
    const handler = (e, action) => cb(action);
    ipcRenderer.on('menu-action', handler);
    return () => ipcRenderer.removeListener('menu-action', handler);
  },

  openFile: () => ipcRenderer.invoke('dialog:open-file'),

  saveFile: (opts) => ipcRenderer.invoke('dialog:save-file', opts),

  writeText: (filePath, data) => ipcRenderer.invoke('fs:write-text', filePath, data),

  writeBinary: (filePath, data) => ipcRenderer.invoke('fs:write-binary', filePath, data),

  // Send toggle/mode state to main so menu checkmarks stay accurate
  sendMenuState: (state) => ipcRenderer.send('menu:state-update', state),

  // Send language list on startup so main can build Language submenu
  setLanguages: (languages) => ipcRenderer.send('menu:set-languages', languages),

  // Notify main of unsaved-changes state so the close guard works
  setDirty: (dirty) => ipcRenderer.send('menu:dirty-update', dirty),

  // Update the native window title
  setWindowTitle: (title) => ipcRenderer.send('window:set-title', title),

  // Confirmed close: bypasses guard, destroys window (called after user saves/discards)
  closeWindow: () => ipcRenderer.send('window:close-confirmed'),

  // Read a file directly by path (used for Open Recent)
  readFile: (filePath) => ipcRenderer.invoke('fs:read-file', filePath),

  // Notify main to add a file to the recent files list
  addRecentFile: (filePath) => ipcRenderer.send('menu:add-recent', filePath),

  // Get persisted recent files list
  getRecentFiles: () => ipcRenderer.invoke('menu:get-recent-files'),
});
