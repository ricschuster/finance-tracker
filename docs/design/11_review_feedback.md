# Design review feedback (accepted)

Comments from the owner after the MVP review. Each item is mapped to what is
built today and what would change. Nothing here is built yet. Items that
change scope need a decision before work starts (see Decisions).

## 1. Fixed category set, no subcategories

Status: built (migration 8 flattens, `mergeCategory`, flat Categories tab). The
existing 15 top-level starter categories are kept as the editable defaults
instead of being replaced by `Category N` placeholders, so nothing a user has
already renamed is lost. Mint
category names that were children (for example `Restaurants`) now import as
Uncategorized and are listed as unknown in the preview.

Comment: no subcategories, 10 to 15 categories in total, our own.

Today: categories can have a parent (Categories tab, milestone after MVP).
Change: ship a default set of 10 to 15 flat categories, remove the
"add subcategory" UI, and migrate existing parented categories by merging each
child into its parent (reassign transactions and rules, then delete the child).
The schema column `parent_id` can stay unused. Needs category merge, which is
already on the next-actions list.

## 2. Colours and icons for categories

Status: built (migration 9, `categoryStyle.ts`, picker in the Categories tab,
badge in the transaction list, dashboard and reports). Icons are bundled emoji
glyphs keyed by name, colours a fixed 12 colour palette.

Change: add `color` and `icon` columns to `categories` (migration), a picker
in the Categories tab, and show them in the transaction list, reports and
dashboard. Icons come from a small bundled set, no network. Colours come from
a fixed palette that passes contrast in light and dark.

## 3. Transfers and card payments stay out of spending and budgets

Status: import prompt built. A new row with a transfer candidate is linked by
default when either account is a credit card or loan and the bank text says
payment (payment, pmt, paiement, autopay, bill pay). The checkbox in the
preview starts ticked and can be cleared; other candidates stay opt-in.
Flagging an unmatched payment as "not spending" waits for item 4.

Today: reports already skip transfer-linked transactions and kind `transfer`
categories (note 07). Credit card payments are only excluded if they are
linked as a transfer.
Change: when budgets are built they use the same exclusion. Import should
prompt to link a card payment to its other side, and an unmatched payment
should be flaggable as "not spending" (see item 4).

## 4. Hide a transaction from budgets

Change: a per-transaction `exclude_from_budgets` flag (migration), settable
from the edit form and as a bulk action in search. Budgets only: reports still
show it, with a marker.

## 5. Monthly report sorted by category, descending

Status: already true (sorted by total, largest first). Covered by a test.

Today: the category report exists (note 07).
Change: the monthly report lists categories by total, largest first, expenses
and income in separate groups. Check the current sort and fix if needed.

## 6. Search by category over a date range

Status: built. A Year box in the search filters sets the date range, and with a
category filter the total counts only that category's lines, so a split
transaction contributes its share (test in `search.test.ts`).

Example: all `Business` from 2026.
Today: search has category and date filters (note 06), so this may already
work. Change: verify with a test, add a year shortcut to the date filter, and
show the total of the result set.

## 7. Import income and spending, including refunds

Status: verified by tests (`refunds.test.ts`), no code change was needed.

Today: signed amounts import and reports classify by category kind, so a
refund in an expense category reduces that category.
Change: add tests for refunds in each importer (CSV with separate debit and
credit columns, OFX, Mint) and show refunds as a positive amount in an expense
category without treating it as income.

## 8. Import from one watched folder

Status: built (folder setting, scan, review through the wizard). The folder is
checked when the import screen opens and on "Check folder"; live file system
watching is not built. The folder is set only through the native picker and
files are read by bare name. OFX, QFX and Mint files count as ready; a CSV is
ready only when its header matches a saved profile. Already imported files
(by hash) are hidden unless asked for.

Change: a setting `import_folder`. On startup and on demand ("Check folder"),
list new files, run each through its saved mapping profile, and put the
results in the import review screen. Files are never deleted or moved by
default. Files with no matching profile are listed as "needs mapping". Watching
live (file system events) is optional and later.

## 9. Duplicate files must be exact, joint accounts included

Status: built (file hash warning, id collision fix, joint account tests).

Today: duplicates are detected per row (external id, then date, amount and
payee, note 04). There is no file-level check.
Change:

- Record a SHA-256 of each imported file in `import_batches`. A file with a
  known hash is reported as "already imported" before parsing.
- Row-level matching is per account, not per file, so two people's CSVs of
  the same joint account collide on rows even though the files differ. Rows with no
  external id and the same date, amount and payee are matched by count, as
  today, so a genuine repeated purchase is kept.
- Tests: same file twice, overlapping date ranges from two files, same joint
  account via two folders, a file re-exported with different column order.
- Undo of a batch must not remove rows that another batch also matched.

## Decisions

1. The default set is placeholders (`Category 1` to `Category 12`), flat,
   renamed by the owner in the Categories tab. `Transfer` stays as a system
   category. Nothing hardcodes names.
2. Existing children merge into their parent automatically. Bank exports do
   not carry subcategories: the RBC, TD and Tangerine presets map no category
   column, and only the Mint export has a `Category`, which is a flat name.
   So the flat set loses nothing on import.
3. Hide from budgets is budgets only. Reports still show the transaction.
4. One fixed import folder, chosen by the user in settings (item 8). The
   account comes from the mapping profile, not the folder.
5. A joint account is one database fed by two CSV files, one per person, with
   overlapping rows. That makes row-level matching across files the main
   duplicate defence, and the file hash only a quick shortcut for the same
   file twice (item 9).

## Order of work

1. Duplicate hardening (item 9) and refund tests (item 7), since they protect data.
2. Flat categories, merge, colours and icons (items 1 and 2).
3. Watched folder (item 8).
4. Exclude-from-budgets flag with budgets (items 3 and 4), then report and search checks (items 5 and 6).

## Category aliases (follow-up to item 3 of the open list)

Status: built. Migration 10 adds `category_aliases` (alias, category id, case
insensitive). Imports match a category name first, then an alias. In the Mint
preview each unknown category has a selector that saves an alias and refreshes
the preview. Merging a category keeps its old name as an alias of the survivor,
so later imports that still use that name land in the right place. Deleting a
category removes its aliases.

