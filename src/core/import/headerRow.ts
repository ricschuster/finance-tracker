// Kept apart from csv.ts so the renderer can use it without pulling in csv-parse.

/**
 * Index of the first row that looks like a header or data row: the first at least as wide as the
 * modal width. "At least" matters because some banks (RBC) drop trailing empty cells from data
 * rows, so the header is wider than every row below it and would never match the modal width.
 */
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
  const idx = rows.findIndex((r) => r.length >= modal)
  return idx < 0 ? 0 : idx
}
