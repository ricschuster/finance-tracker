import type Database from 'better-sqlite3'
import { createTransaction } from '../ledger/transactions'
import { applyRules } from '../rules/apply'
import type { Candidate } from './mapping'
import type { ExistingTxn } from './match'

export type ImportFormat = 'csv' | 'ofx' | 'mint'

/** One decision per candidate, after the user has reviewed the plan. */
export interface ImportDecision {
  candidate: Candidate
  action: 'add' | 'merge' | 'skip'
  /** Required for `merge`: the existing transaction to enrich. */
  matchId?: number
  /** Optional for `add`: an opposite row in another account to link as a transfer. */
  linkTransferId?: number
}

export interface CommitInput {
  accountId: number
  sourceName: string
  format: ImportFormat
  profileId?: number | null
  /** From `hashFileText`; lets a later preview warn that this file was already imported. */
  fileHash?: string | null
  decisions: ImportDecision[]
  /** Rows that failed mapping or were skipped as foreign; only counted. */
  rowsError?: number
  rowsTotal?: number
}

export interface CommitResult {
  batchId: number
  added: number
  merged: number
  skipped: number
}

/** Snapshot of the ledger for matching: every transaction, as the matcher needs it. */
export function loadExistingForMatching(db: Database.Database): ExistingTxn[] {
  const rows = db
    .prepare(
      `SELECT id, account_id, date, amount, raw_description, external_id, import_batch_id, transfer_peer_id
       FROM transactions`,
    )
    .all() as Array<{
    id: number
    account_id: number
    date: string
    amount: number
    raw_description: string
    external_id: string | null
    import_batch_id: number | null
    transfer_peer_id: number | null
  }>
  return rows.map((r) => ({
    id: r.id,
    accountId: r.account_id,
    date: r.date,
    amount: r.amount,
    rawDescription: r.raw_description,
    externalId: r.external_id,
    imported: r.import_batch_id !== null,
    transferPeerId: r.transfer_peer_id,
  }))
}

interface MergeBefore {
  raw_description: string
  status: string
  external_id: string | null
}

interface TransferBefore {
  peerId: number
  lines: Array<{ id: number; category_id: number }>
  newLines: Array<{ id: number; category_id: number }>
}

/**
 * Category ids are matched by name (unique, case-insensitive), then by saved alias, so an outside
 * name such as a Mint subcategory can point at one of our categories. Unknown names give null.
 */
export function categoryIdByName(db: Database.Database, name: string): number | null {
  const key = name.trim()
  const r = db
    .prepare(
      `SELECT id FROM categories WHERE name = ? COLLATE NOCASE
       UNION ALL SELECT category_id FROM category_aliases WHERE alias = ? COLLATE NOCASE LIMIT 1`,
    )
    .get(key, key) as { id: number } | undefined
  return r?.id ?? null
}

function transferCategoryId(db: Database.Database): number {
  return (
    db.prepare("SELECT id FROM categories WHERE name = 'Transfer' AND parent_id IS NULL").get() as {
      id: number
    }
  ).id
}

