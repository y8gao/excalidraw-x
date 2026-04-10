const { app, BrowserWindow, ipcMain, nativeTheme, Menu, dialog, shell } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const isDev = require('electron-is-dev');

// ─── Recent-files persistence ──────────────────────────────────────────────────
const MAX_RECENT = 10;
let recentFiles = [];let isDirtyMain = false;  // mirrors renderer's unsaved-changes state
const getRecentFilesPath = () =>
  path.join(app.getPath('userData'), 'recent-files.json');

const getLibraryCachePath = () =>
  path.join(app.getPath('userData'), 'library-cache.excalidrawlib');

const loadRecentFiles = () => {
  try {
    const p = getRecentFilesPath();
    if (fs.existsSync(p)) {
      const parsed = JSON.parse(fs.readFileSync(p, 'utf-8'));
      if (Array.isArray(parsed)) {
        recentFiles = parsed.filter(f => { try { return fs.existsSync(f); } catch { return false; } });
      }
    }
  } catch { recentFiles = []; }
};

const saveRecentFiles = () => {
  try {
    fs.writeFileSync(getRecentFilesPath(), JSON.stringify(recentFiles), 'utf-8');
  } catch (err) { console.error('Failed to save recent files:', err); }
};

const addRecentFile = (filePath) => {
  recentFiles = [filePath, ...recentFiles.filter(f => f !== filePath)].slice(0, MAX_RECENT);
  saveRecentFiles();
  buildMenu();
};
// ───────────────────────────────────────────────────────────────────────────────

let mainWindow;

const waitForDevServer = (url, retries = 30, delay = 1000) => {
  return new Promise((resolve, reject) => {
    const attempt = () => {
      http.get(url, () => {
        resolve();
      }).on('error', () => {
        if (retries-- > 0) {
          setTimeout(attempt, delay);
        } else {
          reject(new Error(`Dev server at ${url} did not start in time`));
        }
      });
    };
    attempt();
  });
};

// Mutable menu state — rebuilt whenever any value changes
let menuState = {
  appearance: 'auto', // 'auto' | 'light' | 'dark'
  zenMode: false,
  gridMode: false,
  snapMode: false,
  viewMode: false,
  langCode: 'en',
  languages: [],
};

