import type Database from 'better-sqlite3'
import { planRules, skipRule } from '../rules/engine'
import { listRules } from '../rules/store'
import type { Rule, RuleTarget } from '../rules/types'
import { suggestPattern } from '../rules/suggest'
import { categoryIdByName } from './commit'
import type { PlanItem } from './match'

export type CategorySource = 'file' | 'rule' | 'history'

/** What the import will do to a new row beyond saving it: skip it, or give it a category. */
export interface RowEnrichment {
  skippedByRule: { ruleId: number; ruleName: string } | null
  category: {
    id: number
    name: string
    source: CategorySource
    /** For `history`: how many earlier transactions agree, out of how many with the same text. */
    agree?: number
    of?: number
  } | null
}

/** The history guess needs at least this share of earlier transactions to agree. */
const MIN_SHARE = 0.6

interface HistoryRow {
  d: string
  expense: number
  category_id: number
  n: number
}

export interface HistoryGuess {
  id: number
  agree: number
  of: number
}

/** The most common category for this description and direction, if enough earlier rows agree. */
export function guessFromHistory(
  history: Map<string, Map<number, number>>,
  rawDescription: string,
  amount: number,
): HistoryGuess | null {
  const counts = history.get(`${suggestPattern(rawDescription).toLowerCase()}|${amount < 0}`)
  if (!counts) return null
  const total = [...counts.values()].reduce((a, b) => a + b, 0)
  const [id, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]!
  return n / total >= MIN_SHARE ? { id, agree: n, of: total } : null
}

/** Earlier single-category, non-transfer transactions by description pattern and direction. */
export function loadHistory(db: Database.Database): Map<string, Map<number, number>> {
  const rows = db
    .prepare(
      `SELECT t.raw_description AS d, t.amount < 0 AS expense, l.category_id, COUNT(*) AS n
       FROM transactions t
       JOIN transaction_lines l ON l.transaction_id = t.id
       JOIN categories c ON c.id = l.category_id
       WHERE t.transfer_peer_id IS NULL AND c.is_system = 0
         AND NOT (c.name = 'Uncategorized' AND c.parent_id IS NULL)
         AND (SELECT COUNT(*) FROM transaction_lines x WHERE x.transaction_id = t.id) = 1
       GROUP BY t.raw_description, t.amount < 0, l.category_id`,
    )
    .all() as HistoryRow[]
  const out = new Map<string, Map<number, number>>()
  for (const r of rows) {
    const pattern = suggestPattern(r.d).toLowerCase()
    if (!pattern) continue
    const key = `${pattern}|${r.expense === 1}`
    const counts = out.get(key) ?? new Map<number, number>()
    counts.set(r.category_id, (counts.get(r.category_id) ?? 0) + r.n)
    out.set(key, counts)
  }
  return out
}

function target(accountId: number, p: PlanItem): RuleTarget {
  const c = p.candidate
  return {
    accountId,
    amount: c.amount,
    rawDescription: c.rawDescription,
    payee: c.payee,
    editedFields: [],
    isTransfer: false,
    lineCount: 1,
    categoryId: null,
    tags: c.tags ?? [],
  }
}

/**
 * For each row that would be added: the rule that skips it, and the category it will get, in the
 * order rule, file, then what the same description was filed under before. Keyed by line number.
 * Reads only; the commit applies the same rules itself.
 */
export function enrichPlan(
  db: Database.Database,
  accountId: number,
  plan: PlanItem[],
  rules: Rule[] = listRules(db),
): Map<number, RowEnrichment> {
  const names = new Map(
    (db.prepare('SELECT id, name FROM categories').all() as { id: number; name: string }[]).map(
      (c) => [c.id, c.name],
    ),
  )
  const history = loadHistory(db)
  const out = new Map<number, RowEnrichment>()
  for (const p of plan) {
    if (p.outcome === 'duplicate') continue
    const c = p.candidate
    const t = target(accountId, p)
    const skip = skipRule(rules, t)
    const ruleCat = planRules(rules, t, (id) => names.has(id))?.changes.categoryId
    let category: RowEnrichment['category'] = null
    if (ruleCat !== undefined) {
      category = { id: ruleCat, name: names.get(ruleCat) ?? '', source: 'rule' }
    } else if (c.categoryName) {
      const id = categoryIdByName(db, c.categoryName)
      if (id !== null) category = { id, name: names.get(id) ?? c.categoryName, source: 'file' }
    } else {
      const g = guessFromHistory(history, c.rawDescription, c.amount)
      if (g) {
        category = {
          id: g.id,
          name: names.get(g.id) ?? '',
          source: 'history',
          agree: g.agree,
          of: g.of,
        }
      }
    }
    out.set(c.line, {
      skippedByRule: skip ? { ruleId: skip.id, ruleName: skip.name } : null,
      category,
    })
  }
  return out
}
