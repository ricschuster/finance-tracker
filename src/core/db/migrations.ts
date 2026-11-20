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
 * Starter child categories (ADR 0003). Names are unique across the whole tree.
 * This literal is frozen once shipped; later changes go in a new migration.
 */
const STARTER_CHILDREN: Record<string, string[]> = {
  'Auto & Transport': [
    'Gas & Fuel',
    'Parking',
    'Public Transit',
    'Ride Share',
    'Auto Insurance',
    'Service & Parts',
    'Vehicle Registration',
  ],
  'Bills & Utilities': [
    'Electricity',
    'Natural Gas',
    'Water & Sewer',
    'Internet',
    'Mobile Phone',
    'TV & Streaming Bundles',
    'Home Insurance',
  ],
  'Food & Dining': ['Restaurants', 'Coffee Shops', 'Fast Food', 'Bars & Alcohol', 'Food Delivery'],
  'Health & Fitness': ['Doctor & Dental', 'Pharmacy', 'Vision', 'Gym & Sports', 'Health Insurance'],
  Home: [
    'Rent',
    'Mortgage',
    'Furnishings',
    'Home Improvement',
    'Lawn & Garden',
    'Home Services',
    'Property Tax',
  ],
  Income: ['Paycheque', 'Bonus', 'Interest', 'Reimbursement', 'Tax Refund', 'Other Income'],
  Shopping: ['Clothing', 'Electronics & Software', 'Books & Media', 'Hobbies', 'Online Shopping'],
  Travel: ['Flights', 'Hotels & Lodging', 'Rental Car', 'Vacation Activities'],
  Entertainment: ['Movies & Events', 'Music', 'Games', 'Subscriptions'],
  Fees: ['Bank Fees', 'Interest Charges', 'Late Fees', 'Annual Fees'],
  'Gifts & Donations': ['Gifts', 'Charity'],
  Kids: ['Childcare', 'School & Supplies', 'Activities', 'Toys'],
  'Personal Care': ['Hair & Beauty', 'Spa & Massage', 'Laundry'],
  Taxes: ['Income Tax', 'Other Taxes'],
}

/** Migration 3: children inherit the parent's kind. */
const CATEGORY_CHILDREN = Object.entries(STARTER_CHILDREN)
  .flatMap(([parent, kids]) =>
    kids.map(
      (kid, i) =>
        `INSERT INTO categories (parent_id, name, kind, sort_order)
         SELECT id, '${kid.replace(/'/g, "''")}', kind, ${i + 1} FROM categories
         WHERE name = '${parent.replace(/'/g, "''")}' AND parent_id IS NULL;`,
    ),
  )
  .join('\n')

/** Migration 4: import batches, mapping profiles, and external ids. See docs/design/04_import.md. */
const IMPORT_SCHEMA = `
CREATE TABLE import_batches (
  id            INTEGER PRIMARY KEY,
  account_id    INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  source_name   TEXT NOT NULL,
  format        TEXT NOT NULL CHECK (format IN ('csv','ofx','mint')),
  profile_id    INTEGER,
  imported_at   TEXT NOT NULL DEFAULT (datetime('now')),
  rows_total    INTEGER NOT NULL DEFAULT 0,
  rows_added    INTEGER NOT NULL DEFAULT 0,
  rows_merged   INTEGER NOT NULL DEFAULT 0,
  rows_skipped  INTEGER NOT NULL DEFAULT 0,
  rows_error    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE import_profiles (
  id                 INTEGER PRIMARY KEY,
  name               TEXT NOT NULL COLLATE NOCASE UNIQUE,
  account_id         INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
  header_fingerprint TEXT,
  config             TEXT NOT NULL,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX import_profiles_fingerprint ON import_profiles (header_fingerprint);

ALTER TABLE transactions ADD COLUMN external_id TEXT;
ALTER TABLE transactions ADD COLUMN import_batch_id INTEGER REFERENCES import_batches(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX transactions_external_id ON transactions (account_id, external_id)
  WHERE external_id IS NOT NULL;
CREATE INDEX transactions_import_batch ON transactions (import_batch_id);

-- Before images so a batch can be undone: merged fields and transfer links.
CREATE TABLE import_changes (
  id             INTEGER PRIMARY KEY,
  batch_id       INTEGER NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
  transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL CHECK (kind IN ('merge','transfer')),
  before         TEXT NOT NULL
);
CREATE INDEX import_changes_batch ON import_changes (batch_id);
`

/** Migration 5: categorization rules. See docs/design/05_rules.md. */
const RULES_SCHEMA = `
CREATE TABLE rules (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL DEFAULT '',
  position   INTEGER NOT NULL,
  enabled    INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  conditions TEXT NOT NULL,
  actions    TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX rules_position ON rules (position);
`

/** Migration 6: saved searches. See docs/design/06_search.md. */
const SEARCH_SCHEMA = `
CREATE TABLE saved_searches (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL COLLATE NOCASE UNIQUE,
  query      TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`

/** Migration 7: file hash per import batch, to spot the same file imported twice. See docs/design/11_review_feedback.md. */
const FILE_HASH_SCHEMA = `
ALTER TABLE import_batches ADD COLUMN file_hash TEXT;
CREATE INDEX import_batches_hash ON import_batches (account_id, file_hash);
`

/**
 * Migration 8: flat categories. Every child is merged into its parent: its lines, rule actions and
 * saved searches are pointed at the parent, then the child is deleted. See docs/design/11_review_feedback.md.
 */
