import type Database from 'better-sqlite3'
import { ipcMain } from 'electron'
import { createLedgerHandlers } from '../core/ledger/handlers'
import { LEDGER_METHODS } from '../core/ledger/methods'

/** Expose every ledger handler as the IPC channel `ledger:<method>`. */
export function registerLedgerIpc(db: Database.Database): void {
  const handlers = createLedgerHandlers(db) as Record<string, (...args: unknown[]) => unknown>
  for (const name of LEDGER_METHODS) {
    ipcMain.handle(`ledger:${name}`, (_event, ...args: unknown[]) => handlers[name]!(...args))
  }
}
