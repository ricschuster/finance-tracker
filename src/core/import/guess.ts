import { guessHeaderRow } from './headerRow'
import { parseDate, type DateFormat } from './dates'
import { parseLocaleAmount } from './mapping'

/**
 * Heuristic column guesser. From the first rows of a file it proposes a full mapping (header
 * row, date column and format, amount mode and columns, description columns) with a confidence
 * per field, using both header names and column content, so headerless files work too. It never
 * throws and never writes anything; the user can change every part of it.
 */

export type AmountGuess =
  | { mode: 'signed'; column: number; foreign: number | null; confidence: number }
  | {
      mode: 'debitCredit'
      debit: number
      credit: number
      foreign: number | null
      confidence: number
    }
  | {
      mode: 'directional'
      column: number
      direction: number
      debitValues: string[]
      confidence: number
    }

export interface DateGuess {
  column: number
  format: DateFormat
  /** Every format that fits the column equally well. */
  candidates: DateFormat[]
  /** True when day-first and month-first both fit and the order of rows could not settle it. */
  ambiguous: boolean
  confidence: number
}

export interface MappingGuess {
  hasHeader: boolean
  /** Header row, or the first data row when there is no header. */
  headerRow: number
  headerConfidence: number
  date: DateGuess | null
  amount: AmountGuess | null
  description: { columns: number[]; confidence: number }
  decimal: '.' | ','
  /** Columns the guess does not use (balance, category, ids, extra dates). */
  ignored: number[]
  /** Human-readable cautions, for example "all amounts are positive". */
  notes: string[]
  /** The weakest of the date, amount and description confidences. */
  confidence: number
}

const SAMPLE = 40

const FORMATS: DateFormat[] = [
  'YYYY-MM-DD',
  'YYYY/MM/DD',
  'MM/DD/YYYY',
  'DD/MM/YYYY',
  'MM-DD-YYYY',
  'DD-MM-YYYY',
  'DD-Mon-YYYY',
  'YYYYMMDD',
]

type Kind =
  | 'date'
  | 'debit'
  | 'credit'
  | 'amount'
  | 'foreign'
  | 'balance'
  | 'desc'
  | 'direction'
  | 'category'
  | 'other'

/** Classify a header cell. Order matters: the first matching rule wins. */
export function headerKind(raw: string): Kind {
  const h = raw.trim().toLowerCase()
  if (h === '') return 'other'
  if (/balance/.test(h)) return 'balance'
  if (/^(type|direction|dr\/cr|debit\/credit|cr\/dr|credit\/debit)$/.test(h)) return 'direction'
  if (/categor/.test(h)) return 'category'
  if (/date|posted|posting/.test(h)) return 'date'
  if (/usd|foreign/.test(h)) return 'foreign'
  if (/debit|withdraw|paid out|money out|spent/.test(h)) return 'debit'
  if (/credit|deposit|paid in|money in|received/.test(h)) return 'credit'
  if (/amount|^cad|\bsum\b|^value$/.test(h)) return 'amount'
  if (/desc|detail|payee|merchant|name|narrative|particular|memo|note/.test(h)) return 'desc'
  return 'other'
}

function numeric(v: string): number | null {
  for (const d of ['.', ','] as const) {
    try {
      return parseLocaleAmount(v, d)
    } catch {
      /* try the other separator */
    }
  }
  return null
}

const looksNumber = (v: string) => /\d/.test(v) && !/[A-Za-z]{2,}/.test(v) && numeric(v) !== null

function parsesAsDate(v: string): boolean {
  return FORMATS.some((f) => parseDate(v, f) !== null)
}

/** Formats that parse the most values, provided that is at least 60% of them. */
function bestFormats(values: string[]): { formats: DateFormat[]; fraction: number } {
  if (values.length === 0) return { formats: [], fraction: 0 }
  const counts = FORMATS.map((f) => values.filter((v) => parseDate(v, f) !== null).length)
  const max = Math.max(...counts)
  if (max / values.length < 0.6) return { formats: [], fraction: max / values.length }
  return { formats: FORMATS.filter((_, i) => counts[i] === max), fraction: max / values.length }
}

