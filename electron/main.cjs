const { app, BrowserWindow, shell } = require('electron');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '..');
const DASHBOARD_ORIGIN = process.env.DASHBOARD_ORIGIN || 'http://localhost:3000';
const SYNC_CENTER_URL = `${DASHBOARD_ORIGIN}/sync-center`;
const SMOKE = process.env.ELECTRON_SMOKE === '1' || process.argv.includes('--smoke');

let nextProcess = null;
let nextLogStream = null;

function ensureLogDir() {
  const dir = path.join(REPO_ROOT, 'logs');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function requestOk(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForDashboard(timeoutMs = 120_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await requestOk(DASHBOARD_ORIGIN)) return true;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

async function ensureDashboard() {
  if (await requestOk(DASHBOARD_ORIGIN)) return;

  const logDir = ensureLogDir();
  nextLogStream = fs.createWriteStream(path.join(logDir, 'desktop-next.log'), {
    flags: 'a',
  });
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  nextProcess = spawn(npmCmd, ['run', 'dev:next'], {
    cwd: REPO_ROOT,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
    windowsHide: true,
  });
  nextProcess.stdout?.pipe(nextLogStream, { end: false });
  nextProcess.stderr?.pipe(nextLogStream, { end: false });

  const ready = await waitForDashboard();
  if (!ready) {
    throw new Error(`Dashboard did not become ready at ${DASHBOARD_ORIGIN}`);
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1100,
    minHeight: 720,
    title: 'LECG Dashboard Sync Center',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  void win.loadURL(SYNC_CENTER_URL);

  if (SMOKE) {
    win.webContents.once('did-finish-load', () => {
      setTimeout(() => app.quit(), 1500);
    });
  }
}

app.whenReady().then(async () => {
  try {
    await ensureDashboard();
    createWindow();
  } catch (err) {
    console.error(err);
    app.exit(1);
  }
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('before-quit', () => {
  if (nextProcess && !nextProcess.killed) {
    if (process.platform === 'win32' && nextProcess.pid) {
      spawnSync('taskkill', ['/PID', String(nextProcess.pid), '/T', '/F'], {
        stdio: 'ignore',
      });
    } else {
      nextProcess.kill();
    }
  }
  nextLogStream?.end();
});
