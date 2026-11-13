import { describe, expect, it } from 'vitest'
import type { Candidate } from './mapping'
import { planImport, summarisePlan, type ExistingTxn } from './match'

let nextId = 1
const ex = (o: Partial<ExistingTxn>): ExistingTxn => ({
  id: nextId++,
  accountId: 1,
  date: '2026-01-06',
  amount: -4500,
  rawDescription: 'Safeway',
  externalId: null,
  imported: false,
  transferPeerId: null,
  ...o,
})
const cand = (o: Partial<Candidate>): Candidate => ({
  line: 2,
  date: '2026-01-06',
  amount: -4500,
  rawDescription: 'Safeway',
  payee: '',
  memo: '',
  externalId: null,
  status: 'cleared',
  ...o,
})

describe('planImport', () => {
  it('re-importing identical rows adds nothing', () => {
    const existing = [ex({ rawDescription: 'SAFEWAY  #1' })]
    const plan = planImport(1, [cand({ rawDescription: 'safeway #1' })], existing)
    expect(plan[0]!.outcome).toBe('duplicate')
  })

  it('two identical rows against one existing add exactly one', () => {
    const plan = planImport(1, [cand({ line: 2 }), cand({ line: 3 })], [ex({})])
    expect(plan.map((p) => p.outcome)).toEqual(['duplicate', 'new'])
  })

  it('offers merge for a manual entry posted three days later', () => {
    const existing = [ex({ date: '2026-01-06' })]
    const plan = planImport(
      1,
      [cand({ date: '2026-01-09', rawDescription: 'SAFEWAY #4412' })],
      existing,
    )
    expect(plan[0]).toMatchObject({
      outcome: 'possible',
      choice: 'merge',
      matchId: existing[0]!.id,
    })
  })

  it('does not match beyond the window', () => {
    const plan = planImport(1, [cand({ date: '2026-01-10', rawDescription: 'X' })], [ex({})])
    expect(plan[0]!.outcome).toBe('new')
  })

  it('defaults to import as new when the existing row was itself imported', () => {
    const plan = planImport(
      1,
      [cand({ date: '2026-01-07', rawDescription: 'X' })],
      [ex({ imported: true })],
    )
    expect(plan[0]).toMatchObject({ outcome: 'possible', choice: 'new' })
  })

  it('lets each existing row be matched by one candidate only', () => {
    const plan = planImport(
      1,
      [
        cand({ date: '2026-01-07', rawDescription: 'A' }),
        cand({ date: '2026-01-07', rawDescription: 'B' }),
      ],
      [ex({})],
    )
    expect(plan.map((p) => p.outcome)).toEqual(['possible', 'new'])
  })

  it('trusts an external id only when date and amount agree', () => {
    const existing = [ex({ externalId: 'F1' })]
    const same = planImport(1, [cand({ externalId: 'F1', rawDescription: 'other' })], existing)
    expect(same[0]!.outcome).toBe('duplicate')
    const conflict = planImport(1, [cand({ externalId: 'F1', amount: -999 })], existing)
    expect(conflict[0]).toMatchObject({ outcome: 'possible', choice: 'new' })
  })

  it('offers a transfer, never linking automatically', () => {
    const other = ex({ accountId: 2, amount: 20000, rawDescription: 'Payment' })
    const plan = planImport(1, [cand({ amount: -20000, date: '2026-01-07' })], [other])
    expect(plan[0]).toMatchObject({ outcome: 'new', transferCandidateId: other.id })
  })

  it('ignores other accounts for duplicates', () => {
    const plan = planImport(1, [cand({})], [ex({ accountId: 2 })])
    expect(plan[0]!.outcome).toBe('new')
  })

  it('is idempotent: planning the same file after committing it yields no new rows', () => {
    const file = [
      cand({ line: 2, date: '2026-01-01', amount: -100, rawDescription: 'a' }),
      cand({ line: 3, date: '2026-01-01', amount: -100, rawDescription: 'a' }),
      cand({ line: 4, date: '2026-01-02', amount: 500, rawDescription: 'b' }),
    ]
    const first = planImport(1, file, [])
    const ledger = first
      .filter((p) => p.outcome === 'new')
      .map((p) =>
        ex({
          date: p.candidate.date,
          amount: p.candidate.amount,
          rawDescription: p.candidate.rawDescription,
          imported: true,
        }),
      )
    const second = planImport(1, file, ledger)
    expect(second.every((p) => p.outcome === 'duplicate')).toBe(true)
  })
})

describe('summarisePlan', () => {
  it('totals inflow and outflow of rows that would be added', () => {
    const plan = planImport(
      1,
      [cand({ amount: -100 }), cand({ amount: 300, rawDescription: 'p' })],
      [],
    )
    const s = summarisePlan(plan)
    expect(s).toMatchObject({ inflow: 300, outflow: -100, counts: { new: 2 } })
  })
})
