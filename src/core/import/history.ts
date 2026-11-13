import type Database from 'better-sqlite3'

export interface BatchSummary {
  id: number
  accountId: number
  accountName: string
  sourceName: string
  format: string
  importedAt: string
  rowsTotal: number
  rowsAdded: number
  rowsMerged: number
  rowsSkipped: number
  rowsError: number
  /** Date range of the rows this batch added, or null when it added none. */
  firstDate: string | null
  lastDate: string | null
}

export function listBatches(db: Database.Database): BatchSummary[] {
  const rows = db
    .prepare(
      `SELECT b.*, a.name AS account_name,
              (SELECT MIN(date) FROM transactions t WHERE t.import_batch_id = b.id) AS first_date,
              (SELECT MAX(date) FROM transactions t WHERE t.import_batch_id = b.id) AS last_date
       FROM import_batches b JOIN accounts a ON a.id = b.account_id
       ORDER BY b.id DESC`,
    )
    .all() as Array<Record<string, string | number | null>>
  return rows.map((r) => ({
    id: r.id as number,
    accountId: r.account_id as number,
    accountName: r.account_name as string,
    sourceName: r.source_name as string,
    format: r.format as string,
    importedAt: r.imported_at as string,
    rowsTotal: r.rows_total as number,
    rowsAdded: r.rows_added as number,
    rowsMerged: r.rows_merged as number,
    rowsSkipped: r.rows_skipped as number,
    rowsError: r.rows_error as number,
    firstDate: r.first_date as string | null,
    lastDate: r.last_date as string | null,
  }))
}

export interface BatchRow {
  id: number
  date: string
  amount: number
  rawDescription: string
  edited: boolean
}

/** Rows the batch added. */
export function getBatchRows(db: Database.Database, batchId: number): BatchRow[] {
  const rows = db
    .prepare(
      `SELECT id, date, amount, raw_description, edited_fields FROM transactions
       WHERE import_batch_id = ? ORDER BY date, id`,
    )
    .all(batchId) as Array<{
    id: number
    date: string
    amount: number
    raw_description: string
    edited_fields: string
  }>
  return rows.map((r) => ({
    id: r.id,
    date: r.date,
    amount: r.amount,
    rawDescription: r.raw_description,
    edited: r.edited_fields !== '[]',
  }))
}

export interface UndoPreview {
  added: number
  /** Added rows edited by hand since the import. */
  edited: number
  merged: number
}

export function previewUndo(db: Database.Database, batchId: number): UndoPreview {
  const rows = getBatchRows(db, batchId)
  const merged = (
    db
      .prepare("SELECT COUNT(*) AS n FROM import_changes WHERE batch_id = ? AND kind = 'merge'")
      .get(batchId) as { n: number }
  ).n
  return { added: rows.length, edited: rows.filter((r) => r.edited).length, merged }
}

export interface UndoResult {
  deleted: number
  keptEdited: number
  restored: number
}

/**
 * Undo a batch: delete the rows it added and restore merged fields and transfer links.
 * Rows edited by hand are kept unless `deleteEdited` is set; the caller learns the count first via `previewUndo`.
 */
export function undoBatch(
  db: Database.Database,
  batchId: number,
  options: { deleteEdited?: boolean } = {},
): UndoResult {
  return db.transaction(() => {
    const exists = db.prepare('SELECT 1 FROM import_batches WHERE id = ?').get(batchId)
    if (!exists) throw new Error(`Import batch ${batchId} not found`)
    const rows = getBatchRows(db, batchId)
    const keep = new Set(options.deleteEdited ? [] : rows.filter((r) => r.edited).map((r) => r.id))

    const changes = db
      .prepare(
        'SELECT transaction_id, kind, before FROM import_changes WHERE batch_id = ? ORDER BY id DESC',
      )
      .all(batchId) as Array<{ transaction_id: number; kind: string; before: string }>
    let restored = 0
    for (const ch of changes) {
      const before = JSON.parse(ch.before) as Record<string, unknown>
      if (ch.kind === 'merge') {
        const b = before as { raw_description: string; status: string; external_id: string | null }
        db.prepare(
          `UPDATE transactions SET raw_description = ?, status = ?, external_id = ?,
             updated_at = datetime('now') WHERE id = ?`,
        ).run(b.raw_description, b.status, b.external_id, ch.transaction_id)
        restored++
      } else if (!keep.has(ch.transaction_id)) {
        const b = before as { peerId: number; lines: Array<{ id: number; category_id: number }> }
        const setCat = db.prepare('UPDATE transaction_lines SET category_id = ? WHERE id = ?')
        for (const l of b.lines) setCat.run(l.category_id, l.id)
        db.prepare('UPDATE transactions SET transfer_peer_id = NULL WHERE id = ?').run(b.peerId)
        db.prepare('UPDATE transactions SET transfer_peer_id = NULL WHERE id = ?').run(
          ch.transaction_id,
        )
        restored++
      }
    }

    const del = db.prepare('DELETE FROM transactions WHERE id = ?')
    let deleted = 0
    for (const r of rows) {
      if (keep.has(r.id)) continue
      del.run(r.id)
      deleted++
    }
    db.prepare('DELETE FROM import_batches WHERE id = ?').run(batchId)
    return { deleted, keptEdited: keep.size, restored }
  })()
}
