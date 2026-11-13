import type { PlanItem } from './match'

export interface AccountKind {
  type: 'checking' | 'savings' | 'credit_card' | 'cash' | 'loan' | 'other'
}

/** Warnings that catch mapping mistakes (wrong sign, wrong date format) before anything is written. */
export function sanityWarnings(
  plan: PlanItem[],
  accountType: AccountKind['type'],
  today: string,
): string[] {
  const out: string[] = []
  const added = plan.filter((p) => p.outcome === 'new' && p.candidate.amount !== 0)
  if (added.length >= 5) {
    const positive = added.filter((p) => p.candidate.amount > 0).length / added.length
    if (accountType === 'credit_card' && positive > 0.7) {
      out.push(
        'Most rows are positive for a credit card, so signs may be inverted. Try "Flip sign".',
      )
    } else if ((accountType === 'checking' || accountType === 'savings') && positive > 0.9) {
      out.push('Almost every row is income for this account, so signs may be inverted.')
    }
  }
  const dates = plan.map((p) => p.candidate.date).sort()
  if (dates.length > 0) {
    const first = dates[0]!
    const last = dates[dates.length - 1]!
    if (last > today)
      out.push(`Some dates are in the future (latest ${last}). Check the date format.`)
    const years = (Date.parse(last) - Date.parse(first)) / (365.25 * 86_400_000)
    if (years > 5)
      out.push(
        `Dates span ${Math.round(years)} years (${first} to ${last}). Check the date format.`,
      )
  }
  return out
}
