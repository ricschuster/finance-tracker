import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import { migrate } from '../db/migrations'
import { createAccount } from '../ledger/accounts'
import { incomeVsExpenses, monthPeriod, spendingByCategory } from '../reports'
import { createImportHandlers } from './handlers'
import type { MappingProfile } from './mapping'

let db: Database.Database
let acct: number
let api: ReturnType<typeof createImportHandlers>

beforeEach(() => {
  db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  migrate(db)
  acct = createAccount(db, { name: 'Card', type: 'credit_card' })
  api = createImportHandlers(db)
})

const jan = monthPeriod(2026, 1)
const groceries = () => spendingByCategory(db, jan).find((c) => c.name === 'Groceries')

describe('refunds reduce spending, they are not income', () => {
  it('Mint: a credit in an expense category nets against that category', () => {
    const text = `Date,Description,Original Description,Amount,Transaction Type,Category,Account Name,Labels,Notes
01/08/2026,Safeway,SAFEWAY,100.00,debit,Groceries,Card,,
01/20/2026,Safeway,SAFEWAY REFUND,30.00,credit,Groceries,Card,,
`
    const req = { text, accountMap: { Card: acct } }
    api.commitMint({ ...req, sourceName: 'm.csv' })
    expect(groceries()!.total).toBe(7000)
    expect(incomeVsExpenses(db, jan)).toMatchObject({ income: 0, spending: 7000 })
  })

  it('CSV with separate debit and credit columns imports the credit as positive', () => {
    const profile: MappingProfile = {
      hasHeader: true,
      headerRow: 0,
      date: { column: 'Date', format: 'YYYY-MM-DD' },
      amount: { mode: 'debitCredit', debit: 'Withdrawals', credit: 'Deposits' },
      description: ['Desc'],
    }
    const text =
      'Date,Desc,Withdrawals,Deposits\n2026-01-08,STORE,50.00,\n2026-01-15,STORE REFUND,,20.00\n'
    const prev = api.previewImport({ text, profile, accountId: acct })
    expect(prev.items.map((i) => i.candidate.amount)).toEqual([-5000, 2000])
    expect(prev.summary).toMatchObject({ inflow: 2000, outflow: -5000 })
  })

  it('OFX: a CREDIT on a card is a positive amount', () => {
    const text = `OFXHEADER:100
DATA:OFXSGML
VERSION:102

<OFX><CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS><CURDEF>CAD<BANKTRANLIST>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260115<TRNAMT>20.00<FITID>R1<NAME>STORE REFUND</STMTTRN>
</BANKTRANLIST></CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1></OFX>`
    const prev = api.previewImport({ text, format: 'ofx', accountId: acct })
    expect(prev.items[0]!.candidate.amount).toBe(2000)
  })
})
