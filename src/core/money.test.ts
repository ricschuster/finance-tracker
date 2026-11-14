import { describe, expect, it } from 'vitest'
import { amountProblem, formatCents, parseAmountToCents, sanityWarnings } from './money'

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

describe('parseAmountToCents separators', () => {
  it.each([
    ['5,5', 550],
    ['1,50', 150],
    ['0,99', 99],
    [',5', 50],
    ['-5,5', -550],
    ['$5,50', 550],
    ['(5,50)', -550],
    ['1.234,56', 123456],
    ['1 234,56', 123456],
    ['1\u00a0234,56', 123456],
    ['12.345.678,9', 1234567890],
    ['1,234', 123400],
    ['1,234.56', 123456],
    ['12,345,678', 1234567800],
    ['$1,234,567.89', 123456789],
    ['1,234.5', 123450],
    ['1,234,56', 12345600],
    ['5,', 500],
  ])('parses %s', (input, expected) => {
    expect(parseAmountToCents(input)).toBe(expected)
  })

  it.each(['1,2,3x', '5,555.', '1.234', 'a,5', '5,5,5.5.5'])('rejects %j', (input) => {
    expect(() => parseAmountToCents(input)).toThrow()
  })
})

describe('amountProblem', () => {
  it('is null for valid amounts', () => {
    expect(amountProblem('5,5')).toBeNull()
  })
  it('explains empty and invalid input', () => {
    expect(amountProblem('  ')).toMatch(/Enter an amount like 12.50/)
    expect(amountProblem('abc')).toMatch(/"abc" is not an amount.*up to 2 decimals/)
  })
})

describe('sanityWarnings', () => {
  const now = new Date(2026, 5, 15)
  it('is quiet for ordinary values', () => {
    expect(sanityWarnings(1250, '2026-06-15', now)).toEqual([])
    expect(sanityWarnings(100_000_000, '2027-06-15', now)).toEqual([])
    expect(sanityWarnings(1250, '2006-06-15', now)).toEqual([])
  })
  it('warns on zero and huge amounts', () => {
    expect(sanityWarnings(0, '2026-06-15', now)).toHaveLength(1)
    expect(sanityWarnings(-100_000_001, '2026-06-15', now)[0]).toMatch(/over \$1,000,000/)
  })
  it('warns on far dates', () => {
    expect(sanityWarnings(100, '2027-06-16', now)[0]).toMatch(/future/)
    expect(sanityWarnings(100, '2006-06-14', now)[0]).toMatch(/past/)
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
