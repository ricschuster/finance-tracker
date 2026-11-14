import { mapRows, type ForeignPolicy, type MappingProfile } from './mapping'

export interface MappingPreviewRow {
  /** One-based line number, as in the import errors. */
  line: number
  cells: string[]
  ok: boolean
  date?: string
  /** Signed integer cents, expenses negative. */
  amount?: number
  description?: string
  /** Why the row cannot be imported, or why it is left out. */
  message?: string
}

export interface MappingPreview {
  rows: MappingPreviewRow[]
  /** Set when the mapping as a whole cannot be applied (for example a missing column). */
  error: string | null
  failed: number
  total: number
}

/** Apply a mapping to the first rows only, to show how they will be read before anything is saved. */
export function previewMapping(
  rows: string[][],
  profile: MappingProfile,
  options: { limit?: number; foreign?: ForeignPolicy } = {},
): MappingPreview {
  const limit = options.limit ?? 10
  const first = profile.hasHeader ? profile.headerRow + 1 : profile.headerRow
  const slice = rows.slice(0, first + limit)
  try {
    const mapped = mapRows(slice, profile, { foreign: options.foreign ?? 'skip' })
    const byLine = new Map<number, MappingPreviewRow>()
    for (const c of mapped.candidates)
      byLine.set(c.line, {
        line: c.line,
        cells: slice[c.line - 1] ?? [],
        ok: true,
        date: c.date,
        amount: c.amount,
        description: c.rawDescription,
      })
    for (const e of mapped.errors)
      byLine.set(e.line, {
        line: e.line,
        cells: slice[e.line - 1] ?? [],
        ok: false,
        message: e.message,
      })
    for (const e of mapped.skippedForeign)
      byLine.set(e.line, {
        line: e.line,
        cells: slice[e.line - 1] ?? [],
        ok: false,
        message: e.message,
      })
    const out = [...byLine.values()].sort((a, b) => a.line - b.line)
    return { rows: out, error: null, failed: out.filter((r) => !r.ok).length, total: out.length }
  } catch (e) {
    return { rows: [], error: e instanceof Error ? e.message : String(e), failed: 0, total: 0 }
  }
}
