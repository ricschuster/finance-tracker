import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import { migrate } from '../db/migrations'
import {
  accountBalance,
  createAccount,
  categoryUsage,
  createCategory,
  deleteAccount,
  accountImpact,
  createTransaction,
  createTransfer,
  deleteCategory,
  mergeCategory,
  setCategoryStyle,
  isCategoryColor,
  isCategoryIcon,
  CATEGORY_COLORS,
  deleteTransaction,
  getCategoryByName,
  getTransaction,
  listAccounts,
  listCategories,
  listTransactions,
  renameCategory,
  updateAccount,
  updateTransaction,
} from './index'

let db: Database.Database
let chq: number
let visa: number
let groceries: number
let dining: number

beforeEach(() => {
  db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  migrate(db)
  chq = createAccount(db, { name: 'Chequing', type: 'checking', openingBalance: 100_000 })
  visa = createAccount(db, { name: 'Visa', type: 'credit_card' })
  groceries = getCategoryByName(db, 'Groceries')!.id
  dining = getCategoryByName(db, 'Food & Dining')!.id
})

describe('accounts', () => {
  it('creates, lists, archives and validates', () => {
    expect(() => createAccount(db, { name: '  ', type: 'cash' })).toThrow(/required/)
    expect(() => createAccount(db, { name: 'X', type: 'cash', openingBalance: 1.5 })).toThrow(
      /integer/,
    )
    expect(listAccounts(db).map((a) => a.name)).toEqual(['Chequing', 'Visa'])
    updateAccount(db, visa, { archived: true })
    expect(listAccounts(db).map((a) => a.name)).toEqual(['Chequing'])
    expect(listAccounts(db, { includeArchived: true })).toHaveLength(2)
  })

  it('computes balance from opening balance and transactions', () => {
    createTransaction(db, { accountId: chq, date: '2026-11-01', amount: -2_500 })
    createTransaction(db, { accountId: chq, date: '2026-11-02', amount: 50_000 })
    expect(accountBalance(db, chq)).toBe(100_000 - 2_500 + 50_000)
    expect(accountBalance(db, visa)).toBe(0)
  })
})

describe('account deletion', () => {
  it('deletes an empty account', () => {
    deleteAccount(db, visa)
    expect(listAccounts(db, { includeArchived: true }).map((a) => a.name)).toEqual(['Chequing'])
  })

  it('refuses an account with transactions unless told to delete them', () => {
    createTransaction(db, { accountId: visa, date: '2026-01-05', amount: -100 })
    expect(accountImpact(db, visa)).toEqual({ transactions: 1, transferPeers: 0 })
    expect(() => deleteAccount(db, visa)).toThrow(/transactions/)
    deleteAccount(db, visa, { deleteTransactions: true })
    expect(listAccounts(db).map((a) => a.name)).toEqual(['Chequing'])
  })

  it('removes the other half of a transfer too', () => {
    createTransfer(db, { fromAccountId: chq, toAccountId: visa, date: '2026-01-06', amount: 5_000 })
    expect(accountImpact(db, visa)).toEqual({ transactions: 1, transferPeers: 1 })
    deleteAccount(db, visa, { deleteTransactions: true })
    expect(accountBalance(db, chq)).toBe(100_000)
  })
})

