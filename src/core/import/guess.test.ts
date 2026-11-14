import { describe, expect, it } from 'vitest'
import { guessMapping } from './guess'
import { mapRows, type MappingProfile } from './mapping'
import { matchPresetByHeader } from './presets'
import { previewMapping } from './preview'

describe('guessMapping', () => {
  it('reads a headered signed file', () => {
    const g = guessMapping([
      ['Date', 'Description', 'Amount', 'Balance'],
      ['2024-01-15', 'Coffee Shop', '-4.50', '995.50'],
      ['2024-01-16', 'Payroll', '1500.00', '2495.50'],
      ['2024-01-17', 'Groceries Market', '-82.10', '2413.40'],
    ])
    expect(g.hasHeader).toBe(true)
    expect(g.date).toMatchObject({ column: 0, format: 'YYYY-MM-DD', ambiguous: false })
    expect(g.amount).toMatchObject({ mode: 'signed', column: 2 })
    expect(g.description.columns).toEqual([1])
    expect(g.ignored).toEqual([3])
    expect(g.confidence).toBeGreaterThan(0.8)
  })

  it('recognises bank header variants and debit/credit columns', () => {
    const g = guessMapping([
      ['Posted', 'Details', 'Withdrawals', 'Deposits', 'Balance'],
      ['15 Jan 2024', 'Hydro bill', '75.00', '', '925.00'],
      ['16 Jan 2024', 'Refund', '', '20.00', '945.00'],
    ])
    expect(g.date).toMatchObject({ column: 0, format: 'DD-Mon-YYYY' })
    expect(g.amount).toMatchObject({ mode: 'debitCredit', debit: 2, credit: 3 })
    expect(g.description.columns).toEqual([1])
  })

  it('guesses a headerless debit/credit/balance file from content', () => {
    const g = guessMapping([
      ['01/15/2024', 'Coffee Shop', '4.50', '', '995.50'],
      ['01/16/2024', 'Payroll deposit', '', '1500.00', '2495.50'],
      ['01/17/2024', 'Groceries Market', '82.10', '', '2413.40'],
      ['01/18/2024', 'Gas station', '40.00', '', '2373.40'],
    ])
    expect(g.hasHeader).toBe(false)
    expect(g.headerRow).toBe(0)
    expect(g.date).toMatchObject({ column: 0, format: 'MM/DD/YYYY' })
    expect(g.amount).toMatchObject({ mode: 'debitCredit', debit: 2, credit: 3 })
    expect(g.description.columns).toEqual([1])
    expect(g.ignored).toEqual([4])
  })

  it('tells day-first from month-first by a value above 12', () => {
    const g = guessMapping([
      ['Date', 'Memo', 'Amount'],
      ['25/01/2024', 'Rent', '-900.00'],
      ['03/02/2024', 'Phone', '-45.00'],
    ])
    expect(g.date).toMatchObject({ format: 'DD/MM/YYYY', ambiguous: false })
  })

  it('settles a day/month ambiguity by row order, else flags it', () => {
    const sorted = guessMapping([
      ['Date', 'Memo', 'Amount'],
      ['12/01/2024', 'a', '-1.00'],
      ['12/02/2024', 'b', '-2.00'],
      ['01/03/2024', 'c', '-3.00'],
    ])
    expect(sorted.date).toMatchObject({ format: 'DD/MM/YYYY', ambiguous: false })
    const unclear = guessMapping([
      ['Date', 'Memo', 'Amount'],
      ['01/02/2024', 'a', '-1.00'],
      ['03/04/2024', 'b', '-2.00'],
      ['02/03/2024', 'c', '-3.00'],
    ])
    expect(unclear.date).toMatchObject({ format: 'MM/DD/YYYY', ambiguous: true })
    expect(unclear.date!.confidence).toBeLessThanOrEqual(0.5)
    expect(unclear.notes.join(' ')).toMatch(/month\/day/)
  })

  it('picks the transaction date over the posted date and keeps extra columns ignored', () => {
    const g = guessMapping([
      ['Posted Date', 'Transaction Date', 'Payee', 'Category', 'Amount'],
      ['2024-01-16', '2024-01-15', 'Cafe', 'Dining', '-4.50'],
      ['2024-01-17', '2024-01-16', 'Bakery', 'Dining', '-6.00'],
    ])
    expect(g.date?.column).toBe(1)
    expect(g.ignored).toEqual([0, 3])
  })

  it('finds a balance column without a header from the running total', () => {
    const g = guessMapping([
      ['2024-01-01', 'Opening deposit', '100.00', '1100.00'],
      ['2024-01-02', 'Coffee', '-4.00', '1096.00'],
      ['2024-01-03', 'Lunch', '-12.00', '1084.00'],
      ['2024-01-04', 'Books', '-30.00', '1054.00'],
    ])
    expect(g.amount).toMatchObject({ mode: 'signed', column: 2 })
    expect(g.ignored).toEqual([3])
  })

  it('detects comma decimals and a direction column', () => {
    const g = guessMapping([
      ['Date', 'Text', 'Type', 'Amount'],
      ['2024-01-15', 'Kaffee', 'Debit', '4,50'],
      ['2024-01-16', 'Gehalt', 'Credit', '1500,00'],
    ])
    expect(g.decimal).toBe(',')
    expect(g.amount).toMatchObject({
      mode: 'directional',
      column: 3,
      direction: 2,
      debitValues: ['debit'],
    })
  })

  it('warns when every amount is positive', () => {
    const g = guessMapping([
      ['Date', 'Description', 'Amount'],
      ['2024-01-15', 'Store', '12.00'],
      ['2024-01-16', 'Shop', '8.00'],
    ])
    expect(g.notes.join(' ')).toMatch(/Flip sign/)
  })

  it('does not take id or check-number columns for amounts', () => {
    const g = guessMapping([
      ['Date', 'Check', 'Description', 'Amount'],
      ['2024-01-15', '1001', 'Landlord', '-900.00'],
      ['2024-01-16', '1002', 'Electric', '-60.00'],
    ])
    expect(g.amount).toMatchObject({ column: 3 })
    expect(g.description.columns).toEqual([2])
  })

  it('survives empty and junk input', () => {
    expect(guessMapping([]).confidence).toBe(0)
    const g = guessMapping([
      ['a', 'b'],
      ['c', 'd'],
    ])
    expect(g.date).toBeNull()
    expect(g.amount).toBeNull()
  })

  it('produces a mapping that imports through mapRows', () => {
    const rows = [
      ['Transaction Date', 'Name', 'Amount'],
      ['2024-02-01', 'Gym', '-30.00'],
      ['2024-02-02', 'Salary', '2000.00'],
    ]
    const g = guessMapping(rows)
    const profile: MappingProfile = {
      hasHeader: g.hasHeader,
      headerRow: g.headerRow,
      date: { column: g.date!.column, format: g.date!.format },
      amount: { mode: 'signed', column: (g.amount as { column: number }).column },
      description: g.description.columns,
    }
    expect(mapRows(rows, profile).candidates.map((c) => c.amount)).toEqual([-3000, 200000])
  })
})

