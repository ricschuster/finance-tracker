import type Database from 'better-sqlite3'
import { getBudgetMonth, setBudget } from './budgets'
import type { BudgetsMethod } from './methods'

export function createBudgetsHandlers(db: Database.Database) {
  return {
    getBudgetMonth: (year: number, month: number) => getBudgetMonth(db, year, month),
    setBudget: (categoryId: number, amount: number) => setBudget(db, categoryId, amount),
  } satisfies Record<BudgetsMethod, (...args: never[]) => unknown>
}

export type BudgetsHandlers = ReturnType<typeof createBudgetsHandlers>

/** The renderer-side view: every handler becomes async. */
export type BudgetsApi = {
  [K in keyof BudgetsHandlers]: (
    ...args: Parameters<BudgetsHandlers[K]>
  ) => Promise<ReturnType<BudgetsHandlers[K]>>
}
