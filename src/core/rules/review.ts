import type Database from 'better-sqlite3'
import { guessFromHistory, loadHistory } from '../import/enrich'
import { searchTransactions } from '../search/query'
import type { Transaction } from '../ledger/transactions'

export interface ReviewItem {
  transaction: Transaction
  /** What the same description was filed under before, when earlier rows mostly agree. */
  guess: { categoryId: number; categoryName: string; agree: number; of: number } | null
}

/**
 * Uncategorized, unsplit, non-transfer transactions, newest first, each with a guess from the
 * user's own filing history. Reads only; the review screen applies choices through the normal
 * `updateTransaction`, so edits are locked against rules like any hand edit.
 */
export function reviewQueue(db: Database.Database, limit = 500): ReviewItem[] {
  const { transactions } = searchTransactions(db, {
    uncategorized: true,
    excludeTransfers: true,
    limit,
  })
  const history = loadHistory(db)
  const names = new Map(
    (db.prepare('SELECT id, name FROM categories').all() as { id: number; name: string }[]).map(
      (c) => [c.id, c.name],
    ),
  )
  return transactions
    .filter((t) => t.lines.length === 1)
    .map((t) => {
      const g = guessFromHistory(history, t.rawDescription, t.amount)
      return {
        transaction: t,
        guess: g
          ? { categoryId: g.id, categoryName: names.get(g.id) ?? '', agree: g.agree, of: g.of }
          : null,
      }
    })
}
