import { useCallback, useEffect, useState } from 'react'
import type { AccountWithBalance } from '../../core/ledger/accounts'
import type { Category } from '../../core/ledger/categories'
import type { Transaction } from '../../core/ledger/transactions'

export interface LedgerState {
  accounts: AccountWithBalance[]
  categories: Category[]
  transactions: Transaction[]
  error: string | null
  /** Bumps after every reload, so views with their own queries can refetch. */
  version: number
  /** Run a mutation, then reload; surfaces any error in `error`. */
  run: (action: () => Promise<unknown>) => Promise<boolean>
  clearError: () => void
}

/** Loads accounts, categories and the transaction list for the selected account (null = all). */
export function useLedger(accountId: number | null): LedgerState {
  const [accounts, setAccounts] = useState<AccountWithBalance[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  const reload = useCallback(async () => {
    const { ledger } = window.api
    const [a, c, t] = await Promise.all([
      ledger.listAccounts(),
      ledger.listCategories(),
      ledger.listTransactions(accountId === null ? { limit: 500 } : { accountId, limit: 500 }),
    ])
    setAccounts(a)
    setCategories(c)
    setTransactions(t)
    setVersion((v) => v + 1)
  }, [accountId])

  useEffect(() => {
    reload().catch((e: unknown) => setError(messageOf(e)))
  }, [reload])

  const run = useCallback(
    async (action: () => Promise<unknown>) => {
      try {
        await action()
        setError(null)
        await reload()
        return true
      } catch (e) {
        setError(messageOf(e))
        return false
      }
    },
    [reload],
  )

  return {
    accounts,
    categories,
    transactions,
    error,
    version,
    run,
    clearError: () => setError(null),
  }
}

/** Electron wraps IPC errors as "Error invoking remote method '...': Error: <message>". */
function messageOf(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  return msg.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}
