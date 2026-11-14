import type Database from 'better-sqlite3'
import { deleteTransaction } from './transactions'
import { daysBetween, normaliseDescription } from '../import/match'

export const DUPLICATE_WINDOW_DAYS = 2

/** `strict`: identical text. `normal`: identical, or one contains the other, or mostly shared words. */
export type DuplicateStrictness = 'strict' | 'normal'

export interface DuplicateOptions {
  /** Largest gap in days between two rows of a group. 0 means the same day only. Default 2. */
  windowDays?: number
  strictness?: DuplicateStrictness
  /** Also match rows in different accounts (the same row imported into two accounts). Default true. */
  crossAccount?: boolean
}

export interface DuplicateTransaction {
  id: number
  accountId: number
  accountName: string
  date: string
  /** The transaction total in cents. Splits are compared by this total, never by their lines. */
  amount: number
  description: string
  split: boolean
  imported: boolean
}

export interface DuplicateGroup {
  transactions: DuplicateTransaction[]
  /** 0 to 100, higher is more likely a true duplicate. */
  score: number
  reason: string
}

interface Row {
  id: number
  account_id: number
  account_name: string
  date: string
  amount: number
  raw_description: string
  payee: string
  lines: number
  batch: number | null
}

/** Lowercase, drop punctuation and collapse spaces, so "STARBUCKS #123" and "Starbucks 123" agree. */
function textKey(r: Row): string {
  return normaliseDescription(r.payee || r.raw_description)
    .replace(/[^\p{L}\p{N} ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 1 for identical, otherwise the share of words in common (0 when none), with containment scoring high. */
export function textSimilarity(a: string, b: string): number {
  if (a === b) return 1
  if (a === '' || b === '') return 0
  if (a.includes(b) || b.includes(a)) return 0.85
  const wa = new Set(a.split(' '))
  const wb = new Set(b.split(' '))
  let shared = 0
  for (const w of wa) if (wb.has(w)) shared++
  return shared / (wa.size + wb.size - shared)
}

const NORMAL_THRESHOLD = 0.6

/**
 * Likely duplicates among existing transactions. Two rows are a candidate pair when they are in
 * the same account, have the same total, fall within the window and read alike (the same
 * normalisation as import matching). Transfer legs and zero amounts are skipped. Pairs the user
 * marked "not a duplicate" are ignored. Pairs that share a row are merged into one group.
 */
export function findDuplicateGroups(
  db: Database.Database,
  opts: DuplicateOptions = {},
): DuplicateGroup[] {
  const windowDays = Math.max(0, Math.floor(opts.windowDays ?? DUPLICATE_WINDOW_DAYS))
  const strictness = opts.strictness ?? 'normal'
  const cross = opts.crossAccount ?? true
  const rows = db
    .prepare(
      `SELECT t.id, t.account_id, a.name AS account_name, t.date, t.amount, t.raw_description,
              t.payee, (SELECT COUNT(*) FROM transaction_lines l WHERE l.transaction_id = t.id) AS lines,
              t.import_batch_id AS batch
       FROM transactions t JOIN accounts a ON a.id = t.account_id
       WHERE t.transfer_peer_id IS NULL AND a.archived = 0 AND t.amount <> 0
       ORDER BY ${cross ? '' : 't.account_id, '}t.amount, t.date, t.id`,
    )
    .all() as Row[]
  const dismissed = new Set(
    (
      db.prepare('SELECT txn_a, txn_b FROM duplicate_dismissals').all() as Array<{
        txn_a: number
        txn_b: number
      }>
    ).map((d) => `${d.txn_a}:${d.txn_b}`),
  )

  const keys = new Map(rows.map((r) => [r.id, textKey(r)]))
  const parent = new Map<number, number>()
  const find = (x: number): number => {
    let p = parent.get(x) ?? x
    while (p !== (parent.get(p) ?? p)) p = parent.get(p) ?? p
    parent.set(x, p)
    return p
  }
  const pairScore = new Map<string, number>()

  for (let i = 0; i < rows.length; i++) {
    const a = rows[i]!
    for (let j = i + 1; j < rows.length; j++) {
      const b = rows[j]!
      if (b.amount !== a.amount) break
      if (!cross && b.account_id !== a.account_id) break
      if (daysBetween(a.date, b.date) > windowDays && cross) {
        // Sorted by date within an amount, so later rows are only further away.
        break
      }
      const gap = daysBetween(a.date, b.date)
      if (gap > windowDays) continue
      const lo = Math.min(a.id, b.id)
      const hi = Math.max(a.id, b.id)
      if (dismissed.has(`${lo}:${hi}`)) continue
      const sim = textSimilarity(keys.get(a.id)!, keys.get(b.id)!)
      if (strictness === 'strict' ? sim < 1 : sim < NORMAL_THRESHOLD) continue
      pairScore.set(`${lo}:${hi}`, Math.round(100 * (0.4 + 0.6 * sim) - gap * 5))
      parent.set(find(a.id), find(b.id))
    }
  }

  const byRoot = new Map<number, Row[]>()
  for (const r of rows) {
    if (!parent.has(r.id)) continue
    const root = find(r.id)
    byRoot.set(root, [...(byRoot.get(root) ?? []), r])
  }
  const groups: DuplicateGroup[] = []
  for (const members of byRoot.values()) {
    if (members.length < 2) continue
    members.sort((x, y) => x.date.localeCompare(y.date) || x.id - y.id)
    let score = 100
    let maxGap = 0
    let identical = true
    for (let i = 0; i < members.length; i++)
      for (let j = i + 1; j < members.length; j++) {
        const m = members[i]!
        const n = members[j]!
        const s = pairScore.get(`${Math.min(m.id, n.id)}:${Math.max(m.id, n.id)}`)
        if (s !== undefined) score = Math.min(score, s)
        maxGap = Math.max(maxGap, daysBetween(m.date, n.date))
        if (keys.get(m.id) !== keys.get(n.id)) identical = false
      }
    const when = maxGap === 0 ? 'on the same day' : `within ${maxGap} day${maxGap === 1 ? '' : 's'}`
    groups.push({
      transactions: members.map((r) => ({
        id: r.id,
        accountId: r.account_id,
        accountName: r.account_name,
        date: r.date,
        amount: r.amount,
        description: r.payee || r.raw_description,
        split: r.lines > 1,
        imported: r.batch !== null,
      })),
      score: Math.max(score, 0),
      reason: `${new Set(members.map((m) => m.account_id)).size > 1 ? 'Same amount, different accounts,' : 'Same account and amount'} ${when}, ${identical ? 'identical' : 'similar'} description`,
    })
  }
  return groups.sort(
    (x, y) => y.score - x.score || x.transactions[0]!.date.localeCompare(y.transactions[0]!.date),
  )
}

/** Remember that these rows are not duplicates of each other; every pair among them is hidden. */
export function dismissDuplicateGroup(db: Database.Database, ids: number[]): void {
  const ins = db.prepare('INSERT OR IGNORE INTO duplicate_dismissals (txn_a, txn_b) VALUES (?, ?)')
  db.transaction(() => {
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++)
        ins.run(Math.min(ids[i]!, ids[j]!), Math.max(ids[i]!, ids[j]!))
  })()
}

/**
 * Delete every row of each group except the first listed, so each group keeps exactly one row.
 * Groups with fewer than two distinct rows are left alone. Returns the ids deleted.
 */
export function keepOneOfEach(db: Database.Database, groups: number[][]): number[] {
  const deleted: number[] = []
  db.transaction(() => {
    for (const g of groups) {
      const ids = [...new Set(g)]
      for (const id of ids.slice(1)) {
        deleteTransaction(db, id)
        deleted.push(id)
      }
    }
  })()
  return deleted
}