/** Apply reviewed decisions in one database transaction and record the batch. Nothing is left behind on failure. */
export function commitImport(db: Database.Database, input: CommitInput): CommitResult {
  return db.transaction(() => {
    const batchId = Number(
      db
        .prepare(
          'INSERT INTO import_batches (account_id, source_name, format, profile_id, file_hash) VALUES (?, ?, ?, ?, ?)',
        )
        .run(
          input.accountId,
          input.sourceName,
          input.format,
          input.profileId ?? null,
          input.fileHash ?? null,
        ).lastInsertRowid,
    )
    const change = db.prepare(
      'INSERT INTO import_changes (batch_id, transaction_id, kind, before) VALUES (?, ?, ?, ?)',
    )
    const claimed = new Set<number>()
    const idTaken = db.prepare(
      'SELECT 1 FROM transactions WHERE account_id = ? AND external_id = ?',
    )
    // A bank id that is already used in this account (reused by the bank, or repeated in one file)
    // is dropped for this row so the unique index cannot abort the whole import.
    const usableId = (id: string | null): string | null =>
      id !== null && !idTaken.get(input.accountId, id) ? id : null
    const addedIds: number[] = []
    let added = 0
    let merged = 0
    let skipped = 0

    for (const d of input.decisions) {
      const c = d.candidate
      if (d.action === 'skip') {
        skipped++
        continue
      }
      if (d.action === 'merge') {
        if (d.matchId === undefined) throw new Error('Merge needs a matchId')
        if (claimed.has(d.matchId)) throw new Error(`Transaction ${d.matchId} merged twice`)
        claimed.add(d.matchId)
        const row = db
          .prepare(
            'SELECT account_id, raw_description, status, external_id, edited_fields FROM transactions WHERE id = ?',
          )
          .get(d.matchId) as
          (MergeBefore & { account_id: number; edited_fields: string }) | undefined
        if (!row || row.account_id !== input.accountId) {
          throw new Error(`Cannot merge into transaction ${d.matchId}`)
        }
        change.run(
          batchId,
          d.matchId,
          'merge',
          JSON.stringify({
            raw_description: row.raw_description,
            status: row.status,
            external_id: row.external_id,
          } satisfies MergeBefore),
        )
        const edited = JSON.parse(row.edited_fields) as string[]
        const status =
          edited.includes('status') || row.status === 'reconciled' ? row.status : c.status
        const externalId = row.external_id ?? usableId(c.externalId)
        db.prepare(
          `UPDATE transactions SET raw_description = ?, status = ?, external_id = ?,
             updated_at = datetime('now') WHERE id = ?`,
        ).run(c.rawDescription || row.raw_description, status, externalId, d.matchId)
        merged++
        continue
      }

      const categoryId = c.categoryName ? categoryIdByName(db, c.categoryName) : null
      const id = createTransaction(db, {
        accountId: input.accountId,
        date: c.date,
        amount: c.amount,
        rawDescription: c.rawDescription,
        payee: c.payee,
        notes: c.memo,
        status: c.status,
        ...(c.tags && c.tags.length > 0 && { tags: c.tags }),
        ...(categoryId !== null && { lines: [{ categoryId, amount: c.amount }] }),
      })
      db.prepare('UPDATE transactions SET external_id = ?, import_batch_id = ? WHERE id = ?').run(
        usableId(c.externalId),
        batchId,
        id,
      )
      if (d.linkTransferId !== undefined) linkTransfer(db, batchId, id, d.linkTransferId, change)
      addedIds.push(id)
      added++
    }
    // Rules run inside the same database transaction, so undoing the batch removes the rows.
    if (addedIds.length) applyRules(db, { ids: addedIds })

    db.prepare(
      `UPDATE import_batches SET rows_total = ?, rows_added = ?, rows_merged = ?,
         rows_skipped = ?, rows_error = ? WHERE id = ?`,
    ).run(
      input.rowsTotal ?? input.decisions.length + (input.rowsError ?? 0),
      added,
      merged,
      skipped,
      input.rowsError ?? 0,
      batchId,
    )
    return { batchId, added, merged, skipped }
  })()
}

function linkTransfer(
  db: Database.Database,
  batchId: number,
  newId: number,
  peerId: number,
  change: Database.Statement,
): void {
  const a = db.prepare('SELECT account_id, amount, transfer_peer_id FROM transactions WHERE id = ?')
  const mine = a.get(newId) as {
    account_id: number
    amount: number
    transfer_peer_id: number | null
  }
  const peer = a.get(peerId) as
    { account_id: number; amount: number; transfer_peer_id: number | null } | undefined
  if (!peer) throw new Error(`Transfer peer ${peerId} not found`)
  if (peer.account_id === mine.account_id) throw new Error('Transfer needs two different accounts')
  if (peer.amount !== -mine.amount) throw new Error('Transfer amounts must be opposite')
  if (peer.transfer_peer_id !== null) throw new Error('Peer is already part of a transfer')

  const lines = (id: number) =>
    db
      .prepare('SELECT id, category_id FROM transaction_lines WHERE transaction_id = ?')
      .all(id) as Array<{
      id: number
      category_id: number
    }>
  const peerLines = lines(peerId)
  const newLines = lines(newId)
  if (peerLines.length !== 1) throw new Error('Cannot link a split transaction as a transfer')

  const transfer = transferCategoryId(db)
  const setCat = db.prepare('UPDATE transaction_lines SET category_id = ? WHERE id = ?')
  for (const l of [...peerLines, ...newLines]) setCat.run(transfer, l.id)
  const link = db.prepare('UPDATE transactions SET transfer_peer_id = ? WHERE id = ?')
  link.run(peerId, newId)
  link.run(newId, peerId)
  change.run(
    batchId,
    newId,
    'transfer',
    JSON.stringify({ peerId, lines: peerLines, newLines } satisfies TransferBefore),
  )
}
