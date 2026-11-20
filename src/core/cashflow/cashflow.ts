import type Database from 'better-sqlite3'
import { monthPeriod } from '../reports/period'

export interface CashflowCategory {
  categoryId: number
  categoryName: string
  /** Signed net cents for the month: negative is spending, positive is income or net refunds. */
  amount: number
}

export interface CashflowMonth {
  year: number
  month: number
  /** Positive cents in: the sum of the categories with a positive net. */
  income: number
  /** Positive cents out: the sum of the categories with a negative net. */
  spending: number
  /** Income minus spending. */
  net: number
  /** Every category with activity in the month, biggest spending first, income last. */
  categories: CashflowCategory[]
}

/**
 * Money in and out of each category for one month. Excluded, matching the reports: transfers
 * and transactions hidden from reports. Split transactions count per line. Negative nets (spending)
 * are kept, so nothing is dropped from the list. See docs/design/12_budgets.md.
 */
export function getCashflowMonth(
  db: Database.Database,
  year: number,
  month: number,
): CashflowMonth {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error('Invalid month')
  }
  const p = monthPeriod(year, month)
  const categories = db
    .prepare(
      `SELECT c.id AS categoryId, c.name AS categoryName, SUM(l.amount) AS amount
       FROM transaction_lines l
       JOIN transactions t ON t.id = l.transaction_id
       JOIN categories c ON c.id = l.category_id
       WHERE t.transfer_peer_id IS NULL AND t.exclude_from_budgets = 0
         AND NOT (c.is_system = 1 AND c.name = 'Transfer')
         AND t.date BETWEEN ? AND ?
       GROUP BY c.id
       ORDER BY amount ASC, c.name COLLATE NOCASE`,
    )
    .all(p.from, p.to) as CashflowCategory[]
  const income = categories.reduce((n, c) => (c.amount > 0 ? n + c.amount : n), 0)
  const spending = categories.reduce((n, c) => (c.amount < 0 ? n - c.amount : n), 0)
  return { year, month, income, spending, net: income - spending, categories }
}
