import type Database from 'better-sqlite3'
import type { DateFormat } from './dates'
import type { AmountMapping, ColumnRef, MappingProfile } from './mapping'

const DATE_FORMATS: DateFormat[] = [
  'YYYY-MM-DD',
  'YYYY/MM/DD',
  'MM/DD/YYYY',
  'DD/MM/YYYY',
  'DD-MM-YYYY',
  'MM-DD-YYYY',
  'DD-Mon-YYYY',
  'YYYYMMDD',
]

const isRef = (v: unknown): v is ColumnRef =>
  typeof v === 'string' || (typeof v === 'number' && Number.isInteger(v) && v >= 0)

function fail(msg: string): never {
  throw new Error(`Invalid import profile: ${msg}`)
}

function checkAmount(a: unknown): AmountMapping {
  if (typeof a !== 'object' || a === null) fail('amount')
  const o = a as Record<string, unknown>
  const foreign = o.foreignColumn
  if (foreign !== undefined && !isRef(foreign)) fail('amount.foreignColumn')
  if (o.mode === 'signed') {
    if (!isRef(o.column)) fail('amount.column')
    return {
      mode: 'signed',
      column: o.column,
      ...(foreign !== undefined && { foreignColumn: foreign }),
    }
  }
  if (o.mode === 'debitCredit') {
    if (!isRef(o.debit) || !isRef(o.credit)) fail('amount.debit/credit')
    return {
      mode: 'debitCredit',
      debit: o.debit,
      credit: o.credit,
      ...(foreign !== undefined && { foreignColumn: foreign }),
    }
  }
  if (o.mode === 'directional') {
    if (!isRef(o.column) || !isRef(o.direction)) fail('amount.column/direction')
    if (!Array.isArray(o.debitValues) || !o.debitValues.every((x) => typeof x === 'string'))
      fail('amount.debitValues')
    return {
      mode: 'directional',
      column: o.column,
      direction: o.direction,
      debitValues: o.debitValues as string[],
    }
  }
  return fail('amount.mode')
}

/** Validate untrusted JSON (from storage or the renderer) into a MappingProfile. */
export function validateProfile(input: unknown): MappingProfile {
  if (typeof input !== 'object' || input === null) fail('not an object')
  const o = input as Record<string, unknown>
  if (typeof o.hasHeader !== 'boolean') fail('hasHeader')
  if (!Number.isInteger(o.headerRow) || (o.headerRow as number) < 0) fail('headerRow')
  const date = o.date as Record<string, unknown> | undefined
  if (!date || !isRef(date.column) || !DATE_FORMATS.includes(date.format as DateFormat))
    fail('date')
  if (!Array.isArray(o.description) || !o.description.every(isRef)) fail('description')
  for (const k of ['payee', 'memo', 'status', 'externalId'] as const) {
    if (o[k] !== undefined && !isRef(o[k])) fail(k)
  }
  if (o.flipSign !== undefined && typeof o.flipSign !== 'boolean') fail('flipSign')
  if (o.decimalSeparator !== undefined && o.decimalSeparator !== '.' && o.decimalSeparator !== ',')
    fail('decimalSeparator')
  return {
    hasHeader: o.hasHeader,
    headerRow: o.headerRow as number,
    date: { column: date.column, format: date.format as DateFormat },
    amount: checkAmount(o.amount),
    description: o.description as ColumnRef[],
    ...(o.payee !== undefined && { payee: o.payee as ColumnRef }),
    ...(o.memo !== undefined && { memo: o.memo as ColumnRef }),
    ...(o.status !== undefined && { status: o.status as ColumnRef }),
    ...(o.externalId !== undefined && { externalId: o.externalId as ColumnRef }),
    ...(o.flipSign !== undefined && { flipSign: o.flipSign }),
    ...(o.decimalSeparator !== undefined && { decimalSeparator: o.decimalSeparator }),
  }
}

export interface SavedProfile {
  id: number
  name: string
  accountId: number | null
  headerFingerprint: string | null
  config: MappingProfile
}

interface ProfileRow {
  id: number
  name: string
  account_id: number | null
  header_fingerprint: string | null
  config: string
}

const toSaved = (r: ProfileRow): SavedProfile => ({
  id: r.id,
  name: r.name,
  accountId: r.account_id,
  headerFingerprint: r.header_fingerprint,
  config: validateProfile(JSON.parse(r.config)),
})

export interface ProfileInput {
  id?: number
  name: string
  accountId?: number | null
  headerFingerprint?: string | null
  config: MappingProfile
}

/** Create a profile, or update it when `id` is given. Names are unique. */
export function saveProfile(db: Database.Database, input: ProfileInput): number {
  const name = input.name.trim()
  if (!name) throw new Error('Profile name is required')
  const config = JSON.stringify(validateProfile(input.config))
  if (input.id !== undefined) {
    const r = db
      .prepare(
        `UPDATE import_profiles SET name = ?, account_id = ?, header_fingerprint = ?, config = ?,
           updated_at = datetime('now') WHERE id = ?`,
      )
      .run(name, input.accountId ?? null, input.headerFingerprint ?? null, config, input.id)
    if (r.changes === 0) throw new Error(`Profile ${input.id} not found`)
    return input.id
  }
  return Number(
    db
      .prepare(
        'INSERT INTO import_profiles (name, account_id, header_fingerprint, config) VALUES (?, ?, ?, ?)',
      )
      .run(name, input.accountId ?? null, input.headerFingerprint ?? null, config).lastInsertRowid,
  )
}

export function listProfiles(db: Database.Database): SavedProfile[] {
  return (db.prepare('SELECT * FROM import_profiles ORDER BY name').all() as ProfileRow[]).map(
    toSaved,
  )
}

export function deleteProfile(db: Database.Database, id: number): void {
  db.prepare('DELETE FROM import_profiles WHERE id = ?').run(id)
}

/** The most recently updated profile whose header fingerprint matches, if any. */
export function findProfileByFingerprint(
  db: Database.Database,
  fingerprint: string,
): SavedProfile | undefined {
  const r = db
    .prepare(
      'SELECT * FROM import_profiles WHERE header_fingerprint = ? ORDER BY updated_at DESC, id DESC LIMIT 1',
    )
    .get(fingerprint) as ProfileRow | undefined
  return r ? toSaved(r) : undefined
}
