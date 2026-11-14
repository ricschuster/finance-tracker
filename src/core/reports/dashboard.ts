import type Database from 'better-sqlite3'
import { lastDayOfMonth, monthPeriod, shiftMonth, type Period } from './period'
import {
  biggestTransactions,
  incomeVsExpenses,
  monthlyTrend,
  spendingByCategory,
  type BigTransaction,
  type CategorySpend,
  type IncomeVsExpenses,
  type ReportFilter,
  type TrendPoint,
} from './queries'

export interface Dashboard {
  period: Period
  summary: IncomeVsExpenses
  /** Spending for the same span of the previous month (day 1 to the same day). */
  previousSpending: number
  topCategories: CategorySpend[]
  /** The last six calendar months, ending with the current one. */
  trend: TrendPoint[]
  biggest: BigTransaction[]
  /** Transactions still in Uncategorized, all time, transfers excluded. */
  uncategorizedCount: number
  /** Every transaction in the database, so the app can tell a fresh start from an empty month. */
  transactionCount: number
}

/** `today` is an ISO date, passed in so the result is deterministic in tests. */
export function dashboard(db: Database.Database, today: string, f: ReportFilter = {}): Dashboard {
  const year = Number(today.slice(0, 4))
  const month = Number(today.slice(5, 7))
  const day = Number(today.slice(8, 10))
  const period = monthPeriod(year, month)
  const prev = shiftMonth(year, month, -1)
  const prevDay = Math.min(day, lastDayOfMonth(prev.year, prev.month))
  const prevPeriod = {
    from: monthPeriod(prev.year, prev.month).from,
    to: `${prev.year}-${String(prev.month).padStart(2, '0')}-${String(prevDay).padStart(2, '0')}`,
  }
  const first = shiftMonth(year, month, -5)
  const trendPeriod = { from: monthPeriod(first.year, first.month).from, to: period.to }
  const uncategorized = db
    .prepare(
      `SELECT COUNT(DISTINCT t.id) AS n
       FROM transactions t
       JOIN transaction_lines l ON l.transaction_id = t.id
       JOIN categories c ON c.id = l.category_id
       WHERE c.name = 'Uncategorized' AND c.parent_id IS NULL AND t.transfer_peer_id IS NULL`,
    )
    .get() as { n: number }
  return {
    period,
    summary: incomeVsExpenses(db, period, f),
    previousSpending: incomeVsExpenses(db, prevPeriod, f).spending,
    topCategories: spendingByCategory(db, period, f).slice(0, 5),
    trend: monthlyTrend(db, trendPeriod, f),
    biggest: biggestTransactions(db, period, 5, f),
    uncategorizedCount: uncategorized.n,
    transactionCount: (db.prepare('SELECT COUNT(*) AS n FROM transactions').get() as { n: number })
      .n,
  }
}
