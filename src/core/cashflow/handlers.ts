import type Database from 'better-sqlite3'
import { getCashflowMonth } from './cashflow'
import type { CashflowMethod } from './methods'

export function createCashflowHandlers(db: Database.Database) {
  return {
    getCashflowMonth: (year: number, month: number) => getCashflowMonth(db, year, month),
  } satisfies Record<CashflowMethod, (...args: never[]) => unknown>
}

export type CashflowHandlers = ReturnType<typeof createCashflowHandlers>

/** The renderer-side view: every handler becomes async. */
export type CashflowApi = {
  [K in keyof CashflowHandlers]: (
    ...args: Parameters<CashflowHandlers[K]>
  ) => Promise<ReturnType<CashflowHandlers[K]>>
}
