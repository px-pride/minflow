const { app, BrowserWindow } = require('electron');
const path = require('path');
const { homedir } = require('os');
const { startServer } = require('./server');

const DATA_DIR = process.env.MINFLOW_DATA_DIR || path.join(homedir(), '.config', 'minflow');
const PORT = parseInt(process.env.MINFLOW_PORT || '3777', 10);

let serverInstance;

async function isPortInUse(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/workspace`, { method: 'HEAD' });
    return res.ok || res.status === 404;
  } catch {
    return false;
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  win.loadURL(`http://127.0.0.1:${PORT}`);
}

app.whenReady().then(async () => {
  try {
    if (!(await isPortInUse(PORT))) {
      serverInstance = await startServer({ dataDir: DATA_DIR, port: PORT, logger: false });
    }
    createWindow();
  } catch (err) {
    console.error('[minflow] Startup failed:', err);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
