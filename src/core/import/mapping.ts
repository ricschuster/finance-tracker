import { parseDate, type DateFormat } from './dates'

/** A column is a header name (when the file has a header) or a zero-based index. */
export type ColumnRef = string | number

export type AmountMapping =
  | { mode: 'signed'; column: ColumnRef; foreignColumn?: ColumnRef }
  | { mode: 'debitCredit'; debit: ColumnRef; credit: ColumnRef; foreignColumn?: ColumnRef }
  | { mode: 'directional'; column: ColumnRef; direction: ColumnRef; debitValues: string[] }

export interface MappingProfile {
  hasHeader: boolean
  /** Zero-based row of the header (or of the first data row when there is no header). */
  headerRow: number
  date: { column: ColumnRef; format: DateFormat }
  amount: AmountMapping
  /** Descriptions are joined with a space when several columns are given. */
  description: ColumnRef[]
  payee?: ColumnRef
  memo?: ColumnRef
  status?: ColumnRef
  externalId?: ColumnRef
  flipSign?: boolean
  decimalSeparator?: '.' | ','
}

export type ForeignPolicy = 'skip' | 'faceValue'

export interface Candidate {
  /** One-based line number among non-blank rows, for error reporting. */
  line: number
  date: string
  /** Signed integer cents, expenses negative. */
  amount: number
  rawDescription: string
  payee: string
  memo: string
  externalId: string | null
  status: 'pending' | 'cleared'
  /** Mint only: the source account name and category name. */
  accountName?: string
  categoryName?: string
  /** Monarch only: tags to attach to the new transaction. */
  tags?: string[]
}

export interface RowIssue {
  line: number
  message: string
}

export interface MappingResult {
  candidates: Candidate[]
  errors: RowIssue[]
  /** Foreign currency rows left out under the `skip` policy. */
  skippedForeign: RowIssue[]
}

/** Parse an amount with a chosen decimal separator. Currency symbols, spaces and thousands marks are ignored. */
export function parseLocaleAmount(input: string, decimal: '.' | ',' = '.'): number {
  let s = input.trim()
  let negative = false
  if (s.startsWith('(') && s.endsWith(')')) {
    negative = true
    s = s.slice(1, -1)
  }
  if (/-\s*$/.test(s)) {
    negative = !negative
    s = s.replace(/-\s*$/, '')
  }
  const thousands = decimal === '.' ? /[,\s\u00a0']/g : /[.\s\u00a0']/g
  s = s.replace(/[A-Za-z$€£]/g, '').replace(thousands, '')
  if (decimal === ',') s = s.replace(',', '.')
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

/** Normalised header cells joined together, for recognising a saved profile. */
export function headerFingerprint(header: string[]): string {
  return header.map((c) => c.trim().toLowerCase().replace(/\s+/g, ' ')).join('|')
}

function resolveColumn(ref: ColumnRef, header: string[] | null): number {
  if (typeof ref === 'number') return ref
  if (!header) throw new Error(`Column "${ref}" needs a header row`)
  const want = ref.trim().toLowerCase()
  const idx = header.findIndex((h) => h.trim().toLowerCase() === want)
  if (idx < 0) {
    const found = header.map((h) => h.trim()).filter((h) => h !== '')
    throw new Error(
      `Column "${ref}" not found in the header row (found: ${found.slice(0, 10).join(', ') || 'nothing'}). Check that the header row is the right line, or map the columns by hand.`,
    )
  }
  return idx
}

/** Apply a profile to raw rows. Rows that cannot be mapped become errors with their line number. */
export function mapRows(
  rows: string[][],
  profile: MappingProfile,
  options: { foreign?: ForeignPolicy } = {},
): MappingResult {
  const foreignPolicy = options.foreign ?? 'skip'
  const header = profile.hasHeader ? (rows[profile.headerRow] ?? []) : null
  const firstData = profile.hasHeader ? profile.headerRow + 1 : profile.headerRow
  const col = (ref: ColumnRef) => resolveColumn(ref, header)

  const dateCol = col(profile.date.column)
  const descCols = profile.description.map(col)
  const payeeCol = profile.payee === undefined ? -1 : col(profile.payee)
  const memoCol = profile.memo === undefined ? -1 : col(profile.memo)
  const statusCol = profile.status === undefined ? -1 : col(profile.status)
  const idCol = profile.externalId === undefined ? -1 : col(profile.externalId)
  const decimal = profile.decimalSeparator ?? '.'
  const a = profile.amount
  const foreignCol =
    a.mode !== 'directional' && a.foreignColumn !== undefined ? col(a.foreignColumn) : -1

  const cell = (r: string[], i: number) => (i >= 0 ? (r[i] ?? '').trim() : '')
  const out: MappingResult = { candidates: [], errors: [], skippedForeign: [] }

  for (let i = firstData; i < rows.length; i++) {
    const r = rows[i]!
    const line = i + 1
    try {
      const date = parseDate(cell(r, dateCol), profile.date.format)
      if (!date) throw new Error(`Invalid date "${cell(r, dateCol)}"`)

      let cents: number | null = null
      if (a.mode === 'signed') {
        const v = cell(r, col(a.column))
        if (v !== '') cents = parseLocaleAmount(v, decimal)
      } else if (a.mode === 'debitCredit') {
        const d = cell(r, col(a.debit))
        const c = cell(r, col(a.credit))
        if (d !== '' && c !== '') {
          const dc = parseLocaleAmount(d, decimal)
          const cc = parseLocaleAmount(c, decimal)
          if (dc !== 0 && cc !== 0) throw new Error('Both debit and credit are filled')
          cents = cc !== 0 ? Math.abs(cc) : -Math.abs(dc)
        } else if (d !== '') cents = -Math.abs(parseLocaleAmount(d, decimal))
        else if (c !== '') cents = Math.abs(parseLocaleAmount(c, decimal))
      } else {
        const v = cell(r, col(a.column))
        const dir = cell(r, col(a.direction)).toLowerCase()
        if (v === '') throw new Error('Missing amount')
        const isDebit = a.debitValues.some((x) => x.toLowerCase() === dir)
        const mag = Math.abs(parseLocaleAmount(v, decimal))
        cents = isDebit ? -mag : mag
      }

      if (cents === null && foreignCol >= 0 && cell(r, foreignCol) !== '') {
        if (foreignPolicy === 'skip') {
          out.skippedForeign.push({ line, message: 'Foreign currency amount skipped' })
          continue
        }
        cents = parseLocaleAmount(cell(r, foreignCol), decimal)
      }
      if (cents === null) throw new Error('Missing amount')
      if (profile.flipSign) cents = -cents

      const rawDescription = descCols
        .map((c) => cell(r, c))
        .filter((x) => x !== '')
        .join(' ')
      const statusText = cell(r, statusCol).toLowerCase()
      out.candidates.push({
        line,
        date,
        amount: cents,
        rawDescription,
        payee: cell(r, payeeCol),
        memo: cell(r, memoCol),
        externalId: cell(r, idCol) || null,
        status: statusText === 'pending' ? 'pending' : 'cleared',
      })
    } catch (e) {
      out.errors.push({ line, message: e instanceof Error ? e.message : String(e) })
    }
  }
  return out
}