const FLAT_CATEGORIES = `
UPDATE transaction_lines
   SET category_id = (SELECT parent_id FROM categories WHERE id = category_id)
 WHERE category_id IN (SELECT id FROM categories WHERE parent_id IS NOT NULL);

UPDATE rules SET actions = (
  SELECT json_group_array(
    CASE
      WHEN json_extract(a.value, '$.type') = 'setCategory'
       AND json_extract(a.value, '$.categoryId') IN (SELECT id FROM categories WHERE parent_id IS NOT NULL)
      THEN json_set(a.value, '$.categoryId',
             (SELECT parent_id FROM categories WHERE id = json_extract(a.value, '$.categoryId')))
      ELSE json(a.value)
    END)
  FROM json_each(rules.actions) a
);

UPDATE saved_searches
   SET query = json_set(query, '$.categoryId',
         (SELECT parent_id FROM categories WHERE id = json_extract(query, '$.categoryId')))
 WHERE json_extract(query, '$.categoryId') IN (SELECT id FROM categories WHERE parent_id IS NOT NULL);

DELETE FROM categories WHERE parent_id IS NOT NULL;
`

/** Migration 9: category colour and icon. Keys are validated against `categoryStyle.ts`. */
const CATEGORY_STYLE = `
ALTER TABLE categories ADD COLUMN color TEXT;
ALTER TABLE categories ADD COLUMN icon TEXT;
UPDATE categories SET color = CASE (id - 1) % 12 WHEN 0 THEN '#4e79a7' WHEN 1 THEN '#f28e2b' WHEN 2 THEN '#e15759' WHEN 3 THEN '#76b7b2' WHEN 4 THEN '#59a14f' WHEN 5 THEN '#edc948' WHEN 6 THEN '#b07aa1' WHEN 7 THEN '#ff9da7' WHEN 8 THEN '#9c755f' WHEN 9 THEN '#8cd17d' WHEN 10 THEN '#86bcb6' WHEN 11 THEN '#bab0ac' END;
UPDATE categories SET icon = 'car' WHERE name = 'Auto & Transport';
UPDATE categories SET icon = 'bolt' WHERE name = 'Bills & Utilities';
UPDATE categories SET icon = 'food' WHERE name = 'Food & Dining';
UPDATE categories SET icon = 'cart' WHERE name = 'Groceries';
UPDATE categories SET icon = 'heart' WHERE name = 'Health & Fitness';
UPDATE categories SET icon = 'home' WHERE name = 'Home';
UPDATE categories SET icon = 'cash' WHERE name = 'Income';
UPDATE categories SET icon = 'bag' WHERE name = 'Shopping';
UPDATE categories SET icon = 'plane' WHERE name = 'Travel';
UPDATE categories SET icon = 'ticket' WHERE name = 'Entertainment';
UPDATE categories SET icon = 'fee' WHERE name = 'Fees';
UPDATE categories SET icon = 'gift' WHERE name = 'Gifts & Donations';
UPDATE categories SET icon = 'kids' WHERE name = 'Kids';
UPDATE categories SET icon = 'care' WHERE name = 'Personal Care';
UPDATE categories SET icon = 'tax' WHERE name = 'Taxes';
UPDATE categories SET icon = 'swap' WHERE name = 'Transfer';
UPDATE categories SET icon = 'tag' WHERE name = 'Uncategorized';
`

const CATEGORY_ALIASES = `
CREATE TABLE category_aliases (
  alias       TEXT PRIMARY KEY COLLATE NOCASE,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE
);
`

const EXCLUDE_FROM_BUDGETS = `
ALTER TABLE transactions ADD COLUMN exclude_from_budgets INTEGER NOT NULL DEFAULT 0;
`

const BUDGETS = `
CREATE TABLE budgets (
  category_id INTEGER PRIMARY KEY REFERENCES categories(id) ON DELETE CASCADE,
  amount      INTEGER NOT NULL CHECK (amount > 0)
);
`

/**
 * Migration 13: categories no longer have a kind. Whether money is spending or income is decided
 * by the sign of the amounts (docs/design/07_reports.md, ADR 0007). Transfers are identified by
 * the system category named Transfer. Ids, aliases, colours, icons and budgets are untouched.
 */
const DROP_CATEGORY_KIND = `
ALTER TABLE categories DROP COLUMN kind;
`

/**
 * Migration 14: pairs of transactions the user marked "not a duplicate" in Find duplicates
 * (docs/design/04_import.md). Stored with txn_a < txn_b; deleting either row drops the pair.
 */
const DUPLICATE_DISMISSALS = `
CREATE TABLE duplicate_dismissals (
  txn_a INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  txn_b INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  PRIMARY KEY (txn_a, txn_b),
  CHECK (txn_a < txn_b)
);
`

/** Migration 15: budget targets were removed from the app (docs/design/12_budgets.md). */
const DROP_BUDGETS = `
DROP TABLE IF EXISTS budgets;
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
  CATEGORY_CHILDREN,
  IMPORT_SCHEMA,
  RULES_SCHEMA,
  SEARCH_SCHEMA,
  FILE_HASH_SCHEMA,
  FLAT_CATEGORIES,
  CATEGORY_STYLE,
  CATEGORY_ALIASES,
  EXCLUDE_FROM_BUDGETS,
  BUDGETS,
  DROP_CATEGORY_KIND,
  DUPLICATE_DISMISSALS,
  DROP_BUDGETS,
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
