import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import { migrate } from '../db/migrations'
import { createAccount } from '../ledger/accounts'
import { createTransaction, getTransaction, updateTransaction } from '../ledger/transactions'
import { commitImport, loadExistingForMatching, type ImportDecision } from './commit'
import { getBatchRows, listBatches, previewUndo, undoBatch } from './history'
import { mapRows, type Candidate, type MappingProfile } from './mapping'
import { planImport } from './match'
import { findProfileByFingerprint, listProfiles, saveProfile, validateProfile } from './profiles'

let db: Database.Database
let chq: number
let card: number

beforeEach(() => {
  db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  migrate(db)
  chq = createAccount(db, { name: 'Chequing', type: 'checking' })
  card = createAccount(db, { name: 'Card', type: 'credit_card' })
})

const cand = (o: Partial<Candidate>): Candidate => ({
  line: 2,
  date: '2026-01-06',
  amount: -4500,
  rawDescription: 'SAFEWAY #4412',
  payee: '',
  memo: '',
  externalId: null,
  status: 'cleared',
  ...o,
})
const add = (c: Candidate): ImportDecision => ({ candidate: c, action: 'add' })
const input = (decisions: ImportDecision[], accountId = chq) => ({
  accountId,
  sourceName: 'f.csv',
  format: 'csv' as const,
  decisions,
})

describe('commitImport', () => {
  it('adds rows with an Uncategorized line and records the batch', () => {
    const r = commitImport(db, input([add(cand({})), add(cand({ amount: 1000, line: 3 }))]))
    expect(r).toMatchObject({ added: 2, merged: 0, skipped: 0 })
    const rows = getBatchRows(db, r.batchId)
    expect(rows).toHaveLength(2)
    const t = getTransaction(db, rows[0]!.id)!
    expect(t.status).toBe('cleared')
    expect(t.lines.map((l) => l.categoryName)).toEqual(['Uncategorized'])
    expect(listBatches(db)[0]).toMatchObject({ rowsAdded: 2, accountName: 'Chequing' })
  })

  it('leaves nothing behind when a row fails part way', () => {
    expect(() =>
      commitImport(db, input([add(cand({})), add(cand({ date: 'bogus', line: 3 }))])),
    ).toThrow()
    expect(db.prepare('SELECT COUNT(*) n FROM transactions').get()).toEqual({ n: 0 })
    expect(db.prepare('SELECT COUNT(*) n FROM import_batches').get()).toEqual({ n: 0 })
  })

  it('re-importing the same file adds nothing', () => {
    const file = [cand({}), cand({ line: 3, amount: -100, rawDescription: 'X' })]
    const run = () =>
      commitImport(
        db,
        input(
          planImport(chq, file, loadExistingForMatching(db)).map((p) =>
            p.outcome === 'new' ? add(p.candidate) : { candidate: p.candidate, action: 'skip' },
          ),
        ),
      )
    expect(run().added).toBe(2)
    expect(run().added).toBe(0)
    expect(db.prepare('SELECT COUNT(*) n FROM transactions').get()).toEqual({ n: 2 })
  })

  it('merges into a manual entry without overwriting hand-edited status', () => {
    const id = createTransaction(db, {
      accountId: chq,
      date: '2026-01-06',
      amount: -4500,
      payee: 'Safeway',
      status: 'pending',
    })
    updateTransaction(db, id, { status: 'pending' })
    const r = commitImport(db, input([{ candidate: cand({}), action: 'merge', matchId: id }]))
    expect(r.merged).toBe(1)
    const t = getTransaction(db, id)!
    expect(t.rawDescription).toBe('SAFEWAY #4412')
    expect(t.payee).toBe('Safeway')
    expect(t.status).toBe('pending')
    undoBatch(db, r.batchId)
    expect(getTransaction(db, id)!.rawDescription).toBe('')
  })

  it('rejects merging into another account or twice', () => {
    const other = createTransaction(db, { accountId: card, date: '2026-01-06', amount: -4500 })
    expect(() =>
      commitImport(db, input([{ candidate: cand({}), action: 'merge', matchId: other }])),
    ).toThrow(/Cannot merge/)
    const mine = createTransaction(db, { accountId: chq, date: '2026-01-06', amount: -4500 })
    expect(() =>
      commitImport(
        db,
        input([
          { candidate: cand({}), action: 'merge', matchId: mine },
          { candidate: cand({}), action: 'merge', matchId: mine },
        ]),
      ),
    ).toThrow(/twice/)
  })

  it('keeps an external id unique per account without failing the import', () => {
    commitImport(db, input([add(cand({ externalId: 'F1' }))]))
    const again = commitImport(db, input([add(cand({ externalId: 'F1' }))]))
    expect(again.added).toBe(1)
    const ids = db.prepare('SELECT external_id FROM transactions WHERE account_id = ?').all(chq)
    expect(ids).toEqual([{ external_id: 'F1' }, { external_id: null }])
    expect(() => commitImport(db, input([add(cand({ externalId: 'F1' }))], card))).not.toThrow()
  })
})