const buildMenu = () => {
  const send = (action) => () => {
    if (mainWindow) mainWindow.webContents.send('menu-action', action);
  };

  // Checkbox click: flip local state, rebuild, then tell renderer the new explicit value
  const toggleState = (key, actionName) => () => {
    menuState[key] = !menuState[key];
    buildMenu();
    if (mainWindow) mainWindow.webContents.send('menu-action', `${actionName}:${menuState[key]}`);
  };

  const template = [
    {
      label: 'File',
      submenu: [
        { label: 'Open...', accelerator: 'CmdOrCtrl+O', click: send('open') },
        {
          label: 'Open Recent',
          submenu: recentFiles.length > 0
            ? [
                ...recentFiles.map(fp => ({
                  label: path.basename(fp),
                  click: () => { if (mainWindow) mainWindow.webContents.send('menu-action', `open-recent:${fp}`); },
                })),
                { type: 'separator' },
                {
                  label: 'Clear Recent Items',
                  click: () => { recentFiles = []; saveRecentFiles(); buildMenu(); },
                },
              ]
            : [{ label: 'No Recent Items', enabled: false }],
        },
        { type: 'separator' },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: send('save') },
        { label: 'Save As...', accelerator: 'CmdOrCtrl+Shift+S', click: send('save-as') },
        { type: 'separator' },
        { label: 'Export Image...', accelerator: 'CmdOrCtrl+Shift+E', click: send('export-image') },
        { type: 'separator' },
        { label: 'Exit', click: () => app.quit() },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        {
          label: 'Undo',
          accelerator: 'CmdOrCtrl+Z',
          click: () => {
            if (!mainWindow) return;
            mainWindow.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Z', modifiers: ['control'] });
            mainWindow.webContents.sendInputEvent({ type: 'keyUp',   keyCode: 'Z', modifiers: ['control'] });
          },
        },
        {
          label: 'Redo',
          accelerator: 'CmdOrCtrl+Shift+Z',
          click: () => {
            if (!mainWindow) return;
            mainWindow.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Z', modifiers: ['control', 'shift'] });
            mainWindow.webContents.sendInputEvent({ type: 'keyUp',   keyCode: 'Z', modifiers: ['control', 'shift'] });
          },
        },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        {
          label: 'Find on Canvas',
          accelerator: 'CmdOrCtrl+F',
          click: () => {
            if (!mainWindow) return;
            mainWindow.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'F', modifiers: ['control'] });
            mainWindow.webContents.sendInputEvent({ type: 'keyUp',   keyCode: 'F', modifiers: ['control'] });
          },
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'View Mode',
          type: 'checkbox',
          checked: menuState.viewMode,
          accelerator: 'Alt+R',
          click: toggleState('viewMode', 'view-mode'),
        },
        {
          label: 'Zen Mode',
          type: 'checkbox',
          checked: menuState.zenMode,
          accelerator: 'Alt+Z',
          click: toggleState('zenMode', 'zen-mode'),
        },
        {
          label: 'Grid',
          type: 'checkbox',
          checked: menuState.gridMode,
          accelerator: "CmdOrCtrl+'",
          click: toggleState('gridMode', 'grid'),
        },
        {
          label: 'Snap to Objects',
          type: 'checkbox',
          checked: menuState.snapMode,
          accelerator: 'Alt+S',
          click: toggleState('snapMode', 'snap'),
        },
        { type: 'separator' },
        {
          label: 'Zoom In',
          accelerator: 'CmdOrCtrl+=',
          click: () => {
            if (!mainWindow) return;
            mainWindow.webContents.sendInputEvent({ type: 'keyDown', keyCode: '=', modifiers: ['control'] });
            mainWindow.webContents.sendInputEvent({ type: 'keyUp',   keyCode: '=', modifiers: ['control'] });
          },
        },
        {
          label: 'Zoom Out',
          accelerator: 'CmdOrCtrl+-',
          click: () => {
            if (!mainWindow) return;
            mainWindow.webContents.sendInputEvent({ type: 'keyDown', keyCode: '-', modifiers: ['control'] });
            mainWindow.webContents.sendInputEvent({ type: 'keyUp',   keyCode: '-', modifiers: ['control'] });
          },
        },
        {
          label: 'Reset Zoom',
          accelerator: 'CmdOrCtrl+0',
          click: () => {
            if (!mainWindow) return;
            mainWindow.webContents.sendInputEvent({ type: 'keyDown', keyCode: '0', modifiers: ['control'] });
            mainWindow.webContents.sendInputEvent({ type: 'keyUp',   keyCode: '0', modifiers: ['control'] });
          },
        },
        { type: 'separator' },
        { label: 'Reset Canvas', accelerator: 'CmdOrCtrl+Delete', click: send('reset-canvas') },
        { type: 'separator' },
        { label: 'Toggle Sidebar', accelerator: 'CmdOrCtrl+B', click: send('toggle-sidebar') },
      ],
    },
    {
      label: 'Library',
      submenu: [
        {
          label: 'Browse libraries (web)…',
          accelerator: 'CmdOrCtrl+Alt+B',
          click: () => {
            shell.openExternal('https://libraries.excalidraw.com/');
          },
        },
        { type: 'separator' },
        { label: 'Import Library…', accelerator: 'CmdOrCtrl+Shift+O', click: send('import-library') },
        { label: 'Save to…', accelerator: 'CmdOrCtrl+Alt+E', click: send('save-library-as') },
        { type: 'separator' },
        { label: 'Reset Library', accelerator: 'CmdOrCtrl+Shift+Backspace', click: send('reset-library') },
        { type: 'separator' },
        { label: 'Toggle Library', accelerator: 'CmdOrCtrl+Alt+L', click: send('toggle-library') },
      ],
    },
    {
      label: 'Window',
      submenu: [
        {
          label: 'Appearance',
          submenu: [
            {
              label: 'Auto',
              type: 'radio',
              checked: menuState.appearance === 'auto',
              click: () => {
                menuState.appearance = 'auto';
                nativeTheme.themeSource = 'system';
                buildMenu();
                if (mainWindow) mainWindow.webContents.send('menu-action', 'appearance:auto');
              },
            },
            {
              label: 'Light',
              type: 'radio',
              checked: menuState.appearance === 'light',
              click: () => {
                menuState.appearance = 'light';
                nativeTheme.themeSource = 'light';
                buildMenu();
                if (mainWindow) mainWindow.webContents.send('menu-action', 'appearance:light');
              },
            },
            {
              label: 'Dark',
              type: 'radio',
              checked: menuState.appearance === 'dark',
              click: () => {
                menuState.appearance = 'dark';
                nativeTheme.themeSource = 'dark';
                buildMenu();
                if (mainWindow) mainWindow.webContents.send('menu-action', 'appearance:dark');
              },
            },
          ],
        },
        ...(menuState.languages.length > 0 ? [{
          label: 'Language',
          submenu: menuState.languages.map(({ code, label }) => ({
            label,
            type: 'radio',
            checked: menuState.langCode === code,
            click: () => {
              menuState.langCode = code;
              buildMenu();
              if (mainWindow) mainWindow.webContents.send('menu-action', `lang:${code}`);
            },
          })),
        }] : []),
        { type: 'separator' },
        { label: 'Fullscreen', role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Shortcuts', click: send('help') },
        { label: 'Command Palette', accelerator: 'CmdOrCtrl+/', click: send('command-palette') },
        { type: 'separator' },
        {
          label: 'About ExcalidrawX',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About ExcalidrawX',
              message: 'ExcalidrawX',
              detail: [
                `Version: ${app.getVersion()}`,
                `Electron: ${process.versions.electron}`,
                `Chrome: ${process.versions.chrome}`,
                `Node.js: ${process.versions.node}`,
              ].join('\n'),
              buttons: ['OK'],
            });
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);          // fallback for app-level (e.g. macOS)
  if (mainWindow) {
    mainWindow.setMenu(menu);             // must set per-window for frameless on Windows
    mainWindow.setMenuBarVisibility(true);
  }
};

