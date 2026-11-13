import { join } from 'node:path'
import { app, BrowserWindow, ipcMain } from 'electron'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { openDatabase } from '../core/db/open'
import { seedDemoData } from '../core/dev/seed'
import { registerImportIpc } from './import-ipc'
import { registerLedgerIpc } from './ledger-ipc'
import { registerRulesIpc } from './rules-ipc'
import { registerReportsIpc } from './reports-ipc'
import { registerSearchIpc } from './search-ipc'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

void app.whenReady().then(() => {
  // FT_DB_PATH points at a separate file (used by `npm run dev:demo`); FT_SEED=demo fills it if empty.
  const dbPath = process.env['FT_DB_PATH'] ?? join(app.getPath('userData'), 'finance.sqlite')
  mkdirSync(dirname(dbPath), { recursive: true })
  const db = openDatabase(dbPath)
  if (process.env['FT_SEED'] === 'demo' && !db.prepare('SELECT 1 FROM accounts LIMIT 1').get()) {
    seedDemoData(db)
  }
  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    schemaVersion: db.pragma('user_version', { simple: true }) as number,
  }))
  registerLedgerIpc(db)
  registerImportIpc(db)
  registerRulesIpc(db)
  registerSearchIpc(db)
  registerReportsIpc(db)
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
