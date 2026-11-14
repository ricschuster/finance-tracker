import { readSheet } from 'read-excel-file/node'

/** True for a spreadsheet file name; these are converted to CSV text before the import pipeline. */
export const isXlsxName = (name: string): boolean => name.toLowerCase().endsWith('.xlsx')

function csvField(v: unknown): string {
  // Dates in a sheet are midnight UTC; the import pipeline expects ISO dates.
  const s =
    v === null || v === undefined
      ? ''
      : v instanceof Date
        ? v.toISOString().slice(0, 10)
        : typeof v === 'boolean'
          ? v
            ? 'TRUE'
            : 'FALSE'
          : String(v)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * Turn the first sheet of an .xlsx file into CSV text, so spreadsheet exports (for example from
 * Monarch) go through the same detection and mapping as CSV. Only the first sheet is read.
 */
export async function xlsxToCsv(bytes: Uint8Array): Promise<string> {
  let rows: unknown[][]
  try {
    rows = (await readSheet(Buffer.from(bytes))) as unknown[][]
  } catch {
    throw new Error('Could not read this spreadsheet. Save it as CSV and import that instead.')
  }
  return rows.map((r) => r.map(csvField).join(',')).join('\n') + '\n'
}
