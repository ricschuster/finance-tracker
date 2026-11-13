import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { migrate } from '../db/migrations'
import { createLedgerHandlers } from '../ledger/handlers'
import { createReportsHandlers } from './handlers'
import { REPORTS_METHODS } from './methods'
import { DASHBOARD_WIDGETS } from './widgets'
import { monthPeriod, monthsBetween, previousPeriod, quarterPeriod, yearPeriod } from './period'

function setup() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  migrate(db)
  const ledger = createLedgerHandlers(db)
  const reports = createReportsHandlers(db)
  const cat = (name: string) =>
    (db.prepare('SELECT id FROM categories WHERE name = ?').get(name) as { id: number }).id
  const a = ledger.createAccount({ name: 'Chequing', type: 'checking' })
  const b = ledger.createAccount({ name: 'Visa', type: 'credit_card' })
  const add = (date: string, amount: number, category: string, payee = '', accountId = a): number =>
    ledger.createTransaction({
      accountId,
      date,
      amount,
      payee,
      lines: [{ categoryId: cat(category), amount }],
    })
  return { db, ledger, reports, cat, a, b, add }
}

const NOV = monthPeriod(2026, 11)

describe('periods', () => {
  it('builds months, quarters and years', () => {
    expect(monthPeriod(2028, 2)).toEqual({ from: '2028-02-01', to: '2028-02-29' })
    expect(quarterPeriod(2026, 4)).toEqual({ from: '2026-10-01', to: '2026-12-31' })
    expect(yearPeriod(2026)).toEqual({ from: '2026-01-01', to: '2026-12-31' })
  })

  it('finds the previous period of equal length', () => {
    expect(previousPeriod(NOV)).toEqual({ from: '2026-10-02', to: '2026-10-31' })
    expect(previousPeriod({ from: '2026-01-01', to: '2026-01-31' })).toEqual({
      from: '2025-12-01',
      to: '2025-12-31',
    })
  })

  it('lists months across a year boundary', () => {
    expect(monthsBetween('2026-11-15', '2027-02-01')).toEqual([
      '2026-11',
      '2026-12',
      '2027-01',
      '2027-02',
    ])
  })
})

