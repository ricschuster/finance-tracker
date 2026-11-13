import { describe, expect, it } from 'vitest'
import { formatCents, parseAmountToCents } from './money'

describe('parseAmountToCents', () => {
  it.each([
    ['12.34', 1234],
    ['-12.34', -1234],
    ['$1,234.5', 123450],
    ['(12.34)', -1234],
    ['+7', 700],
    ['.99', 99],
    ['0', 0],
  ])('parses %s', (input, expected) => {
    expect(parseAmountToCents(input)).toBe(expected)
  })

  it.each(['', 'abc', '1.234', '--1', '$'])('rejects %j', (input) => {
    expect(() => parseAmountToCents(input)).toThrow()
  })
})

describe('formatCents', () => {
  it('formats as CAD', () => {
    expect(formatCents(123456)).toBe('$1,234.56')
    expect(formatCents(-500)).toBe('-$5.00')
  })
  it('rejects non-integers', () => {
    expect(() => formatCents(1.5)).toThrow()
  })
})
