import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { migrate, migrations } from './migrations'

describe('migrate', () => {
  it('applies all migrations to a fresh database', () => {
    const db = new Database(':memory:')
    expect(migrate(db)).toBe(migrations.length)
    const row = db.prepare("SELECT value FROM settings WHERE key = 'home_currency'").get() as {
      value: string
    }
    expect(row.value).toBe('CAD')
  })

  it('is idempotent', () => {
    const db = new Database(':memory:')
    migrate(db)
    migrate(db)
    expect(db.pragma('user_version', { simple: true })).toBe(migrations.length)
  })

  it('rolls back a failing migration and keeps the version', () => {
    const db = new Database(':memory:')
    expect(() => migrate(db, ['CREATE TABLE a (x);', 'CREATE TABLE a (x);'])).toThrow()
    expect(db.pragma('user_version', { simple: true })).toBe(1)
  })

  it('refuses a database from a newer app', () => {
    const db = new Database(':memory:')
    db.pragma('user_version = 99')
    expect(() => migrate(db)).toThrow(/newer/)
  })
})
