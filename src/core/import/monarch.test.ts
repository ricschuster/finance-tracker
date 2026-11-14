import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { migrate } from '../db/migrations'
import { createAccount } from '../ledger/accounts'
import { getTransaction } from '../ledger/transactions'
import { createImportHandlers } from './handlers'
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
    expect(api.commitMint({ ...req, sourceName: 'monarch.csv' }).every((d) => d.added === 0)).toBe(
      true,
    )
  })
})
