import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { migrate } from '../db/migrations'
import { createAccount } from '../ledger/accounts'
import { getTransaction } from '../ledger/transactions'
import { createImportHandlers } from './handlers'
import { incomeVsExpenses } from '../reports/queries'
import { getBatchRows } from './history'
import { looksLikeMonarch, mapMonarch } from './monarch'

const H =
  'Date,Merchant,Category,Account,Original Statement,Notes,Amount,Tags,Owner,Reviewed,Reviewed At,Reviewed By,Pending,Id'
const csv = `${H}
2026-01-08,Safeway,Groceries,Chequing,SAFEWAY #4412,weekly,-45.00,"Food, Weekly",Me,TRUE,,,False,id-1
2026-01-09,Acme,Paychecks,Chequing,PAYROLL ACME,,2000.00,,Me,FALSE,,,False,id-2
2026-01-10,Shop,Mystery,Visa,SHOP 1,,-10.00,,Me,FALSE,,,True,id-3
bad,x,x,Visa,x,,-1.00,,Me,FALSE,,,False,id-4
`

describe('Monarch', () => {
  it('recognises and maps a Monarch export', () => {
    const rows = [
      H.split(','),
      [
        '2026-01-08',
        'Safeway',
        'Groceries',
        'Chequing',
        'SAFEWAY #4412',
        '',
        '-45.00',
        'Food, Weekly',
        '',
        '',
        '',
        '',
        'False',
        'id-1',
      ],
    ]
    expect(looksLikeMonarch(rows)).toBe(true)
    expect(looksLikeMonarch([['Date', 'Amount']])).toBe(false)
    expect(mapMonarch(rows).candidates[0]).toMatchObject({
      date: '2026-01-08',
      amount: -4500,
      payee: 'Safeway',
      rawDescription: 'SAFEWAY #4412',
      accountName: 'Chequing',
      categoryName: 'Groceries',
      externalId: 'id-1',
      status: 'cleared',
      tags: ['Food', 'Weekly'],
    })
  })

  it('imports per account with tags, pending status and re-import protection', () => {
    const db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    migrate(db)
    const chq = createAccount(db, { name: 'Chequing', type: 'checking' })
    const visa = createAccount(db, { name: 'Visa', type: 'credit_card' })
    const api = createImportHandlers(db)
    expect(api.inspectMint(csv)).toMatchObject({
      source: 'Monarch',
      accountNames: ['Chequing', 'Visa'],
    })
    const req = { text: csv, accountMap: { Chequing: chq, Visa: visa } }
    expect(api.previewMint(req).unknownCategories).toContain('Mystery')
    const done = api.commitMint({ ...req, sourceName: 'monarch.csv' })
    expect(done.map((d) => d.added)).toEqual([2, 1])
    const [first] = getBatchRows(db, done[0]!.batchId)
    const t = getTransaction(db, first!.id)!
    expect(t.tags.sort()).toEqual(['Food', 'Weekly'])
    expect(t.notes).toBe('weekly')
    expect(t.lines[0]!.categoryName).toBe('Groceries')
    const [card] = getBatchRows(db, done[1]!.batchId)
    expect(getTransaction(db, card!.id)!.status).toBe('pending')
    const cats = db
      .prepare("SELECT name FROM categories WHERE name IN ('Mystery','Paychecks')")
      .all()
    expect(cats).toHaveLength(2)
    expect(api.commitMint({ ...req, sourceName: 'monarch.csv' }).every((d) => d.added === 0)).toBe(
      true,
    )
  })

  it('creates categories without a kind and reports classify by net sign', () => {
    const db = new Database(':memory:')
    migrate(db)
    const acct = createAccount(db, { name: 'Chequing', type: 'checking' })
    const text = `${H}
2026-01-09,Acme,Salary Co,Chequing,PAYROLL,,2000.00,,Me,FALSE,,,False,s1
2026-02-09,Acme,Salary Co,Chequing,PAYROLL,,2000.00,,Me,FALSE,,,False,s2
2026-02-10,Acme,Salary Co,Chequing,CLAWBACK,,-50.00,,Me,FALSE,,,False,s3
2026-02-11,Shop,Gadgets,Chequing,SHOP,,-30.00,,Me,FALSE,,,False,s4
2026-02-12,Shop,Gadgets,Chequing,REFUND,,5.00,,Me,FALSE,,,False,s5
`
    createImportHandlers(db).commitMint({
      text,
      accountMap: { Chequing: acct },
      sourceName: 'm.csv',
    })
    const names = db
      .prepare("SELECT name FROM categories WHERE name IN ('Salary Co','Gadgets')")
      .all()
    expect(names).toHaveLength(2)
    const r = incomeVsExpenses(db, { from: '2026-01-01', to: '2026-12-31' })
    expect(r).toMatchObject({ income: 395_000, spending: 2_500 })
  })

  it('replaces unused categories on a setup import, keeping used ones', () => {
    const db = new Database(':memory:')
    migrate(db)
    const api = createImportHandlers(db)
    const cats = () =>
      (db.prepare('SELECT name FROM categories').all() as Array<{ name: string }>).map(
        (c) => c.name,
      )
    // Stock categories exist before any import; Groceries is named in the file, Auto & Transport is not.
    expect(cats()).toContain('Auto & Transport')
    const acc = Object.fromEntries(
      api
        .inspectMint(csv)!
        .accountNames.map((n) => [n, createAccount(db, { name: n, type: 'checking' })]),
    )
    const req = { text: csv, accountMap: acc, replaceCategories: true }
    const removed = api.previewMint(req).removedCategories
    expect(removed).toContain('Auto & Transport')
    expect(removed).not.toContain('Groceries')
    api.commitMint({ ...req, sourceName: 'm.csv' })
    const after = cats()
    expect(after).not.toContain('Auto & Transport')
    expect(after).toEqual(
      expect.arrayContaining(['Groceries', 'Paychecks', 'Mystery', 'Uncategorized']),
    )
  })
})

describe('Monarch xlsx', () => {
  it('converts a spreadsheet to CSV that the Monarch import recognises', async () => {
    const { readFileSync } = await import('node:fs')
    const { xlsxToCsv } = await import('./xlsx')
    const text = await xlsxToCsv(readFileSync('test-data/import/monarch.xlsx'))
    expect(text).toContain(
      '2026-01-08,Safeway,Groceries,Chequing,SAFEWAY #4412,weekly,-45,"Food, Weekly"',
    )
    expect(text).toContain('2026-01-09,Acme,Paychecks')
    const api = createImportHandlers(
      (() => {
        const db = new Database(':memory:')
        migrate(db)
        return db
      })(),
    )
    const found = api.inspectMint(text)
    expect(found?.source).toBe('Monarch')
    expect(found?.accountNames).toEqual(['Chequing'])
    expect(found?.count).toBe(2)
  })

  it('rejects a file that is not a spreadsheet', async () => {
    const { xlsxToCsv } = await import('./xlsx')
    await expect(xlsxToCsv(new TextEncoder().encode('not a zip'))).rejects.toThrow('Could not read')
  })
})
