import type Database from 'better-sqlite3'
import { monthPeriod } from '../reports/period'

export interface BudgetRow {
  categoryId: number
  categoryName: string
  /** Positive cents per month. */
  budget: number
  /** Positive cents spent in the month; negative when refunds exceed spending. */
  spent: number
  remaining: number
}

export interface BudgetMonth {
  year: number
  month: number
  rows: BudgetRow[]
  totalBudget: number
  totalSpent: number
  /** Categories with no budget yet, with what was spent in the month. */
  unbudgeted: Array<{ categoryId: number; categoryName: string; spent: number }>
}

/** Set the monthly budget for a category. Zero removes it. */
export function setBudget(db: Database.Database, categoryId: number, amount: number): void {
  if (!Number.isInteger(amount) || amount < 0)
    throw new Error('Budget must be whole cents, zero or more')
  const cat = db.prepare('SELECT name, is_system FROM categories WHERE id = ?').get(categoryId) as
    { name: string; is_system: number } | undefined
  if (!cat) throw new Error(`Category ${categoryId} not found`)
  if (cat.is_system && cat.name === 'Transfer')
    throw new Error('The Transfer category cannot have a budget')
  if (amount === 0) {
    db.prepare('DELETE FROM budgets WHERE category_id = ?').run(categoryId)
    return
  }
  db.prepare(
    `INSERT INTO budgets (category_id, amount) VALUES (?, ?)
     ON CONFLICT(category_id) DO UPDATE SET amount = excluded.amount`,
  ).run(categoryId, amount)
}

/** Budget against spending for one month. See docs/design/12_budgets.md for what counts. */
export function getBudgetMonth(db: Database.Database, year: number, month: number): BudgetMonth {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error('Invalid month')
  }
  const p = monthPeriod(year, month)
  const rows = db
    .prepare(
      `SELECT c.id AS categoryId, c.name AS categoryName, b.amount AS budget,
              COALESCE(-SUM(l.amount), 0) AS spent
       FROM categories c
       LEFT JOIN budgets b ON b.category_id = c.id
       LEFT JOIN (SELECT l.category_id, l.amount FROM transaction_lines l
                  JOIN transactions t ON t.id = l.transaction_id
                  WHERE t.transfer_peer_id IS NULL AND t.exclude_from_budgets = 0
                    AND t.date BETWEEN ? AND ?) l ON l.category_id = c.id
       WHERE NOT (c.is_system = 1 AND c.name = 'Transfer')
       GROUP BY c.id
       ORDER BY c.name COLLATE NOCASE`,
    )
    .all(p.from, p.to) as Array<{
    categoryId: number
    categoryName: string
    budget: number | null
    spent: number
  }>
  const budgeted = rows
    .filter((r) => r.budget !== null)
    .map((r) => ({ ...r, budget: r.budget as number, remaining: (r.budget as number) - r.spent }))
  return {
    year,
    month,
    rows: budgeted,
    totalBudget: budgeted.reduce((n, r) => n + r.budget, 0),
    totalSpent: budgeted.reduce((n, r) => n + r.spent, 0),
    unbudgeted: rows
      .filter((r) => r.budget === null)
      .map((r) => ({ categoryId: r.categoryId, categoryName: r.categoryName, spent: r.spent })),
  }
}
