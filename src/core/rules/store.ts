import type Database from 'better-sqlite3'
import { compileRegex } from './engine'
import type { Action, Condition, Rule, RuleInput } from './types'

interface RuleRow {
  id: number
  name: string
  position: number
  enabled: number
  conditions: string
  actions: string
}

const TEXT_OPS = ['contains', 'starts_with', 'equals', 'regex', 'similar']

function isCents(n: unknown): n is number {
  return typeof n === 'number' && Number.isSafeInteger(n) && n >= 0
}

/** Throws a readable error when a rule is not safe to store. */
export function validateRule(db: Database.Database, input: RuleInput): void {
  if (!Array.isArray(input.conditions) || input.conditions.length === 0) {
    throw new Error('A rule needs at least one condition')
  }
  if (!Array.isArray(input.actions) || input.actions.length === 0) {
    throw new Error('A rule needs at least one action')
  }
  const exists = (sql: string, id: unknown) => db.prepare(sql).get(id) !== undefined
  for (const c of input.conditions as Condition[]) {
    if (c.type === 'text') {
      if (c.field !== 'description' && c.field !== 'payee') throw new Error('Unknown text field')
      if (!TEXT_OPS.includes(c.op)) throw new Error('Unknown text operator')
      if (typeof c.value !== 'string' || c.value.trim() === '') {
        throw new Error('Text condition needs a value')
      }
      if (c.op === 'regex' && compileRegex(c.value) === null) {
        throw new Error(`Invalid regular expression: ${c.value}`)
      }
    } else if (c.type === 'amount') {
      if (c.direction !== undefined && c.direction !== 'expense' && c.direction !== 'income') {
        throw new Error('Unknown amount direction')
      }
      if (c.min !== undefined && !isCents(c.min)) throw new Error('Amount min must be cents')
      if (c.max !== undefined && !isCents(c.max)) throw new Error('Amount max must be cents')
      if (c.min !== undefined && c.max !== undefined && c.min > c.max) {
        throw new Error('Amount min is above max')
      }
      if (c.direction === undefined && c.min === undefined && c.max === undefined) {
        throw new Error('Amount condition is empty')
      }
    } else if (c.type === 'account') {
      if (!exists('SELECT 1 FROM accounts WHERE id = ?', c.accountId)) {
        throw new Error(`Account ${String(c.accountId)} not found`)
      }
    } else {
      throw new Error('Unknown condition type')
    }
  }
  for (const a of input.actions as Action[]) {
    if (a.type === 'setPayee') {
      if (typeof a.payee !== 'string') throw new Error('Payee must be text')
    } else if (a.type === 'setCategory') {
      if (!exists('SELECT 1 FROM categories WHERE id = ?', a.categoryId)) {
        throw new Error(`Category ${String(a.categoryId)} not found`)
      }
    } else if (a.type === 'skipImport') {
      // Nothing to check.
    } else if (a.type === 'addTags') {
      if (
        !Array.isArray(a.tags) ||
        a.tags.map((t) => String(t).trim()).filter(Boolean).length === 0
      ) {
        throw new Error('Add tags needs at least one tag')
      }
    } else {
      throw new Error('Unknown action type')
    }
  }
}

function toRule(r: RuleRow): Rule {
  return {
    id: r.id,
    name: r.name,
    position: r.position,
    enabled: r.enabled === 1,
    conditions: JSON.parse(r.conditions) as Condition[],
    actions: JSON.parse(r.actions) as Action[],
  }
}

/** All rules in evaluation order. */
export function listRules(db: Database.Database): Rule[] {
  return (db.prepare('SELECT * FROM rules ORDER BY position, id').all() as RuleRow[]).map(toRule)
}

export function getRule(db: Database.Database, id: number): Rule | undefined {
  const row = db.prepare('SELECT * FROM rules WHERE id = ?').get(id) as RuleRow | undefined
  return row ? toRule(row) : undefined
}

function clean(input: RuleInput): { conditions: string; actions: string } {
  const actions = input.actions.map((a) =>
    a.type === 'addTags' ? { ...a, tags: a.tags.map((t) => t.trim()).filter(Boolean) } : a,
  )
  return { conditions: JSON.stringify(input.conditions), actions: JSON.stringify(actions) }
}

/** Create a rule at the end of the list, or at `position` (0 based) shifting later ones down. */
export function createRule(db: Database.Database, input: RuleInput, position?: number): number {
  validateRule(db, input)
  return db.transaction(() => {
    const count = (db.prepare('SELECT COUNT(*) n FROM rules').get() as { n: number }).n
    const pos = Math.min(Math.max(position ?? count, 0), count)
    const { conditions, actions } = clean(input)
    const id = Number(
      db
        .prepare(
          'INSERT INTO rules (name, position, enabled, conditions, actions) VALUES (?, ?, ?, ?, ?)',
        )
        .run(input.name?.trim() ?? '', count, input.enabled === false ? 0 : 1, conditions, actions)
        .lastInsertRowid,
    )
    if (pos !== count) {
      const ids = listRules(db)
        .map((r) => r.id)
        .filter((x) => x !== id)
      ids.splice(pos, 0, id)
      reorderRules(db, ids)
    }
    return id
  })()
}

export function updateRule(db: Database.Database, id: number, input: RuleInput): void {
  validateRule(db, input)
  const { conditions, actions } = clean(input)
  const res = db
    .prepare(
      `UPDATE rules SET name = ?, enabled = ?, conditions = ?, actions = ?,
         updated_at = datetime('now') WHERE id = ?`,
    )
    .run(input.name?.trim() ?? '', input.enabled === false ? 0 : 1, conditions, actions, id)
  if (res.changes === 0) throw new Error(`Rule ${id} not found`)
}

export function setRuleEnabled(db: Database.Database, id: number, enabled: boolean): void {
  const res = db.prepare('UPDATE rules SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id)
  if (res.changes === 0) throw new Error(`Rule ${id} not found`)
}

export function deleteRule(db: Database.Database, id: number): void {
  db.transaction(() => {
    if (db.prepare('DELETE FROM rules WHERE id = ?').run(id).changes === 0) {
      throw new Error(`Rule ${id} not found`)
    }
    reorderRules(
      db,
      listRules(db).map((r) => r.id),
    )
  })()
}

/** Set the evaluation order. `ids` must list every rule exactly once. */
export function reorderRules(db: Database.Database, ids: number[]): void {
  db.transaction(() => {
    const current = (db.prepare('SELECT id FROM rules').all() as { id: number }[]).map((r) => r.id)
    if (ids.length !== current.length || new Set(ids).size !== ids.length) {
      throw new Error('Reorder must list every rule exactly once')
    }
    const known = new Set(current)
    if (ids.some((i) => !known.has(i))) throw new Error('Reorder lists an unknown rule')
    const set = db.prepare('UPDATE rules SET position = ? WHERE id = ?')
    ids.forEach((id, i) => set.run(i, id))
  })()
}
