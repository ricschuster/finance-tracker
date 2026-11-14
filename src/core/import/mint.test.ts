import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { migrate } from '../db/migrations'
import { createAccount } from '../ledger/accounts'
import { createCategory, mergeCategory } from '../ledger/categories'
import { categoryIdByName } from './commit'
import { createTransaction, getTransaction } from '../ledger/transactions'
import { createImportHandlers } from './handlers'
import { getBatchRows } from './history'
import { looksLikeMint, mapMint } from './mint'

const csv = `Date,Description,Original Description,Amount,Transaction Type,Category,Account Name,Labels,Notes
01/08/2026,Safeway,SAFEWAY #4412,45.00,debit,Groceries,Chequing,,weekly shop
01/09/2026,Payroll,PAYROLL ACME,2000.00,credit,Income,Chequing,,
01/10/2026,Shop,SHOP 1,10.00,debit,Mystery Category,Visa,,
bad,x,x,1,debit,,Visa,,
`

describe('Mint', () => {
  it('recognises and maps a Mint file', () => {
    const rows = [
      [
        'Date',
        'Description',
        'Original Description',
        'Amount',
        'Transaction Type',
        'Category',
        'Account Name',
      ],
      ['01/08/2026', 'Safeway', 'SAFEWAY #4412', '45.00', 'debit', 'Groceries', 'Chequing'],
    ]
    expect(looksLikeMint(rows)).toBe(true)
    expect(looksLikeMint([['Date', 'Amount']])).toBe(false)
    const r = mapMint(rows)
    expect(r.candidates[0]).toMatchObject({
      date: '2026-01-08',
      amount: -4500,
      payee: 'Safeway',
      rawDescription: 'SAFEWAY #4412',
      accountName: 'Chequing',
      categoryName: 'Groceries',
    })
    expect(() => mapMint([['a']])).toThrow(/Mint/)
  })

  it('previews per account, reports unknown categories, and commits atomically', () => {
    const db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    migrate(db)
    const chq = createAccount(db, { name: 'Chequing', type: 'checking' })
    const visa = createAccount(db, { name: 'Visa', type: 'credit_card' })
    const manual = createTransaction(db, { accountId: chq, date: '2026-01-06', amount: -4500 })
    const api = createImportHandlers(db)

    expect(api.inspectMint(csv)).toEqual({ accountNames: ['Chequing', 'Visa'], count: 4 })
    expect(api.inspectMint('a,b\n1,2')).toBeNull()
    expect(() => api.previewMint({ text: csv, accountMap: { Chequing: chq } })).toThrow(/Visa/)

    const req = { text: csv, accountMap: { Chequing: chq, Visa: visa } }
    const prev = api.previewMint(req)
    expect(prev.unknownCategories).toEqual(['Mystery Category'])
    expect(prev.accounts.map((a) => a.preview.items.map((i) => i.outcome))).toEqual([
      ['possible', 'new'],
      ['new'],
    ])

    const done = api.commitMint({ ...req, sourceName: 'mint.csv' })
    expect(done.map((d) => [d.mintName, d.added, d.merged])).toEqual([
      ['Chequing', 1, 1],
      ['Visa', 1, 0],
    ])
    expect(getTransaction(db, manual)!.rawDescription).toBe('SAFEWAY #4412')
    const [payroll] = getBatchRows(db, done[0]!.batchId)
    expect(getTransaction(db, payroll!.id)!.lines[0]!.categoryName).toBe('Income')
    const [shop] = getBatchRows(db, done[1]!.batchId)
    expect(getTransaction(db, shop!.id)!.lines[0]!.categoryName).toBe('Uncategorized')
    expect(api.commitMint({ ...req, sourceName: 'mint.csv' }).every((d) => d.added === 0)).toBe(
      true,
    )
  })
  it('maps an outside category name through an alias, and merge keeps the old name working', () => {
    const db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    migrate(db)
    const chq = createAccount(db, { name: 'Chequing', type: 'checking' })
    const visa = createAccount(db, { name: 'Visa', type: 'credit_card' })
    const api = createImportHandlers(db)
    const food = db.prepare("SELECT id FROM categories WHERE name = 'Groceries'").get() as {
      id: number
    }
    api.setCategoryAlias('mystery category', food.id)
    expect(() => api.setCategoryAlias('x', 99999)).toThrow(/not found/)
    const req = { text: csv, accountMap: { Chequing: chq, Visa: visa } }
    expect(api.previewMint(req).unknownCategories).toEqual([])
    const done = api.commitMint({ ...req, sourceName: 'mint.csv' })
    const [shop] = getBatchRows(db, done[1]!.batchId)
    expect(getTransaction(db, shop!.id)!.lines[0]!.categoryName).toBe('Groceries')

    // Merging a category leaves its name as an alias of the survivor.
    const dining = createCategory(db, { name: 'Dining Out', kind: 'expense' })
    mergeCategory(db, dining, food.id)
    expect(categoryIdByName(db, 'dining out')).toBe(food.id)
  })
})
