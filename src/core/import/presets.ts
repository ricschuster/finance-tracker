import type { MappingProfile } from './mapping'

export interface Preset {
  id: string
  name: string
  /** Layouts written from memory stay unverified until checked against a real export header. */
  verified: boolean
  config: MappingProfile
}

/**
 * Starting mappings for common Canadian banks. Each is only a starting point the user can edit;
 * the generic mapper covers every other bank.
 */
export const PRESETS: readonly Preset[] = [
  {
    id: 'rbc',
    name: 'RBC (chequing, savings, cards)',
    verified: true,
    config: {
      hasHeader: true,
      headerRow: 0,
      date: { column: 'Transaction Date', format: 'MM/DD/YYYY' },
      amount: { mode: 'signed', column: 'CAD$', foreignColumn: 'USD$' },
      description: ['Description 1', 'Description 2'],
    },
  },
  {
    id: 'td',
    name: 'TD (headerless: date, description, debit, credit, balance)',
    verified: true,
    config: {
      hasHeader: false,
      headerRow: 0,
      date: { column: 0, format: 'MM/DD/YYYY' },
      amount: { mode: 'debitCredit', debit: 2, credit: 3 },
      description: [1],
    },
  },
  {
    id: 'tangerine',
    name: 'Tangerine',
    verified: true,
    config: {
      hasHeader: true,
      headerRow: 0,
      date: { column: 'Date', format: 'MM/DD/YYYY' },
      amount: { mode: 'signed', column: 'Amount' },
      description: ['Name', 'Memo'],
    },
  },
]

/**
 * A preset whose header names all appear in the given header row, or null. Only presets with a
 * header can be recognised this way; headerless layouts are left to the guesser.
 */
export function matchPresetByHeader(header: string[]): Preset | null {
  const names = new Set(header.map((h) => h.trim().toLowerCase()))
  const refs = (p: MappingProfile): string[] => {
    const a = p.amount
    const cols = [
      p.date.column,
      ...p.description,
      ...(a.mode === 'debitCredit' ? [a.debit, a.credit] : [a.column]),
    ]
    return cols.filter((c): c is string => typeof c === 'string')
  }
  for (const p of PRESETS) {
    if (!p.config.hasHeader) continue
    const r = refs(p.config)
    if (r.length > 0 && r.every((c) => names.has(c.trim().toLowerCase()))) return p
  }
  return null
}
