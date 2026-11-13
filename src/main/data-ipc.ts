import type Database from 'better-sqlite3'
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { rmSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  backupDue,
  exportFileName,
  exportTransactionsCsv,
  getBackupSettings,
  listBackups,
  runBackup,
  setBackupSettings,
  snapshotTo,
  stageRestore,
  validateDatabaseFile,
  type BackupSettings,
  type CsvExportFilter,
} from '../core/backup'
import { migrations } from '../core/db/migrations'

export interface DataStatus {
  settings: BackupSettings
  backupCount: number
  lastBackupAt: number | null
  lastError: string | null
  keptRestoreCopy: string | null
}

const HOUR = 3_600_000

/**
 * Data safety IPC (`data:*`): database export, restore, CSV export and automatic backups.
 * `keptRestoreCopy` is the pre-restore copy made at this start, if a restore was just applied.
 */
export function registerDataIpc(
  db: Database.Database,
  dbPath: string,
  keptRestoreCopy: string | null,
): void {
  let lastError: string | null = null
  let inFlight: Promise<void> | null = null

  const windowOf = (e: Electron.IpcMainInvokeEvent) => BrowserWindow.fromWebContents(e.sender)

  /** One backup at a time; a caller arriving mid-backup waits for that one instead of starting another. */
  function backupNow(): Promise<void> {
    inFlight ??= runBackup(db, getBackupSettings(db), new Date())
      .then(() => {
        lastError = null
      })
      .catch((err: unknown) => {
        lastError = err instanceof Error ? err.message : String(err)
        throw err
      })
      .finally(() => {
        inFlight = null
      })
    return inFlight
  }

  async function backupIfDue(): Promise<void> {
    try {
      if (backupDue(getBackupSettings(db), new Date())) await backupNow()
    } catch {
      // Recorded in lastError and shown in the Data tab; never crash the app.
    }
  }
  void backupIfDue()
  setInterval(() => void backupIfDue(), HOUR).unref()

  function status(): DataStatus {
    const settings = getBackupSettings(db)
    const files = listBackups(settings.folder)
    return {
      settings,
      backupCount: files.length,
      lastBackupAt: files[0]?.mtimeMs ?? null,
      lastError,
      keptRestoreCopy,
    }
  }

  ipcMain.handle('data:status', () => status())

  ipcMain.handle('data:setSettings', (_e, s: BackupSettings) => {
    setBackupSettings(db, s)
    void backupIfDue()
    return status()
  })

  ipcMain.handle('data:chooseFolder', async (e) => {
    const win = windowOf(e)
    const options = {
      title: 'Choose a backup folder',
      properties: ['openDirectory' as const, 'createDirectory' as const],
    }
    const r = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    return r.canceled ? null : (r.filePaths[0] ?? null)
  })

  ipcMain.handle('data:backupNow', async () => {
    await backupNow()
    return status()
  })

  ipcMain.handle('data:exportDatabase', async (e) => {
    const win = windowOf(e)
    const options = {
      title: 'Export database',
      defaultPath: join(app.getPath('documents'), exportFileName(new Date())),
      filters: [{ name: 'SQLite database', extensions: ['sqlite'] }],
    }
    const r = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
    if (r.canceled || !r.filePath) return null
    // The dialog already asked about overwriting; snapshotTo refuses existing files, so clear it.
    rmSync(r.filePath, { force: true })
    await snapshotTo(db, r.filePath)
    return r.filePath
  })

  ipcMain.handle('data:exportCsv', async (e, filter?: CsvExportFilter) => {
    const win = windowOf(e)
    const options = {
      title: 'Export transactions',
      defaultPath: join(app.getPath('documents'), 'transactions.csv'),
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    }
    const r = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
    if (r.canceled || !r.filePath) return null
    await writeFile(r.filePath, exportTransactionsCsv(db, filter), 'utf8')
    return r.filePath
  })

  ipcMain.handle('data:restoreDatabase', async (e) => {
    const win = windowOf(e)
    const options = {
      title: 'Restore from a database file',
      properties: ['openFile' as const],
      filters: [{ name: 'SQLite database', extensions: ['sqlite', 'db'] }],
    }
    const r = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    const file = r.filePaths[0]
    if (r.canceled || !file) return { status: 'cancelled' as const }
    const v = validateDatabaseFile(file, migrations.length)
    if (!v.ok) return { status: 'invalid' as const, reason: v.reason }
    const box = {
      type: 'warning' as const,
      buttons: ['Replace my data and restart', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      message: 'Replace all current data with this file?',
      detail:
        'A copy of your current data is kept in the pre-restore folder next to the database. The app will restart.',
    }
    const answer = win ? await dialog.showMessageBox(win, box) : await dialog.showMessageBox(box)
    if (answer.response !== 0) return { status: 'cancelled' as const }
    stageRestore(file, dbPath)
    app.relaunch()
    app.exit(0)
    return { status: 'restarting' as const }
  })
}
