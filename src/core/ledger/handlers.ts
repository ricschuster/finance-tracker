import type Database from 'better-sqlite3'
import {
  accountImpact,
  createAccount,
  deleteAccount,
  listAccountsWithBalance,
  updateAccount,
} from './accounts'
import {
  categoryUsage,
  createCategory,
  deleteCategory,
  listCategories,
  renameCategory,
} from './categories'
import type { LedgerMethod } from './methods'
import { listTags } from './tags'
import {
  createTransaction,
  createTransfer,
  deleteTransaction,
  getTransaction,
  listTransactions,
  updateTransaction,
} from './transactions'

/**
 * The ledger API as plain functions over a database. Arguments and results are
 * structured-clone safe, so main can expose each one over IPC unchanged.
 */
export function createLedgerHandlers(db: Database.Database) {
  return {
    listAccounts: (opts?: Parameters<typeof listAccountsWithBalance>[1]) =>
      listAccountsWithBalance(db, opts),
    createAccount: (input: Parameters<typeof createAccount>[1]) => createAccount(db, input),
    updateAccount: (id: number, patch: Parameters<typeof updateAccount>[2]) =>
      updateAccount(db, id, patch),
    deleteAccount: (id: number, opts?: Parameters<typeof deleteAccount>[2]) =>
      deleteAccount(db, id, opts),
    accountImpact: (id: number) => accountImpact(db, id),
    listCategories: () => listCategories(db),
    createCategory: (input: Parameters<typeof createCategory>[1]) => createCategory(db, input),
    renameCategory: (id: number, name: string) => renameCategory(db, id, name),
    deleteCategory: (id: number, reassignTo?: number) => deleteCategory(db, id, reassignTo),
    categoryUsage: () => categoryUsage(db),
    listTags: () => listTags(db),
    getTransaction: (id: number) => getTransaction(db, id) ?? null,
    listTransactions: (filter?: Parameters<typeof listTransactions>[1]) =>
      listTransactions(db, filter),
    createTransaction: (input: Parameters<typeof createTransaction>[1]) =>
      createTransaction(db, input),
    updateTransaction: (id: number, patch: Parameters<typeof updateTransaction>[2]) =>
      updateTransaction(db, id, patch),
    deleteTransaction: (id: number) => deleteTransaction(db, id),
    createTransfer: (input: Parameters<typeof createTransfer>[1]) => createTransfer(db, input),
  } satisfies Record<LedgerMethod, (...args: never[]) => unknown>
}

export type LedgerHandlers = ReturnType<typeof createLedgerHandlers>

/** The renderer-side view: every handler becomes async. */
export type LedgerApi = {
  [K in keyof LedgerHandlers]: (
    ...args: Parameters<LedgerHandlers[K]>
  ) => Promise<ReturnType<LedgerHandlers[K]>>
}
