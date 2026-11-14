import type Database from 'better-sqlite3'
import { ipcMain } from 'electron'
import { createBudgetsHandlers } from '../core/budgets/handlers'
import { BUDGETS_METHODS } from '../core/budgets/methods'

/** Expose every budgets handler as the IPC channel `budgets:<method>`. */
export function registerBudgetsIpc(db: Database.Database): void {
  const handlers = createBudgetsHandlers(db) as Record<string, (...args: unknown[]) => unknown>
  for (const name of BUDGETS_METHODS) {
    ipcMain.handle(`budgets:${name}`, (_event, ...args: unknown[]) => handlers[name]!(...args))
  }
}
