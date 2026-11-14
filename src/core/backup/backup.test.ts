import Database from 'better-sqlite3'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase } from '../db/open'
import { migrations } from '../db/migrations'
import { createAccount, createTransaction, createTransfer } from '../ledger'
import {
  applyPendingRestore,
  backupDue,
  backupFileName,
  exportTransactionsCsv,
  csvField,
  getBackupSettings,
  listBackups,
  pruneBackups,
  runBackup,
  setBackupSettings,
  snapshotTo,
  stageRestore,
  validateDatabaseFile,
} from './index'

let dir: string
// Windows cannot delete an open database file, so every handle a test opens is closed before cleanup.
let handles: Database.Database[] = []
const track = (db: Database.Database) => (handles.push(db), db)
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ft-backup-'))
})
afterEach(() => {
  for (const h of handles) if (h.open) h.close()
  handles = []
  rmSync(dir, { recursive: true, force: true })
})

function seeded(path = join(dir, 'live.sqlite')) {
  const db = track(openDatabase(path))
  const a = createAccount(db, { name: 'Chequing', type: 'checking' })
  createTransaction(db, { accountId: a, date: '2026-03-01', amount: -1234, payee: 'Safeway' })
  return { db, a, path }
}

describe('snapshot and validate', () => {
  it('writes a consistent standalone copy that validates and holds the data', async () => {
    const { db } = seeded()
    const out = join(dir, 'copy.sqlite')
    await snapshotTo(db, out)
    expect(existsSync(`${out}-wal`)).toBe(false)
    expect(validateDatabaseFile(out, migrations.length)).toEqual({
      ok: true,
      version: migrations.length,
    })
    const copy = track(new Database(out, { readonly: true }))
    expect(copy.prepare('SELECT COUNT(*) AS n FROM transactions').get()).toEqual({ n: 1 })
  })

  it('refuses to overwrite an existing file', async () => {
    const { db } = seeded()
    const out = join(dir, 'copy.sqlite')
    writeFileSync(out, 'x')
    await expect(snapshotTo(db, out)).rejects.toThrow(/overwrite/)
  })

  it('rejects missing, non-SQLite, foreign and newer databases', () => {
    expect(validateDatabaseFile(join(dir, 'nope'), 9)).toMatchObject({ ok: false })
    const junk = join(dir, 'junk.sqlite')
    writeFileSync(junk, 'not a database at all, just text')
    expect(validateDatabaseFile(junk, 9)).toMatchObject({
      ok: false,
      reason: 'Not a SQLite database',
    })
    const other = join(dir, 'other.sqlite')
    const o = new Database(other)
    o.exec('CREATE TABLE x (a)')
    o.close()
    expect(validateDatabaseFile(other, 9)).toMatchObject({
      ok: false,
      reason: expect.stringContaining('missing'),
    })
    const { path, db } = seeded(join(dir, 'new.sqlite'))
    db.close()
    expect(validateDatabaseFile(path, migrations.length - 1)).toMatchObject({
      ok: false,
      reason: expect.stringContaining('newer'),
    })
  })
})

describe('backups', () => {
  const now = new Date(2026, 10, 13, 9, 5, 7)

  it('names files by local time', () => {
    expect(backupFileName(now)).toBe('finance-backup-2026-11-13-090507.sqlite')
  })

  it('is due when there is no backup or the newest is older than the interval', async () => {
    const { db } = seeded()
    const folder = join(dir, 'b')
    const s = { folder, intervalDays: 7, keep: 10 }
    expect(backupDue({ ...s, folder: '' }, now)).toBe(false)
    expect(backupDue(s, now)).toBe(true)
    const { path } = await runBackup(db, s, now)
    expect(backupDue(s, now)).toBe(false)
    const old = new Date(now.getTime() - 8 * 86_400_000)
    utimesSync(path, old, old)
    expect(backupDue(s, now)).toBe(true)
  })

  it('does not collide when two backups start in the same second', async () => {
    const { db } = seeded()
    const s = { folder: join(dir, 'b'), intervalDays: 7, keep: 10 }
    const a = await runBackup(db, s, now)
    const b = await runBackup(db, s, now)
    expect(a.path).not.toBe(b.path)
    expect(listBackups(s.folder)).toHaveLength(2)
  })

  it('prunes to the newest N and leaves other files alone', () => {
    const folder = join(dir, 'b')
    const names = ['01', '02', '03', '04'].map((d) => `finance-backup-2026-11-${d}-000000.sqlite`)
    for (const n of names) {
      mkdirpWrite(folder, n)
    }
    mkdirpWrite(folder, 'notes.txt')
    expect(pruneBackups(folder, 2)).toEqual([names[1], names[0]])
    expect(readdirSync(folder).sort()).toEqual([names[2], names[3], 'notes.txt'])
    expect(listBackups(folder).map((f) => f.name)).toEqual([names[3], names[2]])
  })

  it('never prunes below one backup', () => {
    const folder = join(dir, 'b')
    mkdirpWrite(folder, 'finance-backup-2026-11-01-000000.sqlite')
    expect(pruneBackups(folder, 0)).toEqual([])
  })

  it('stores and validates settings', () => {
    const { db } = seeded()
    expect(getBackupSettings(db)).toEqual({ folder: '', intervalDays: 7, keep: 10 })
    expect(setBackupSettings(db, { folder: ' /x ', intervalDays: 3, keep: 4 })).toEqual({
      folder: '/x',
      intervalDays: 3,
      keep: 4,
    })
    expect(() => setBackupSettings(db, { folder: '', intervalDays: 0, keep: 4 })).toThrow()
    expect(() => setBackupSettings(db, { folder: '', intervalDays: 1, keep: 1.5 })).toThrow()
  })
})

