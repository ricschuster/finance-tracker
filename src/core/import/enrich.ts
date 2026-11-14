import type Database from 'better-sqlite3'
import { planRules, skipRule } from '../rules/engine'
import { listRules } from '../rules/store'
import type { Rule, RuleTarget } from '../rules/types'
import { allowedEdits, editDistance } from '../rules/fuzzy'
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
    /** For `history`: the guess pooled similar spellings because the exact text was never seen. */
    similar?: boolean
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
  /** True when no earlier row had the same pattern and the guess pools similar spellings. */
  similar: boolean
}

/** Fuzzy history matching only trusts words of at least this many letters ("shall" is not "shell"). */
const MIN_FUZZY_WORD = 6

/** Words of a history pattern that are close enough to be the same shop, in the same order. */
function similarPatterns(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  let fuzzy = false
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!
    const y = b[i]!
    if (x === y) continue
    if (Math.min(x.length, y.length) < MIN_FUZZY_WORD) return false
    const max = allowedEdits(Math.min(x.length, y.length))
    if (editDistance(x, y, max) > max) return false
    fuzzy = true
  }
  return fuzzy
}

function pick(counts: Map<number, number>, similar: boolean): HistoryGuess | null {
  const total = [...counts.values()].reduce((a, b) => a + b, 0)
  const [id, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]!
  return n / total >= MIN_SHARE ? { id, agree: n, of: total, similar } : null
}

/** Per history map: the keys split into words, by direction, built once. */
const fuzzyIndex = new WeakMap<
  Map<string, Map<number, number>>,
  { words: string[]; counts: Map<number, number> }[][]
>()

function indexFor(history: Map<string, Map<number, number>>) {
  let idx = fuzzyIndex.get(history)
  if (!idx) {
    idx = [[], []]
    for (const [key, counts] of history) {
      const sep = key.lastIndexOf('|')
      const dir = key.slice(sep + 1) === 'true' ? 1 : 0
      idx[dir]!.push({ words: key.slice(0, sep).split(' '), counts })
    }
    fuzzyIndex.set(history, idx)
  }
  return idx
}

/**
 * The most common category for this description and direction, if enough earlier rows agree. An
 * exact match on the description pattern always wins. Only when there is none are similar
 * patterns pooled ("SAFWAY" with "SAFEWAY"), and then every word must be six letters or more
 * to differ at all, so short look-alikes such as "shall" and "shell" stay apart.
 */
export function guessFromHistory(
  history: Map<string, Map<number, number>>,
  rawDescription: string,
  amount: number,
): HistoryGuess | null {
  const pattern = suggestPattern(rawDescription).toLowerCase()
  const exact = history.get(`${pattern}|${amount < 0}`)
  if (exact) return pick(exact, false)
  if (!pattern) return null
  const words = pattern.split(' ')
  if (!words.some((w) => w.length >= MIN_FUZZY_WORD)) return null
  // Imports repeat descriptions a lot, so remember the pooled answer per pattern.
  const memoKey = `${pattern}|${amount < 0}`
  let memo = pooledMemo.get(history)
  if (!memo) pooledMemo.set(history, (memo = new Map()))
  const hit = memo.get(memoKey)
  if (hit !== undefined) return hit
  const result = poolSimilar(history, words, amount < 0)
  memo.set(memoKey, result)
  return result
}

const pooledMemo = new WeakMap<Map<string, Map<number, number>>, Map<string, HistoryGuess | null>>()

function poolSimilar(
  history: Map<string, Map<number, number>>,
  words: string[],
  expense: boolean,
): HistoryGuess | null {
  const pooled = new Map<number, number>()
  for (const e of indexFor(history)[expense ? 1 : 0]!) {
    if (!similarPatterns(words, e.words)) continue
    for (const [id, n] of e.counts) pooled.set(id, (pooled.get(id) ?? 0) + n)
  }
  return pooled.size > 0 ? pick(pooled, true) : null
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
          similar: g.similar,
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