describe('transfers', () => {
  it('links an imported row to an existing opposite row, and undo unlinks', () => {
    const payment = createTransaction(db, { accountId: card, date: '2026-01-07', amount: 20000 })
    const r = commitImport(
      db,
      input([{ ...add(cand({ amount: -20000 })), linkTransferId: payment }]),
    )
    const [row] = getBatchRows(db, r.batchId)
    const t = getTransaction(db, row!.id)!
    expect(t.transferPeerId).toBe(payment)
    expect(getTransaction(db, payment)!.lines[0]!.categoryName).toBe('Transfer')

    undoBatch(db, r.batchId)
    const after = getTransaction(db, payment)!
    expect(after.transferPeerId).toBeNull()
    expect(after.lines[0]!.categoryName).toBe('Uncategorized')
  })

  it('refuses a mismatched amount', () => {
    const p = createTransaction(db, { accountId: card, date: '2026-01-07', amount: 100 })
    expect(() =>
      commitImport(db, input([{ ...add(cand({ amount: -200 })), linkTransferId: p }])),
    ).toThrow(/opposite/)
  })
})

describe('undo', () => {
  it('restores the ledger exactly', () => {
    createTransaction(db, { accountId: chq, date: '2025-12-01', amount: -1 })
    const before = db.prepare('SELECT * FROM transactions ORDER BY id').all()
    const r = commitImport(db, input([add(cand({})), add(cand({ line: 3, amount: 5 }))]))
    expect(undoBatch(db, r.batchId)).toMatchObject({ deleted: 2, keptEdited: 0 })
    expect(db.prepare('SELECT * FROM transactions ORDER BY id').all()).toEqual(before)
    expect(listBatches(db)).toEqual([])
  })

  it('keeps hand-edited rows unless told to delete them', () => {
    const r = commitImport(db, input([add(cand({})), add(cand({ line: 3, amount: 5 }))]))
    const [first] = getBatchRows(db, r.batchId)
    updateTransaction(db, first!.id, { payee: 'Mine' })
    expect(previewUndo(db, r.batchId)).toEqual({ added: 2, edited: 1, merged: 0 })
    const res = undoBatch(db, r.batchId)
    expect(res).toMatchObject({ deleted: 1, keptEdited: 1 })
    expect(getTransaction(db, first!.id)!.payee).toBe('Mine')

    const r2 = commitImport(db, input([add(cand({ amount: 9, line: 4 }))]))
    updateTransaction(db, getBatchRows(db, r2.batchId)[0]!.id, { payee: 'x' })
    expect(undoBatch(db, r2.batchId, { deleteEdited: true }).deleted).toBe(1)
  })
})

describe('profiles', () => {
  const profile: MappingProfile = {
    hasHeader: true,
    headerRow: 0,
    date: { column: 'Date', format: 'YYYY-MM-DD' },
    amount: { mode: 'signed', column: 'Amount' },
    description: ['Desc'],
  }

  it('saves, finds by fingerprint, updates and lists', () => {
    const id = saveProfile(db, {
      name: 'Bank',
      config: profile,
      headerFingerprint: 'date|desc|amount',
    })
    expect(findProfileByFingerprint(db, 'date|desc|amount')?.id).toBe(id)
    expect(findProfileByFingerprint(db, 'nope')).toBeUndefined()
    saveProfile(db, { id, name: 'Bank 2', config: { ...profile, flipSign: true } })
    expect(listProfiles(db)[0]).toMatchObject({ name: 'Bank 2', config: { flipSign: true } })
    expect(() => saveProfile(db, { id: 999, name: 'x', config: profile })).toThrow(/not found/)
  })

  it('rejects invalid configs', () => {
    expect(() => validateProfile({})).toThrow(/Invalid import profile/)
    expect(() => validateProfile({ ...profile, date: { column: 'D', format: 'bad' } })).toThrow()
    expect(() => validateProfile({ ...profile, amount: { mode: 'x' } })).toThrow()
    expect(validateProfile(JSON.parse(JSON.stringify(profile)))).toEqual(profile)
  })
})

describe('end to end', () => {
  it('maps a CSV, plans against a manual entry, and commits the merge', () => {
    const manual = createTransaction(db, { accountId: chq, date: '2026-01-06', amount: -4500 })
    const rows = [
      ['Date', 'Desc', 'Amount'],
      ['2026-01-08', 'SAFEWAY #4412', '-45.00'],
      ['2026-01-09', 'PAYROLL', '2000.00'],
    ]
    const { candidates } = mapRows(rows, {
      hasHeader: true,
      headerRow: 0,
      date: { column: 'Date', format: 'YYYY-MM-DD' },
      amount: { mode: 'signed', column: 'Amount' },
      description: ['Desc'],
    })
    const plan = planImport(chq, candidates, loadExistingForMatching(db))
    expect(plan.map((p) => [p.outcome, p.choice])).toEqual([
      ['possible', 'merge'],
      ['new', 'new'],
    ])
    const r = commitImport(
      db,
      input(
        plan.map((p) =>
          p.outcome === 'possible' && p.choice === 'merge'
            ? { candidate: p.candidate, action: 'merge', matchId: p.matchId! }
            : add(p.candidate),
        ),
      ),
    )
    expect(r).toMatchObject({ added: 1, merged: 1 })
    expect(getTransaction(db, manual)!.rawDescription).toBe('SAFEWAY #4412')
  })
})
