import type Database from 'better-sqlite3'
import { ipcMain } from 'electron'
import { createSearchHandlers } from '../core/search/handlers'
import { SEARCH_METHODS } from '../core/search/methods'

/** Expose every search handler as the IPC channel `search:<method>`. */
export function registerSearchIpc(db: Database.Database): void {
  const handlers = createSearchHandlers(db) as Record<string, (...args: unknown[]) => unknown>
  for (const name of SEARCH_METHODS) {
    ipcMain.handle(`search:${name}`, (_event, ...args: unknown[]) => handlers[name]!(...args))
  }
}