const resolveWindowIcon = () => {
  if (process.platform === 'win32') {
    const p = path.join(__dirname, 'assets', 'icon.ico');
    return fs.existsSync(p) ? p : undefined;
  }
  if (process.platform === 'linux') {
    const p = path.join(__dirname, 'assets', 'icon.png');
    return fs.existsSync(p) ? p : undefined;
  }
  return undefined;
};

const createWindow = async () => {
  const winIcon = resolveWindowIcon();

  mainWindow = new BrowserWindow({
    title: 'ExcalidrawX',
    width: 1400,
    height: 900,
    ...(winIcon ? { icon: winIcon } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
    },
  });

  // Excalidraw "Browse libraries" uses window.open — open in the system browser instead of a second app window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (
        (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
        (parsed.hostname === 'libraries.excalidraw.com' ||
          parsed.hostname === 'www.libraries.excalidraw.com')
      ) {
        shell.openExternal(url);
        return { action: 'deny' };
      }
    } catch {
      /* invalid URL */
    }
    return { action: 'allow' };
  });

  // Determine the app URL based on environment
  const appUrl = isDev
    ? 'http://localhost:3000'
    : `file://${path.join(__dirname, 'build/index.html')}`;

  if (isDev) {
    await waitForDevServer('http://localhost:3000').catch(console.error);
  }
  mainWindow.loadURL(appUrl);

  // Re-apply menu to this window instance now that it exists
  buildMenu();

  // Only open DevTools in development
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  // Toggle DevTools with Ctrl+Shift+I
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.control && input.shift && input.keyCode === 105) {
      mainWindow.webContents.toggleDevTools();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Guard against accidental close when there are unsaved changes
  mainWindow.on('close', (event) => {
    if (!isDirtyMain) return;
    event.preventDefault();
    // Ask renderer to show its own styled confirmation dialog
    mainWindow.webContents.send('menu-action', 'confirm-close');
  });
};

