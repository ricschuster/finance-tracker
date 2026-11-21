import type Database from 'better-sqlite3'
import { monthsBetween, type Period } from './period'

export interface ReportFilter {
  accountIds?: number[]
}

export interface CategoryChild {
  categoryId: number
  name: string
  total: number
  count: number
}

export interface CategorySpend {
  categoryId: number
  name: string
  /** Positive cents, net of refunds. */
  total: number
  /** Fraction of all spending, 0 to 1. */
  share: number
  count: number
  children: CategoryChild[]
}

export interface IncomeVsExpenses {
  income: number
  spending: number
  net: number
  /** Net divided by income; null when there was no income. */
  savingsRate: number | null
}

export interface TrendPoint {
  /** `YYYY-MM`. */
  month: string
  income: number
  spending: number
  net: number
}

export interface PayeeTotal {
  payee: string
  total: number
  count: number
}

export interface BigTransaction {
  id: number
  date: string
  payee: string
  accountId: number
  /** Positive cents. */
  amount: number
  /** Shown in reports, skipped by budgets. */
  excludeFromBudgets: boolean
}

/**
 * Split lines that count toward reports: transfers are out (a transfer-linked transaction, or the
 * system Transfer category). Categories have no kind: spending and income are decided by sign.
 * Each report nets amounts first (so a refund reduces its category) and then classifies the net:
 * negative is spending, positive is income. Uncategorized is the exception: it is a catch-all of
 * unrelated money, so each of its lines is classified by its own sign. Transactions hidden from
 * budgets are left out of every total and graph (they only appear in the biggest-transactions list). See docs/design/07_reports.md and ADR 0007.
 */
function base(
  period: Period,
  f: ReportFilter,
  includeHidden = false,
): { from: string; params: unknown[] } {
  const params: unknown[] = [period.from, period.to]
  let accounts = ''
  if (f.accountIds?.length) {
    accounts = `AND t.account_id IN (${f.accountIds.map(() => '?').join(',')})`
    params.push(...f.accountIds)
  }
  const from = `
    (SELECT l.amount AS amount, l.transaction_id AS tid, c.id AS cid, c.name AS cname,
            c.parent_id AS pid, t.date AS date, t.account_id AS account_id,
            t.exclude_from_budgets AS hidden,
            CASE WHEN t.payee <> '' THEN t.payee ELSE t.raw_description END AS payee,
            CASE WHEN c.is_system = 1 AND c.name = 'Uncategorized'
                 THEN c.id || CASE WHEN l.amount < 0 THEN 'd' ELSE 'c' END
                 ELSE CAST(c.id AS TEXT) END AS grp
     FROM transaction_lines l
     JOIN transactions t ON t.id = l.transaction_id
     JOIN categories c ON c.id = l.category_id
     WHERE t.transfer_peer_id IS NULL AND NOT (c.is_system = 1 AND c.name = 'Transfer')
       ${includeHidden ? '' : 'AND t.exclude_from_budgets = 0 AND c.hide_from_trends = 0'}
       AND t.date BETWEEN ? AND ? ${accounts}) AS x`
  return { from, params }
}

export function incomeVsExpenses(
  db: Database.Database,
  period: Period,
  f: ReportFilter = {},
): IncomeVsExpenses {
  const { from, params } = base(period, f)
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(CASE WHEN net > 0 THEN net END), 0) AS income,
              COALESCE(-SUM(CASE WHEN net < 0 THEN net END), 0) AS spending
       FROM (SELECT SUM(amount) AS net FROM ${from} GROUP BY grp)`,
    )
    .get(...params) as { income: number; spending: number }
  const net = row.income - row.spending
  return { ...row, net, savingsRate: row.income > 0 ? net / row.income : null }
}

export function spendingByCategory(
  db: Database.Database,
  period: Period,
  f: ReportFilter = {},
): CategorySpend[] {
  const { from, params } = base(period, f)
  const rows = db
    .prepare(
      `SELECT cid, cname, pid, COALESCE(p.name, cname) AS top_name, COALESCE(pid, cid) AS top_id,
              -SUM(amount) AS total, COUNT(DISTINCT tid) AS count
       FROM ${from} LEFT JOIN categories p ON p.id = x.pid
       GROUP BY cid, grp HAVING SUM(amount) < 0`,
    )
    .all(...params) as {
    cid: number
    cname: string
    pid: number | null
    top_name: string
    top_id: number
    total: number
    count: number
  }[]
  const tops = new Map<number, CategorySpend>()
  for (const r of rows) {
    let top = tops.get(r.top_id)
    if (!top) {
      top = { categoryId: r.top_id, name: r.top_name, total: 0, share: 0, count: 0, children: [] }
      tops.set(r.top_id, top)
    }
    top.total += r.total
    top.count += r.count
    if (r.pid !== null) {
      top.children.push({ categoryId: r.cid, name: r.cname, total: r.total, count: r.count })
    }
  }
  const all = [...tops.values()]
  const sum = all.reduce((s, c) => s + c.total, 0)
  for (const c of all) {
    c.share = sum > 0 ? c.total / sum : 0
    c.children.sort((a, b) => b.total - a.total)
  }
  return all.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
}

export function monthlyTrend(
  db: Database.Database,
  period: Period,
  f: ReportFilter = {},
): TrendPoint[] {
  const { from, params } = base(period, f)
  const rows = db
    .prepare(
      `SELECT month,
              COALESCE(SUM(CASE WHEN net > 0 THEN net END), 0) AS income,
              COALESCE(-SUM(CASE WHEN net < 0 THEN net END), 0) AS spending
       FROM (SELECT substr(date, 1, 7) AS month, SUM(amount) AS net
             FROM ${from} GROUP BY month, grp)
       GROUP BY month`,
    )
    .all(...params) as { month: string; income: number; spending: number }[]
  const byMonth = new Map(rows.map((r) => [r.month, r]))
  return monthsBetween(period.from, period.to).map((month) => {
    const r = byMonth.get(month) ?? { income: 0, spending: 0 }
    return { month, income: r.income, spending: r.spending, net: r.income - r.spending }
  })
}

export function topPayees(
  db: Database.Database,
  period: Period,
  limit = 10,
  f: ReportFilter = {},
): PayeeTotal[] {
  const { from, params } = base(period, f)
  return db
    .prepare(
      `SELECT payee, -SUM(amount) AS total, COUNT(DISTINCT tid) AS count
       FROM ${from} WHERE payee <> ''
       GROUP BY payee COLLATE NOCASE HAVING total > 0
       ORDER BY total DESC, payee LIMIT ?`,
    )
    .all(...params, limit) as PayeeTotal[]
}

export function biggestTransactions(
  db: Database.Database,
  period: Period,
  limit = 10,
  f: ReportFilter = {},
): BigTransaction[] {
  // A list, not a total: hidden transactions stay visible here, flagged by excludeFromBudgets.
  const { from, params } = base(period, f, true)
  return db
    .prepare(
      `SELECT tid AS id, date, payee, account_id AS accountId, hidden AS excludeFromBudgets,
              -SUM(amount) AS total
       FROM ${from}
       GROUP BY tid HAVING total > 0
       ORDER BY total DESC, date DESC, tid LIMIT ?`,
    )
    .all(...params, limit)
    .map((r) => {
      const { total, excludeFromBudgets, ...rest } = r as {
        id: number
        date: string
        payee: string
        accountId: number
        total: number
        excludeFromBudgets: number
      }
      return { ...rest, amount: total, excludeFromBudgets: excludeFromBudgets === 1 }
    })
}