describe('matchPresetByHeader', () => {
  it('recognises RBC and Tangerine headers, not unknown ones', () => {
    expect(
      matchPresetByHeader([
        'Account Type',
        'Transaction Date',
        'Description 1',
        'Description 2',
        'CAD$',
        'USD$',
      ])?.id,
    ).toBe('rbc')
    expect(matchPresetByHeader(['Date', 'Name', 'Memo', 'Amount'])?.id).toBe('tangerine')
    expect(matchPresetByHeader(['When', 'What', 'How much'])).toBeNull()
  })
})

describe('previewMapping', () => {
  const profile: MappingProfile = {
    hasHeader: true,
    headerRow: 0,
    date: { column: 0, format: 'YYYY-MM-DD' },
    amount: { mode: 'signed', column: 2 },
    description: [1],
  }
  it('shows parsed rows and flags rows that fail', () => {
    const p = previewMapping(
      [
        ['Date', 'Desc', 'Amount'],
        ['2024-01-15', 'Coffee', '-4.50'],
        ['nope', 'Bad date', '1.00'],
        ['2024-01-17', 'Bad amount', 'abc'],
      ],
      profile,
    )
    expect(p.rows.map((r) => r.ok)).toEqual([true, false, false])
    expect(p.rows[0]).toMatchObject({ date: '2024-01-15', amount: -450, description: 'Coffee' })
    expect(p.failed).toBe(2)
    expect(p.rows[1]!.message).toMatch(/Invalid date/)
  })
  it('limits rows and reports an unusable mapping', () => {
    const rows = [
      ['Date', 'Desc', 'Amount'],
      ...Array.from({ length: 30 }, () => ['2024-01-01', 'x', '1.00']),
    ]
    expect(previewMapping(rows, profile, { limit: 10 }).total).toBe(10)
    expect(
      previewMapping(rows, { ...profile, date: { column: 'Missing', format: 'YYYY-MM-DD' } }).error,
    ).toMatch(/not found/)
  })
})
