import Database from 'better-sqlite3'
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

export interface BackupSettings {
  /** Empty string means automatic backups are off. */
  folder: string
  intervalDays: number
  keep: number
}

export const DEFAULT_BACKUP_SETTINGS: BackupSettings = { folder: '', intervalDays: 7, keep: 10 }

const NAME_RE = /^finance-backup-\d{4}-\d{2}-\d{2}-\d{6}\.sqlite$/
const pad = (n: number) => String(n).padStart(2, '0')

export function backupFileName(now: Date): string {
  const d = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  const t = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  return `finance-backup-${d}-${t}.sqlite`
}

export function exportFileName(now: Date): string {
  return `finance-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.sqlite`
}

/** Consistent snapshot of the live database (safe in WAL mode while the app runs). */
export async function snapshotTo(db: Database.Database, path: string): Promise<void> {
  if (existsSync(path)) throw new Error(`Refusing to overwrite ${path}`)
  await db.backup(path)
  // The copy inherits WAL mode; switch it off so the file stands alone (no -wal or -shm beside it).
  const copy = new Database(path)
  try {
    copy.pragma('journal_mode = DELETE')
  } finally {
    copy.close()
  }
}

export interface BackupFile {
  name: string
  path: string
  mtimeMs: number
}

/** Backup files in the folder (newest first). Other files are ignored. */
export function listBackups(folder: string): BackupFile[] {
  if (!folder || !existsSync(folder)) return []
  return readdirSync(folder)
    .filter((n) => NAME_RE.test(n))
    .map((name) => ({
      name,
      path: join(folder, name),
      mtimeMs: statSync(join(folder, name)).mtimeMs,
    }))
    .sort((a, b) => b.name.localeCompare(a.name))
}

/** Delete all but the newest `keep` backups. Returns the deleted names. */
export function pruneBackups(folder: string, keep: number): string[] {
  const doomed = listBackups(folder).slice(Math.max(1, keep))
  for (const f of doomed) unlinkSync(f.path)
  return doomed.map((f) => f.name)
}

export function backupDue(settings: BackupSettings, now: Date): boolean {
  if (!settings.folder) return false
  const newest = listBackups(settings.folder)[0]
  if (!newest) return true
  return now.getTime() - newest.mtimeMs >= settings.intervalDays * 86_400_000
}

export interface BackupResult {
  path: string
  pruned: string[]
}

/** Write a backup into the configured folder, then prune. Throws on failure; the caller reports it. */
export async function runBackup(
  db: Database.Database,
  settings: BackupSettings,
  now: Date,
): Promise<BackupResult> {
  if (!settings.folder) throw new Error('No backup folder is set')
  mkdirSync(settings.folder, { recursive: true })
  // Names have one-second resolution; step forward so a second backup in the same second never collides.
  let stamp = now
  while (existsSync(join(settings.folder, backupFileName(stamp)))) {
    stamp = new Date(stamp.getTime() + 1000)
  }
  const path = join(settings.folder, backupFileName(stamp))
  await snapshotTo(db, path)
  return { path, pruned: pruneBackups(settings.folder, settings.keep) }
}

function readSetting(db: Database.Database, key: string): string | undefined {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    { value: string } | undefined
  return row?.value
}

function positiveInt(v: string | undefined, fallback: number, max: number): number {
  const n = Number(v)
  return Number.isInteger(n) && n >= 1 && n <= max ? n : fallback
}

export function getBackupSettings(db: Database.Database): BackupSettings {
  return {
    folder: readSetting(db, 'backup_folder') ?? DEFAULT_BACKUP_SETTINGS.folder,
    intervalDays: positiveInt(
      readSetting(db, 'backup_interval_days'),
      DEFAULT_BACKUP_SETTINGS.intervalDays,
      365,
    ),
    keep: positiveInt(readSetting(db, 'backup_keep'), DEFAULT_BACKUP_SETTINGS.keep, 1000),
  }
}

export function setBackupSettings(db: Database.Database, s: BackupSettings): BackupSettings {
  if (!Number.isInteger(s.intervalDays) || s.intervalDays < 1 || s.intervalDays > 365) {
    throw new Error('Backup interval must be a whole number of days from 1 to 365')
  }
  if (!Number.isInteger(s.keep) || s.keep < 1 || s.keep > 1000) {
    throw new Error('Number of backups to keep must be a whole number from 1 to 1000')
  }
  const put = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  )
  db.transaction(() => {
    put.run('backup_folder', s.folder.trim())
    put.run('backup_interval_days', String(s.intervalDays))
    put.run('backup_keep', String(s.keep))
  })()
  return getBackupSettings(db)
}
