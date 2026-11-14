import Database from 'better-sqlite3'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { migrate } from '../db/migrations'
import { createAccount } from '../ledger/accounts'
import { createImportHandlers } from './handlers'
import { getImportFolder, readFolderFile, scanImportFolder, setImportFolder } from './folder'
import type { MappingProfile } from './mapping'

const profile: MappingProfile = {
  hasHeader: true,
  headerRow: 0,
  date: { column: 'Date', format: 'YYYY-MM-DD' },
  amount: { mode: 'signed', column: 'Amount' },
  description: ['Desc'],
}
const csv = 'Date,Desc,Amount\n2026-01-08,SAFEWAY #4412,-45.00\n'
const other = 'When,What,How much\n2026-01-08,X,-1.00\n'
const ofx =
  'OFXHEADER:100\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>'

const dirs: string[] = []
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true })
})

function setup() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  migrate(db)
  const accountId = createAccount(db, { name: 'Chequing', type: 'checking' })
  const dir = mkdtempSync(join(tmpdir(), 'ft-folder-'))
  dirs.push(dir)
  return { db, accountId, dir, api: createImportHandlers(db) }
}

describe('import folder', () => {
  it('stores the folder setting', () => {
    const { db, dir } = setup()
    expect(getImportFolder(db)).toBe('')
    setImportFolder(db, ` ${dir} `)
    expect(getImportFolder(db)).toBe(dir)
  })

  it('reports a missing folder without throwing', () => {
    const { db, dir } = setup()
    expect(scanImportFolder(db, join(dir, 'nope'))).toMatchObject({ exists: false, files: [] })
    expect(scanImportFolder(db, '')).toMatchObject({ exists: false })
  })

  it('classifies files and ignores everything else', () => {
    const { db, accountId, dir, api } = setup()
    api.saveImportProfile({
      name: 'Bank',
      accountId,
      config: profile,
      headerFingerprint: api.inspectCsv(csv).fingerprint,
    })
    writeFileSync(join(dir, 'known.csv'), csv)
    writeFileSync(join(dir, 'strange.csv'), other)
    writeFileSync(join(dir, 'a.qfx'), ofx)
    writeFileSync(join(dir, 'notes.pdf'), 'x')
    writeFileSync(join(dir, '.hidden.csv'), csv)
    mkdirSync(join(dir, 'sub.csv'))
    const scan = scanImportFolder(db, dir)
    const by = Object.fromEntries(scan.files.map((f) => [f.name, f]))
    expect(Object.keys(by).sort()).toEqual(['a.qfx', 'known.csv', 'strange.csv'])
    expect(by['known.csv']).toMatchObject({ status: 'ready', profileName: 'Bank' })
    expect(by['strange.csv']!.status).toBe('needs_mapping')
    expect(by['a.qfx']!.status).toBe('ready')
  })

  it('marks a file that was already imported', () => {
    const { db, accountId, dir, api } = setup()
    api.saveImportProfile({
      name: 'Bank',
      accountId,
      config: profile,
      headerFingerprint: api.inspectCsv(csv).fingerprint,
    })
    writeFileSync(join(dir, 'known.csv'), csv)
    api.commitImport({
      text: csv,
      profile,
      accountId,
      sourceName: 'known.csv',
      overrides: [],
    })
    expect(scanImportFolder(db, dir).files[0]!.status).toBe('already_imported')
  })

  it('never changes the files it scans', () => {
    const { db, dir } = setup()
    writeFileSync(join(dir, 'strange.csv'), other)
    scanImportFolder(db, dir)
    expect(readFolderFile(dir, 'strange.csv').text).toBe(other)
  })

  it('reads only bare bank file names', () => {
    const { dir } = setup()
    writeFileSync(join(dir, 'a.csv'), csv)
    expect(readFolderFile(dir, 'a.csv').name).toBe('a.csv')
    for (const bad of ['../a.csv', 'sub/a.csv', '..', 'a.exe', 'a\\b.csv'])
      expect(() => readFolderFile(dir, bad)).toThrow()
    expect(() => readFolderFile('', 'a.csv')).toThrow('No import folder')
  })
})
