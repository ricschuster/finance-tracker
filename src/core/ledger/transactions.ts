import type Database from 'better-sqlite3'

export type TransactionStatus = 'pending' | 'cleared' | 'reconciled'

/** Fields a user can edit by hand; rules must not overwrite these once marked. */
export type EditableField =
  'date' | 'amount' | 'payee' | 'notes' | 'status' | 'account' | 'categories' | 'tags'

export interface LineInput {
  categoryId: number
  amount: number
  memo?: string
}

export interface TransactionLine {
  id: number
  categoryId: number
  categoryName: string
  amount: number
  memo: string
}

export interface Transaction {
  id: number
  accountId: number
  date: string
  amount: number
  rawDescription: string
  payee: string
  notes: string
  status: TransactionStatus
  transferPeerId: number | null
  /** Counted in reports but skipped by budgets. Never set by rules. */
  excludeFromBudgets: boolean
  editedFields: EditableField[]
  lines: TransactionLine[]
  tags: string[]
}

export interface NewTransaction {
  accountId: number
  date: string
  amount: number
  rawDescription?: string
  payee?: string
  notes?: string
  status?: TransactionStatus
  /** Omit for an unsplit transaction; it gets one Uncategorized line. */
  lines?: LineInput[]
  tags?: string[]
}

export interface TransactionFilter {
  accountId?: number
  /** Matches lines in this category or any of its children. */
  categoryId?: number
  tag?: string
  status?: TransactionStatus
  /** Inclusive ISO dates. */
  from?: string
  to?: string
  limit?: number
  offset?: number
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function assertCents(n: number, what: string): void {
  if (!Number.isSafeInteger(n)) throw new Error(`${what} must be integer cents`)
}

function assertDate(d: string): void {
  const parsed = new Date(`${d}T00:00:00Z`)
  if (
    !ISO_DATE.test(d) ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== d
  ) {
    throw new Error(`Invalid date: ${d}`)
  }
}

function assertLines(lines: LineInput[], total: number): void {
  if (lines.length === 0) throw new Error('A transaction needs at least one line')
  let sum = 0
  for (const l of lines) {
    assertCents(l.amount, 'Line amount')
    sum += l.amount
  }
  if (sum !== total) throw new Error(`Line amounts sum to ${sum}, expected ${total}`)
}

function categoryIdByName(db: Database.Database, name: string): number {
  const row = db
    .prepare('SELECT id FROM categories WHERE name = ? AND parent_id IS NULL')
    .get(name) as { id: number } | undefined
  if (!row) throw new Error(`Category ${name} is missing`)
  return row.id
}

function writeLines(db: Database.Database, txnId: number, lines: LineInput[]): void {
  db.prepare('DELETE FROM transaction_lines WHERE transaction_id = ?').run(txnId)
  const ins = db.prepare(
    'INSERT INTO transaction_lines (transaction_id, category_id, amount, memo) VALUES (?, ?, ?, ?)',
  )
  for (const l of lines) ins.run(txnId, l.categoryId, l.amount, l.memo ?? '')
}

function writeTags(db: Database.Database, txnId: number, tags: string[]): void {
  db.prepare('DELETE FROM transaction_tags WHERE transaction_id = ?').run(txnId)
  const seen = new Set<string>()
  const names = tags
    .map((t) => t.trim())
    .filter((t) => t && !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()))
  const upsert = db.prepare('INSERT INTO tags (name) VALUES (?) ON CONFLICT(name) DO NOTHING')
  const find = db.prepare('SELECT id FROM tags WHERE name = ?')
  const link = db.prepare('INSERT INTO transaction_tags (transaction_id, tag_id) VALUES (?, ?)')
  for (const name of names) {
    upsert.run(name)
    link.run(txnId, (find.get(name) as { id: number }).id)
  }
}

function markEdited(db: Database.Database, id: number, fields: EditableField[]): void {
  const row = db.prepare('SELECT edited_fields FROM transactions WHERE id = ?').get(id) as {
    edited_fields: string
  }
  const merged = [...new Set([...(JSON.parse(row.edited_fields) as EditableField[]), ...fields])]
  db.prepare(
    "UPDATE transactions SET edited_fields = ?, updated_at = datetime('now') WHERE id = ?",
  ).run(JSON.stringify(merged), id)
}

