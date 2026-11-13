export type DateFormat =
  | 'YYYY-MM-DD'
  | 'YYYY/MM/DD'
  | 'MM/DD/YYYY'
  | 'DD/MM/YYYY'
  | 'DD-MM-YYYY'
  | 'MM-DD-YYYY'
  | 'DD-Mon-YYYY'
  | 'YYYYMMDD'

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

function valid(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || y < 1900 || y > 2200) return null
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** Parse a date string in the given format to ISO `YYYY-MM-DD`, or null when invalid. */
export function parseDate(input: string, format: DateFormat): string | null {
  const s = input.trim()
  let m: RegExpExecArray | null
  switch (format) {
    case 'YYYY-MM-DD':
      m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(s)
      return m ? valid(+m[1]!, +m[2]!, +m[3]!) : null
    case 'YYYY/MM/DD':
      m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(s)
      return m ? valid(+m[1]!, +m[2]!, +m[3]!) : null
    case 'MM/DD/YYYY':
      m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s)
      return m ? valid(+m[3]!, +m[1]!, +m[2]!) : null
    case 'DD/MM/YYYY':
      m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s)
      return m ? valid(+m[3]!, +m[2]!, +m[1]!) : null
    case 'MM-DD-YYYY':
      m = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(s)
      return m ? valid(+m[3]!, +m[1]!, +m[2]!) : null
    case 'DD-MM-YYYY':
      m = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(s)
      return m ? valid(+m[3]!, +m[2]!, +m[1]!) : null
    case 'DD-Mon-YYYY': {
      m = /^(\d{1,2})[- ]([A-Za-z]{3})[a-z]*[- ,]+(\d{4})$/.exec(s)
      if (!m) return null
      const mon = MONTHS.indexOf(m[2]!.toLowerCase()) + 1
      return mon ? valid(+m[3]!, mon, +m[1]!) : null
    }
    case 'YYYYMMDD':
      m = /^(\d{4})(\d{2})(\d{2})$/.exec(s)
      return m ? valid(+m[1]!, +m[2]!, +m[3]!) : null
  }
}

const ALL_FORMATS: DateFormat[] = [
  'YYYY-MM-DD',
  'YYYY/MM/DD',
  'MM/DD/YYYY',
  'DD/MM/YYYY',
  'MM-DD-YYYY',
  'DD-MM-YYYY',
  'DD-Mon-YYYY',
  'YYYYMMDD',
]

export interface DateFormatGuess {
  /** Formats under which every non-blank value parses. */
  candidates: DateFormat[]
  /** The single format when unambiguous, otherwise null (ask the user). */
  format: DateFormat | null
}

/** Suggest a format by scanning a column. Day-first and month-first are told apart by values above 12. */
export function guessDateFormat(values: string[]): DateFormatGuess {
  const sample = values.map((v) => v.trim()).filter((v) => v !== '')
  if (sample.length === 0) return { candidates: [], format: null }
  const candidates = ALL_FORMATS.filter((f) => sample.every((v) => parseDate(v, f) !== null))
  return { candidates, format: candidates.length === 1 ? candidates[0]! : null }
}
