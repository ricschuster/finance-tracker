import { describe, expect, it } from 'vitest'
import { guessDateFormat, parseDate } from './dates'

describe('parseDate', () => {
  it('parses every format', () => {
    expect(parseDate('2026-03-05', 'YYYY-MM-DD')).toBe('2026-03-05')
    expect(parseDate('2026/3/5', 'YYYY/MM/DD')).toBe('2026-03-05')
    expect(parseDate('03/05/2026', 'MM/DD/YYYY')).toBe('2026-03-05')
    expect(parseDate('05/03/2026', 'DD/MM/YYYY')).toBe('2026-03-05')
    expect(parseDate('03-05-2026', 'MM-DD-YYYY')).toBe('2026-03-05')
    expect(parseDate('05-03-2026', 'DD-MM-YYYY')).toBe('2026-03-05')
    expect(parseDate('5-Mar-2026', 'DD-Mon-YYYY')).toBe('2026-03-05')
    expect(parseDate('20260305', 'YYYYMMDD')).toBe('2026-03-05')
  })
  it('rejects impossible dates', () => {
    expect(parseDate('2026-02-30', 'YYYY-MM-DD')).toBeNull()
    expect(parseDate('13/01/2026', 'MM/DD/YYYY')).toBeNull()
    expect(parseDate('2025-02-29', 'YYYY-MM-DD')).toBeNull()
    expect(parseDate('2024-02-29', 'YYYY-MM-DD')).toBe('2024-02-29')
    expect(parseDate('', 'YYYY-MM-DD')).toBeNull()
  })
})

describe('guessDateFormat', () => {
  it('detects day first from a value above 12', () => {
    expect(guessDateFormat(['05/03/2026', '25/03/2026']).format).toBe('DD/MM/YYYY')
  })
  it('detects month first from a second part above 12', () => {
    expect(guessDateFormat(['03/05/2026', '03/25/2026']).format).toBe('MM/DD/YYYY')
  })
  it('reports ambiguity', () => {
    const g = guessDateFormat(['01/02/2026', '03/04/2026'])
    expect(g.format).toBeNull()
    expect(g.candidates).toEqual(['MM/DD/YYYY', 'DD/MM/YYYY'])
  })
  it('detects ISO', () => {
    expect(guessDateFormat(['2026-01-02']).format).toBe('YYYY-MM-DD')
  })
})
