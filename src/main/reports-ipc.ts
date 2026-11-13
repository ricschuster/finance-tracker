import type Database from 'better-sqlite3'
import { ipcMain } from 'electron'
import { createReportsHandlers } from '../core/reports/handlers'
import { REPORTS_METHODS } from '../core/reports/methods'

/** Expose every reports handler as the IPC channel `reports:<method>`. */
export function registerReportsIpc(db: Database.Database): void {
  const handlers = createReportsHandlers(db) as Record<string, (...args: unknown[]) => unknown>
  for (const name of REPORTS_METHODS) {
    ipcMain.handle(`reports:${name}`, (_event, ...args: unknown[]) => handlers[name]!(...args))
  }
}
