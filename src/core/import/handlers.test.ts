import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { migrate } from '../db/migrations'
import { createAccount } from '../ledger/accounts'
import { createTransaction } from '../ledger/transactions'
import { createImportHandlers } from './handlers'
import { IMPORT_METHODS } from './methods'
import type { MappingProfile } from './mapping'

const profile: MappingProfile = {
  hasHeader: true,
  headerRow: 0,
  date: { column: 'Date', format: 'YYYY-MM-DD' },
  amount: { mode: 'signed', column: 'Amount' },
  description: ['Desc'],
}
const csv =
  'Date,Desc,Amount\n2026-01-08,SAFEWAY #4412,-45.00\n2026-01-09,PAYROLL,2000.00\nbad,X,1\n'

function setup() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  migrate(db)
  const accountId = createAccount(db, { name: 'Chequing', type: 'checking' })
  return { db, accountId, api: createImportHandlers(db) }
}

describe('import handlers', () => {
  it('implements exactly the advertised methods', () => {
    expect(Object.keys(setup().api).sort()).toEqual([...IMPORT_METHODS].sort())
  })

  it('inspects a file and previews with errors and match details', () => {
    const { db, accountId, api } = setup()
    createTransaction(db, { accountId, date: '2026-01-06', amount: -4500, payee: 'Safeway' })
    const info = api.inspectCsv(csv)
    expect(info).toMatchObject({
      delimiter: ',',
      totalRows: 4,
      headerRowGuess: 0,
      matchedProfile: null,
    })
    const prev = api.previewImport({ text: csv, profile, accountId })
    expect(prev.errors.map((e) => e.line)).toEqual([4])
    expect(prev.items.map((i) => [i.outcome, i.choice])).toEqual([
      ['possible', 'merge'],
      ['new', 'new'],
    ])
    expect(prev.items[0]!.match).toMatchObject({ payee: 'Safeway', accountName: 'Chequing' })
    expect(prev.summary).toMatchObject({ inflow: 200000, outflow: 0 })
  })

  it('commits with overrides, then a second commit adds nothing', () => {
    const { db, accountId, api } = setup()
    createTransaction(db, { accountId, date: '2026-01-06', amount: -4500 })
    const req = { text: csv, profile, accountId, sourceName: 'f.csv' }
    const r = api.commitImport({ ...req, overrides: [{ line: 2, choice: 'new' }] })
    expect(r).toMatchObject({ added: 2, merged: 0 })
    const again = api.commitImport(req)
    expect(again.added).toBe(0)
    expect(api.listImportBatches()).toHaveLength(2)
  })

  it('finds a saved profile by header fingerprint and rejects bad profiles', () => {
    const { accountId, api } = setup()
    const fp = api.inspectCsv(csv).fingerprint
    api.saveImportProfile({ name: 'Mine', config: profile, headerFingerprint: fp })
    expect(api.inspectCsv(csv).matchedProfile?.name).toBe('Mine')
    expect(() =>
      api.previewImport({ text: csv, profile: { nope: 1 } as never, accountId }),
    ).toThrow(/Invalid import profile/)
  })

  it('warns about inverted signs on a credit card', () => {
    const { db, api } = setup()
    const card = createAccount(db, { name: 'Card', type: 'credit_card' })
    const rows = Array.from({ length: 6 }, (_, i) => `2026-01-0${i + 1},SHOP ${i},10.00`).join('\n')
    const prev = api.previewImport({
      text: `Date,Desc,Amount\n${rows}\n`,
      profile,
      accountId: card,
    })
    expect(prev.warnings.join(' ')).toMatch(/inverted/)
  })

  it('imports OFX without a profile, keeps FITIDs, and warns on foreign currency', () => {
    const { accountId, api } = setup()
    const ofx = `<OFX><CURDEF>USD<ACCTID>1<STMTTRN><DTPOSTED>20260108<TRNAMT>-45.00<FITID>F1<NAME>SAFEWAY</STMTTRN></OFX>`
    expect(api.inspectOfx(ofx)).toMatchObject({ currency: 'USD', count: 1 })
    expect(api.inspectOfx('a,b\n1,2')).toBeNull()
    const prev = api.previewImport({ text: ofx, format: 'ofx', accountId })
    expect(prev.warnings.join(' ')).toMatch(/USD/)
    const req = { text: ofx, format: 'ofx' as const, accountId, sourceName: 'x.qfx' }
    expect(api.commitImport(req)).toMatchObject({ added: 1 })
    expect(api.commitImport(req)).toMatchObject({ added: 0 })
  })

  it('warns when the same file is previewed again after importing', () => {
    const { accountId, api } = setup()
    expect(api.previewImport({ text: csv, profile, accountId }).warnings).toEqual([])
    api.commitImport({ text: csv, profile, accountId, sourceName: 'jan.csv' })
    const again = api.previewImport({ text: csv.replace(/\n/g, '\r\n'), profile, accountId })
    expect(again.warnings[0]).toContain('already imported as "jan.csv"')
    expect(again.items.every((i) => i.outcome === 'duplicate')).toBe(true)
  })
  it('links a card payment to its other side by default, and respects a cleared box', () => {
    const { db, accountId, api } = setup()
    const card = createAccount(db, { name: 'Visa', type: 'credit_card' })
    // The card side already exists: a payment of +200.00 on the card.
    createTransaction(db, { accountId: card, date: '2026-02-03', amount: 20000, payee: 'Payment' })
    const text = 'Date,Desc,Amount\n2026-02-03,VISA PAYMENT,-200.00\n2026-02-03,SHELL,-200.00\n'
    const prev = api.previewImport({ text, profile, accountId })
    expect(prev.items.map((i) => i.suggestLink)).toEqual([true, false])

    const linked = () =>
      db
        .prepare('SELECT COUNT(*) AS n FROM transactions WHERE transfer_peer_id IS NOT NULL')
        .get() as {
        n: number
      }
    api.commitImport({ text, profile, accountId, sourceName: 'a.csv', overrides: [] })
    expect(linked().n).toBe(2)
  })

  it('suggests linking a bank-worded card payment such as MB-CREDIT CARD/LOC PAY.', () => {
    const { db, accountId, api } = setup()
    const card = createAccount(db, { name: 'Visa', type: 'credit_card' })
    createTransaction(db, { accountId: card, date: '2026-02-04', amount: 9000, payee: 'Thanks' })
    const text = 'Date,Desc,Amount\n2026-02-03,MB-CREDIT CARD/LOC PAY.,-90.00\n'
    expect(api.previewImport({ text, profile, accountId }).items[0]!.suggestLink).toBe(true)
  })

  it('does not link when the box is cleared', () => {
    const { db, accountId, api } = setup()
    const card = createAccount(db, { name: 'Visa', type: 'credit_card' })
    createTransaction(db, { accountId: card, date: '2026-02-03', amount: 20000, payee: 'Payment' })
    const text = 'Date,Desc,Amount\n2026-02-03,VISA PAYMENT,-200.00\n'
    api.commitImport({
      text,
      profile,
      accountId,
      sourceName: 'a.csv',
      overrides: [{ line: 2, choice: 'new', linkTransfer: false }],
    })
    const n = db
      .prepare('SELECT COUNT(*) AS n FROM transactions WHERE transfer_peer_id IS NOT NULL')
      .get() as { n: number }
    expect(n.n).toBe(0)
  })
})
