import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import { migrate } from '../db/migrations'
import { createAccount } from '../ledger/accounts'
import { mergeCategory } from '../ledger/categories'
import { createTransaction, createTransfer, updateTransaction } from '../ledger/transactions'
import { getBudgetMonth, setBudget } from './budgets'

let db: Database.Database
let acct: number
let card: number
const cat = (name: string) =>
  (db.prepare('SELECT id FROM categories WHERE name = ?').get(name) as { id: number }).id

function spend(date: string, amount: number, category: string) {
  return createTransaction(db, {
    accountId: acct,
    date,
    amount,
    lines: [{ categoryId: cat(category), amount }],
  })
}

beforeEach(() => {
  db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  migrate(db)
  acct = createAccount(db, { name: 'Chequing', type: 'checking' })
  card = createAccount(db, { name: 'Visa', type: 'credit_card' })
})

describe('budgets', () => {
  it('compares spending with the budget for the month only', () => {
    setBudget(db, cat('Groceries'), 40000)
    spend('2026-03-02', -15000, 'Groceries')
    spend('2026-03-20', -5000, 'Groceries')
    spend('2026-04-01', -9999, 'Groceries')
    const m = getBudgetMonth(db, 2026, 3)
    expect(m.rows).toEqual([
      expect.objectContaining({
        categoryName: 'Groceries',
        budget: 40000,
        spent: 20000,
        remaining: 20000,
      }),
    ])
    expect(m.totalBudget).toBe(40000)
    expect(m.totalSpent).toBe(20000)
  })

  it('lets refunds reduce spending and shows over budget as negative remaining', () => {
    setBudget(db, cat('Groceries'), 10000)
    spend('2026-03-02', -15000, 'Groceries')
    expect(getBudgetMonth(db, 2026, 3).rows[0]!.remaining).toBe(-5000)
    spend('2026-03-03', 3000, 'Groceries')
    expect(getBudgetMonth(db, 2026, 3).rows[0]!.spent).toBe(12000)
  })

  it('skips transfers and hidden transactions', () => {
    setBudget(db, cat('Groceries'), 10000)
    const hidden = spend('2026-03-02', -4000, 'Groceries')
    spend('2026-03-03', -1000, 'Groceries')
    createTransfer(db, { fromAccountId: acct, toAccountId: card, date: '2026-03-04', amount: 9000 })
    updateTransaction(db, hidden, { excludeFromBudgets: true })
    expect(getBudgetMonth(db, 2026, 3).rows[0]!.spent).toBe(1000)
  })

  it('lists categories without a budget, removes a budget at zero, and validates input', () => {
    spend('2026-03-02', -4000, 'Groceries')
    expect(
      getBudgetMonth(db, 2026, 3).unbudgeted.find((u) => u.categoryName === 'Groceries'),
    ).toMatchObject({
      spent: 4000,
    })
    setBudget(db, cat('Groceries'), 5000)
    setBudget(db, cat('Groceries'), 0)
    expect(getBudgetMonth(db, 2026, 3).rows).toEqual([])
    expect(() => setBudget(db, cat('Groceries'), 1.5)).toThrow()
    expect(() => setBudget(db, cat('Income'), 100)).toThrow(/expense/)
    expect(() => setBudget(db, 99999, 100)).toThrow(/not found/)
    expect(() => getBudgetMonth(db, 2026, 13)).toThrow()
  })

  it('adds budgets when categories merge', () => {
    const extra = db.prepare("INSERT INTO categories (name, kind) VALUES ('Eats', 'expense')").run()
      .lastInsertRowid as number
    setBudget(db, extra, 3000)
    setBudget(db, cat('Groceries'), 5000)
    mergeCategory(db, extra, cat('Groceries'))
    expect(getBudgetMonth(db, 2026, 3).rows[0]).toMatchObject({ budget: 8000 })
  })
})
