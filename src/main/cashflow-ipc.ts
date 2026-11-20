import type Database from 'better-sqlite3'
import { ipcMain } from 'electron'
import { createCashflowHandlers } from '../core/cashflow/handlers'
import { CASHFLOW_METHODS } from '../core/cashflow/methods'

/** Expose every cashflow handler as the IPC channel `cashflow:<method>`. */
export function registerCashflowIpc(db: Database.Database): void {
  const handlers = createCashflowHandlers(db) as Record<string, (...args: unknown[]) => unknown>
  for (const name of CASHFLOW_METHODS) {
    ipcMain.handle(`cashflow:${name}`, (_event, ...args: unknown[]) => handlers[name]!(...args))
  }
}
