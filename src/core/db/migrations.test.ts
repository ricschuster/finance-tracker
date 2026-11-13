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

  describe('ledger schema', () => {
    const fresh = () => {
      const db = new Database(':memory:')
      db.pragma('foreign_keys = ON')
      migrate(db)
      return db
    }

    it('seeds the starter parent categories, with system ones locked', () => {
      const db = fresh()
      const rows = db
        .prepare('SELECT name, is_system FROM categories ORDER BY sort_order')
        .all() as {
        name: string
        is_system: number
      }[]
      expect(rows).toHaveLength(17)
      expect(rows.filter((r) => r.is_system).map((r) => r.name)).toEqual([
        'Transfer',
        'Uncategorized',
      ])
    })

    it('rejects duplicate account names ignoring case', () => {
      const db = fresh()
      const ins = db.prepare("INSERT INTO accounts (name, type) VALUES (?, 'checking')")
      ins.run('Chequing')
      expect(() => ins.run('chequing')).toThrow(/UNIQUE/)
    })

    it('rejects malformed dates and unknown statuses', () => {
      const db = fresh()
      db.prepare("INSERT INTO accounts (name, type) VALUES ('A', 'cash')").run()
      const ins = db.prepare(
        'INSERT INTO transactions (account_id, date, amount, status) VALUES (1, ?, -100, ?)',
      )
      expect(() => ins.run('2026/11/13', 'cleared')).toThrow(/CHECK/)
      expect(() => ins.run('2026-11-13', 'bogus')).toThrow(/CHECK/)
      expect(() => ins.run('2026-11-13', 'cleared')).not.toThrow()
    })

    it('cascades line and tag deletion with the transaction', () => {
      const db = fresh()
      db.prepare("INSERT INTO accounts (name, type) VALUES ('A', 'cash')").run()
      db.prepare(
        "INSERT INTO transactions (account_id, date, amount) VALUES (1, '2026-11-13', -500)",
      ).run()
      db.prepare(
        'INSERT INTO transaction_lines (transaction_id, category_id, amount) VALUES (1, 1, -500)',
      ).run()
      db.prepare("INSERT INTO tags (name) VALUES ('trip')").run()
      db.prepare('INSERT INTO transaction_tags (transaction_id, tag_id) VALUES (1, 1)').run()
      db.prepare('DELETE FROM transactions WHERE id = 1').run()
      expect(db.prepare('SELECT COUNT(*) AS n FROM transaction_lines').get()).toEqual({ n: 0 })
      expect(db.prepare('SELECT COUNT(*) AS n FROM transaction_tags').get()).toEqual({ n: 0 })
    })

    it('blocks deleting a category or account that is in use', () => {
      const db = fresh()
      db.prepare("INSERT INTO accounts (name, type) VALUES ('A', 'cash')").run()
      db.prepare(
        "INSERT INTO transactions (account_id, date, amount) VALUES (1, '2026-11-13', -500)",
      ).run()
      db.prepare(
        'INSERT INTO transaction_lines (transaction_id, category_id, amount) VALUES (1, 1, -500)',
      ).run()
      expect(() => db.prepare('DELETE FROM categories WHERE id = 1').run()).toThrow(/FOREIGN KEY/)
      expect(() => db.prepare('DELETE FROM accounts WHERE id = 1').run()).toThrow(/FOREIGN KEY/)
    })
  })
})