/** Number of order violations when read top-to-bottom ascending and descending; min is the score. */
function disorder(values: string[], f: DateFormat): number {
  const iso = values.map((v) => parseDate(v, f)).filter((x): x is string => x !== null)
  let up = 0
  let down = 0
  for (let i = 1; i < iso.length; i++) {
    if (iso[i]! < iso[i - 1]!) up++
    if (iso[i]! > iso[i - 1]!) down++
  }
  return Math.min(up, down)
}

interface ColStat {
  index: number
  header: string
  kind: Kind
  values: string[]
  filled: number
  dateFraction: number
  numFraction: number
  decimalFraction: number
  avgLen: number
  distinct: string[]
}

function stat(index: number, header: string, kind: Kind, rows: string[][]): ColStat {
  const all = rows.map((r) => (r[index] ?? '').trim())
  const values = all.filter((v) => v !== '')
  const n = Math.max(values.length, 1)
  const num = values.filter(looksNumber)
  return {
    index,
    header,
    kind,
    values: all,
    filled: values.length,
    dateFraction: bestFormats(values).fraction,
    numFraction: num.length / n,
    decimalFraction: num.filter((v) => /[.,]\d{1,2}\)?-?$/.test(v)).length / n,
    avgLen: values.reduce((s, v) => s + v.length, 0) / n,
    distinct: [...new Set(values.map((v) => v.toLowerCase()))],
  }
}

/** Does column `b` look like a running balance given the amounts in `a`? */
function isRunningBalance(a: ColStat, b: ColStat): boolean {
  let hits = 0
  let tested = 0
  const avals = a.values.map((v) => (v === '' ? null : numeric(v)))
  const bvals = b.values.map((v) => (v === '' ? null : numeric(v)))
  for (let i = 1; i < bvals.length; i++) {
    const cur = bvals[i]
    const prev = bvals[i - 1]
    if (cur == null || prev == null) continue
    tested++
    // Rows may be newest first, so the amount can sit on either side of the pair.
    const d = Math.abs(cur - prev)
    if (d === Math.abs(avals[i] ?? NaN) || d === Math.abs(avals[i - 1] ?? NaN)) hits++
  }
  return tested >= 3 && hits / tested >= 0.7
}

const empty = (headerRow: number): MappingGuess => ({
  hasHeader: false,
  headerRow,
  headerConfidence: 0,
  date: null,
  amount: null,
  description: { columns: [], confidence: 0 },
  decimal: '.',
  ignored: [],
  notes: ['The file has no rows to guess from.'],
  confidence: 0,
})

