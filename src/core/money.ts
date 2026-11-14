// Money is stored as integer cents in the single home currency (ADR 0003).

const cad = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' })

export function formatCents(cents: number): string {
  if (!Number.isInteger(cents)) throw new Error(`cents must be an integer, got ${cents}`)
  return cad.format(cents / 100)
}

/** Shown when an amount cannot be read. */
export const AMOUNT_HINT = 'Enter an amount like 12.50 (up to 2 decimals).'

/**
 * Parse "12.34", "-12.34", "$1,234.5", "(12.34)" or "5,5" into integer cents.
 *
 * Commas: a single comma followed by one or two digits at the end, with no dot, is a
 * decimal comma ("5,5" is 5.50, "1,50" is 1.50, "1 234,56" is 1234.56). With a dot and a
 * comma, whichever comes last is the decimal mark ("1.234,56" and "1,234.56" are both
 * 1234.56). Any other comma is a thousands separator ("12,345,678"). A lone "1,234" is
 * genuinely ambiguous and is read as 1234.00.
 */
export function parseAmountToCents(input: string): number {
  let s = input.trim()
  let negative = false
  if (s.startsWith('(') && s.endsWith(')')) {
    negative = true
    s = s.slice(1, -1)
  }
  s = s.replace(/[$\s]/g, '')
  if (s.startsWith('-')) {
    negative = !negative
    s = s.slice(1)
  } else if (s.startsWith('+')) {
    s = s.slice(1)
  }
  if (s.includes(',')) {
    const decimalComma = s.includes('.')
      ? s.lastIndexOf(',') > s.lastIndexOf('.')
      : /^\d*,\d{1,2}$/.test(s)
    s = decimalComma ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  }
  const m = /^(\d*)(?:\.(\d{1,2}))?$/.exec(s)
  if (!m || (m[1] === '' && m[2] === undefined))
    throw new Error(
      input.trim() === ''
        ? 'Enter an amount like 12.50.'
        : `"${input.trim()}" is not an amount. ${AMOUNT_HINT}`,
    )
  const cents = Number(m[1] || '0') * 100 + Number((m[2] ?? '').padEnd(2, '0'))
  return negative ? -cents : cents
}

/** A user-facing reason the text is not a valid amount, or null when it parses. */
export function amountProblem(input: string): string | null {
  try {
    parseAmountToCents(input)
    return null
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}

const MAX_SANE_CENTS = 100_000_000

/**
 * Non-blocking sanity warnings for a new transaction: a zero or very large amount and a
 * date far in the future or past. `date` is YYYY-MM-DD; `today` is injectable for tests.
 */
export function sanityWarnings(cents: number, date: string, today: Date = new Date()): string[] {
  const out: string[] = []
  if (cents === 0) out.push('The amount is zero.')
  if (Math.abs(cents) > MAX_SANE_CENTS) {
    out.push(`The amount is over ${formatCents(MAX_SANE_CENTS)}.`)
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    const limit = (years: number) =>
      new Date(today.getFullYear() + years, today.getMonth(), today.getDate())
    if (d > limit(1)) out.push('The date is more than a year in the future.')
    if (d < limit(-20)) out.push('The date is more than 20 years in the past.')
  }
  return out
}
