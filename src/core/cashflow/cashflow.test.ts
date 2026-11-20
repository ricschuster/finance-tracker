import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import { migrate } from '../db/migrations'
import { createAccount } from '../ledger/accounts'
import { createCategory } from '../ledger/categories'
import { createTransaction, createTransfer } from '../ledger/transactions'
import { getCashflowMonth } from './cashflow'

let db: Database.Database
let acct: number
let card: number
const cat = (name: string) =>
  (db.prepare('SELECT id FROM categories WHERE name = ?').get(name) as { id: number }).id

function add(date: string, amount: number, category: string) {
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
  createCategory(db, { name: 'Paycheque' })
})

describe('cashflow', () => {
  it('lists spending as negative and income as positive for the month only', () => {
    add('2026-03-02', -15000, 'Groceries')
    add('2026-03-20', -5000, 'Groceries')
    add('2026-03-25', 300000, 'Paycheque')
    add('2026-04-01', -9999, 'Groceries')
    const m = getCashflowMonth(db, 2026, 3)
    expect(m.categories.map((c) => [c.categoryName, c.amount])).toEqual([
      ['Groceries', -20000],
      ['Paycheque', 300000],
    ])
    expect(m.spending).toBe(20000)
    expect(m.income).toBe(300000)
    expect(m.net).toBe(280000)
  })

  it('keeps net refunds in the list as positive amounts', () => {
    add('2026-03-02', -1000, 'Groceries')
    add('2026-03-03', 4000, 'Groceries')
    const m = getCashflowMonth(db, 2026, 3)
    expect(m.categories).toEqual([
      expect.objectContaining({ categoryName: 'Groceries', amount: 3000 }),
    ])
  })

  it('leaves out transfers and transactions hidden from reports', () => {
    createTransfer(db, { fromAccountId: acct, toAccountId: card, date: '2026-03-05', amount: 5000 })
    const hidden = add('2026-03-06', -7000, 'Groceries')
    db.prepare('UPDATE transactions SET exclude_from_budgets = 1 WHERE id = ?').run(hidden)
    expect(getCashflowMonth(db, 2026, 3).categories).toEqual([])
  })

  it('rejects an invalid month', () => {
    expect(() => getCashflowMonth(db, 2026, 13)).toThrow('Invalid month')
  })
})
