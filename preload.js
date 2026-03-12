const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  // Add IPC methods here as needed
});
