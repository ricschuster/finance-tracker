// Money is stored as integer cents in the single home currency (ADR 0003).

const cad = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' })

export function formatCents(cents: number): string {
  if (!Number.isInteger(cents)) throw new Error(`cents must be an integer, got ${cents}`)
  return cad.format(cents / 100)
}

/** Parse "12.34", "-12.34", "$1,234.5", or "(12.34)" into integer cents. */
export function parseAmountToCents(input: string): number {
  let s = input.trim()
  let negative = false
  if (s.startsWith('(') && s.endsWith(')')) {
    negative = true
    s = s.slice(1, -1)
  }
  s = s.replace(/[$,\s]/g, '')
  if (s.startsWith('-')) {
    negative = !negative
    s = s.slice(1)
  } else if (s.startsWith('+')) {
    s = s.slice(1)
  }
  const m = /^(\d*)(?:\.(\d{1,2}))?$/.exec(s)
  if (!m || (m[1] === '' && m[2] === undefined)) throw new Error(`Invalid amount: "${input}"`)
  const cents = Number(m[1] || '0') * 100 + Number((m[2] ?? '').padEnd(2, '0'))
  return negative ? -cents : cents
}
