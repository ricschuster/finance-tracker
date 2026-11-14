import { readFile, stat } from 'node:fs/promises'
import { basename } from 'node:path'
import type Database from 'better-sqlite3'
import { BrowserWindow, dialog, ipcMain } from 'electron'
import { decodeBytes, MAX_FILE_BYTES } from '../core/import/csv'
import { createImportHandlers } from '../core/import/handlers'
import {
  getImportFolder,
  folderFilePath,
  scanImportFolder,
  setImportFolder,
} from '../core/import/folder'
import { IMPORT_METHODS } from '../core/import/methods'
import { isXlsxName, xlsxToCsv } from '../core/import/xlsx'

/** Read a bank file as text; spreadsheets are converted to CSV first. */
async function readText(name: string, path: string): Promise<{ name: string; text: string }> {
  const bytes = await readFile(path)
  return { name, text: isXlsxName(name) ? await xlsxToCsv(bytes) : decodeBytes(bytes) }
}

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
        { name: 'Bank exports', extensions: ['csv', 'txt', 'xlsx'] },
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
    return readText(basename(path), path)
  })
  // A dropped spreadsheet arrives as bytes (the renderer cannot read it as text).
  ipcMain.handle('import:convertXlsx', async (_event, name: string, bytes: Uint8Array) => {
    if (bytes.byteLength > MAX_FILE_BYTES) {
      throw new Error(`File is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB`)
    }
    return { name: String(name), text: await xlsxToCsv(bytes) }
  })

  // The folder is only ever set through the native picker, and files are read by bare name from it.
  ipcMain.handle('import:getFolder', () => getImportFolder(db))
  ipcMain.handle('import:chooseFolder', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options = {
      title: 'Choose the folder your bank files are saved in',
      properties: ['openDirectory' as const],
    }
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)
    const path = result.filePaths[0]
    return result.canceled || !path ? getImportFolder(db) : setImportFolder(db, path)
  })
  ipcMain.handle('import:clearFolder', () => setImportFolder(db, ''))
  ipcMain.handle('import:scanFolder', () => scanImportFolder(db, getImportFolder(db)))
  ipcMain.handle('import:readFolderFile', (_event, name: string) =>
    readText(String(name), folderFilePath(getImportFolder(db), String(name))),
  )
}
