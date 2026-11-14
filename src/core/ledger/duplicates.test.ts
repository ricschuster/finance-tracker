import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import { migrate } from '../db/migrations'
import {
  createAccount,
  createTransaction,
  createTransfer,
  deleteTransaction,
  dismissDuplicateGroup,
  findDuplicateGroups,
  textSimilarity,
} from './index'

let db: Database.Database
let acct: number
beforeEach(() => {
  db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  migrate(db)
  acct = createAccount(db, { name: 'Chequing', type: 'checking' })
})
const add = (date: string, amount: number, payee: string, accountId = acct) =>
  createTransaction(db, { accountId, date, amount, payee })

describe('findDuplicateGroups', () => {
  it('flags the same amount and text within the window', () => {
    const a = add('2026-03-01', -450, 'Corner Cafe')
    const b = add('2026-03-02', -450, 'CORNER CAFE #12')
    const groups = findDuplicateGroups(db)
    expect(groups).toHaveLength(1)
    expect(groups[0]!.transactions.map((t) => t.id)).toEqual([a, b])
    expect(groups[0]!.reason).toMatch(/within 1 day/)
  })

  it('window 0 flags only the same day, so identical coffees on different days are fine', () => {
    add('2026-03-01', -450, 'Corner Cafe')
    add('2026-03-02', -450, 'Corner Cafe')
    expect(findDuplicateGroups(db, { windowDays: 0 })).toHaveLength(0)
    add('2026-03-02', -450, 'Corner Cafe')
    expect(findDuplicateGroups(db, { windowDays: 0 })).toHaveLength(1)
  })

  it('does not flag a monthly subscription', () => {
    add('2026-01-05', -1599, 'Streamo')
    add('2026-02-05', -1599, 'Streamo')
    add('2026-03-05', -1599, 'Streamo')
    expect(findDuplicateGroups(db, { windowDays: 7 })).toHaveLength(0)
  })

  it('needs the same account, same amount and similar text', () => {
    const other = createAccount(db, { name: 'Savings', type: 'savings' })
    add('2026-03-01', -450, 'Corner Cafe')
    add('2026-03-01', -450, 'Corner Cafe', other)
    add('2026-03-01', -451, 'Corner Cafe')
    add('2026-03-01', -450, 'Gas Station')
    expect(findDuplicateGroups(db)).toHaveLength(0)
  })

  it('strict needs identical normalised text', () => {
    add('2026-03-01', -450, 'Corner Cafe')
    add('2026-03-01', -450, 'Corner Cafe Downtown')
    expect(findDuplicateGroups(db)).toHaveLength(1)
    expect(findDuplicateGroups(db, { strictness: 'strict' })).toHaveLength(0)
  })

  it('skips both legs of a transfer', () => {
    const other = createAccount(db, { name: 'Savings', type: 'savings' })
    createTransfer(db, {
      fromAccountId: acct,
      toAccountId: other,
      date: '2026-03-01',
      amount: 5000,
    })
    createTransfer(db, {
      fromAccountId: acct,
      toAccountId: other,
      date: '2026-03-01',
      amount: 5000,
    })
    expect(findDuplicateGroups(db)).toHaveLength(0)
  })

  it('compares split transactions by their total', () => {
    const cats = db.prepare('SELECT id FROM categories LIMIT 2').all() as Array<{ id: number }>
    createTransaction(db, {
      accountId: acct,
      date: '2026-03-01',
      amount: -1000,
      payee: 'Big Store',
      lines: [
        { categoryId: cats[0]!.id, amount: -600 },
        { categoryId: cats[1]!.id, amount: -400 },
      ],
    })
    add('2026-03-01', -1000, 'Big Store')
    const groups = findDuplicateGroups(db)
    expect(groups).toHaveLength(1)
    expect(groups[0]!.transactions.map((t) => t.split)).toEqual([true, false])
  })

  it('merges three rows into one group and ignores dismissed groups', () => {
    const ids = [
      add('2026-03-01', -450, 'Corner Cafe'),
      add('2026-03-01', -450, 'Corner Cafe'),
      add('2026-03-02', -450, 'Corner Cafe'),
    ]
    const groups = findDuplicateGroups(db)
    expect(groups).toHaveLength(1)
    expect(groups[0]!.transactions).toHaveLength(3)
    dismissDuplicateGroup(db, ids)
    expect(findDuplicateGroups(db)).toHaveLength(0)
    // A new look-alike still shows, paired with the old rows only where not dismissed.
    add('2026-03-02', -450, 'Corner Cafe')
    expect(findDuplicateGroups(db)[0]!.transactions).toHaveLength(4)
  })

  it('disappears once one row is deleted', () => {
    const a = add('2026-03-01', -450, 'Corner Cafe')
    add('2026-03-01', -450, 'Corner Cafe')
    deleteTransaction(db, a)
    expect(findDuplicateGroups(db)).toHaveLength(0)
  })

  it('scores identical same-day above looser matches', () => {
    add('2026-03-01', -100, 'Aaa Shop')
    add('2026-03-01', -100, 'Aaa Shop')
    add('2026-04-01', -200, 'Bbb Shop')
    add('2026-04-03', -200, 'Bbb Shop Online')
    const [first, second] = findDuplicateGroups(db)
    expect(first!.score).toBeGreaterThan(second!.score)
  })
})

describe('textSimilarity', () => {
  it('is 1 for equal, 0 for disjoint', () => {
    expect(textSimilarity('a b', 'a b')).toBe(1)
    expect(textSimilarity('a b', 'c d')).toBe(0)
  })
})
