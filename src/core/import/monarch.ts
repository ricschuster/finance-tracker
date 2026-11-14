import { parseDate } from './dates'
import { parseLocaleAmount, type Candidate, type MappingResult } from './mapping'

const REQUIRED = ['date', 'merchant', 'category', 'account', 'original statement', 'amount', 'tags']

export function looksLikeMonarch(rows: string[][]): boolean {
  const header = (rows[0] ?? []).map((h) => h.trim().toLowerCase())
  return REQUIRED.every((r) => header.includes(r))
}

/**
 * Map a Monarch transactions export (the move from Monarch to this app). Dates are ISO and
 * amounts are signed (expenses negative). `Merchant` is the payee, `Original Statement` the raw
 * description, `Tags` a comma separated list and `Id` a stable id used to catch re-imports.
 */
export function mapMonarch(rows: string[][]): MappingResult {
  if (!looksLikeMonarch(rows)) throw new Error('This does not look like a Monarch export')
  const header = rows[0]!.map((h) => h.trim().toLowerCase())
  const col = (name: string) => header.indexOf(name)
  const idx = {
    date: col('date'),
    merchant: col('merchant'),
    category: col('category'),
    account: col('account'),
    statement: col('original statement'),
    notes: col('notes'),
    amount: col('amount'),
    tags: col('tags'),
    pending: col('pending'),
    id: col('id'),
  }
  const out: MappingResult = { candidates: [], errors: [], skippedForeign: [] }
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]!
    if (r.every((c) => c.trim() === '')) continue
    const cell = (c: number) => (c >= 0 ? (r[c] ?? '').trim() : '')
    try {
      const date = parseDate(cell(idx.date), 'YYYY-MM-DD')
      if (!date) throw new Error(`Invalid date "${cell(idx.date)}"`)
      const merchant = cell(idx.merchant)
      const c: Candidate = {
        line: i + 1,
        date,
        amount: parseLocaleAmount(cell(idx.amount)),
        rawDescription: cell(idx.statement) || merchant,
        payee: merchant,
        memo: cell(idx.notes),
        externalId: cell(idx.id) || null,
        status: ['true', 'yes', '1'].includes(cell(idx.pending).toLowerCase())
          ? 'pending'
          : 'cleared',
        accountName: cell(idx.account),
        categoryName: cell(idx.category),
        tags: cell(idx.tags)
          .split(',')
          .map((t) => t.trim())
          .filter((t) => t !== ''),
      }
      out.candidates.push(c)
    } catch (e) {
      out.errors.push({ line: i + 1, message: e instanceof Error ? e.message : String(e) })
    }
  }
  return out
}
