import { createHash } from 'node:crypto'
import type Database from 'better-sqlite3'

/**
 * SHA-256 of the file text, ignoring a byte order mark and line ending style so the same export
 * saved by two programs or two people still matches. Everything else counts.
 */
export function hashFileText(text: string): string {
  const bomless = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  const normal = bomless.replace(/\r\n?/g, '\n')
  return createHash('sha256').update(normal).digest('hex')
}

export interface KnownFile {
  batchId: number
  sourceName: string
  importedAt: string
}

/** The live batch that already imported this exact file into the account, if any. Undone batches are gone. */
export function findBatchByHash(
  db: Database.Database,
  accountId: number,
  hash: string,
): KnownFile | null {
  const r = db
    .prepare(
      `SELECT id, source_name, imported_at FROM import_batches
       WHERE account_id = ? AND file_hash = ? ORDER BY id DESC LIMIT 1`,
    )
    .get(accountId, hash) as { id: number; source_name: string; imported_at: string } | undefined
  return r ? { batchId: r.id, sourceName: r.source_name, importedAt: r.imported_at } : null
}

export function alreadyImportedWarning(k: KnownFile): string {
  return `This exact file was already imported as "${k.sourceName}" on ${k.importedAt.slice(0, 10)}. Rows it holds will show as duplicates.`
}
