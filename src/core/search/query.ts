import type Database from 'better-sqlite3'
import {
  hydrate,
  type Transaction,
  type TransactionStatus,
  type TxnRow,
} from '../ledger/transactions'

export interface SearchQuery {
  text?: string
  accountIds?: number[]
  categoryId?: number
  uncategorized?: boolean
  /** Leave out transfers (linked pairs and the system Transfer category), as reports do. */
  excludeTransfers?: boolean
  tag?: string
  status?: TransactionStatus
  /** Inclusive ISO dates. */
  from?: string
  to?: string
  direction?: 'expense' | 'income'
  /** Positive cents, compared with the absolute amount. */
  minAmount?: number
  maxAmount?: number
  limit?: number
  offset?: number
  /** Order of the returned page. Default is date, newest first. */
  sort?: SortKey
  dir?: 'asc' | 'desc'
}

export type SortKey = 'date' | 'payee' | 'category' | 'status' | 'amount'

const SORT_SQL: Record<SortKey, string> = {
  date: 't.date',
  payee: "LOWER(CASE WHEN t.payee <> '' THEN t.payee ELSE t.raw_description END)",
  category: `(SELECT LOWER(c.name) FROM transaction_lines l JOIN categories c ON c.id = l.category_id
              WHERE l.transaction_id = t.id ORDER BY l.id LIMIT 1)`,
  status: 't.status',
  amount: 't.amount',
}

function orderBy(q: SearchQuery): string {
  const key = q.sort ?? 'date'
  if (!(key in SORT_SQL)) throw new Error(`Unknown sort "${key}"`)
  const dir = q.dir === 'asc' ? 'ASC' : 'DESC'
  return `${SORT_SQL[key]} ${dir}, t.date DESC, t.id DESC`
}

export interface SearchResult {
  transactions: Transaction[]
  total: number
  /**
   * Signed sum of every match, not just this page. With a category filter it is the sum of the
   * matching lines only, so a split transaction counts just its share in that category.
   */
  sum: number
}

export const MAX_BULK = 10_000

