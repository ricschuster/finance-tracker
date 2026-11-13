import type Database from 'better-sqlite3'
import { ipcMain } from 'electron'
import { createRulesHandlers } from '../core/rules/handlers'
import { RULES_METHODS } from '../core/rules/methods'

/** Expose every rules handler as the IPC channel `rules:<method>`. */
export function registerRulesIpc(db: Database.Database): void {
  const handlers = createRulesHandlers(db) as Record<string, (...args: unknown[]) => unknown>
  for (const name of RULES_METHODS) {
    ipcMain.handle(`rules:${name}`, (_event, ...args: unknown[]) => handlers[name]!(...args))
  }
}
