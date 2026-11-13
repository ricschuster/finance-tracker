/** Names of the ledger API methods shared by main (handlers) and preload (bridge). No imports on purpose. */
export const LEDGER_METHODS = [
  'listAccounts',
  'createAccount',
  'updateAccount',
  'listCategories',
  'createCategory',
  'renameCategory',
  'deleteCategory',
  'listTags',
  'getTransaction',
  'listTransactions',
  'createTransaction',
  'updateTransaction',
  'deleteTransaction',
  'createTransfer',
] as const

export type LedgerMethod = (typeof LEDGER_METHODS)[number]
