import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import { migrate } from '../db/migrations'
import { createAccount } from '../ledger/accounts'
import { commitImport, loadExistingForMatching, type ImportDecision } from './commit'
import { findBatchByHash, hashFileText } from './filehash'
import { undoBatch } from './history'
import type { Candidate } from './mapping'
import { planImport } from './match'

let db: Database.Database
let joint: number

beforeEach(() => {
  db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  migrate(db)
  joint = createAccount(db, { name: 'Joint', type: 'checking' })
})

let line = 2
const cand = (o: Partial<Candidate>): Candidate => ({
  line: line++,
  date: '2026-01-06',
  amount: -4500,
  rawDescription: 'SAFEWAY #4412',
  payee: '',
  memo: '',
  externalId: null,
  status: 'cleared',
  ...o,
})

/** Plan then commit with default choices, as the review screen does when the user accepts. */
function importFile(rows: Candidate[], name = 'f.csv') {
  const plan = planImport(joint, rows, loadExistingForMatching(db))
  const decisions: ImportDecision[] = plan.map((p) => {
    if (p.outcome === 'duplicate') return { candidate: p.candidate, action: 'skip' }
    if (p.outcome === 'possible' && p.choice === 'skip')
      return { candidate: p.candidate, action: 'skip' }
    if (p.outcome === 'possible' && p.choice === 'merge')
      return { candidate: p.candidate, action: 'merge', matchId: p.matchId! }
    return { candidate: p.candidate, action: 'add' }
  })
  const r = commitImport(db, { accountId: joint, sourceName: name, format: 'csv', decisions })
  return { plan, ...r }
}
const count = () => (db.prepare('SELECT COUNT(*) n FROM transactions').get() as { n: number }).n

const personA = () => [
  cand({ date: '2026-01-05', amount: -450, rawDescription: 'TIM HORTONS' }),
  cand({ date: '2026-01-05', amount: -450, rawDescription: 'TIM HORTONS' }),
  cand({ date: '2026-01-07', amount: -9000, rawDescription: 'HYDRO' }),
  cand({ date: '2026-01-10', amount: 250000, rawDescription: 'PAYROLL' }),
]

describe('joint account imported from two CSVs', () => {
  it('the same file twice adds nothing the second time', () => {
    importFile(personA())
    const second = importFile(personA(), 'copy.csv')
    expect(second.added).toBe(0)
    expect(count()).toBe(4)
  })

  it('a second person with an overlapping range adds only the new rows', () => {
    importFile(personA())
    const b = [
      ...personA().slice(1), // starts later, so one coffee is missing
      cand({ date: '2026-01-12', amount: -2000, rawDescription: 'SHELL' }),
    ]
    const r = importFile(b, 'partner.csv')
    expect(r.added).toBe(1)
    expect(count()).toBe(5)
  })

  it('row order and spacing differences do not matter', () => {
    importFile(personA())
    const reordered = personA()
      .reverse()
      .map((c) => ({ ...c, rawDescription: c.rawDescription.toLowerCase() + '  ' }))
    expect(importFile(reordered, 'b.csv').added).toBe(0)
  })

  it('two real identical purchases survive when both files hold both', () => {
    importFile(personA())
    importFile(personA(), 'b.csv')
    expect(count()).toBe(4) // both coffees kept once, not collapsed to one
  })

  it('a genuine third identical purchase in the later file is added', () => {
    importFile(personA())
    const b = [
      ...personA(),
      cand({ date: '2026-01-05', amount: -450, rawDescription: 'TIM HORTONS' }),
    ]
    expect(importFile(b, 'b.csv').added).toBe(1)
  })

  it('undoing the later import leaves the first import intact', () => {
    importFile(personA())
    const b = importFile(
      [...personA(), cand({ date: '2026-01-12', amount: -1, rawDescription: 'X' })],
      'b.csv',
    )
    undoBatch(db, b.batchId)
    expect(count()).toBe(4)
  })
})

describe('external ids', () => {
  const fit = (id: string, o: Partial<Candidate> = {}) => cand({ externalId: id, ...o })

  it('a reused id with a different amount imports instead of failing the whole file', () => {
    importFile([fit('A1')])
    const r = importFile([fit('A1', { amount: -999, date: '2026-02-01' })])
    expect(r.added).toBe(1)
    expect(count()).toBe(2)
  })

  it('the same id twice in one file imports both rows', () => {
    const r = importFile([
      fit('B1', { amount: -100, rawDescription: 'ONE' }),
      fit('B1', { amount: -200, rawDescription: 'TWO' }),
    ])
    expect(r.added).toBe(2)
  })
})

describe('file hash', () => {
  it('ignores line endings and a byte order mark', () => {
    expect(hashFileText('﻿a,b\r\n1,2\r\n')).toBe(hashFileText('a,b\n1,2\n'))
    expect(hashFileText('a,b\n1,2\n')).not.toBe(hashFileText('a,b\n1,3\n'))
  })

  it('finds a live batch, and not one that was undone', () => {
    const hash = hashFileText('x')
    const r = commitImport(db, {
      accountId: joint,
      sourceName: 'a.csv',
      format: 'csv',
      fileHash: hash,
      decisions: [{ candidate: cand({}), action: 'add' }],
    })
    expect(findBatchByHash(db, joint, hash)).toMatchObject({
      batchId: r.batchId,
      sourceName: 'a.csv',
    })
    expect(findBatchByHash(db, joint + 1, hash)).toBeNull()
    undoBatch(db, r.batchId)
    expect(findBatchByHash(db, joint, hash)).toBeNull()
  })
})
