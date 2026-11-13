import { describe, expect, it } from 'vitest'
import { mapRows } from './mapping'
import { PRESETS } from './presets'
import { validateProfile } from './profiles'

const preset = (id: string) => PRESETS.find((p) => p.id === id)!

describe('presets', () => {
  it('are all valid profiles with unique ids', () => {
    for (const p of PRESETS) expect(validateProfile(p.config)).toEqual(p.config)
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length)
  })

  it('RBC maps CAD rows and skips USD rows by default', () => {
    const rows = [
      [
        'Account Type',
        'Account Number',
        'Transaction Date',
        'Cheque Number',
        'Description 1',
        'Description 2',
        'CAD$',
        'USD$',
      ],
      ['Chequing', '0000', '01/08/2026', '', 'SAFEWAY', '#4412', '-45.00', ''],
      ['Chequing', '0000', '01/09/2026', '', 'HOTEL', '', '', '-100.00'],
    ]
    const r = mapRows(rows, preset('rbc').config)
    expect(r.candidates.map((c) => [c.date, c.amount, c.rawDescription])).toEqual([
      ['2026-01-08', -4500, 'SAFEWAY #4412'],
    ])
    expect(r.skippedForeign).toHaveLength(1)
  })

  it('TD maps headerless debit and credit columns', () => {
    const rows = [
      ['01/08/2026', 'SAFEWAY', '45.00', '', '955.00'],
      ['01/09/2026', 'PAYROLL', '', '2000.00', '2955.00'],
    ]
    const r = mapRows(rows, preset('td').config)
    expect(r.candidates.map((c) => c.amount)).toEqual([-4500, 200000])
  })

  it('Tangerine maps a signed amount and joins name and memo', () => {
    const rows = [
      ['Transaction date', 'Transaction', 'Name', 'Memo', 'Amount'],
      ['1/8/2026', 'DEBIT', 'SAFEWAY', 'POS', '-45.00'],
    ]
    const r = mapRows(rows, preset('tangerine').config)
    expect(r.candidates[0]).toMatchObject({
      date: '2026-01-08',
      amount: -4500,
      rawDescription: 'SAFEWAY POS',
    })
  })
})
