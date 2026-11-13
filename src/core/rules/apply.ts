import type Database from 'better-sqlite3'
import { hasChanges, planRules } from './engine'
import { listRules } from './store'
import type { Rule, RuleChanges, RulePlan, RuleTarget } from './types'

export interface RuleChange {
  transactionId: number
  ruleId: number
  ruleName: string
  date: string
  rawDescription: string
  before: { payee: string; categoryName: string; tags: string[] }
  changes: RuleChanges
  /** Display name of the new category when `changes.categoryId` is set. */
  newCategoryName?: string
  locked: RulePlan['locked']
}

interface TargetRow {
  id: number
  account_id: number
  date: string
  amount: number
  raw_description: string
  payee: string
  edited_fields: string
  transfer_peer_id: number | null
  line_count: number
  category_id: number | null
  category_name: string | null
  tags: string
}

const CHUNK = 500

function loadTargets(
  db: Database.Database,
  ids?: number[],
): { id: number; date: string; categoryName: string; target: RuleTarget }[] {
  const base = `SELECT t.id, t.account_id, t.date, t.amount, t.raw_description, t.payee,
      t.edited_fields, t.transfer_peer_id,
      (SELECT COUNT(*) FROM transaction_lines l WHERE l.transaction_id = t.id) AS line_count,
      (SELECT l.category_id FROM transaction_lines l WHERE l.transaction_id = t.id
         ORDER BY l.id LIMIT 1) AS category_id,
      (SELECT c.name FROM transaction_lines l JOIN categories c ON c.id = l.category_id
         WHERE l.transaction_id = t.id ORDER BY l.id LIMIT 1) AS category_name,
      (SELECT json_group_array(g.name) FROM transaction_tags tt JOIN tags g ON g.id = tt.tag_id
         WHERE tt.transaction_id = t.id) AS tags
    FROM transactions t`
  const rows: TargetRow[] = []
  if (ids === undefined) {
    rows.push(...(db.prepare(`${base} ORDER BY t.id`).all() as TargetRow[]))
  } else {
    for (let i = 0; i < ids.length; i += CHUNK) {
      const part = ids.slice(i, i + CHUNK)
      const marks = part.map(() => '?').join(',')
      rows.push(
        ...(db
          .prepare(`${base} WHERE t.id IN (${marks}) ORDER BY t.id`)
          .all(...part) as TargetRow[]),
      )
    }
  }
  return rows.map((r) => ({
    id: r.id,
    date: r.date,
    categoryName: r.category_name ?? '',
    target: {
      accountId: r.account_id,
      amount: r.amount,
      rawDescription: r.raw_description,
      payee: r.payee,
      editedFields: JSON.parse(r.edited_fields) as string[],
      isTransfer: r.transfer_peer_id !== null,
      lineCount: r.line_count,
      categoryId: r.category_id,
      tags: JSON.parse(r.tags) as string[],
    },
  }))
}

function categoryLookup(db: Database.Database): Map<number, string> {
  return new Map(
    (db.prepare('SELECT id, name FROM categories').all() as { id: number; name: string }[]).map(
      (c) => [c.id, c.name],
    ),
  )
}

/** What the rules would do. Writes nothing. Only transactions where something would change are listed. */
export function previewRules(
  db: Database.Database,
  opts: { ids?: number[]; rules?: Rule[] } = {},
): RuleChange[] {
  const rules = opts.rules ?? listRules(db)
  if (rules.length === 0) return []
  const cats = categoryLookup(db)
  const names = new Map(rules.map((r) => [r.id, r.name]))
  const out: RuleChange[] = []
  for (const row of loadTargets(db, opts.ids)) {
    const plan = planRules(rules, row.target, (id) => cats.has(id))
    if (!plan || !hasChanges(plan.changes)) continue
    out.push({
      transactionId: row.id,
      ruleId: plan.ruleId,
      ruleName: names.get(plan.ruleId) ?? '',
      date: row.date,
      rawDescription: row.target.rawDescription,
      before: { payee: row.target.payee, categoryName: row.categoryName, tags: row.target.tags },
      changes: plan.changes,
      ...(plan.changes.categoryId !== undefined && {
        newCategoryName: cats.get(plan.changes.categoryId) ?? '',
      }),
      locked: plan.locked,
    })
  }
  return out
}

/**
 * Write the changes. Rule writes never touch edited_fields, so they can be re-run and replaced.
 * Runs in its own database transaction (a no-op nesting when called inside one).
 */
export function applyRules(
  db: Database.Database,
  opts: { ids?: number[]; rules?: Rule[] } = {},
): { changed: number } {
  return db.transaction(() => {
    const changes = previewRules(db, opts)
    const setPayee = db.prepare(
      "UPDATE transactions SET payee = ?, updated_at = datetime('now') WHERE id = ?",
    )
    const setCat = db.prepare(
      'UPDATE transaction_lines SET category_id = ? WHERE transaction_id = ?',
    )
    const addTag = db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)')
    const findTag = db.prepare('SELECT id FROM tags WHERE name = ?')
    const link = db.prepare(
      'INSERT OR IGNORE INTO transaction_tags (transaction_id, tag_id) VALUES (?, ?)',
    )
    const touch = db.prepare("UPDATE transactions SET updated_at = datetime('now') WHERE id = ?")
    for (const c of changes) {
      if (c.changes.payee !== undefined) setPayee.run(c.changes.payee, c.transactionId)
      if (c.changes.categoryId !== undefined) {
        setCat.run(c.changes.categoryId, c.transactionId)
        touch.run(c.transactionId)
      }
      for (const tag of c.changes.addTags ?? []) {
        addTag.run(tag)
        link.run(c.transactionId, (findTag.get(tag) as { id: number }).id)
        touch.run(c.transactionId)
      }
    }
    return { changed: changes.length }
  })()
}
