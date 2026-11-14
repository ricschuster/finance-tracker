import type { AccountType } from '../ledger/accounts'

/** Best guess at an account type from the name an outside export gives it; the user can change it later. */
export function guessAccountType(name: string): AccountType {
  const n = name.toLowerCase()
  if (/credit|visa|mastercard|master card|amex|american express|card/.test(n)) return 'credit_card'
  if (/saving|tfsa|rrsp|fhsa|cash management/.test(n)) return 'savings'
  if (/loan|mortgage|line of credit|loc\b/.test(n)) return 'loan'
  if (/\bcash\b/.test(n)) return 'cash'
  return 'checking'
}
