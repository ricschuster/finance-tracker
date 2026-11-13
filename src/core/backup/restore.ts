import Database from 'better-sqlite3'
import { copyFileSync, existsSync, mkdirSync, renameSync, unlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'

const CORE_TABLES = ['settings', 'accounts', 'categories', 'transactions', 'transaction_lines']

export type Validation = { ok: true; version: number } | { ok: false; reason: string }

/** Check a candidate file is an intact finance-tracker database this app can open. Never modifies it. */
export function validateDatabaseFile(path: string, maxVersion: number): Validation {
  if (!existsSync(path)) return { ok: false, reason: 'File not found' }
  let db: Database.Database | undefined
  try {
    db = new Database(path, { readonly: true, fileMustExist: true })
    const check = db.pragma('integrity_check', { simple: true })
    if (check !== 'ok') return { ok: false, reason: `Database is damaged (${String(check)})` }
    const names = new Set(
      (
        db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as {
          name: string
        }[]
      ).map((r) => r.name),
    )
    const missing = CORE_TABLES.filter((t) => !names.has(t))
    if (missing.length) {
      return { ok: false, reason: `Not a finance-tracker database (missing ${missing.join(', ')})` }
    }
    const version = db.pragma('user_version', { simple: true }) as number
    if (version > maxVersion) {
      return {
        ok: false,
        reason: `This database is from a newer version of the app (schema ${version}, this app supports ${maxVersion})`,
      }
    }
    return { ok: true, version }
  } catch {
    return { ok: false, reason: 'Not a SQLite database' }
  } finally {
    db?.close()
  }
}

export const pendingRestorePath = (dbPath: string) => `${dbPath}.restore`

/** Copy a validated file next to the live database so the next start swaps it in. */
export function stageRestore(src: string, dbPath: string): void {
  const dest = pendingRestorePath(dbPath)
  copyFileSync(src, `${dest}.tmp`)
  renameSync(`${dest}.tmp`, dest)
}

export function cancelStagedRestore(dbPath: string): void {
  const p = pendingRestorePath(dbPath)
  if (existsSync(p)) unlinkSync(p)
}

function stamp(now: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`
}

/**
 * Run before the database is opened. If a staged restore exists, keep the current database as
 * `pre-restore-<timestamp>.sqlite` in `keepDir`, then put the staged file in its place.
 * Returns the pre-restore copy's path, or null when nothing was pending.
 */
export function applyPendingRestore(dbPath: string, keepDir: string, now: Date): string | null {
  const staged = pendingRestorePath(dbPath)
  if (!existsSync(staged)) return null
  let kept: string | null = null
  if (existsSync(dbPath)) {
    // Fold any WAL content into the main file so the kept copy is complete.
    const old = new Database(dbPath)
    old.pragma('wal_checkpoint(TRUNCATE)')
    old.close()
    mkdirSync(keepDir, { recursive: true })
    kept = join(keepDir, `pre-restore-${stamp(now)}.sqlite`)
    copyFileSync(dbPath, kept)
  }
  for (const suffix of ['-wal', '-shm']) {
    if (existsSync(dbPath + suffix)) unlinkSync(dbPath + suffix)
  }
  mkdirSync(dirname(dbPath), { recursive: true })
  renameSync(staged, dbPath)
  return kept
}
