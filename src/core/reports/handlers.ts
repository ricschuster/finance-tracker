import type Database from 'better-sqlite3'
import { dashboard } from './dashboard'
import type { ReportsMethod } from './methods'
import type { Period } from './period'
import {
  biggestTransactions,
  incomeVsExpenses,
  monthlyTrend,
  spendingByCategory,
  topPayees,
  type ReportFilter,
} from './queries'
import { getDashboardWidgets, setDashboardWidgets } from './widgets'

/** The reports API as plain functions over a database, exposed over IPC unchanged. */
export function createReportsHandlers(db: Database.Database) {
  return {
    spendingByCategory: (p: Period, f?: ReportFilter) => spendingByCategory(db, p, f),
    incomeVsExpenses: (p: Period, f?: ReportFilter) => incomeVsExpenses(db, p, f),
    monthlyTrend: (p: Period, f?: ReportFilter) => monthlyTrend(db, p, f),
    topPayees: (p: Period, limit?: number, f?: ReportFilter) => topPayees(db, p, limit, f),
    biggestTransactions: (p: Period, limit?: number, f?: ReportFilter) =>
      biggestTransactions(db, p, limit, f),
    dashboard: (today: string, f?: ReportFilter) => dashboard(db, today, f),
    getDashboardWidgets: () => getDashboardWidgets(db),
    setDashboardWidgets: (ids: string[]) => setDashboardWidgets(db, ids),
  } satisfies Record<ReportsMethod, (...args: never[]) => unknown>
}

export type ReportsHandlers = ReturnType<typeof createReportsHandlers>

/** The renderer-side view: every handler becomes async. */
export type ReportsApi = {
  [K in keyof ReportsHandlers]: (
    ...args: Parameters<ReportsHandlers[K]>
  ) => Promise<ReturnType<ReportsHandlers[K]>>
}
