import type Database from 'better-sqlite3'

export interface CsvExportFilter {
  /** Inclusive ISO dates. */
  from?: string
  to?: string
}

export const CSV_COLUMNS = [
  'Transaction ID',
  'Date',
  'Account',
  'Payee',
  'Description',
  'Amount',
  'Category',
  'Memo',
  'Tags',
  'Notes',
  'Status',
  'Transfer',
] as const

/** Quote per RFC 4180, and defuse spreadsheet formulas (text that would start with = + - @ or tab). */
export function csvField(value: string): string {
  let v = value
  if (/^[=+@\t\r]/.test(v) || (/^-/.test(v) && !/^-\d+(\.\d+)?$/.test(v))) v = `'${v}`
  return /[",\r\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v
}

const dollars = (cents: number) => (cents / 100).toFixed(2)

interface Row {
  id: number
  date: string
  account: string
  payee: string
  raw: string
  amount: number
  category: string
  memo: string
  tags: string | null
  notes: string
  status: string
  transfer: number
}

/** One row per split line (ADR 0003), so each keeps its own category and amount. Header always present. */
export function exportTransactionsCsv(db: Database.Database, filter: CsvExportFilter = {}): string {
  const rows = db
    .prepare(
      `SELECT t.id, t.date, a.name AS account, t.payee, t.raw_description AS raw, l.amount,
              CASE WHEN p.name IS NULL THEN c.name ELSE p.name || ': ' || c.name END AS category,
              l.memo,
              (SELECT group_concat(g.name, ', ') FROM transaction_tags tt
                 JOIN tags g ON g.id = tt.tag_id WHERE tt.transaction_id = t.id) AS tags,
              t.notes, t.status, (t.transfer_peer_id IS NOT NULL) AS transfer
         FROM transactions t
         JOIN accounts a ON a.id = t.account_id
         JOIN transaction_lines l ON l.transaction_id = t.id
         JOIN categories c ON c.id = l.category_id
         LEFT JOIN categories p ON p.id = c.parent_id
        WHERE (@from IS NULL OR t.date >= @from) AND (@to IS NULL OR t.date <= @to)
        ORDER BY t.date, t.id, l.id`,
    )
    .all({ from: filter.from ?? null, to: filter.to ?? null }) as Row[]
  const lines = [CSV_COLUMNS.join(',')]
  for (const r of rows) {
    lines.push(
      [
        String(r.id),
        r.date,
        r.account,
        r.payee,
        r.raw,
        dollars(r.amount),
        r.category,
        r.memo,
        r.tags ?? '',
        r.notes,
        r.status,
        r.transfer ? 'yes' : '',
      ]
        .map(csvField)
        .join(','),
    )
  }
  return lines.join('\r\n') + '\r\n'
}