describe('reports', () => {
  it('implements exactly the advertised methods', () => {
    expect(Object.keys(setup().reports).sort()).toEqual([...REPORTS_METHODS].sort())
  })

  it('totals income and spending and computes the savings rate', () => {
    const { reports, add } = setup()
    add('2026-11-01', 400_000, 'Paycheque')
    add('2026-11-02', -100_000, 'Rent')
    add('2026-11-03', -20_000, 'Groceries')
    add('2026-10-30', -99_999, 'Groceries')
    expect(reports.incomeVsExpenses(NOV)).toEqual({
      income: 400_000,
      spending: 120_000,
      net: 280_000,
      savingsRate: 0.7,
    })
  })

  it('has a null savings rate when there is no income', () => {
    const { reports, add } = setup()
    add('2026-11-03', -500, 'Groceries')
    expect(reports.incomeVsExpenses(NOV).savingsRate).toBeNull()
  })

  it('excludes transfers on both sides', () => {
    const { reports, ledger, a, b, add } = setup()
    add('2026-11-03', -500, 'Groceries')
    ledger.createTransfer({ fromAccountId: a, toAccountId: b, date: '2026-11-04', amount: 90_000 })
    expect(reports.incomeVsExpenses(NOV)).toMatchObject({ income: 0, spending: 500 })
  })

  it('nets refunds against spending and classifies Uncategorized by sign', () => {
    const { reports, add } = setup()
    add('2026-11-01', -10_000, 'Clothing')
    add('2026-11-02', 2_500, 'Clothing')
    add('2026-11-03', -300, 'Uncategorized')
    add('2026-11-04', 1_000, 'Uncategorized')
    expect(reports.incomeVsExpenses(NOV)).toMatchObject({ income: 1_000, spending: 7_800 })
  })

  it('groups spending by parent with children, shares and ordering', () => {
    const { reports, add } = setup()
    add('2026-11-01', -3_000, 'Restaurants')
    add('2026-11-02', -1_000, 'Coffee Shops')
    add('2026-11-03', -6_000, 'Groceries')
    const rows = reports.spendingByCategory(NOV)
    expect(rows.map((r) => [r.name, r.total, r.count])).toEqual([
      ['Groceries', 6_000, 1],
      ['Food & Dining', 4_000, 2],
    ])
    expect(rows[0]!.share).toBeCloseTo(0.6)
    expect(rows[0]!.children).toEqual([])
    expect(rows[1]!.children.map((c) => [c.name, c.total])).toEqual([
      ['Restaurants', 3_000],
      ['Coffee Shops', 1_000],
    ])
  })

  it('counts each split line in its own category', () => {
    const { reports, ledger, a, cat } = setup()
    ledger.createTransaction({
      accountId: a,
      date: '2026-11-05',
      amount: -10_000,
      lines: [
        { categoryId: cat('Groceries'), amount: -7_000 },
        { categoryId: cat('Pharmacy'), amount: -3_000 },
      ],
    })
    expect(reports.spendingByCategory(NOV).map((r) => [r.name, r.total])).toEqual([
      ['Groceries', 7_000],
      ['Health & Fitness', 3_000],
    ])
  })

  it('fills empty months in the trend', () => {
    const { reports, add } = setup()
    add('2026-09-10', -1_000, 'Groceries')
    add('2026-11-10', 5_000, 'Paycheque')
    expect(
      reports.monthlyTrend({ from: '2026-09-01', to: '2026-11-30' }).map((t) => [t.month, t.net]),
    ).toEqual([
      ['2026-09', -1_000],
      ['2026-10', 0],
      ['2026-11', 5_000],
    ])
  })

  it('ranks payees case-insensitively, falling back to the description', () => {
    const { reports, add, ledger, a, cat } = setup()
    add('2026-11-01', -1_000, 'Groceries', 'Loblaws')
    add('2026-11-02', -2_000, 'Groceries', 'LOBLAWS')
    add('2026-11-03', -500, 'Groceries', 'Corner Store')
    ledger.createTransaction({
      accountId: a,
      date: '2026-11-04',
      amount: -9_000,
      rawDescription: 'POS RAW',
      lines: [{ categoryId: cat('Groceries'), amount: -9_000 }],
    })
    const rows = reports.topPayees(NOV, 2)
    expect(rows.map((r) => [r.payee.toLowerCase(), r.total, r.count])).toEqual([
      ['pos raw', 9_000, 1],
      ['loblaws', 3_000, 2],
    ])
  })

  it('lists the biggest expenses by transaction and filters by account', () => {
    const { reports, add, a, b } = setup()
    add('2026-11-01', -1_000, 'Groceries', 'Small', a)
    add('2026-11-02', -8_000, 'Shopping', 'Big', b)
    add('2026-11-03', 50_000, 'Paycheque', 'Employer', a)
    expect(reports.biggestTransactions(NOV, 5).map((t) => [t.payee, t.amount])).toEqual([
      ['Big', 8_000],
      ['Small', 1_000],
    ])
    expect(reports.spendingByCategory(NOV, { accountIds: [a] }).map((r) => r.name)).toEqual([
      'Groceries',
    ])
  })

  it('builds the dashboard with month to date comparison', () => {
    const { reports, add } = setup()
    add('2026-10-05', -2_000, 'Groceries')
    add('2026-10-20', -9_000, 'Groceries')
    add('2026-11-04', -4_000, 'Groceries')
    add('2026-11-06', -700, 'Uncategorized')
    const d = reports.dashboard('2026-11-10')
    expect(d.period).toEqual(NOV)
    expect(d.summary.spending).toBe(4_700)
    expect(d.previousSpending).toBe(2_000)
    expect(d.trend).toHaveLength(6)
    expect(d.trend[0]!.month).toBe('2026-06')
    expect(d.uncategorizedCount).toBe(1)
    expect(d.topCategories[0]!.name).toBe('Groceries')
  })

  it('clamps the comparison day for short months', () => {
    const { reports, add } = setup()
    add('2026-02-28', -1_000, 'Groceries')
    expect(reports.dashboard('2026-03-31').previousSpending).toBe(1_000)
  })

  it('returns structured-clone-safe results', () => {
    const { reports } = setup()
    expect(() => structuredClone(reports.dashboard('2026-11-10'))).not.toThrow()
  })
})

describe('dashboard widgets', () => {
  it('shows everything by default and saves a chosen subset in display order', () => {
    const { reports } = setup()
    expect(reports.getDashboardWidgets()).toEqual(DASHBOARD_WIDGETS.map((w) => w.id))
    expect(reports.setDashboardWidgets(['trend', 'income'])).toEqual(['income', 'trend'])
    expect(reports.getDashboardWidgets()).toEqual(['income', 'trend'])
    expect(reports.setDashboardWidgets([])).toEqual([])
    expect(reports.getDashboardWidgets()).toEqual([])
  })

  it('rejects unknown widgets', () => {
    const { reports } = setup()
    expect(() => reports.setDashboardWidgets(['nope'])).toThrow(/Unknown/)
  })
})
