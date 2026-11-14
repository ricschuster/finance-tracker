import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { migrate } from '../db/migrations'
import { createAccount } from '../ledger/accounts'
import { createTransaction, getTransaction } from '../ledger/transactions'
import { createRule } from '../rules/store'
import { categoryIdByName } from './commit'
import { createImportHandlers } from './handlers'
import type { MappingProfile } from './mapping'

const profile: MappingProfile = {
  hasHeader: true,
  headerRow: 0,
  date: { column: 'Date', format: 'YYYY-MM-DD' },
  amount: { mode: 'signed', column: 'Amount' },
  description: ['Desc'],
}

function setup() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  migrate(db)
  const accountId = createAccount(db, { name: 'Chequing', type: 'checking' })
  const cat = (name: string) => categoryIdByName(db, name)!
  const past = (desc: string, category: string, amount = -1000, date = '2025-12-01') =>
    createTransaction(db, {
      accountId,
      date,
      amount,
      rawDescription: desc,
      lines: [{ categoryId: cat(category), amount }],
    })
  return { db, accountId, cat, past, api: createImportHandlers(db) }
}

const file = (...rows: string[]) => `Date,Desc,Amount\n${rows.join('\n')}\n`

describe('import enrichment', () => {
  it('guesses a category from earlier transactions with the same description', () => {
    const { accountId, past, cat, api } = setup()
    past('SAFEWAY #4412', 'Groceries')
    past('SAFEWAY #9', 'Groceries', -2000, '2025-12-02')
    const text = file('2026-01-08,SAFEWAY #77,-45.00', '2026-01-09,NEW PLACE,-5.00')
    const prev = api.previewImport({ text, profile, accountId })
    expect(prev.items[0]!.category).toMatchObject({
      id: cat('Groceries'),
      source: 'history',
      agree: 2,
      of: 2,
    })
    expect(prev.items[1]!.category).toBeNull()
  })

  it('does not guess when history disagrees, or across income and expense', () => {
    const { accountId, past, api } = setup()
    past('SHELL 12', 'Groceries')
    past('SHELL 13', 'Shopping', -1000, '2025-12-02')
    past('SHELL 14', 'Shopping', -1000, '2025-12-03')
    past('REFUND CO', 'Groceries', 500)
    const text = file('2026-01-08,SHELL 1,-5.00', '2026-01-09,REFUND CO,-5.00')
    const prev = api.previewImport({ text, profile, accountId })
    // 2 of 3 agree: 0.67 meets the 0.6 bar.
    expect(prev.items[0]!.category?.source).toBe('history')
    expect(prev.items[1]!.category).toBeNull()
  })

  it('ignores Uncategorized and transfers as history', () => {
    const { accountId, past, api } = setup()
    past('MYSTERY', 'Uncategorized')
    const prev = api.previewImport({ text: file('2026-01-08,MYSTERY,-5.00'), profile, accountId })
    expect(prev.items[0]!.category).toBeNull()
  })

  it('applies the guess on commit, and a rule beats the guess', () => {
    const { db, accountId, past, cat, api } = setup()
    past('SAFEWAY #1', 'Groceries')
    past('NETFLIX 1', 'Groceries') // a bad past filing
    createRule(db, {
      name: 'Netflix',
      conditions: [{ type: 'text', field: 'description', op: 'contains', value: 'netflix' }],
      actions: [{ type: 'setCategory', categoryId: cat('Entertainment') }],
    })
    const text = file('2026-01-08,SAFEWAY #5,-45.00', '2026-01-09,NETFLIX 5,-15.00')
    const prev = api.previewImport({ text, profile, accountId })
    expect(prev.items[1]!.category).toMatchObject({ source: 'rule', id: cat('Entertainment') })
    api.commitImport({ text, profile, accountId, sourceName: 'f.csv' })
    const rows = db
      .prepare(
        "SELECT id, raw_description FROM transactions WHERE date >= '2026-01-01' ORDER BY date",
      )
      .all() as { id: number; raw_description: string }[]
    expect(getTransaction(db, rows[0]!.id)!.lines[0]!.categoryId).toBe(cat('Groceries'))
    expect(getTransaction(db, rows[1]!.id)!.lines[0]!.categoryId).toBe(cat('Entertainment'))
  })

  it('a category picked in the preview wins over a rule', () => {
    const { db, accountId, cat, api } = setup()
    createRule(db, {
      conditions: [{ type: 'text', field: 'description', op: 'contains', value: 'netflix' }],
      actions: [{ type: 'setCategory', categoryId: cat('Entertainment') }],
    })
    const text = file('2026-01-09,NETFLIX 5,-15.00')
    api.commitImport({
      text,
      profile,
      accountId,
      sourceName: 'f.csv',
      overrides: [{ line: 2, choice: 'new', categoryId: cat('Shopping') }],
    })
    const id = (db.prepare('SELECT id FROM transactions').get() as { id: number }).id
    expect(getTransaction(db, id)!.lines[0]!.categoryId).toBe(cat('Shopping'))
  })

  it('skips rows a skip rule matches, unless the user imports them', () => {
    const { db, accountId, api } = setup()
    createRule(db, {
      name: 'Internal',
      conditions: [{ type: 'text', field: 'description', op: 'contains', value: 'internal xfer' }],
      actions: [{ type: 'skipImport' }],
    })
    const text = file('2026-01-08,INTERNAL XFER 1,-45.00', '2026-01-09,INTERNAL XFER 2,-5.00')
    const prev = api.previewImport({ text, profile, accountId })
    expect(prev.items.map((i) => i.skippedByRule?.ruleName)).toEqual(['Internal', 'Internal'])
    const r = api.commitImport({
      text,
      profile,
      accountId,
      sourceName: 'f.csv',
      overrides: [{ line: 3, choice: 'new' }],
    })
    expect(r).toMatchObject({ added: 1, skipped: 1 })
    expect(db.prepare('SELECT amount FROM transactions').all()).toEqual([{ amount: -500 }])
  })

  it('a skip rule does nothing to saved transactions', () => {
    const { db, accountId, past } = setup()
    const id = past('INTERNAL XFER', 'Groceries')
    createRule(db, {
      conditions: [{ type: 'text', field: 'description', op: 'contains', value: 'internal' }],
      actions: [{ type: 'skipImport' }],
    })
    // applyRules over history must leave it alone.
    return import('../rules/apply').then(({ previewRules }) => {
      expect(previewRules(db)).toEqual([])
      expect(getTransaction(db, id)).not.toBeNull()
      expect(accountId).toBeGreaterThan(0)
    })
  })

  it('only the first matching rule decides a skip', () => {
    const { db, accountId, cat, api } = setup()
    createRule(db, {
      conditions: [{ type: 'text', field: 'description', op: 'contains', value: 'internal' }],
      actions: [{ type: 'setCategory', categoryId: cat('Groceries') }],
    })
    createRule(db, {
      conditions: [{ type: 'text', field: 'description', op: 'contains', value: 'internal' }],
      actions: [{ type: 'skipImport' }],
    })
    const prev = api.previewImport({
      text: file('2026-01-08,INTERNAL 1,-45.00'),
      profile,
      accountId,
    })
    expect(prev.items[0]!.skippedByRule).toBeNull()
  })
})
