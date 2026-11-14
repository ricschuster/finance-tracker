import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import { migrate } from '../db/migrations'
import { createAccount } from '../ledger/accounts'
import { createTransaction, createTransfer, getTransaction } from '../ledger/transactions'
import { createRule } from '../rules/store'
import { applyRules } from '../rules/apply'
import { bulkUpdate, deleteMatching } from './bulk'
import { createSearchHandlers } from './handlers'
import { MAX_BULK, searchTransactionIds, searchTransactions } from './query'
import { deleteSavedSearch, listSavedSearches, saveSearch } from './saved'

let db: Database.Database
let chq: number
let card: number

const cat = (name: string) =>
  (db.prepare('SELECT id FROM categories WHERE name = ?').get(name) as { id: number }).id

beforeEach(() => {
  db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  migrate(db)
  chq = createAccount(db, { name: 'Chequing', type: 'checking' })
  card = createAccount(db, { name: 'Card', type: 'credit_card' })
})

const txn = (o: {
  desc?: string
  amount?: number
  date?: string
  accountId?: number
  payee?: string
  notes?: string
  tags?: string[]
  category?: string
  status?: 'pending' | 'cleared' | 'reconciled'
}) =>
  createTransaction(db, {
    accountId: o.accountId ?? chq,
    date: o.date ?? '2026-02-01',
    amount: o.amount ?? -1000,
    rawDescription: o.desc ?? '',
    ...(o.payee !== undefined && { payee: o.payee }),
    ...(o.notes !== undefined && { notes: o.notes }),
    ...(o.tags && { tags: o.tags }),
    ...(o.status && { status: o.status }),
    ...(o.category && {
      lines: [{ categoryId: cat(o.category), amount: o.amount ?? -1000 }],
    }),
  })

const ids = (q: Parameters<typeof searchTransactions>[1]) =>
  searchTransactions(db, q).transactions.map((t) => t.id)

describe('searchTransactions', () => {
  it('matches every word across payee, description, notes, tags and categories', () => {
    const a = txn({ desc: 'SAFEWAY #44', payee: 'Safeway', category: 'Groceries' })
    const b = txn({
      desc: 'SHELL 9',
      notes: 'road trip',
      tags: ['vacation'],
      category: 'Auto & Transport',
    })
    expect(ids({ text: 'safeway' })).toEqual([a])
    expect(ids({ text: 'SAFE way' })).toEqual([a])
    expect(ids({ text: 'safe way44' })).toEqual([])
    expect(ids({ text: 'road shell' })).toEqual([b])
    expect(ids({ text: 'vacat' })).toEqual([b])
    expect(ids({ text: 'groceries' })).toEqual([a])
    // parent category name matches children
    expect(ids({ text: 'auto transport' })).toEqual([b])
    expect(ids({ text: 'auto' })).toEqual([b])
  })

  it('treats % and _ literally', () => {
    const a = txn({ desc: '50% OFF SALE' })
    txn({ desc: '50 OFF SALE' })
    expect(ids({ text: '50%' })).toEqual([a])
    expect(ids({ text: 'a_b' })).toEqual([])
  })

  it('filters by account, category tree, tag, status, dates and amounts', () => {
    const a = txn({ date: '2026-01-10', amount: -500, category: 'Food & Dining', tags: ['x'] })
    const b = txn({ date: '2026-02-10', amount: 20000, accountId: card, category: 'Income' })
    const c = txn({ date: '2026-03-10', amount: -9000, status: 'pending' })
    expect(ids({ accountIds: [card] })).toEqual([b])
    expect(ids({ accountIds: [chq, card] })).toEqual([c, b, a])
    expect(ids({ categoryId: cat('Food & Dining') })).toEqual([a])
    expect(ids({ categoryId: cat('Food & Dining') })).toEqual([a])
    expect(ids({ tag: 'x' })).toEqual([a])
    expect(ids({ status: 'pending' })).toEqual([c])
    expect(ids({ from: '2026-02-01', to: '2026-02-28' })).toEqual([b])
    expect(ids({ direction: 'income' })).toEqual([b])
    expect(ids({ direction: 'expense', minAmount: 1000 })).toEqual([c])
    expect(ids({ maxAmount: 500 })).toEqual([a])
    expect(ids({ uncategorized: true })).toEqual([c])
  })

  it('combines filters with AND and reports total and sum across pages', () => {
    for (let i = 0; i < 5; i++) txn({ desc: 'COFFEE', amount: -300, date: `2026-02-0${i + 1}` })
    txn({ desc: 'OTHER', amount: -999 })
    const r = searchTransactions(db, { text: 'coffee', limit: 2, offset: 1 })
    expect(r.transactions).toHaveLength(2)
    expect(r.total).toBe(5)
    expect(r.sum).toBe(-1500)
    expect(r.transactions[0]!.date).toBe('2026-02-04')
  })

  it('returns an empty result with zero sum, and rejects bad ranges', () => {
    expect(searchTransactions(db, { text: 'nothing' })).toEqual({
      transactions: [],
      total: 0,
      sum: 0,
    })
    expect(() => searchTransactions(db, { minAmount: 5, maxAmount: 1 })).toThrow(/above/)
    expect(() => searchTransactions(db, { minAmount: 1.5 })).toThrow(/cents/)
    expect(() => searchTransactions(db, { from: '2026-02-02', to: '2026-02-01' })).toThrow(/after/)
  })

  it('returns all ids of a query and refuses an oversized one', () => {
    const a = txn({ desc: 'A' })
    const b = txn({ desc: 'A' })
    expect(searchTransactionIds(db, { text: 'a' })).toEqual([a, b])
    const ins = db.prepare(
      "INSERT INTO transactions (account_id, date, amount) VALUES (?, '2026-01-01', -1)",
    )
    db.transaction(() => {
      for (let i = 0; i < MAX_BULK; i++) ins.run(chq)
    })()
    expect(() => searchTransactionIds(db, {})).toThrow(/narrow/)
  })
})