export function guessMapping(allRows: string[][]): MappingGuess {
  const rows = allRows.slice(0, SAMPLE)
  if (rows.length === 0) return empty(0)
  const first = guessHeaderRow(rows)
  const top = rows[first] ?? []
  const filledText = top.filter((c) => /[A-Za-z]/.test(c)).length
  const dataLike = top.some(
    (c) => c.trim() !== '' && (parsesAsDate(c.trim()) || /\d[.,]\d{2}$/.test(c.trim())),
  )
  const knownHeaders = top.filter((c) => headerKind(c) !== 'other').length
  const hasHeader = !dataLike && filledText >= 2
  const headerConfidence = hasHeader
    ? knownHeaders >= 2
      ? 0.95
      : knownHeaders === 1
        ? 0.8
        : 0.6
    : 0.7
  const data = rows.slice(hasHeader ? first + 1 : first)
  const width = rows.reduce((n, r) => Math.max(n, r.length), 0)
  const notes: string[] = []
  if (data.length === 0) return { ...empty(first), hasHeader, headerRow: first }

  const stats = Array.from({ length: width }, (_, i) =>
    stat(
      i,
      hasHeader ? (top[i] ?? '').trim() : '',
      hasHeader ? headerKind(top[i] ?? '') : 'other',
      data,
    ),
  )
  const used = new Set<number>()

  // Date: content decides, the header breaks ties (Transaction date over Posted date).
  let date: DateGuess | null = null
  {
    const scored = stats
      .filter(
        (s) =>
          s.filled > 0 && (s.dateFraction >= 0.6 || (s.kind === 'date' && s.dateFraction >= 0.3)),
      )
      .map((s) => {
        const h = s.header.toLowerCase()
        const bonus =
          (s.kind === 'date' ? 0.3 : 0) +
          (/transaction|trans\.?\s*date/.test(h) ? 0.05 : 0) -
          (/post/.test(h) ? 0.02 : 0)
        return { s, score: s.dateFraction * 0.7 + bonus }
      })
      .sort((a, b) => b.score - a.score || a.s.index - b.s.index)
    const pick = scored[0]?.s
    if (pick) {
      const values = pick.values.filter((v) => v !== '')
      const { formats, fraction } = bestFormats(values)
      let format = formats[0]!
      let ambiguous = false
      const dayMonth = (['MM/DD/YYYY', 'DD/MM/YYYY'] as const).every((f) => formats.includes(f))
        ? (['MM/DD/YYYY', 'DD/MM/YYYY'] as const)
        : (['MM-DD-YYYY', 'DD-MM-YYYY'] as const).every((f) => formats.includes(f))
          ? (['MM-DD-YYYY', 'DD-MM-YYYY'] as const)
          : null
      if (dayMonth) {
        const [mdy, dmy] = dayMonth
        const a = disorder(values, mdy)
        const b = disorder(values, dmy)
        if (a === 0 && b > 0) format = mdy
        else if (b === 0 && a > 0) format = dmy
        else {
          format = mdy
          ambiguous = true
        }
      }
      let confidence = fraction * (pick.kind === 'date' ? 1 : 0.9)
      if (ambiguous) {
        confidence = Math.min(confidence, 0.5)
        notes.push(
          'Dates fit both month/day and day/month; month/day was assumed. Check the preview.',
        )
      }
      date = { column: pick.index, format, candidates: formats, ambiguous, confidence }
      used.add(pick.index)
    }
  }

  // Amounts.
  const free = stats.filter((s) => !used.has(s.index))
  const isNum = (s: ColStat) =>
    s.filled > 0 &&
    s.numFraction >= (['amount', 'debit', 'credit'].includes(s.kind) ? 0.6 : 0.8) &&
    s.dateFraction < 0.6 &&
    (s.decimalFraction >= 0.5 || ['amount', 'debit', 'credit'].includes(s.kind))
  let amount: AmountGuess | null = null
  const byKind = (k: Kind) => free.filter((s) => s.kind === k && isNum(s))
  const foreign = byKind('foreign')[0]?.index ?? null
  const debitH = byKind('debit')[0]
  const creditH = byKind('credit')[0]
  const amountH = byKind('amount')[0]
  const balanceCols = new Set(free.filter((s) => s.kind === 'balance').map((s) => s.index))
  if (debitH && creditH) {
    amount = {
      mode: 'debitCredit',
      debit: debitH.index,
      credit: creditH.index,
      foreign,
      confidence: 0.95,
    }
  } else if (amountH) {
    const dir = free.find((s) => s.kind === 'direction' && s.distinct.length <= 3)
    const dv = dir ? dir.distinct.filter((v) => /debit|^dr$|withdraw|^out$|purchase/.test(v)) : []
    if (dir && dv.length > 0 && dir.distinct.some((v) => /credit|^cr$|deposit|^in$/.test(v))) {
      amount = {
        mode: 'directional',
        column: amountH.index,
        direction: dir.index,
        debitValues: dv,
        confidence: 0.8,
      }
    } else {
      amount = { mode: 'signed', column: amountH.index, foreign, confidence: 0.9 }
    }
  } else {
    // No telling header: use the numeric columns' content.
    let cands = free.filter((s) => isNum(s) && !balanceCols.has(s.index))
    // A column that follows the running total of another is a balance.
    for (const b of cands) {
      if (cands.some((a) => a !== b && isRunningBalance(a, b))) balanceCols.add(b.index)
    }
    cands = cands.filter((s) => !balanceCols.has(s.index))
    const rowsN = data.length
    const pair = ((): [ColStat, ColStat] | null => {
      for (let i = 0; i < cands.length; i++)
        for (let j = i + 1; j < cands.length; j++) {
          const a = cands[i]!
          const b = cands[j]!
          let both = 0
          let either = 0
          for (let r = 0; r < rowsN; r++) {
            const x = a.values[r] !== ''
            const y = b.values[r] !== ''
            if (x && y) both++
            if (x || y) either++
          }
          if (both === 0 && either >= rowsN * 0.9 && a.filled > 0 && b.filled > 0) return [a, b]
        }
      return null
    })()
    if (pair) {
      amount = {
        mode: 'debitCredit',
        debit: pair[0].index,
        credit: pair[1].index,
        foreign: null,
        confidence: 0.7,
      }
      for (const s of cands)
        if (s !== pair[0] && s !== pair[1] && s.filled >= rowsN * 0.9) balanceCols.add(s.index)
    } else if (cands.length === 1) {
      const s = cands[0]!
      const vals = s.values.filter((v) => v !== '').map((v) => numeric(v)!)
      const mixed = vals.some((v) => v < 0) && vals.some((v) => v > 0)
      amount = { mode: 'signed', column: s.index, foreign: null, confidence: mixed ? 0.8 : 0.65 }
    } else if (cands.length > 1) {
      // Several always-filled numbers: the amount has the smaller typical size and both signs.
      const med = (s: ColStat) => {
        const v = s.values
          .filter((x) => x !== '')
          .map((x) => Math.abs(numeric(x)!))
          .sort((p, q) => p - q)
        return v[Math.floor(v.length / 2)] ?? 0
      }
      const best = [...cands].sort((a, b) => med(a) - med(b))[0]!
      amount = { mode: 'signed', column: best.index, foreign: null, confidence: 0.45 }
      for (const s of cands) if (s !== best) balanceCols.add(s.index)
      notes.push(
        'Several numeric columns; the one with the smaller amounts was taken as the amount.',
      )
    }
  }
  if (amount) {
    const cols =
      amount.mode === 'debitCredit'
        ? [amount.debit, amount.credit]
        : [amount.column, ...(amount.mode === 'directional' ? [amount.direction] : [])]
    for (const c of cols) used.add(c)
    if ('foreign' in amount && amount.foreign !== null) used.add(amount.foreign)
    if (amount.mode === 'signed') {
      const vals = stats[amount.column]!.values.filter((v) => v !== '').map((v) => numeric(v) ?? 0)
      if (vals.length > 0 && vals.every((v) => v >= 0))
        notes.push(
          'Every amount is positive. If these are purchases on a card, tick "Flip sign" so they import as money out.',
        )
    }
  }

  // Description: header words first, otherwise the longest text column.
  const textual = (s: ColStat) =>
    s.filled > 0 && s.numFraction < 0.5 && s.dateFraction < 0.5 && !used.has(s.index)
  let descCols = stats.filter((s) => s.kind === 'desc' && textual(s)).map((s) => s.index)
  let descConf = descCols.length > 0 ? 0.9 : 0
  if (descCols.length === 0) {
    const t = stats
      .filter((s) => textual(s) && s.kind !== 'category' && s.kind !== 'direction')
      .sort((a, b) => b.avgLen - a.avgLen)
    if (t[0]) {
      descCols = [t[0].index]
      descConf = hasHeader ? 0.55 : 0.6
    }
  }
  descCols = descCols.slice(0, 2).sort((a, b) => a - b)
  for (const c of descCols) used.add(c)

  // Decimal separator from the amount columns.
  const amountCols = amount
    ? amount.mode === 'debitCredit'
      ? [amount.debit, amount.credit]
      : [amount.column]
    : []
  let comma = 0
  let dot = 0
  for (const c of amountCols)
    for (const v of stats[c]!.values) {
      if (/,\d{1,2}\)?-?$/.test(v)) comma++
      else if (/\.\d{1,2}\)?-?$/.test(v)) dot++
    }
  const decimal: '.' | ',' = comma > dot ? ',' : '.'

  const ignored = stats.filter((s) => !used.has(s.index) && s.filled > 0).map((s) => s.index)
  const confidence = Math.min(date?.confidence ?? 0, amount?.confidence ?? 0, descConf)
  if (!date) notes.push('No column looks like a date.')
  if (!amount) notes.push('No column looks like an amount.')
  return {
    hasHeader,
    headerRow: first,
    headerConfidence,
    date,
    amount,
    description: { columns: descCols, confidence: descConf },
    decimal,
    ignored,
    notes,
    confidence,
  }
}
