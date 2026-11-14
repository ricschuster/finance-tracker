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
