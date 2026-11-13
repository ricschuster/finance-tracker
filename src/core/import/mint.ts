import { parseDate } from './dates'
import { parseLocaleAmount, type Candidate, type MappingResult } from './mapping'

const REQUIRED = [
  'Date',
  'Description',
  'Original Description',
  'Amount',
  'Transaction Type',
  'Category',
  'Account Name',
]

export function looksLikeMint(rows: string[][]): boolean {
  const header = (rows[0] ?? []).map((h) => h.trim().toLowerCase())
  return REQUIRED.every((r) => header.includes(r.toLowerCase()))
}

/**
 * Map a Mint export. `Description` is the payee, `Original Description` the raw description,
 * and `Amount` is unsigned with `Transaction Type` saying debit or credit.
 */
export function mapMint(rows: string[][]): MappingResult {
  if (!looksLikeMint(rows)) throw new Error('This does not look like a Mint export')
  const header = rows[0]!.map((h) => h.trim().toLowerCase())
  const col = (name: string) => header.indexOf(name.toLowerCase())
  const idx = {
    date: col('Date'),
    desc: col('Description'),
    orig: col('Original Description'),
    amount: col('Amount'),
    type: col('Transaction Type'),
    category: col('Category'),
    account: col('Account Name'),
    notes: col('Notes'),
  }
  const out: MappingResult = { candidates: [], errors: [], skippedForeign: [] }
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]!
    const cell = (c: number) => (c >= 0 ? (r[c] ?? '').trim() : '')
    try {
      const date = parseDate(cell(idx.date), 'MM/DD/YYYY')
      if (!date) throw new Error(`Invalid date "${cell(idx.date)}"`)
      const type = cell(idx.type).toLowerCase()
      if (type !== 'debit' && type !== 'credit')
        throw new Error(`Unknown transaction type "${type}"`)
      const mag = Math.abs(parseLocaleAmount(cell(idx.amount)))
      const c: Candidate = {
        line: i + 1,
        date,
        amount: type === 'debit' ? -mag : mag,
        rawDescription: cell(idx.orig) || cell(idx.desc),
        payee: cell(idx.desc),
        memo: cell(idx.notes),
        externalId: null,
        status: 'cleared',
        accountName: cell(idx.account),
        categoryName: cell(idx.category),
      }
      out.candidates.push(c)
    } catch (e) {
      out.errors.push({ line: i + 1, message: e instanceof Error ? e.message : String(e) })
    }
  }
  return out
}
