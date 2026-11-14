import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { migrate } from '../db/migrations'
import { createAccount } from '../ledger/accounts'
import { createImportHandlers } from './handlers'
import { looksLikeWealthsimple, mapWealthsimple } from './wealthsimple'

const H =
  'transaction_date,transaction_time,account_number,account_type,transaction_type,transaction_sub_type,status,payee,payee_email,amount,currency,notes'
const csv = `${H}
2026-01-08,10:15:00,WS0001,Chequing,Spend,Purchase,settled,Safeway,,-45.00,CAD,weekly
2026-01-09,09:00:00,WS0001,Chequing,Deposit,Direct deposit,settled,,,2000.00,CAD,
2026-01-10,12:00:00,WS0002,Credit card,Spend,Purchase,pending,Hotel,,-100.00,USD,
2026-01-11,12:00:00,WS0002,Credit card,Spend,Purchase,settled,Shop,,-10.00,CAD,
bad,,WS0002,Credit card,Spend,Purchase,settled,X,,-1.00,CAD,
`

const rows = csv
  .trim()
  .split('\n')
  .map((l) => l.split(','))

describe('Wealthsimple', () => {
  it('recognises the header and maps rows', () => {
    expect(looksLikeWealthsimple(rows)).toBe(true)
    expect(looksLikeWealthsimple([['Date', 'Amount']])).toBe(false)
    const r = mapWealthsimple(rows)
    expect(r.candidates.map((c) => [c.date, c.amount, c.rawDescription, c.accountName])).toEqual([
      ['2026-01-08', -4500, 'Safeway', 'Chequing WS0001'],
      ['2026-01-09', 200000, 'Deposit Direct deposit', 'Chequing WS0001'],
      ['2026-01-11', -1000, 'Shop', 'Credit card WS0002'],
    ])
    expect(r.candidates[0]!.memo).toBe('weekly')
    expect(r.skippedForeign).toHaveLength(1)
    expect(r.errors).toHaveLength(1)
  })

  it('imports per account through the multi-account handlers', () => {
    const db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    migrate(db)
    const chq = createAccount(db, { name: 'WS chequing', type: 'checking' })
    const card = createAccount(db, { name: 'WS card', type: 'credit_card' })
    const api = createImportHandlers(db)
    expect(api.inspectMint(csv)).toEqual({
      source: 'Wealthsimple',
      accountNames: ['Chequing WS0001', 'Credit card WS0002'],
      count: 5,
    })
    const req = { text: csv, accountMap: { 'Chequing WS0001': chq, 'Credit card WS0002': card } }
    const prev = api.previewMint(req)
    expect(prev.source).toBe('Wealthsimple')
    expect(prev.accounts[0]!.preview.errors).toHaveLength(1)
    expect(prev.accounts[0]!.preview.skippedForeign).toHaveLength(1)
    const done = api.commitMint({ ...req, sourceName: 'ws.csv' })
    expect(done.map((d) => d.added)).toEqual([2, 1])
    expect(api.commitMint({ ...req, sourceName: 'ws.csv' }).every((d) => d.added === 0)).toBe(true)
  })
})
