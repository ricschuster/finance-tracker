import type Database from 'better-sqlite3'

export const ACCOUNT_TYPES = [
  'checking',
  'savings',
  'credit_card',
  'cash',
  'loan',
  'other',
] as const
export type AccountType = (typeof ACCOUNT_TYPES)[number]

export interface Account {
  id: number
  name: string
  type: AccountType
  openingBalance: number
  archived: boolean
}

interface AccountRow {
  id: number
  name: string
  type: AccountType
  opening_balance: number
  archived: number
}

const toAccount = (r: AccountRow): Account => ({
  id: r.id,
  name: r.name,
  type: r.type,
  openingBalance: r.opening_balance,
  archived: r.archived === 1,
})

export function createAccount(
  db: Database.Database,
  input: { name: string; type: AccountType; openingBalance?: number },
): number {
  const name = input.name.trim()
  if (!name) throw new Error('Account name is required')
  const opening = input.openingBalance ?? 0
  if (!Number.isInteger(opening)) throw new Error('Opening balance must be integer cents')
  return Number(
    db
      .prepare('INSERT INTO accounts (name, type, opening_balance) VALUES (?, ?, ?)')
      .run(name, input.type, opening).lastInsertRowid,
  )
}

export function listAccounts(
  db: Database.Database,
  opts: { includeArchived?: boolean } = {},
): Account[] {
  const sql = `SELECT * FROM accounts ${opts.includeArchived ? '' : 'WHERE archived = 0'} ORDER BY name`
  return (db.prepare(sql).all() as AccountRow[]).map(toAccount)
}

export function getAccount(db: Database.Database, id: number): Account | undefined {
  const row = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id) as AccountRow | undefined
  return row && toAccount(row)
}

export function updateAccount(
  db: Database.Database,
  id: number,
  patch: { name?: string; type?: AccountType; openingBalance?: number; archived?: boolean },
): void {
  const cur = getAccount(db, id)
  if (!cur) throw new Error(`Account ${id} not found`)
  const name = (patch.name ?? cur.name).trim()
  if (!name) throw new Error('Account name is required')
  const opening = patch.openingBalance ?? cur.openingBalance
  if (!Number.isInteger(opening)) throw new Error('Opening balance must be integer cents')
  db.prepare(
    'UPDATE accounts SET name = ?, type = ?, opening_balance = ?, archived = ? WHERE id = ?',
  ).run(name, patch.type ?? cur.type, opening, (patch.archived ?? cur.archived) ? 1 : 0, id)
}

/** Opening balance plus the sum of all transactions in the account. */
export function accountBalance(db: Database.Database, id: number): number {
  const row = db
    .prepare(
      `SELECT a.opening_balance + COALESCE((SELECT SUM(amount) FROM transactions WHERE account_id = a.id), 0) AS balance
       FROM accounts a WHERE a.id = ?`,
    )
    .get(id) as { balance: number } | undefined
  if (!row) throw new Error(`Account ${id} not found`)
  return row.balance
}

export type AccountWithBalance = Account & { balance: number }

export function listAccountsWithBalance(
  db: Database.Database,
  opts: { includeArchived?: boolean } = {},
): AccountWithBalance[] {
  return listAccounts(db, opts).map((a) => ({ ...a, balance: accountBalance(db, a.id) }))
}

export interface AccountImpact {
  /** Transactions in the account itself. */
  transactions: number
  /** Transfer halves in other accounts that would be deleted with them. */
  transferPeers: number
}

export function accountImpact(db: Database.Database, id: number): AccountImpact {
  if (!getAccount(db, id)) throw new Error(`Account ${id} not found`)
  const own = db.prepare('SELECT COUNT(*) AS n FROM transactions WHERE account_id = ?').get(id) as {
    n: number
  }
  const peers = db
    .prepare(
      `SELECT COUNT(*) AS n FROM transactions
       WHERE account_id <> ? AND id IN (SELECT transfer_peer_id FROM transactions WHERE account_id = ?)`,
    )
    .get(id, id) as { n: number }
  return { transactions: own.n, transferPeers: peers.n }
}

/**
 * Delete an account. An account with transactions is only deleted when `deleteTransactions` is
 * set, and then its transactions go with it, including the other half of any transfer.
 */
export function deleteAccount(
  db: Database.Database,
  id: number,
  opts: { deleteTransactions?: boolean } = {},
): void {
  db.transaction(() => {
    const impact = accountImpact(db, id)
    if (impact.transactions > 0 && !opts.deleteTransactions) {
      throw new Error(
        `Account has ${impact.transactions} transactions. Archive it, or confirm deleting them too.`,
      )
    }
    db.prepare(
      'DELETE FROM transactions WHERE id IN (SELECT transfer_peer_id FROM transactions WHERE account_id = ? AND transfer_peer_id IS NOT NULL)',
    ).run(id)
    db.prepare('DELETE FROM transactions WHERE account_id = ?').run(id)
    db.prepare('DELETE FROM accounts WHERE id = ?').run(id)
  })()
}
