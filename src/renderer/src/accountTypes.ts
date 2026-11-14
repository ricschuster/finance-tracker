import { Banknote, CreditCard, Landmark, PiggyBank, Wallet, type LucideIcon } from 'lucide-react'
import type { AccountType } from '../../core/ledger/accounts'

const LABELS: Record<AccountType, string> = {
  checking: 'Chequing',
  savings: 'Savings',
  credit_card: 'Credit card',
  cash: 'Cash',
  loan: 'Loan',
  other: 'Other',
}

export const accountTypeLabel = (t: AccountType) => LABELS[t]

export const ACCOUNT_ICONS: Record<AccountType, LucideIcon> = {
  checking: Landmark,
  savings: PiggyBank,
  credit_card: CreditCard,
  cash: Wallet,
  loan: Banknote,
  other: Wallet,
}

/** Sidebar groups, in display order. */
export const ACCOUNT_GROUPS: { label: string; types: AccountType[] }[] = [
  { label: 'Cash', types: ['checking', 'savings', 'cash'] },
  { label: 'Credit cards', types: ['credit_card'] },
  { label: 'Loans', types: ['loan'] },
  { label: 'Other', types: ['other'] },
]

import { formatCents } from '../../core/money'

/** Credit cards and loans hold a negative balance that means money owed. */
export const isLiability = (t: AccountType) => t === 'credit_card' || t === 'loan'

/** Balance text for an account: liabilities read "Owing $X" (or "Credit $X" when overpaid). */
export function balanceText(type: AccountType, balance: number): string {
  if (!isLiability(type)) return formatCents(balance)
  if (balance < 0) return `Owing ${formatCents(-balance)}`
  if (balance > 0) return `Credit ${formatCents(balance)}`
  return formatCents(0)
}
