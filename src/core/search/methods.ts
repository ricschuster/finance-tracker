/** Names of the search API methods shared by main (handlers) and preload (bridge). No imports on purpose. */
export const SEARCH_METHODS = [
  'searchTransactions',
  'searchTransactionIds',
  'listSavedSearches',
  'saveSearch',
  'deleteSavedSearch',
  'bulkUpdate',
  'deleteMatching',
] as const

export type SearchMethod = (typeof SEARCH_METHODS)[number]
