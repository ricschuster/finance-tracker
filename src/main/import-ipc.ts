import { readFile, stat } from 'node:fs/promises'
import { basename } from 'node:path'
import type Database from 'better-sqlite3'
import { BrowserWindow, dialog, ipcMain } from 'electron'
import { decodeBytes, MAX_FILE_BYTES } from '../core/import/csv'
import { createImportHandlers } from '../core/import/handlers'
import { IMPORT_METHODS } from '../core/import/methods'

/** Expose import handlers as `import:<method>`, plus the native file picker as `import:pickFile`. */
export function registerImportIpc(db: Database.Database): void {
  const handlers = createImportHandlers(db) as Record<string, (...args: unknown[]) => unknown>
  for (const name of IMPORT_METHODS) {
    ipcMain.handle(`import:${name}`, (_event, ...args: unknown[]) => handlers[name]!(...args))
  }
  ipcMain.handle('import:pickFile', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options = {
      title: 'Choose a bank file',
      properties: ['openFile' as const],
      filters: [
        { name: 'Bank exports', extensions: ['csv', 'txt'] },
        { name: 'All files', extensions: ['*'] },
      ],
    }
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)
    const path = result.filePaths[0]
    if (result.canceled || !path) return null
    if ((await stat(path)).size > MAX_FILE_BYTES) {
      throw new Error(`File is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB`)
    }
    // Only the file name leaves main, never the full path.
    return { name: basename(path), text: decodeBytes(await readFile(path)) }
  })
}