function insertTransaction(db: Database.Database, input: NewTransaction): number {
  assertCents(input.amount, 'Amount')
  assertDate(input.date)
  const lines = input.lines ?? [
    { categoryId: categoryIdByName(db, 'Uncategorized'), amount: input.amount },
  ]
  assertLines(lines, input.amount)
  const id = Number(
    db
      .prepare(
        `INSERT INTO transactions (account_id, date, amount, raw_description, payee, notes, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.accountId,
        input.date,
        input.amount,
        input.rawDescription ?? '',
        input.payee ?? '',
        input.notes ?? '',
        input.status ?? 'cleared',
      ).lastInsertRowid,
  )
  writeLines(db, id, lines)
  writeTags(db, id, input.tags ?? [])
  return id
}

export function createTransaction(db: Database.Database, input: NewTransaction): number {
  return db.transaction(() => insertTransaction(db, input))()
}

/**
 * Create a transfer: two linked transactions, one per account, each with a single Transfer line.
 * `amount` is the positive amount moved. Returns the outgoing and incoming ids.
 */
export function createTransfer(
  db: Database.Database,
  input: {
    fromAccountId: number
    toAccountId: number
    date: string
    amount: number
    description?: string
    notes?: string
    status?: TransactionStatus
  },
): { outId: number; inId: number } {
  if (input.fromAccountId === input.toAccountId)
    throw new Error('Transfer needs two different accounts')
  assertCents(input.amount, 'Amount')
  if (input.amount <= 0) throw new Error('Transfer amount must be positive')
  return db.transaction(() => {
    const transfer = categoryIdByName(db, 'Transfer')
    const base = {
      date: input.date,
      rawDescription: input.description ?? 'Transfer',
      payee: input.description ?? 'Transfer',
      notes: input.notes,
      status: input.status,
    }
    const outId = insertTransaction(db, {
      ...base,
      accountId: input.fromAccountId,
      amount: -input.amount,
      lines: [{ categoryId: transfer, amount: -input.amount }],
    })
    const inId = insertTransaction(db, {
      ...base,
      accountId: input.toAccountId,
      amount: input.amount,
      lines: [{ categoryId: transfer, amount: input.amount }],
    })
    const link = db.prepare('UPDATE transactions SET transfer_peer_id = ? WHERE id = ?')
    link.run(inId, outId)
    link.run(outId, inId)
    return { outId, inId }
  })()
}

export interface TransactionPatch {
  accountId?: number
  date?: string
  amount?: number
  payee?: string
  notes?: string
  status?: TransactionStatus
  lines?: LineInput[]
  tags?: string[]
  excludeFromBudgets?: boolean
}

/**
 * Edit a transaction by hand. Touched fields are recorded in edited_fields so rules never
 * overwrite them. Changing the amount of a split transaction requires new `lines`; an unsplit
 * one has its single line rescaled. For a transfer, date and amount changes propagate to the peer.
 */
export function updateTransaction(
  db: Database.Database,
  id: number,
  patch: TransactionPatch,
): void {
  db.transaction(() => {
    const cur = getTransaction(db, id)
    if (!cur) throw new Error(`Transaction ${id} not found`)
    const edited: EditableField[] = []

    const amount = patch.amount ?? cur.amount
    const date = patch.date ?? cur.date
    assertCents(amount, 'Amount')
    assertDate(date)
    if (cur.transferPeerId !== null && patch.lines) {
      throw new Error('Transfer lines cannot be edited')
    }
    if (
      patch.accountId !== undefined &&
      patch.accountId === getPeerAccount(db, cur.transferPeerId)
    ) {
      throw new Error('Transfer needs two different accounts')
    }

    let lines = patch.lines
    if (!lines && amount !== cur.amount) {
      if (cur.lines.length !== 1)
        throw new Error('Provide new lines when changing the amount of a split transaction')
      lines = [{ categoryId: cur.lines[0]!.categoryId, amount, memo: cur.lines[0]!.memo }]
    }
    if (lines) assertLines(lines, amount)

    db.prepare(
      'UPDATE transactions SET account_id = ?, date = ?, amount = ?, payee = ?, notes = ?, status = ? WHERE id = ?',
    ).run(
      patch.accountId ?? cur.accountId,
      date,
      amount,
      patch.payee ?? cur.payee,
      patch.notes ?? cur.notes,
      patch.status ?? cur.status,
      id,
    )
    if (patch.accountId !== undefined) edited.push('account')
    if (patch.date !== undefined) edited.push('date')
    if (patch.amount !== undefined) edited.push('amount')
    if (patch.payee !== undefined) edited.push('payee')
    if (patch.notes !== undefined) edited.push('notes')
    if (patch.status !== undefined) edited.push('status')
    if (patch.lines) edited.push('categories')
    if (lines) writeLines(db, id, lines)
    if (patch.tags) {
      writeTags(db, id, patch.tags)
      edited.push('tags')
    }
    if (patch.excludeFromBudgets !== undefined) {
      // A display flag for budgets only, so it is not a rule-locked field.
      db.prepare('UPDATE transactions SET exclude_from_budgets = ? WHERE id = ?').run(
        patch.excludeFromBudgets ? 1 : 0,
        id,
      )
    }
    markEdited(db, id, edited)

    if (cur.transferPeerId !== null && (patch.date !== undefined || patch.amount !== undefined)) {
      const peerAmount = -amount
      db.prepare('UPDATE transactions SET date = ?, amount = ? WHERE id = ?').run(
        date,
        peerAmount,
        cur.transferPeerId,
      )
      db.prepare('UPDATE transaction_lines SET amount = ? WHERE transaction_id = ?').run(
        peerAmount,
        cur.transferPeerId,
      )
      markEdited(
        db,
        cur.transferPeerId,
        edited.filter((f) => f === 'date' || f === 'amount'),
      )
    }
  })()
}

function getPeerAccount(db: Database.Database, peerId: number | null): number | undefined {
  if (peerId === null) return undefined
  return (
    db.prepare('SELECT account_id FROM transactions WHERE id = ?').get(peerId) as
      { account_id: number } | undefined
  )?.account_id
}

/** Delete a transaction. Deleting one side of a transfer deletes both. */
export function deleteTransaction(db: Database.Database, id: number): void {
  db.transaction(() => {
    const row = db.prepare('SELECT transfer_peer_id FROM transactions WHERE id = ?').get(id) as
      { transfer_peer_id: number | null } | undefined
    if (!row) throw new Error(`Transaction ${id} not found`)
    const del = db.prepare('DELETE FROM transactions WHERE id = ?')
    del.run(id)
    if (row.transfer_peer_id !== null) del.run(row.transfer_peer_id)
  })()
}

export interface TxnRow {
  id: number
  account_id: number
  date: string
  amount: number
  raw_description: string
  payee: string
  notes: string
  status: TransactionStatus
  transfer_peer_id: number | null
  exclude_from_budgets: number
  edited_fields: string
}

export function hydrate(db: Database.Database, rows: TxnRow[]): Transaction[] {
  if (rows.length === 0) return []
  const ids = rows.map((r) => r.id)
  const marks = ids.map(() => '?').join(',')
  const lineRows = db
    .prepare(
      `SELECT l.id, l.transaction_id, l.category_id, c.name AS category_name, l.amount, l.memo
       FROM transaction_lines l JOIN categories c ON c.id = l.category_id
       WHERE l.transaction_id IN (${marks}) ORDER BY l.id`,
    )
    .all(...ids) as {
    id: number
    transaction_id: number
    category_id: number
    category_name: string
    amount: number
    memo: string
  }[]
  const tagRows = db
    .prepare(
      `SELECT tt.transaction_id, t.name FROM transaction_tags tt JOIN tags t ON t.id = tt.tag_id
       WHERE tt.transaction_id IN (${marks}) ORDER BY t.name`,
    )
    .all(...ids) as { transaction_id: number; name: string }[]
  const lines = new Map<number, TransactionLine[]>()
  for (const l of lineRows) {
    const list = lines.get(l.transaction_id) ?? []
    list.push({
      id: l.id,
      categoryId: l.category_id,
      categoryName: l.category_name,
      amount: l.amount,
      memo: l.memo,
    })
    lines.set(l.transaction_id, list)
  }
  const tags = new Map<number, string[]>()
  for (const t of tagRows) {
    const list = tags.get(t.transaction_id) ?? []
    list.push(t.name)
    tags.set(t.transaction_id, list)
  }
  return rows.map((r) => ({
    id: r.id,
    accountId: r.account_id,
    date: r.date,
    amount: r.amount,
    rawDescription: r.raw_description,
    payee: r.payee,
    notes: r.notes,
    status: r.status,
    transferPeerId: r.transfer_peer_id,
    excludeFromBudgets: r.exclude_from_budgets === 1,
    editedFields: JSON.parse(r.edited_fields) as EditableField[],
    lines: lines.get(r.id) ?? [],
    tags: tags.get(r.id) ?? [],
  }))
}

export function getTransaction(db: Database.Database, id: number): Transaction | undefined {
  const row = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id) as TxnRow | undefined
  return row ? hydrate(db, [row])[0] : undefined
}

/** Newest first, ties broken by id descending. */
export function listTransactions(
  db: Database.Database,
  filter: TransactionFilter = {},
): Transaction[] {
  const where: string[] = []
  const params: unknown[] = []
  if (filter.accountId !== undefined) {
    where.push('t.account_id = ?')
    params.push(filter.accountId)
  }
  if (filter.status) {
    where.push('t.status = ?')
    params.push(filter.status)
  }
  if (filter.from) {
    where.push('t.date >= ?')
    params.push(filter.from)
  }
  if (filter.to) {
    where.push('t.date <= ?')
    params.push(filter.to)
  }
  if (filter.categoryId !== undefined) {
    where.push(
      `EXISTS (SELECT 1 FROM transaction_lines l JOIN categories c ON c.id = l.category_id
               WHERE l.transaction_id = t.id AND (c.id = ? OR c.parent_id = ?))`,
    )
    params.push(filter.categoryId, filter.categoryId)
  }
  if (filter.tag) {
    where.push(
      `EXISTS (SELECT 1 FROM transaction_tags tt JOIN tags g ON g.id = tt.tag_id
               WHERE tt.transaction_id = t.id AND g.name = ?)`,
    )
    params.push(filter.tag)
  }
  const sql = `SELECT t.* FROM transactions t ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
               ORDER BY t.date DESC, t.id DESC LIMIT ? OFFSET ?`
  params.push(filter.limit ?? 100, filter.offset ?? 0)
  return hydrate(db, db.prepare(sql).all(...params) as TxnRow[])
}
