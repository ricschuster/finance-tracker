import { parseDate } from './dates'
import { parseLocaleAmount, type Candidate, type MappingResult } from './mapping'

const REQUIRED = [
  'transaction_date',
  'account_number',
  'account_type',
  'transaction_type',
  'amount',
  'currency',
]

export function looksLikeWealthsimple(rows: string[][]): boolean {
  const header = (rows[0] ?? []).map((h) => h.trim().toLowerCase())
  return REQUIRED.every((r) => header.includes(r))
}

/**
 * Map a Wealthsimple activity export. One file can hold several accounts; each row carries its
 * account as "type number" in `accountName`. Dates are ISO and amounts are signed. Rows in a
 * currency other than CAD are skipped, as with the RBC USD$ column.
 */
export function mapWealthsimple(rows: string[][]): MappingResult {
  if (!looksLikeWealthsimple(rows)) throw new Error('This does not look like a Wealthsimple export')
  const header = rows[0]!.map((h) => h.trim().toLowerCase())
  const col = (name: string) => header.indexOf(name)
  const idx = {
    date: col('transaction_date'),
    number: col('account_number'),
    accountType: col('account_type'),
    type: col('transaction_type'),
    subType: col('transaction_sub_type'),
    status: col('status'),
    payee: col('payee'),
    amount: col('amount'),
    currency: col('currency'),
    notes: col('notes'),
  }
  const out: MappingResult = { candidates: [], errors: [], skippedForeign: [] }
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]!
    const cell = (c: number) => (c >= 0 ? (r[c] ?? '').trim() : '')
    if (r.every((c) => c.trim() === '')) continue
    try {
      const date = parseDate(cell(idx.date), 'YYYY-MM-DD')
      if (!date) throw new Error(`Invalid date "${cell(idx.date)}"`)
      const currency = cell(idx.currency).toUpperCase()
      if (currency !== '' && currency !== 'CAD') {
        out.skippedForeign.push({ line: i + 1, message: 'Foreign currency amount skipped' })
        continue
      }
      const kind = [cell(idx.type), cell(idx.subType)].filter((x) => x !== '').join(' ')
      const payee = cell(idx.payee)
      const c: Candidate = {
        line: i + 1,
        date,
        amount: parseLocaleAmount(cell(idx.amount)),
        rawDescription: payee || kind,
        payee,
        memo: cell(idx.notes),
        externalId: null,
        status: cell(idx.status).toLowerCase() === 'pending' ? 'pending' : 'cleared',
        accountName: [cell(idx.accountType), cell(idx.number)].filter((x) => x !== '').join(' '),
      }
      out.candidates.push(c)
    } catch (e) {
      out.errors.push({ line: i + 1, message: e instanceof Error ? e.message : String(e) })
    }
  }
  return out
}