ipcMain.on('window:minimize',  () => { if (mainWindow) mainWindow.minimize(); });
ipcMain.on('window:maximize',  () => { if (mainWindow) mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize(); });
ipcMain.on('window:close',     () => { if (mainWindow) mainWindow.close(); });  // goes through close-guard
ipcMain.handle('window:is-maximized', () => mainWindow ? mainWindow.isMaximized() : false);

ipcMain.on('menu:dirty-update', (event, dirty) => {
  isDirtyMain = dirty;
});

ipcMain.on('window:close-confirmed', () => {
  isDirtyMain = false;
  if (mainWindow) mainWindow.destroy();
});

ipcMain.on('window:set-title', (event, title) => {
  if (mainWindow) mainWindow.setTitle(title);
});

ipcMain.on('set-theme', (event, theme) => {
  // Only override nativeTheme when the user has explicitly chosen Light or Dark.
  // When Auto is active, keep themeSource as 'system' so the OS signal stays intact
  // and window.matchMedia in the renderer correctly reflects OS changes.
  if (menuState.appearance !== 'auto') {
    nativeTheme.themeSource = theme === 'dark' ? 'dark' : 'light';
  }
});

ipcMain.on('menu:state-update', (event, state) => {
  Object.assign(menuState, state);
  buildMenu();
});

ipcMain.on('menu:set-languages', (event, languages) => {
  menuState.languages = languages;
  buildMenu();
});

ipcMain.handle('dialog:open-library-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    filters: [
      { name: 'Excalidraw library', extensions: ['excalidrawlib', 'json'] },
      { name: 'All Files', extensions: ['*'] },
    ],
    properties: ['openFile'],
  });
  if (result.canceled) return { canceled: true };
  const filePath = result.filePaths[0];
  const data = await fs.promises.readFile(filePath, 'utf-8');
  return { canceled: false, data };
});

ipcMain.handle('dialog:open-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    filters: [
      { name: 'Excalidraw', extensions: ['excalidraw', 'json'] },
      { name: 'All Files', extensions: ['*'] },
    ],
    properties: ['openFile'],
  });
  if (result.canceled) return { canceled: true };
  const filePath = result.filePaths[0];
  const data = await fs.promises.readFile(filePath, 'utf-8');
  return { canceled: false, data, filePath };
});

ipcMain.handle('fs:read-file', async (event, filePath) => {
  return fs.promises.readFile(filePath, 'utf-8');
});

ipcMain.on('menu:add-recent', (event, filePath) => {
  addRecentFile(filePath);
});

ipcMain.handle('menu:get-recent-files', () => recentFiles);

ipcMain.handle('library:read-cache', async () => {
  try {
    const p = getLibraryCachePath();
    if (!fs.existsSync(p)) return { exists: false };
    const data = await fs.promises.readFile(p, 'utf-8');
    return { exists: true, data };
  } catch (err) {
    console.error('Library cache read failed:', err);
    return { exists: false };
  }
});

ipcMain.handle('library:write-cache', async (event, data) => {
  const p = getLibraryCachePath();
  await fs.promises.writeFile(p, data, 'utf-8');
});

ipcMain.handle('library:clear-cache', async () => {
  try {
    const p = getLibraryCachePath();
    if (fs.existsSync(p)) await fs.promises.unlink(p);
  } catch (err) {
    console.error('Library cache clear failed:', err);
  }
});

ipcMain.handle('dialog:save-file', async (event, { defaultPath, filters }) => {
  const result = await dialog.showSaveDialog(mainWindow, { defaultPath, filters });
  return { canceled: result.canceled, filePath: result.filePath };
});

ipcMain.handle('fs:write-text', async (event, filePath, data) => {
  await fs.promises.writeFile(filePath, data, 'utf-8');
});

ipcMain.handle('fs:write-binary', async (event, filePath, data) => {
  await fs.promises.writeFile(filePath, Buffer.from(data));
});

app.on('ready', () => {
  loadRecentFiles();
  buildMenu();
  createWindow();

  // When OS theme changes and appearance is set to Auto, push the new theme to the renderer
  nativeTheme.on('updated', () => {
    if (menuState.appearance === 'auto' && mainWindow) {
      mainWindow.webContents.send('menu-action', 'appearance:auto');
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