describe('saved searches', () => {
  it('saves, replaces by name, drops paging, lists and deletes', () => {
    const id = saveSearch(db, ' Big ', { text: 'x', minAmount: 100, limit: 5, offset: 10 })
    expect(listSavedSearches(db)).toEqual([
      { id, name: 'Big', query: { text: 'x', minAmount: 100 } },
    ])
    expect(saveSearch(db, 'big', { tag: 't' })).toBe(id)
    expect(listSavedSearches(db)[0]!.query).toEqual({ tag: 't' })
    expect(() => saveSearch(db, '  ', {})).toThrow(/name/)
    deleteSavedSearch(db, id)
    expect(listSavedSearches(db)).toEqual([])
    expect(() => deleteSavedSearch(db, id)).toThrow(/not found/)
  })
})

describe('bulkUpdate', () => {
  it('hides and restores transactions from budgets without locking rule fields', () => {
    const a = txn({ desc: 'A' })
    expect(getTransaction(db, a)!.excludeFromBudgets).toBe(false)
    expect(bulkUpdate(db, [a], { type: 'setExcludeFromBudgets', exclude: true })).toEqual({
      changed: 1,
      skipped: 0,
    })
    const hidden = getTransaction(db, a)!
    expect(hidden.excludeFromBudgets).toBe(true)
    expect(hidden.editedFields).toEqual([])
    expect(bulkUpdate(db, [a], { type: 'setExcludeFromBudgets', exclude: true }).skipped).toBe(1)
    bulkUpdate(db, [a], { type: 'setExcludeFromBudgets', exclude: false })
    expect(getTransaction(db, a)!.excludeFromBudgets).toBe(false)
  })

  it('sets a category, skipping transfers and splits, and marks hand edits', () => {
    const a = txn({ desc: 'A' })
    const split = createTransaction(db, {
      accountId: chq,
      date: '2026-02-01',
      amount: -3000,
      lines: [
        { categoryId: cat('Groceries'), amount: -2000 },
        { categoryId: cat('Home'), amount: -1000 },
      ],
    })
    const { outId } = createTransfer(db, {
      fromAccountId: chq,
      toAccountId: card,
      date: '2026-02-02',
      amount: 500,
    })
    const r = bulkUpdate(db, [a, split, outId, 9999], {
      type: 'setCategory',
      categoryId: cat('Gifts & Donations'),
    })
    expect(r).toEqual({ changed: 1, skipped: 3 })
    const t = getTransaction(db, a)!
    expect(t.lines[0]!.categoryName).toBe('Gifts & Donations')
    expect(t.editedFields).toContain('categories')
    expect(getTransaction(db, split)!.lines).toHaveLength(2)
    expect(() => bulkUpdate(db, [a], { type: 'setCategory', categoryId: 99999 })).toThrow(
      /Category/,
    )
  })

  it('locks the edit against rules', () => {
    createRule(db, {
      conditions: [{ type: 'text', field: 'description', op: 'contains', value: 'a' }],
      actions: [{ type: 'setCategory', categoryId: cat('Groceries') }],
    })
    const a = txn({ desc: 'A' })
    bulkUpdate(db, [a], { type: 'setCategory', categoryId: cat('Gifts & Donations') })
    applyRules(db)
    expect(getTransaction(db, a)!.lines[0]!.categoryName).toBe('Gifts & Donations')
  })

  it('adds and removes tags case insensitively and sets status', () => {
    const a = txn({ tags: ['Trip'] })
    const b = txn({})
    expect(bulkUpdate(db, [a, b], { type: 'addTag', tag: ' trip ' })).toEqual({
      changed: 1,
      skipped: 1,
    })
    expect(getTransaction(db, b)!.tags).toEqual(['Trip'])
    expect(bulkUpdate(db, [a, b], { type: 'removeTag', tag: 'TRIP' })).toEqual({
      changed: 2,
      skipped: 0,
    })
    expect(getTransaction(db, a)!.tags).toEqual([])
    expect(bulkUpdate(db, [a, b], { type: 'setStatus', status: 'reconciled' }).changed).toBe(2)
    expect(bulkUpdate(db, [a], { type: 'setStatus', status: 'reconciled' }).changed).toBe(0)
    expect(() => bulkUpdate(db, [a], { type: 'addTag', tag: ' ' })).toThrow(/Tag/)
  })

  it('deletes, removing both sides of a transfer once', () => {
    const a = txn({})
    const { outId, inId } = createTransfer(db, {
      fromAccountId: chq,
      toAccountId: card,
      date: '2026-02-02',
      amount: 500,
    })
    expect(bulkUpdate(db, [a, outId, inId], { type: 'delete' })).toEqual({ changed: 2, skipped: 1 })
    expect(db.prepare('SELECT COUNT(*) n FROM transactions').get()).toEqual({ n: 0 })
  })

  it('rolls back everything when one step fails and rejects oversized lists', () => {
    const a = txn({})
    const b = txn({})
    db.exec(
      `CREATE TRIGGER boom BEFORE UPDATE ON transactions WHEN NEW.id = ${b}
       BEGIN SELECT RAISE(ABORT, 'boom'); END`,
    )
    expect(() => bulkUpdate(db, [a, b], { type: 'setStatus', status: 'reconciled' })).toThrow()
    expect(getTransaction(db, a)!.status).toBe('cleared')
    expect(() => bulkUpdate(db, Array(MAX_BULK + 1).fill(1), { type: 'delete' })).toThrow(/limited/)
  })
})

