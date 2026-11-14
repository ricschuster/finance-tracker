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
        .prepare(
          'SELECT name, is_system FROM categories WHERE parent_id IS NULL ORDER BY sort_order',
        )
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

    it('is flat: no subcategories, globally unique names, one income category', () => {
      const db = fresh()
      const kids = db.prepare('SELECT 1 FROM categories WHERE parent_id IS NOT NULL').all()
      expect(kids).toEqual([])
      const names = (db.prepare('SELECT name FROM categories').all() as { name: string }[]).map(
        (r) => r.name.toLowerCase(),
      )
      expect(new Set(names).size).toBe(names.length)
      expect(names.length).toBeLessThanOrEqual(17)
    })

    it('flattening repoints lines, rules and saved searches at the parent', () => {
      const db = new Database(':memory:')
      db.pragma('foreign_keys = ON')
      migrate(db, migrations.slice(0, 7))
      const id = (n: string) =>
        (db.prepare('SELECT id FROM categories WHERE name = ?').get(n) as { id: number }).id
      const dining = id('Food & Dining')
      const coffee = id('Coffee Shops')
      db.prepare("INSERT INTO accounts (name, type) VALUES ('A', 'checking')").run()
      db.prepare(
        "INSERT INTO transactions (account_id, date, amount) VALUES (1, '2026-01-01', -5)",
      ).run()
      db.prepare(
        'INSERT INTO transaction_lines (transaction_id, category_id, amount) VALUES (1, ?, -5)',
      ).run(coffee)
      db.prepare("INSERT INTO rules (position, conditions, actions) VALUES (1, '[]', ?)").run(
        JSON.stringify([
          { type: 'setPayee', payee: 'X' },
          { type: 'setCategory', categoryId: coffee },
        ]),
      )
      db.prepare("INSERT INTO saved_searches (name, query) VALUES ('s', ?)").run(
        JSON.stringify({ categoryId: coffee }),
      )
      migrate(db)
      expect(db.prepare('SELECT category_id FROM transaction_lines').get()).toEqual({
        category_id: dining,
      })
      const actions = JSON.parse(
        (db.prepare('SELECT actions FROM rules').get() as { actions: string }).actions,
      )
      expect(actions).toEqual([
        { type: 'setPayee', payee: 'X' },
        { type: 'setCategory', categoryId: dining },
      ])
      const q = JSON.parse(
        (db.prepare('SELECT query FROM saved_searches').get() as { query: string }).query,
      )
      expect(q).toEqual({ categoryId: dining })
      expect(
        db.prepare('SELECT 1 FROM categories WHERE name = ?').get('Coffee Shops'),
      ).toBeUndefined()
    })
  })
})

describe('duplicate dismissals', () => {
  it('stores ordered pairs and drops them with either transaction', () => {
    const db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    migrate(db)
    db.exec("INSERT INTO accounts (name, type) VALUES ('A', 'checking')")
    const ins = db.prepare(
      "INSERT INTO transactions (account_id, date, amount) VALUES (1, '2026-01-01', -100)",
    )
    const a = Number(ins.run().lastInsertRowid)
    const b = Number(ins.run().lastInsertRowid)
    db.prepare('INSERT INTO duplicate_dismissals (txn_a, txn_b) VALUES (?, ?)').run(a, b)
    expect(() =>
      db.prepare('INSERT INTO duplicate_dismissals (txn_a, txn_b) VALUES (?, ?)').run(b, a),
    ).toThrow()
    db.prepare('DELETE FROM transactions WHERE id = ?').run(a)
    expect(db.prepare('SELECT COUNT(*) AS n FROM duplicate_dismissals').get()).toEqual({ n: 0 })
  })
})
