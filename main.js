const { app, BrowserWindow } = require('electron');
const path = require('path');

let mainWindow;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      // Allow loading content with lenient MIME checking for CDN resources
      webSecurity: true,
    },
  });

  // Load from webpack dev server during development, or built file in production
  const isDev = require('electron-is-dev');
  const appUrl = isDev
    ? 'http://localhost:3000'
    : `file://${path.join(__dirname, 'build', 'index.html')}`;
  mainWindow.loadURL(appUrl);
  mainWindow.webContents.openDevTools();

  // Handle any security warnings
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.control && input.shift && input.keyCode === 105) {
      mainWindow.webContents.toggleDevTools();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

app.on('ready', createWindow);

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

// Handle any uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});


