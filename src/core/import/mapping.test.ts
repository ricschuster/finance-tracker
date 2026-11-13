import { describe, expect, it } from 'vitest'
import { headerFingerprint, mapRows, parseLocaleAmount, type MappingProfile } from './mapping'

describe('parseLocaleAmount', () => {
  it('handles dot and comma decimals', () => {
    expect(parseLocaleAmount('$1,234.50')).toBe(123450)
    expect(parseLocaleAmount('1 234,56', ',')).toBe(123456)
    expect(parseLocaleAmount('1.234,5', ',')).toBe(123450)
    expect(parseLocaleAmount('(12.34)')).toBe(-1234)
    expect(parseLocaleAmount('-0.99')).toBe(-99)
    expect(parseLocaleAmount('12.34-')).toBe(-1234)
  })
  it('rejects junk', () => {
    expect(() => parseLocaleAmount('abc')).toThrow()
    expect(() => parseLocaleAmount('')).toThrow()
  })
})

const base: MappingProfile = {
  hasHeader: true,
  headerRow: 0,
  date: { column: 'Date', format: 'YYYY-MM-DD' },
  amount: { mode: 'signed', column: 'Amount' },
  description: ['Desc'],
}

describe('mapRows', () => {
  it('maps a signed column and reports bad rows with line numbers', () => {
    const rows = [
      ['Date', 'Desc', 'Amount'],
      ['2026-01-02', 'COFFEE', '-4.50'],
      ['not a date', 'X', '1.00'],
      ['2026-01-03', 'PAY', '100.00'],
      ['2026-01-04', 'TOTAL', ''],
    ]
    const r = mapRows(rows, base)
    expect(r.candidates.map((c) => [c.line, c.amount])).toEqual([
      [2, -450],
      [4, 10000],
    ])
    expect(r.errors.map((e) => e.line)).toEqual([3, 5])
  })
  it('maps headerless debit and credit columns', () => {
    const p: MappingProfile = {
      hasHeader: false,
      headerRow: 0,
      date: { column: 0, format: 'MM/DD/YYYY' },
      amount: { mode: 'debitCredit', debit: 2, credit: 3 },
      description: [1],
    }
    const r = mapRows(
      [
        ['01/02/2026', 'RENT', '1000.00', ''],
        ['01/03/2026', 'PAY', '', '2000.00'],
      ],
      p,
    )
    expect(r.candidates.map((c) => c.amount)).toEqual([-100000, 200000])
  })
  it('maps unsigned amount with a direction column', () => {
    const p: MappingProfile = {
      ...base,
      amount: { mode: 'directional', column: 'Amount', direction: 'Type', debitValues: ['DR'] },
    }
    const r = mapRows(
      [
        ['Date', 'Desc', 'Amount', 'Type'],
        ['2026-01-02', 'A', '5.00', 'DR'],
        ['2026-01-02', 'B', '5.00', 'CR'],
      ],
      p,
    )
    expect(r.candidates.map((c) => c.amount)).toEqual([-500, 500])
  })
  it('flips sign for credit card exports', () => {
    const r = mapRows(
      [
        ['Date', 'Desc', 'Amount'],
        ['2026-01-02', 'SHOP', '20.00'],
      ],
      { ...base, flipSign: true },
    )
    expect(r.candidates[0]!.amount).toBe(-2000)
  })
  it('joins several description columns', () => {
    const r = mapRows(
      [
        ['Date', 'D1', 'D2', 'Amount'],
        ['2026-01-02', 'SAFEWAY', '#4412', '-1.00'],
      ],
      { ...base, description: ['D1', 'D2'] },
    )
    expect(r.candidates[0]!.rawDescription).toBe('SAFEWAY #4412')
  })
  it('skips foreign currency rows by default and imports them on override', () => {
    const p: MappingProfile = {
      ...base,
      amount: { mode: 'signed', column: 'CAD$', foreignColumn: 'USD$' },
    }
    const rows = [
      ['Date', 'Desc', 'CAD$', 'USD$'],
      ['2026-01-02', 'LOCAL', '-5.00', ''],
      ['2026-01-03', 'ABROAD', '', '-7.00'],
    ]
    const skipped = mapRows(rows, p)
    expect(skipped.candidates).toHaveLength(1)
    expect(skipped.skippedForeign.map((s) => s.line)).toEqual([3])
    const face = mapRows(rows, p, { foreign: 'faceValue' })
    expect(face.candidates.map((c) => c.amount)).toEqual([-500, -700])
  })
  it('errors on a missing column name', () => {
    expect(() => mapRows([['A']], base)).toThrow(/not found/)
  })
})

describe('headerFingerprint', () => {
  it('ignores case and spacing', () => {
    expect(headerFingerprint([' Date ', 'Amount  Due'])).toBe(
      headerFingerprint(['date', 'amount due']),
    )
  })
})
