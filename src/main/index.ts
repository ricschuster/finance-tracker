import { join } from 'node:path'
import { app, BrowserWindow, ipcMain } from 'electron'
import { openDatabase } from '../core/db/open'

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
  const db = openDatabase(join(app.getPath('userData'), 'finance.sqlite'))
  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    schemaVersion: db.pragma('user_version', { simple: true }) as number,
  }))
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
