import type Database from 'better-sqlite3'

/** Milestone 2: accounts, categories, transactions with split lines, tags. See ADR 0003. */
const LEDGER_SCHEMA = `
CREATE TABLE accounts (
  id               INTEGER PRIMARY KEY,
  name             TEXT NOT NULL COLLATE NOCASE UNIQUE,
  type             TEXT NOT NULL CHECK (type IN ('checking','savings','credit_card','cash','loan','other')),
  opening_balance  INTEGER NOT NULL DEFAULT 0,
  archived         INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0,1)),
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE categories (
  id         INTEGER PRIMARY KEY,
  parent_id  INTEGER REFERENCES categories(id) ON DELETE RESTRICT,
  name       TEXT NOT NULL COLLATE NOCASE,
  kind       TEXT NOT NULL DEFAULT 'expense' CHECK (kind IN ('expense','income','transfer')),
  is_system  INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX categories_name_unique ON categories (COALESCE(parent_id, 0), name);

CREATE TABLE transactions (
  id               INTEGER PRIMARY KEY,
  account_id       INTEGER NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  date             TEXT NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  amount           INTEGER NOT NULL,
  raw_description  TEXT NOT NULL DEFAULT '',
  payee            TEXT NOT NULL DEFAULT '',
  notes            TEXT NOT NULL DEFAULT '',
  status           TEXT NOT NULL DEFAULT 'cleared' CHECK (status IN ('pending','cleared','reconciled')),
  transfer_peer_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL,
  edited_fields    TEXT NOT NULL DEFAULT '[]',
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX transactions_account_date ON transactions (account_id, date);
CREATE INDEX transactions_date ON transactions (date);
CREATE INDEX transactions_transfer_peer ON transactions (transfer_peer_id);

CREATE TABLE transaction_lines (
  id             INTEGER PRIMARY KEY,
  transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  category_id    INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  amount         INTEGER NOT NULL,
  memo           TEXT NOT NULL DEFAULT ''
);
CREATE INDEX transaction_lines_txn ON transaction_lines (transaction_id);
CREATE INDEX transaction_lines_category ON transaction_lines (category_id);

CREATE TABLE tags (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE
);

CREATE TABLE transaction_tags (
  transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  tag_id         INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (transaction_id, tag_id)
);
CREATE INDEX transaction_tags_tag ON transaction_tags (tag_id);

INSERT INTO categories (name, kind, is_system, sort_order) VALUES
  ('Auto & Transport','expense',0,1),
  ('Bills & Utilities','expense',0,2),
  ('Food & Dining','expense',0,3),
  ('Groceries','expense',0,4),
  ('Health & Fitness','expense',0,5),
  ('Home','expense',0,6),
  ('Income','income',0,7),
  ('Shopping','expense',0,8),
  ('Travel','expense',0,9),
  ('Entertainment','expense',0,10),
  ('Fees','expense',0,11),
  ('Gifts & Donations','expense',0,12),
  ('Kids','expense',0,13),
  ('Personal Care','expense',0,14),
  ('Taxes','expense',0,15),
  ('Transfer','transfer',1,16),
  ('Uncategorized','expense',1,17);
`

/**
 * Ordered, append-only list of migrations. Never edit one that has shipped;
 * add a new entry. The schema version is stored in SQLite's user_version.
 */
export const migrations: readonly string[] = [
  `CREATE TABLE settings (
     key   TEXT PRIMARY KEY,
     value TEXT NOT NULL
   );
   INSERT INTO settings (key, value) VALUES ('home_currency', 'CAD');`,
  LEDGER_SCHEMA,
]

export function migrate(db: Database.Database, list: readonly string[] = migrations): number {
  const current = db.pragma('user_version', { simple: true }) as number
  if (current > list.length) {
    throw new Error(`Database version ${current} is newer than this app supports (${list.length})`)
  }
  for (let v = current; v < list.length; v++) {
    const sql = list[v] as string
    db.transaction(() => {
      db.exec(sql)
      db.pragma(`user_version = ${v + 1}`)
    })()
  }
  return list.length
}