describe('deleteMatching', () => {
  it('deletes every match with no cap, including both sides of a transfer', () => {
    const n = MAX_BULK + 5
    db.transaction(() => {
      for (let i = 0; i < n; i++) txn({ desc: 'bulk row', amount: -100 })
    })()
    const keep = txn({ desc: 'other', accountId: card })
    createTransfer(db, { fromAccountId: chq, toAccountId: card, date: '2026-02-02', amount: 5000 })
    const r = deleteMatching(db, { accountIds: [chq] })
    expect(r.deleted).toBe(n + 2)
    expect(getTransaction(db, keep)).toBeTruthy()
    expect(searchTransactions(db, { accountIds: [chq] }).total).toBe(0)
    expect(searchTransactions(db, {}).total).toBe(1)
  })

  it('deletes everything with an empty query', () => {
    txn({})
    txn({ accountId: card })
    expect(deleteMatching(db, {}).deleted).toBe(2)
  })
})

describe('handlers', () => {
  it('round trips', () => {
    const h = createSearchHandlers(db)
    const a = txn({ desc: 'COFFEE' })
    expect(h.searchTransactions({ text: 'coffee' }).total).toBe(1)
    expect(h.searchTransactionIds({ text: 'coffee' })).toEqual([a])
    h.saveSearch('c', { text: 'coffee' })
    expect(h.listSavedSearches()).toHaveLength(1)
    expect(h.bulkUpdate([a], { type: 'delete' }).changed).toBe(1)
  })
})

describe('one category over a year', () => {
  it('lists every 2026 match and totals only that category, including split shares', () => {
    const shopping = cat('Shopping')
    txn({ date: '2026-01-15', amount: -10_000, category: 'Shopping' })
    txn({ date: '2026-12-31', amount: -2_500, category: 'Shopping' })
    txn({ date: '2025-12-31', amount: -9_999, category: 'Shopping' }) // last year
    txn({ date: '2027-01-01', amount: -9_999, category: 'Shopping' }) // next year
    txn({ date: '2026-06-01', amount: -7_777, category: 'Groceries' }) // other category
    createTransaction(db, {
      accountId: chq,
      date: '2026-06-10',
      amount: -5_000,
      lines: [
        { categoryId: shopping, amount: -1_500 },
        { categoryId: cat('Groceries'), amount: -3_500 },
      ],
    })
    const r = searchTransactions(db, { categoryId: shopping, from: '2026-01-01', to: '2026-12-31' })
    expect(r.total).toBe(3)
    expect(r.sum).toBe(-14_000) // the split counts -1,500, not -5,000
  })
})

describe('sorting', () => {
  it('orders a page by amount, payee or category in either direction', () => {
    const db = new Database(':memory:')
    migrate(db)
    const a = createAccount(db, { name: 'Chq', type: 'checking' })
    const mk = (date: string, amount: number, payee: string) =>
      createTransaction(db, { accountId: a, date, amount, payee, rawDescription: payee })
    mk('2026-01-01', -500, 'Beta')
    mk('2026-01-02', -100, 'alpha')
    mk('2026-01-03', 300, 'Gamma')
    const payees = (q: Parameters<typeof searchTransactions>[1]) =>
      searchTransactions(db, q).transactions.map((t) => t.payee)
    expect(payees({})).toEqual(['Gamma', 'alpha', 'Beta'])
    expect(payees({ sort: 'amount', dir: 'asc' })).toEqual(['Beta', 'alpha', 'Gamma'])
    expect(payees({ sort: 'amount', dir: 'desc' })).toEqual(['Gamma', 'alpha', 'Beta'])
    expect(payees({ sort: 'payee', dir: 'asc' })).toEqual(['alpha', 'Beta', 'Gamma'])
    expect(payees({ sort: 'category', dir: 'asc' })).toHaveLength(3)
    expect(() => searchTransactions(db, { sort: 'x; DROP' as never })).toThrow()
  })
})
