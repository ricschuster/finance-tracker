/** An inclusive date range of ISO `YYYY-MM-DD` strings. No time zones. */
export interface Period {
  from: string
  to: string
}

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (d: Date) => d.toISOString().slice(0, 10)
const parse = (s: string) => new Date(`${s}T00:00:00Z`)

export function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** `month` is 1 to 12. */
export function monthPeriod(year: number, month: number): Period {
  return {
    from: `${year}-${pad(month)}-01`,
    to: `${year}-${pad(month)}-${pad(lastDayOfMonth(year, month))}`,
  }
}

/** `quarter` is 1 to 4. */
export function quarterPeriod(year: number, quarter: number): Period {
  const first = (quarter - 1) * 3 + 1
  return { from: monthPeriod(year, first).from, to: monthPeriod(year, first + 2).to }
}

export function yearPeriod(year: number): Period {
  return { from: `${year}-01-01`, to: `${year}-12-31` }
}

/** The period of equal length that ends the day before `p` starts. */
export function previousPeriod(p: Period): Period {
  const from = parse(p.from)
  const days = Math.round((parse(p.to).getTime() - from.getTime()) / 86_400_000) + 1
  const to = new Date(from.getTime() - 86_400_000)
  return { from: iso(new Date(to.getTime() - (days - 1) * 86_400_000)), to: iso(to) }
}

/** Every `YYYY-MM` from the month of `from` to the month of `to`, inclusive. */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = []
  let y = Number(from.slice(0, 4))
  let m = Number(from.slice(5, 7))
  const endY = Number(to.slice(0, 4))
  const endM = Number(to.slice(5, 7))
  while (y < endY || (y === endY && m <= endM)) {
    out.push(`${y}-${pad(m)}`)
    if (++m > 12) {
      m = 1
      y++
    }
  }
  return out
}

/** The same month one step back, as `{ year, month }`. */
export function shiftMonth(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const idx = year * 12 + (month - 1) + delta
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 }
}
