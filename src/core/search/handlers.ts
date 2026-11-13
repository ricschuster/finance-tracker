import type Database from 'better-sqlite3'
import { bulkUpdate, type BulkAction } from './bulk'
import type { SearchMethod } from './methods'
import { searchTransactionIds, searchTransactions, type SearchQuery } from './query'
import { deleteSavedSearch, listSavedSearches, saveSearch } from './saved'

/** The search API as plain functions over a database, exposed over IPC unchanged. */
export function createSearchHandlers(db: Database.Database) {
  return {
    searchTransactions: (q?: SearchQuery) => searchTransactions(db, q),
    searchTransactionIds: (q?: SearchQuery) => searchTransactionIds(db, q),
    listSavedSearches: () => listSavedSearches(db),
    saveSearch: (name: string, query: SearchQuery) => saveSearch(db, name, query),
    deleteSavedSearch: (id: number) => deleteSavedSearch(db, id),
    bulkUpdate: (ids: number[], action: BulkAction) => bulkUpdate(db, ids, action),
  } satisfies Record<SearchMethod, (...args: never[]) => unknown>
}

export type SearchHandlers = ReturnType<typeof createSearchHandlers>

/** The renderer-side view: every handler becomes async. */
export type SearchApi = {
  [K in keyof SearchHandlers]: (
    ...args: Parameters<SearchHandlers[K]>
  ) => Promise<ReturnType<SearchHandlers[K]>>
}