const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`)

/**
 * Split typed search text into terms. Words are matched anywhere in a field, so a typed prefix
 * finds the whole word. Double quotes group a phrase. AND, OR, NOT and NEAR are ordinary words.
 * Stray `*`, parentheses, colons and unbalanced quotes are dropped rather than matched, and a
 * term with no letter or digit (a lone "-" or "'") is ignored. Apostrophes (straight or curly)
 * are ignored on both sides, so "mcdonalds" and "McDonald's" find each other.
 */
export function searchTerms(text: string): string[] {
  const terms: string[] = []
  const add = (raw: string) => {
    const t = raw
      .replace(/['‘’ʼ]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (/[\p{L}\p{N}]/u.test(t)) terms.push(t)
  }
  const parts = text.replace(/[“”]/g, '"').split('"')
  parts.forEach((part, i) => {
    if (i % 2 === 1) add(part.replace(/\*/g, ''))
    else for (const w of part.replace(/[*():]/g, ' ').split(/\s+/)) add(w)
  })
  return terms
}

const noApos = (col: string) =>
  `REPLACE(REPLACE(REPLACE(${col}, char(39), ''), char(8217), ''), char(8216), '')`

/** Build the WHERE clause (without the keyword) and its parameters. */
export function buildWhere(q: SearchQuery): { sql: string; params: unknown[] } {
  const where: string[] = []
  const params: unknown[] = []
  for (const word of searchTerms(q.text ?? '')) {
    const like = `%${likeEscape(word)}%`
    where.push(`(
      ${noApos('t.payee')} LIKE ? ESCAPE '\\' OR ${noApos('t.raw_description')} LIKE ? ESCAPE '\\' OR ${noApos('t.notes')} LIKE ? ESCAPE '\\'
      OR EXISTS (SELECT 1 FROM transaction_tags tt JOIN tags g ON g.id = tt.tag_id
                 WHERE tt.transaction_id = t.id AND ${noApos('g.name')} LIKE ? ESCAPE '\\')
      OR EXISTS (SELECT 1 FROM transaction_lines l JOIN categories c ON c.id = l.category_id
                 LEFT JOIN categories p ON p.id = c.parent_id
                 WHERE l.transaction_id = t.id
                   AND (${noApos('c.name')} LIKE ? ESCAPE '\\' OR ${noApos('p.name')} LIKE ? ESCAPE '\\')))`)
    params.push(like, like, like, like, like, like)
  }
  if (q.accountIds?.length) {
    where.push(`t.account_id IN (${q.accountIds.map(() => '?').join(',')})`)
    params.push(...q.accountIds)
  }
  if (q.categoryId !== undefined) {
    where.push(
      `EXISTS (SELECT 1 FROM transaction_lines l JOIN categories c ON c.id = l.category_id
               WHERE l.transaction_id = t.id AND (c.id = ? OR c.parent_id = ?))`,
    )
    params.push(q.categoryId, q.categoryId)
  }
  if (q.uncategorized) {
    where.push(
      `EXISTS (SELECT 1 FROM transaction_lines l JOIN categories c ON c.id = l.category_id
               WHERE l.transaction_id = t.id AND c.name = 'Uncategorized' AND c.parent_id IS NULL)`,
    )
  }
  if (q.excludeTransfers) {
    where.push(
      `t.transfer_peer_id IS NULL AND NOT EXISTS (SELECT 1 FROM transaction_lines l
         JOIN categories c ON c.id = l.category_id
         WHERE l.transaction_id = t.id AND c.is_system = 1 AND c.name = 'Transfer')`,
    )
  }
  if (q.tag) {
    where.push(
      `EXISTS (SELECT 1 FROM transaction_tags tt JOIN tags g ON g.id = tt.tag_id
               WHERE tt.transaction_id = t.id AND g.name = ?)`,
    )
    params.push(q.tag)
  }
  if (q.status) {
    where.push('t.status = ?')
    params.push(q.status)
  }
  if (q.from) {
    where.push('t.date >= ?')
    params.push(q.from)
  }
  if (q.to) {
    where.push('t.date <= ?')
    params.push(q.to)
  }
  if (q.direction === 'expense') where.push('t.amount < 0')
  if (q.direction === 'income') where.push('t.amount > 0')
  if (q.minAmount !== undefined) {
    where.push('ABS(t.amount) >= ?')
    params.push(q.minAmount)
  }
  if (q.maxAmount !== undefined) {
    where.push('ABS(t.amount) <= ?')
    params.push(q.maxAmount)
  }
  return { sql: where.length ? where.join(' AND ') : '1', params }
}

function validate(q: SearchQuery): void {
  for (const k of ['minAmount', 'maxAmount'] as const) {
    const v = q[k]
    if (v !== undefined && (!Number.isSafeInteger(v) || v < 0)) {
      throw new Error(`${k} must be non-negative integer cents`)
    }
  }
  if (q.minAmount !== undefined && q.maxAmount !== undefined && q.minAmount > q.maxAmount) {
    throw new Error('minAmount is above maxAmount')
  }
  if (q.from && q.to && q.from > q.to) throw new Error('from is after to')
}

/** Newest first unless `sort` says otherwise; ties by date then id descending. Returns one page plus the total and sum of all matches. */
export function searchTransactions(db: Database.Database, q: SearchQuery = {}): SearchResult {
  validate(q)
  const { sql, params } = buildWhere(q)
  const agg = db
    .prepare(
      `SELECT COUNT(*) AS n, COALESCE(SUM(t.amount), 0) AS s FROM transactions t WHERE ${sql}`,
    )
    .get(...params) as { n: number; s: number }
  let sum = agg.s
  if (q.categoryId !== undefined) {
    sum = (
      db
        .prepare(
          `SELECT COALESCE(SUM(l.amount), 0) AS s
           FROM transaction_lines l JOIN categories c ON c.id = l.category_id
           WHERE (c.id = ? OR c.parent_id = ?)
             AND l.transaction_id IN (SELECT t.id FROM transactions t WHERE ${sql})`,
        )
        .get(q.categoryId, q.categoryId, ...params) as { s: number }
    ).s
  }
  const limit = Math.min(Math.max(q.limit ?? 100, 1), MAX_LIMIT)
  const rows = db
    .prepare(
      `SELECT t.* FROM transactions t WHERE ${sql}
       ORDER BY ${orderBy(q)} LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, Math.max(q.offset ?? 0, 0)) as TxnRow[]
  return { transactions: hydrate(db, rows), total: agg.n, sum }
}

/** Upper bound on rows per search call; the UI pages in steps up to the full match count. */
export const MAX_LIMIT = 100_000

/** Ids of every match, for bulk actions on a whole result. Refuses more than MAX_BULK. */
export function searchTransactionIds(db: Database.Database, q: SearchQuery = {}): number[] {
  validate(q)
  const { sql, params } = buildWhere(q)
  const ids = (
    db
      .prepare(`SELECT t.id FROM transactions t WHERE ${sql} ORDER BY t.id LIMIT ?`)
      .all(...params, MAX_BULK + 1) as { id: number }[]
  ).map((r) => r.id)
  if (ids.length > MAX_BULK) throw new Error(`More than ${MAX_BULK} matches; narrow the search`)
  return ids
}

/** Ids of every match with no cap, for deleting a whole result. */
export function allMatchingIds(db: Database.Database, q: SearchQuery = {}): number[] {
  validate(q)
  const { sql, params } = buildWhere(q)
  return (
    db.prepare(`SELECT t.id FROM transactions t WHERE ${sql} ORDER BY t.id`).all(...params) as {
      id: number
    }[]
  ).map((r) => r.id)
}
