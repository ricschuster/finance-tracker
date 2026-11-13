import { parse } from 'csv-parse/sync'

export const MAX_FILE_BYTES = 20 * 1024 * 1024
export const MAX_ROWS = 100_000

export type Delimiter = ',' | ';' | '\t'

export interface ParsedCsv {
  delimiter: Delimiter
  /** Non-blank rows of raw strings. Rows may have differing lengths. */
  rows: string[][]
}

/** Decode bytes as UTF-8 (BOM stripped), falling back to Windows-1252. */
export function decodeBytes(bytes: Uint8Array): string {
  if (bytes.length > MAX_FILE_BYTES) {
    throw new Error(`File is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB`)
  }
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    text = new TextDecoder('windows-1252').decode(bytes)
  }
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

/** Pick the delimiter that appears most consistently outside quotes in the first lines. */
export function sniffDelimiter(text: string): Delimiter {
  const lines = text.split(/\r\n|\n|\r/).filter((l) => l.trim() !== '')
  const sample = lines.slice(0, 10)
  const candidates: Delimiter[] = [',', ';', '\t']
  let best: Delimiter = ','
  let bestScore = 0
  for (const d of candidates) {
    const counts = sample.map((l) => countOutsideQuotes(l, d))
    const min = Math.min(...counts, 0)
    const nonZero = counts.filter((c) => c > 0).length
    // Prefer delimiters present on every sampled line, then the highest count.
    const score = min > 0 ? 1000 + min : nonZero
    if (score > bestScore) {
      best = d
      bestScore = score
    }
  }
  return best
}

function countOutsideQuotes(line: string, d: string): number {
  let inQuotes = false
  let n = 0
  for (const ch of line) {
    if (ch === '"') inQuotes = !inQuotes
    else if (ch === d && !inQuotes) n++
  }
  return n
}

export function parseCsv(text: string, delimiter?: Delimiter): ParsedCsv {
  const d = delimiter ?? sniffDelimiter(text)
  const records = parse(text, {
    delimiter: d,
    relax_column_count: true,
    relax_quotes: true,
    skip_empty_lines: true,
    trim: false,
    bom: true,
  }) as string[][]
  const rows = records.filter((r) => r.some((c) => c.trim() !== ''))
  if (rows.length > MAX_ROWS) throw new Error(`File has more than ${MAX_ROWS} rows`)
  return { delimiter: d, rows }
}

/** Index of the first row that looks like a header or data row: the first with the modal width. */
export function guessHeaderRow(rows: string[][]): number {
  if (rows.length === 0) return 0
  const widths = new Map<number, number>()
  for (const r of rows.slice(0, 50)) widths.set(r.length, (widths.get(r.length) ?? 0) + 1)
  let modal = 0
  let modalCount = 0
  for (const [w, c] of widths) {
    if (c > modalCount || (c === modalCount && w > modal)) {
      modal = w
      modalCount = c
    }
  }
  const idx = rows.findIndex((r) => r.length === modal)
  return idx < 0 ? 0 : idx
}