function mkdirpWrite(folder: string, name: string) {
  mkdirSync(folder, { recursive: true })
  writeFileSync(join(folder, name), 'x')
}

describe('restore', () => {
  it('swaps the staged file in at startup and keeps the old database', async () => {
    const { db, a, path } = seeded()
    const backup = join(dir, 'snap.sqlite')
    await snapshotTo(db, backup)
    createTransaction(db, { accountId: a, date: '2026-03-02', amount: -1 })
    db.close()

    stageRestore(backup, path)
    const kept = applyPendingRestore(path, join(dir, 'keep'), new Date(2026, 10, 13, 1, 2, 3))
    expect(kept).toBe(join(dir, 'keep', 'pre-restore-20261113-010203.sqlite'))

    const restored = track(openDatabase(path))
    expect(restored.prepare('SELECT COUNT(*) AS n FROM transactions').get()).toEqual({ n: 1 })
    const old = track(new Database(kept!, { readonly: true }))
    expect(old.prepare('SELECT COUNT(*) AS n FROM transactions').get()).toEqual({ n: 2 })
    expect(applyPendingRestore(path, join(dir, 'keep'), new Date())).toBeNull()
  })
})

describe('transactions CSV', () => {
  it('escapes fields and defuses formulas', () => {
    expect(csvField('a,b')).toBe('"a,b"')
    expect(csvField('say "hi"')).toBe('"say ""hi"""')
    expect(csvField('=SUM(A1)')).toBe("'=SUM(A1)")
    expect(csvField('-12.50')).toBe('-12.50')
    expect(csvField('-cmd')).toBe("'-cmd")
  })

  it('writes one row per split line with tags, transfers and a date filter', () => {
    const { db, a } = seeded()
    const cat = (n: string) =>
      (db.prepare('SELECT id FROM categories WHERE name = ?').get(n) as { id: number }).id
    createTransaction(db, {
      accountId: a,
      date: '2026-03-05',
      amount: -3000,
      payee: 'Costco, Burnaby',
      tags: ['bulk'],
      notes: 'for the party, again',
      lines: [
        { categoryId: cat('Groceries'), amount: -2000, memo: 'food' },
        { categoryId: cat('Home'), amount: -1000 },
      ],
    })
    const b = createAccount(db, { name: 'Savings', type: 'savings' })
    createTransfer(db, { fromAccountId: a, toAccountId: b, date: '2026-03-06', amount: 500 })

    const lines = exportTransactionsCsv(db).trim().split('\r\n')
    expect(lines[0]).toBe(
      'Transaction ID,Date,Account,Payee,Description,Amount,Category,Memo,Tags,Notes,Status,Transfer',
    )
    expect(lines).toHaveLength(1 + 1 + 2 + 2)
    expect(lines[1]).toContain('2026-03-01,Chequing,Safeway,,-12.34,Uncategorized')
    expect(lines[2]).toContain('"Costco, Burnaby",,-20.00,Groceries,food,bulk')
    expect(lines[2]).toContain('bulk,"for the party, again"')
    expect(lines[3]).toContain(',-10.00,Home,,bulk')
    expect(lines[4]).toMatch(/,yes$/)

    const ranged = exportTransactionsCsv(db, { from: '2026-03-05', to: '2026-03-05' })
      .trim()
      .split('\r\n')
    expect(ranged).toHaveLength(3)
    expect(exportTransactionsCsv(db, { from: '2030-01-01' }).trim().split('\r\n')).toHaveLength(1)
  })
})