describe('categories', () => {
  it('creates flat categories with unique names and takes no parent', () => {
    const id = createCategory(db, { name: 'Salary', kind: 'income' })
    expect(listCategories(db).find((c) => c.id === id)).toMatchObject({
      kind: 'income',
      parentId: null,
    })
    expect(() => createCategory(db, { name: 'salary' })).toThrow(/UNIQUE/)
  })

  it('counts transaction lines per category', () => {
    createTransaction(db, {
      accountId: chq,
      date: '2026-01-05',
      amount: -400,
      lines: [{ categoryId: groceries, amount: -400 }],
    })
    expect(categoryUsage(db)[groceries]).toBe(1)
    expect(categoryUsage(db)[dining]).toBeUndefined()
  })

  it('protects system categories', () => {
    const unc = getCategoryByName(db, 'Uncategorized')!.id
    expect(() => renameCategory(db, unc, 'Misc')).toThrow(/System/)
    expect(() => deleteCategory(db, unc)).toThrow(/System/)
  })

  it('reassigns lines to Uncategorized on delete', () => {
    const child = createCategory(db, { name: 'Coffee' })
    const id = createTransaction(db, {
      accountId: chq,
      date: '2026-11-03',
      amount: -400,
      lines: [{ categoryId: child, amount: -400 }],
    })
    deleteCategory(db, child)
    expect(getTransaction(db, id)!.lines[0]!.categoryName).toBe('Uncategorized')
    expect(getCategoryByName(db, 'Coffee')).toBeUndefined()
  })

  it('merges a category into another, moving lines, rules and saved searches', () => {
    const coffee = createCategory(db, { name: 'Coffee' })
    const id = createTransaction(db, {
      accountId: chq,
      date: '2026-11-03',
      amount: -400,
      lines: [{ categoryId: coffee, amount: -400 }],
    })
    db.prepare("INSERT INTO rules (position, conditions, actions) VALUES (1, '[]', ?)").run(
      JSON.stringify([{ type: 'setCategory', categoryId: coffee }]),
    )
    db.prepare("INSERT INTO saved_searches (name, query) VALUES ('c', ?)").run(
      JSON.stringify({ categoryId: coffee, text: 'x' }),
    )
    mergeCategory(db, coffee, dining)
    expect(getTransaction(db, id)!.lines[0]!.categoryName).toBe('Food & Dining')
    expect(getCategoryByName(db, 'Coffee')).toBeUndefined()
    const rule = db.prepare('SELECT actions FROM rules').get() as { actions: string }
    expect(JSON.parse(rule.actions)).toEqual([{ type: 'setCategory', categoryId: dining }])
    const saved = db.prepare('SELECT query FROM saved_searches').get() as { query: string }
    expect(JSON.parse(saved.query)).toEqual({ categoryId: dining, text: 'x' })
  })

  it('refuses to merge system, mismatched or identical categories', () => {
    const unc = getCategoryByName(db, 'Uncategorized')!.id
    const income = getCategoryByName(db, 'Income')!.id
    expect(() => mergeCategory(db, unc, dining)).toThrow(/System/)
    expect(() => mergeCategory(db, dining, income)).toThrow(/different kinds/)
    expect(() => mergeCategory(db, dining, dining)).toThrow(/itself/)
  })
})

describe('createTransaction', () => {
  it('gives an unsplit transaction one Uncategorized line', () => {
    const id = createTransaction(db, {
      accountId: chq,
      date: '2026-11-03',
      amount: -1_234,
      rawDescription: 'SAFEWAY #12',
    })
    const t = getTransaction(db, id)!
    expect(t.lines).toHaveLength(1)
    expect(t.lines[0]).toMatchObject({ categoryName: 'Uncategorized', amount: -1_234 })
    expect(t.rawDescription).toBe('SAFEWAY #12')
    expect(t.payee).toBe('')
    expect(t.status).toBe('cleared')
    expect(t.editedFields).toEqual([])
  })

  it('stores splits that sum to the amount and rejects those that do not', () => {
    const id = createTransaction(db, {
      accountId: chq,
      date: '2026-11-03',
      amount: -10_000,
      lines: [
        { categoryId: groceries, amount: -7_000 },
        { categoryId: dining, amount: -3_000, memo: 'lunch' },
      ],
    })
    expect(getTransaction(db, id)!.lines.map((l) => l.amount)).toEqual([-7_000, -3_000])
    expect(() =>
      createTransaction(db, {
        accountId: chq,
        date: '2026-11-03',
        amount: -10_000,
        lines: [{ categoryId: groceries, amount: -9_000 }],
      }),
    ).toThrow(/sum/)
    expect(() =>
      createTransaction(db, { accountId: chq, date: '2026-11-03', amount: -1, lines: [] }),
    ).toThrow(/at least one/)
  })

  it('rejects fractional amounts and impossible dates, leaving no partial rows', () => {
    expect(() =>
      createTransaction(db, { accountId: chq, date: '2026-11-03', amount: -1.5 }),
    ).toThrow(/integer/)
    expect(() => createTransaction(db, { accountId: chq, date: '2026-02-30', amount: -1 })).toThrow(
      /Invalid date/,
    )
    expect(() => createTransaction(db, { accountId: 999, date: '2026-11-03', amount: -1 })).toThrow(
      /FOREIGN KEY/,
    )
    expect(listTransactions(db)).toHaveLength(0)
  })

  it('dedupes tags case-insensitively', () => {
    const id = createTransaction(db, {
      accountId: chq,
      date: '2026-11-03',
      amount: -1,
      tags: ['Trip', 'trip', ' ', 'work'],
    })
    expect(getTransaction(db, id)!.tags).toEqual(['Trip', 'work'])
  })
})

