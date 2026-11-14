import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import { migrate } from '../db/migrations'
import { createAccount } from '../ledger/accounts'
import { createTransaction, createTransfer, updateTransaction } from '../ledger/transactions'
import { reviewQueue } from './review'

let db: Database.Database
let acct: number
const cat = (name: string) =>
  (db.prepare('SELECT id FROM categories WHERE name = ?').get(name) as { id: number }).id

beforeEach(() => {
  db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  migrate(db)
  acct = createAccount(db, { name: 'Chequing', type: 'checking' })
})

const add = (rawDescription: string, amount = -1000, date = '2026-11-01') =>
  createTransaction(db, { accountId: acct, date, amount, rawDescription })

describe('reviewQueue', () => {
  it('lists uncategorized rows with a guess from history', () => {
    const groceries = cat('Groceries')
    for (let i = 0; i < 3; i++) {
      const id = add(`SAFEWAY #${i}`, -2000, `2026-10-0${i + 1}`)
      updateTransaction(db, id, { lines: [{ categoryId: groceries, amount: -2000 }] })
    }
    add('SAFEWAY #77')
    add('MYSTERY SHOP')
    const q = reviewQueue(db)
    expect(q).toHaveLength(2)
    const safeway = q.find((r) => r.transaction.rawDescription === 'SAFEWAY #77')!
    expect(safeway.guess).toMatchObject({ categoryId: groceries, agree: 3, of: 3 })
    expect(q.find((r) => r.transaction.rawDescription === 'MYSTERY SHOP')!.guess).toBeNull()
  })

  it('leaves out categorized rows and transfers', () => {
    const done = add('PAID')
    updateTransaction(db, done, { lines: [{ categoryId: cat('Groceries'), amount: -1000 }] })
    const other = createAccount(db, { name: 'Savings', type: 'savings' })
    createTransfer(db, {
      fromAccountId: acct,
      toAccountId: other,
      date: '2026-11-02',
      amount: 5000,
    })
    add('TODO')
    expect(reviewQueue(db).map((r) => r.transaction.rawDescription)).toEqual(['TODO'])
  })
})
