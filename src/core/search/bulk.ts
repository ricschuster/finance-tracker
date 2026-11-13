import type Database from 'better-sqlite3'
import {
  deleteTransaction,
  getTransaction,
  updateTransaction,
  type TransactionStatus,
} from '../ledger/transactions'
import { MAX_BULK } from './query'

export type BulkAction =
  | { type: 'setCategory'; categoryId: number }
  | { type: 'addTag'; tag: string }
  | { type: 'removeTag'; tag: string }
  | { type: 'setStatus'; status: TransactionStatus }
  | { type: 'delete' }

export interface BulkResult {
  changed: number
  /** Skipped on purpose: transfers and splits for set category, or ids that no longer exist. */
  skipped: number
}

/**
 * Apply one action to many transactions in one database transaction. Edits go through
 * updateTransaction, so they count as hand edits and rules leave them alone.
 */
export function bulkUpdate(db: Database.Database, ids: number[], action: BulkAction): BulkResult {
  if (ids.length > MAX_BULK) throw new Error(`Bulk actions are limited to ${MAX_BULK} transactions`)
  const unique = [...new Set(ids)]
  return db.transaction(() => {
    if (action.type === 'setCategory') {
      const ok = db.prepare('SELECT 1 FROM categories WHERE id = ?').get(action.categoryId)
      if (!ok) throw new Error(`Category ${action.categoryId} not found`)
    }
    if (action.type === 'addTag' || action.type === 'removeTag') {
      if (!action.tag.trim()) throw new Error('Tag cannot be empty')
    }
    let changed = 0
    let skipped = 0
    for (const id of unique) {
      const t = getTransaction(db, id)
      if (!t) {
        skipped++
        continue
      }
      switch (action.type) {
        case 'delete':
          deleteTransaction(db, id)
          break
        case 'setCategory':
          if (t.transferPeerId !== null || t.lines.length !== 1) {
            skipped++
            continue
          }
          updateTransaction(db, id, {
            lines: [{ categoryId: action.categoryId, amount: t.amount, memo: t.lines[0]!.memo }],
          })
          break
        case 'setStatus':
          if (t.status === action.status) {
            skipped++
            continue
          }
          updateTransaction(db, id, { status: action.status })
          break
        case 'addTag': {
          const tag = action.tag.trim()
          if (t.tags.some((x) => x.toLowerCase() === tag.toLowerCase())) {
            skipped++
            continue
          }
          updateTransaction(db, id, { tags: [...t.tags, tag] })
          break
        }
        case 'removeTag': {
          const tag = action.tag.trim().toLowerCase()
          if (!t.tags.some((x) => x.toLowerCase() === tag)) {
            skipped++
            continue
          }
          updateTransaction(db, id, { tags: t.tags.filter((x) => x.toLowerCase() !== tag) })
          break
        }
      }
      changed++
    }
    return { changed, skipped }
  })()
}