describe('updateTransaction', () => {
  it('records hand-edited fields', () => {
    const id = createTransaction(db, { accountId: chq, date: '2026-11-03', amount: -500 })
    updateTransaction(db, id, { payee: 'Safeway', notes: 'weekly' })
    updateTransaction(db, id, { payee: 'Safeway Inc', tags: ['food'] })
    const t = getTransaction(db, id)!
    expect(t.payee).toBe('Safeway Inc')
    expect(t.editedFields.sort()).toEqual(['notes', 'payee', 'tags'])
  })

  it('rescales the line of an unsplit transaction when the amount changes', () => {
    const id = createTransaction(db, {
      accountId: chq,
      date: '2026-11-03',
      amount: -500,
      lines: [{ categoryId: groceries, amount: -500 }],
    })
    updateTransaction(db, id, { amount: -800 })
    expect(getTransaction(db, id)!.lines).toMatchObject([
      { categoryName: 'Groceries', amount: -800 },
    ])
  })

  it('requires new lines when changing the amount of a split transaction', () => {
    const id = createTransaction(db, {
      accountId: chq,
      date: '2026-11-03',
      amount: -1_000,
      lines: [
        { categoryId: groceries, amount: -600 },
        { categoryId: dining, amount: -400 },
      ],
    })
    expect(() => updateTransaction(db, id, { amount: -2_000 })).toThrow(/new lines/)
    updateTransaction(db, id, {
      amount: -2_000,
      lines: [
        { categoryId: groceries, amount: -1_200 },
        { categoryId: dining, amount: -800 },
      ],
    })
    expect(getTransaction(db, id)!.amount).toBe(-2_000)
    expect(getTransaction(db, id)!.editedFields).toEqual(
      expect.arrayContaining(['amount', 'categories']),
    )
  })

  it('rolls back everything when validation fails', () => {
    const id = createTransaction(db, { accountId: chq, date: '2026-11-03', amount: -500 })
    expect(() =>
      updateTransaction(db, id, { payee: 'Nope', lines: [{ categoryId: groceries, amount: -1 }] }),
    ).toThrow(/sum/)
    expect(getTransaction(db, id)!.payee).toBe('')
  })

  it('throws for an unknown id', () => {
    expect(() => updateTransaction(db, 999, { payee: 'x' })).toThrow(/not found/)
  })
})

