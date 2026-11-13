# 06 Search

Milestone 5. Instant text search, filters, saved searches and bulk actions on
the transaction list.

## Query

One `SearchQuery` object drives everything and is what a saved search stores:

- `text`: split on whitespace; every word must appear, case insensitively, in
  the payee, raw description, notes, tag names or category names (parent or
  child). Substring match, not whole words, because bank descriptions run
  words together.
- Filters, all combined with AND: `accountIds`, `categoryId` (the category or
  any child), `tag`, `status`, `from` and `to` (inclusive ISO dates),
  `direction` (`expense` or `income`), `minAmount` and `maxAmount` (positive
  cents, absolute value), and `uncategorized`.
- `limit` and `offset`. The result carries the page of transactions plus the
  total count and the signed sum of all matches, so the UI can show
  "212 matches, -$4,310.55".

Decision: plain SQL `LIKE` with escaping, not FTS5. A personal ledger is tens
of thousands of rows, so a scan is instant, and FTS5 token matching is worse
for run-together bank text. Revisit if search ever feels slow.

Transfers match like any other transaction. Split transactions match a
category filter when any line matches.

## Saved searches

Migration 6 adds `saved_searches` (name, query JSON). Names are unique,
saving an existing name replaces it. Paging fields are not stored.

## Bulk actions

Act on a list of transaction ids, or on every match of a query (capped at
10,000). Actions: set category, add tag, remove tag, set status, delete.
Bulk edits count as hand edits, so rules leave those fields alone afterwards.
Transfers and split transactions are skipped for set category and reported in
the result, not treated as errors. Deleting one side of a transfer deletes
both, and ids already removed that way are ignored. A bulk action is one
database transaction.
