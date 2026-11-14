import type Database from 'better-sqlite3'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { decodeBytes, guessHeaderRow, MAX_FILE_BYTES, parseCsv } from './csv'
import { hashFileText } from './filehash'
import { headerFingerprint } from './mapping'
import { findProfileByFingerprint } from './profiles'
import { looksLikeMint } from './mint'
import { looksLikeOfx } from './ofx'

const KEY = 'import_folder'
const EXTENSIONS = new Set(['.csv', '.txt', '.ofx', '.qfx'])

export type FolderFileStatus =
  /** Ready to review: OFX/QFX, or a CSV whose header matches a saved profile. */
  | 'ready'
  /** A CSV with no matching saved profile. Open it and map the columns once. */
  | 'needs_mapping'
  /** A live import batch already holds this exact file. */
  | 'already_imported'
  | 'unreadable'

export interface FolderFile {
  name: string
  size: number
  modifiedAt: string
  status: FolderFileStatus
  /** Matched profile name for `ready` CSV files. */
  profileName?: string
  /** Why a file is `unreadable`. */
  reason?: string
}

export interface FolderScan {
  folder: string
  /** False when the folder is set but missing or not readable. */
  exists: boolean
  files: FolderFile[]
}

export function getImportFolder(db: Database.Database): string {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(KEY) as
    { value: string } | undefined
  return row?.value ?? ''
}

export function setImportFolder(db: Database.Database, folder: string): string {
  const value = folder.trim()
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run(KEY, value)
  return value
}

function extensionOf(name: string): string {
  const i = name.lastIndexOf('.')
  return i < 0 ? '' : name.slice(i).toLowerCase()
}

/**
 * List the bank files in the import folder (top level only) and say what each needs. Read only:
 * files are never changed, moved or deleted. Newest first.
 */
export function scanImportFolder(db: Database.Database, folder: string): FolderScan {
  if (!folder || !existsSync(folder) || !statSync(folder).isDirectory()) {
    return { folder, exists: false, files: [] }
  }
  const hasHash = db.prepare('SELECT 1 FROM import_batches WHERE file_hash = ? LIMIT 1')
  const files: FolderFile[] = []
  for (const name of readdirSync(folder)) {
    if (name.startsWith('.') || !EXTENSIONS.has(extensionOf(name))) continue
    const path = join(folder, name)
    let st
    try {
      st = statSync(path)
    } catch {
      continue
    }
    if (!st.isFile()) continue
    const base = { name, size: st.size, modifiedAt: st.mtime.toISOString() }
    if (st.size > MAX_FILE_BYTES) {
      files.push({
        ...base,
        status: 'unreadable',
        reason: `Larger than ${MAX_FILE_BYTES / 1024 / 1024} MB`,
      })
      continue
    }
    try {
      const text = decodeBytes(readFileSync(path))
      if (hasHash.get(hashFileText(text))) {
        files.push({ ...base, status: 'already_imported' })
      } else if (looksLikeOfx(text)) {
        files.push({ ...base, status: 'ready' })
      } else {
        const rows = parseCsv(text).rows
        if (looksLikeMint(rows)) {
          files.push({ ...base, status: 'ready' })
          continue
        }
        const fp = headerFingerprint(rows[guessHeaderRow(rows)] ?? [])
        const profile = findProfileByFingerprint(db, fp)
        files.push(
          profile
            ? { ...base, status: 'ready', profileName: profile.name }
            : { ...base, status: 'needs_mapping' },
        )
      }
    } catch (e) {
      files.push({
        ...base,
        status: 'unreadable',
        reason: e instanceof Error ? e.message : String(e),
      })
    }
  }
  return {
    folder,
    exists: true,
    files: files.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt)),
  }
}

/** Read one file from the import folder by bare file name. Rejects anything that is not directly inside it. */
export function readFolderFile(folder: string, name: string): { name: string; text: string } {
  if (!folder) throw new Error('No import folder is set')
  if (name !== name.replace(/[\\/]/g, '') || name === '.' || name === '..' || name.includes('\0')) {
    throw new Error('Invalid file name')
  }
  if (!EXTENSIONS.has(extensionOf(name))) throw new Error('Not a bank file')
  const path = join(folder, name)
  if (statSync(path).size > MAX_FILE_BYTES) {
    throw new Error(`File is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB`)
  }
  return { name, text: decodeBytes(readFileSync(path)) }
}