describe('transfers', () => {
  it('creates two linked, opposite transactions that net to zero', () => {
    const { outId, inId } = createTransfer(db, {
      fromAccountId: chq,
      toAccountId: visa,
      date: '2026-11-05',
      amount: 30_000,
    })
    const out = getTransaction(db, outId)!
    const inn = getTransaction(db, inId)!
    expect(out).toMatchObject({ accountId: chq, amount: -30_000, transferPeerId: inId })
    expect(inn).toMatchObject({ accountId: visa, amount: 30_000, transferPeerId: outId })
    expect(out.lines[0]!.categoryName).toBe('Transfer')
    expect(accountBalance(db, chq) + accountBalance(db, visa)).toBe(100_000)
  })

  it('validates inputs', () => {
    expect(() =>
      createTransfer(db, { fromAccountId: chq, toAccountId: chq, date: '2026-11-05', amount: 1 }),
    ).toThrow(/different/)
    expect(() =>
      createTransfer(db, { fromAccountId: chq, toAccountId: visa, date: '2026-11-05', amount: -1 }),
    ).toThrow(/positive/)
  })

  it('keeps both sides in step on edit and delete', () => {
    const { outId, inId } = createTransfer(db, {
      fromAccountId: chq,
      toAccountId: visa,
      date: '2026-11-05',
      amount: 30_000,
    })
    updateTransaction(db, outId, { amount: -45_000, date: '2026-11-06' })
    expect(getTransaction(db, inId)).toMatchObject({ amount: 45_000, date: '2026-11-06' })
    expect(getTransaction(db, inId)!.lines[0]!.amount).toBe(45_000)
    expect(() =>
      updateTransaction(db, outId, { lines: [{ categoryId: groceries, amount: -45_000 }] }),
    ).toThrow(/Transfer/)
    deleteTransaction(db, inId)
    expect(getTransaction(db, outId)).toBeUndefined()
    expect(getTransaction(db, inId)).toBeUndefined()
  })
})

describe('listTransactions', () => {
  beforeEach(() => {
    const coffee = createCategory(db, { name: 'Coffee' })
    createTransaction(db, {
      accountId: chq,
      date: '2026-10-30',
      amount: -100,
      lines: [{ categoryId: groceries, amount: -100 }],
    })
    createTransaction(db, {
      accountId: chq,
      date: '2026-11-02',
      amount: -200,
      lines: [{ categoryId: coffee, amount: -200 }],
      tags: ['work'],
    })
    createTransaction(db, { accountId: visa, date: '2026-11-02', amount: -300, status: 'pending' })
    createTransaction(db, { accountId: chq, date: '2026-11-04', amount: -400 })
  })

  it('orders newest first with id tiebreak', () => {
    expect(listTransactions(db).map((t) => t.amount)).toEqual([-400, -300, -200, -100])
  })

  it('filters by account, status, date range and tag', () => {
    expect(listTransactions(db, { accountId: visa })).toHaveLength(1)
    expect(listTransactions(db, { status: 'pending' }).map((t) => t.amount)).toEqual([-300])
    expect(listTransactions(db, { from: '2026-11-01', to: '2026-11-02' })).toHaveLength(2)
    expect(listTransactions(db, { tag: 'work' }).map((t) => t.amount)).toEqual([-200])
  })

  it('filters by category', () => {
    const coffee = getCategoryByName(db, 'Coffee')!.id
    expect(listTransactions(db, { categoryId: coffee }).map((t) => t.amount)).toEqual([-200])
    expect(listTransactions(db, { categoryId: groceries }).map((t) => t.amount)).toEqual([-100])
  })

  it('pages', () => {
    expect(listTransactions(db, { limit: 2 }).map((t) => t.amount)).toEqual([-400, -300])
    expect(listTransactions(db, { limit: 2, offset: 2 }).map((t) => t.amount)).toEqual([-200, -100])
  })
})

describe('category style', () => {
  it('every starter category has a palette colour and a known icon', () => {
    for (const c of listCategories(db)) {
      expect(isCategoryColor(c.color ?? '')).toBe(true)
      expect(isCategoryIcon(c.icon ?? '')).toBe(true)
    }
  })

  it('sets and clears a style, rejecting values outside the fixed sets', () => {
    const id = createCategory(db, { name: 'Pets' })
    setCategoryStyle(db, id, { color: CATEGORY_COLORS[2], icon: 'pet' })
    expect(listCategories(db).find((c) => c.id === id)).toMatchObject({
      color: CATEGORY_COLORS[2],
      icon: 'pet',
    })
    setCategoryStyle(db, id, { color: null, icon: null })
    expect(listCategories(db).find((c) => c.id === id)).toMatchObject({ color: null, icon: null })
    expect(() => setCategoryStyle(db, id, { color: '#123456', icon: null })).toThrow(/colour/)
    expect(() => setCategoryStyle(db, id, { color: null, icon: 'rocket' })).toThrow(/icon/)
    expect(() => setCategoryStyle(db, 9999, { color: null, icon: null })).toThrow(/not found/)
  })
})
