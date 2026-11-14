import type Database from 'better-sqlite3'

export const PAIR_WINDOW_DAYS = 3

/**
 * Bank wording that marks a row as paying a card or loan. Matches "MB-CREDIT CARD/LOC PAY.",
 * "PAYMENT - THANK YOU", "TD VISA", "AUTOPAY" and similar.
 */
export const PAYMENT_WORDS =
  /\b(payment|pmt|pymt|pay|paiement|autopay|bill pay|credit card|visa|mastercard|master card|amex|loc|loan)\b/i

export interface PairSide {
  id: number
  accountId: number
  accountName: string
  date: string
  amount: number
  description: string
}

export interface TransferPairSuggestion {
  /** The money leaving the paying account (negative). */
  from: PairSide
  /** The matching reduction of the card or loan (positive). */
  to: PairSide
}

interface Row {
  id: number
  account_id: number
  account_name: string
  account_type: string
  date: string
  amount: number
  description: string
  lines: number
}

const dayNumber = (iso: string): number => {
  const [y, m, d] = iso.split('-').map(Number)
  return Math.round(Date.UTC(y!, m! - 1, d!) / 86_400_000)
}

const side = (r: Row): PairSide => ({
  id: r.id,
  accountId: r.account_id,
  accountName: r.account_name,
  date: r.date,
  amount: r.amount,
  description: r.description,
})

/**
 * Unlinked pairs that look like a card or loan payment: a positive row in a credit card or loan
 * account and an equal negative row in a different, non-liability account within a few days.
 * Each row is used at most once; the closest dates win. Only rows that are not split, and only
 * pairs where one side's text reads like a payment, are offered, so a coincidence of amounts is
 * not enough.
 */
export function findTransferPairs(
  db: Database.Database,
  windowDays: number = PAIR_WINDOW_DAYS,
): TransferPairSuggestion[] {
  const rows = db
    .prepare(
      `SELECT t.id, t.account_id, a.name AS account_name, a.type AS account_type, t.date, t.amount,
              COALESCE(NULLIF(t.payee, ''), t.raw_description) AS description,
              (SELECT COUNT(*) FROM transaction_lines l WHERE l.transaction_id = t.id) AS lines
       FROM transactions t JOIN accounts a ON a.id = t.account_id
       WHERE t.transfer_peer_id IS NULL AND a.archived = 0 AND t.amount <> 0
       ORDER BY t.date, t.id`,
    )
    .all() as Row[]
  const liability = (r: Row) => r.account_type === 'credit_card' || r.account_type === 'loan'
  const credits = rows.filter((r) => liability(r) && r.amount > 0 && r.lines === 1)
  const debits = rows.filter((r) => !liability(r) && r.amount < 0 && r.lines === 1)

  const candidates: Array<{ c: Row; d: Row; gap: number }> = []
  for (const c of credits)
    for (const d of debits) {
      if (d.amount !== -c.amount || d.account_id === c.account_id) continue
      const gap = Math.abs(dayNumber(c.date) - dayNumber(d.date))
      if (gap > windowDays) continue
      if (!PAYMENT_WORDS.test(c.description) && !PAYMENT_WORDS.test(d.description)) continue
      candidates.push({ c, d, gap })
    }
  candidates.sort((x, y) => x.gap - y.gap || x.c.id - y.c.id || x.d.id - y.d.id)
  const used = new Set<number>()
  const out: TransferPairSuggestion[] = []
  for (const { c, d } of candidates) {
    if (used.has(c.id) || used.has(d.id)) continue
    used.add(c.id)
    used.add(d.id)
    out.push({ from: side(d), to: side(c) })
  }
  return out.sort((a, b) => a.from.date.localeCompare(b.from.date) || a.from.id - b.from.id)
}

/** Link two existing transactions as a transfer pair and move them to the Transfer category. */
export function linkTransferPair(db: Database.Database, aId: number, bId: number): void {
  db.transaction(() => {
    const get = db.prepare(
      'SELECT account_id, amount, transfer_peer_id FROM transactions WHERE id = ?',
    )
    type T = { account_id: number; amount: number; transfer_peer_id: number | null }
    const a = get.get(aId) as T | undefined
    const b = get.get(bId) as T | undefined
    if (!a || !b) throw new Error('Transaction not found')
    if (a.account_id === b.account_id) throw new Error('Transfer needs two different accounts')
    if (a.amount !== -b.amount) throw new Error('Transfer amounts must be opposite')
    if (a.transfer_peer_id !== null || b.transfer_peer_id !== null)
      throw new Error('Already part of a transfer')
    const count = db.prepare(
      'SELECT COUNT(*) AS n FROM transaction_lines WHERE transaction_id IN (?, ?) GROUP BY transaction_id',
    )
    if ((count.all(aId, bId) as Array<{ n: number }>).some((r) => r.n !== 1))
      throw new Error('Cannot link a split transaction as a transfer')
    const cat = db
      .prepare("SELECT id FROM categories WHERE name = 'Transfer' AND parent_id IS NULL")
      .get() as { id: number }
    db.prepare('UPDATE transaction_lines SET category_id = ? WHERE transaction_id IN (?, ?)').run(
      cat.id,
      aId,
      bId,
    )
    const link = db.prepare('UPDATE transactions SET transfer_peer_id = ? WHERE id = ?')
    link.run(bId, aId)
    link.run(aId, bId)
  })()
}
