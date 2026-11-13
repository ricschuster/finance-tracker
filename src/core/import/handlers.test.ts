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
})
