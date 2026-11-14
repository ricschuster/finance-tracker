# 04 Import

Design for milestone 3. Scope and sign conventions come from the brief and
ADR 0003; this note fixes how files become transactions. Decisions here are
proposals until the open questions at the end are answered.

## Goals

- Turn a bank file into ledger transactions in one short, reviewable flow.
- Re-importing the same file, or an overlapping one, never creates
  duplicates. Importing is safe to repeat.
- Nothing is written until the user has seen a preview. A whole import is
  one database transaction and can be undone as a batch.
- Parsing, mapping and duplicate detection are pure `core/` functions with
  unit tests. The UI is a thin wizard over them.

Non-goals for this milestone: categorization (milestone 4, rules), PDF
statements, multi-currency, merging two devices' databases.

## Pipeline

```text
file bytes -> parse -> rows of strings -> map -> candidates -> match -> plan
                                                                  |
                                          preview (user decisions)
                                                                  |
                                                    commit (one transaction)
```

1. **Parse**: bytes to a table of raw strings (CSV) or a list of statement
   entries (OFX/QFX). No interpretation yet.
2. **Map**: apply a mapping profile to produce candidates, each with
   `date`, signed `amount` in integer cents, `rawDescription`, optional
   `payee`, `memo`, `externalId`, `status`. Rows that cannot be mapped become
   errors with their line number; they never vanish silently.
3. **Match**: compare candidates with existing transactions in the target
   account and classify each one (see Duplicates).
4. **Plan**: the result of matching, plus defaults. The preview edits the
   plan; commit applies it.
5. **Commit**: inserts new rows, applies merges, records the batch.

Every stage before commit is a pure function of its inputs. The renderer
holds the parsed rows and re-requests a plan whenever the mapping or account
changes, so main keeps no wizard state.

## Parsing CSV

- Use the `csv-parse` dependency (sync API) for RFC 4180 handling: quotes,
  doubled quotes, embedded newlines, ragged rows. Our code wraps it and adds
  decoding, delimiter sniffing and the limits below.
- Strip a UTF-8 BOM. Decode as UTF-8, falling back to Windows-1252 when the
  bytes are not valid UTF-8 (older bank exports).
- Sniff the delimiter among comma, semicolon and tab from the first lines.
- Skip blank lines. Allow a preamble: the user picks the header row, with the
  first plausible row preselected. Trailing summary rows (totals, balances)
  fail mapping and are reported, not imported.
- Limits: 20 MB and 100,000 rows per file, with a clear error beyond that.

## Mapping profiles

A profile says how columns become fields. It is stored per bank and reused.

- `hasHeader` and, per field, a column reference (header name when there is a
  header, otherwise index). Headerless files are common (several Canadian
  banks), so index-based mapping is first class.
- **Date**: one column plus a format (`YYYY-MM-DD`, `MM/DD/YYYY`,
  `DD/MM/YYYY`, `DD-Mon-YYYY`, and so on). The wizard suggests a format by
  scanning the column: a first part above 12 means day first, a second part
  above 12 means month first, and a fully ambiguous column asks the user.
- **Amount**, one of three modes:
  - one signed column;
  - separate debit and credit columns (either may be blank per row);
  - one unsigned column plus a direction column (`debit`/`credit`, `DR`/`CR`).
- **Sign**: a `flipSign` option. ADR 0003 says importers normalise to
  expenses negative and income positive. Credit card exports often show
  purchases as positive, so flipping is per profile.
- **Decimal separator**: `.` or `,`, with thousands separators and currency
  symbols ignored. Quebec exports use `1 234,56`. This extends
  `parseAmountToCents`, which today assumes a dot.
- Optional fields: payee, memo, status, balance (unused except for a
  sanity check), category and tags (Mint only).
- `rawDescription` may join several columns with a space (some banks split
  the description over two columns).

Profiles are saved with a name, the account they were last used for, and a
header fingerprint (a hash of the normalised header cells). Choosing a file
whose fingerprint matches a profile preselects it and skips the mapping
step. Headerless files match on column count plus the profile the user picks
for that account.

Built-in presets ship for common banks, but every one is only a starting
mapping the user can edit. The generic mapping wizard covers any other bank,
so presets are a convenience, not a requirement. First presets: RBC
(headered, with a CAD$ and USD$ column), TD (headerless, separate debit and
credit columns) and Tangerine. CIBC, BMO, Scotiabank and others follow once a
real export header has been checked. Layouts written from memory must be
verified against the user's own exports (header row and date format only)
before shipping. Fixtures are synthetic files in that shape, never real data.

**Foreign currency columns**: rows whose amount is in a foreign currency
column (for example RBC USD$) are skipped with a warning by default. The
preview offers a per-import override to import them at face value, labelled
as treating the amount as account currency. No conversion in this milestone.

## Sanity checks in the preview

Mapping mistakes are the main risk, and wrong signs are the worst because
they look fine row by row. The preview therefore shows:

- counts by outcome (new, duplicate, possible match, error);
- total inflow and total outflow of the new rows;
- a warning when the sign looks inverted for the account type (for example,
  a credit card where most rows are positive, or a chequing account where
  almost everything is income);
- a warning when dates span an implausible range or sit in the future;
- the first rows with the original text beside the mapped values.

## Duplicates

Identity is decided per target account in three tiers, strongest first.

1. **External id**: OFX and QFX supply a `FITID`. A candidate whose
   `(account, externalId)` already exists is an exact duplicate. Some banks
   reuse or reset ids, so this tier is trusted only when the id is present
   and the date and amount also agree; a conflict is treated as a possible
   match rather than a silent skip.
2. **Exact fingerprint**: same account, date, amount and normalised raw
   description (case folded, whitespace collapsed). Matching is
   **one to one**: if the file holds two identical rows (two coffees on one
   day) and the ledger holds one, only one is a duplicate and the other is
   new. A plain "does one exist" check would drop real purchases.
3. **Possible match**: same account and amount, date within three days,
   description different. This is the main manual-entry case: the user typed
   `Safeway -45.00` on Tuesday and the bank posts `SAFEWAY #4412` on
   Thursday. Each possible match offers three choices:
   - **Merge**: keep the existing transaction and fill in what the file knows
     (raw description, `cleared` status, external id). Fields the user edited
     by hand, recorded in `edited_fields`, are never overwritten.
   - **Import as new**.
   - **Skip**.

   Default is Merge when the existing row was entered by hand (it has no
   import batch) and is not already matched by another candidate. Otherwise
   the default is Import as new. Each existing transaction can be matched by
   at most one candidate.

Candidates are matched in file order against a snapshot of the ledger, then
against each other, so a file cannot duplicate itself on a re-run.

### File hash and bank id collisions

- Each batch stores a SHA-256 of the file text (migration 7, `file_hash`),
  ignoring a byte order mark and line ending style. Previewing a file whose
  hash matches a live batch for the same account shows a warning; rows still
  go through row matching, so the result is all duplicates. Undoing a batch
  removes its hash.
- Row matching is per account, not per file, so two people's CSVs of one
  joint account collide row by row (tests in `dedupe.test.ts`).
- A bank id already used in the account, or repeated inside one file, is not
  stored for the new row. The row still imports; the unique index on
  `(account_id, external_id)` can no longer abort a whole import.

## Transfers

On import, a candidate that has an opposite-signed amount of equal size in a
different account within three days is offered as a transfer match. Accepting
links the two transactions as a transfer (ADR 0003) and moves the new row's
line to the Transfer category. Nothing is linked automatically. This also
covers the card payment that appears once in the chequing file and once in
the card file.

## Schema (migration 4)

- `transactions` gains `external_id TEXT` and `import_batch_id INTEGER`
  (foreign key to `import_batches`, `ON DELETE SET NULL`), plus a unique index
  on `(account_id, external_id)` where `external_id IS NOT NULL`.
- `import_batches`: `id`, `account_id`, `source_name` (file name only, no
  path), `format` (`csv`, `ofx`, `mint`), `profile_id`, `imported_at`,
  `rows_total`, `rows_added`, `rows_merged`, `rows_skipped`, `rows_error`.
- `import_profiles`: `id`, `name` (unique), `account_id` nullable,
  `header_fingerprint` nullable, `config` (JSON, validated on read),
  `created_at`, `updated_at`.

New transactions are created cleared, with `raw_description` as read, an
empty `payee` unless the source supplies a cleaned one, and one
Uncategorized line, so rules can run over them later.

## History and undo

- The history lists batches with counts and date range, newest first, and
  shows a batch's rows.
- **Undo batch** deletes the transactions that batch added. Merged rows keep
  their existing transaction, with the merged fields restored from a stored
  before image. If any added row was edited by hand since, the user is told
  how many and chooses to keep those or delete everything.
- Deleting a transfer pair removes both sides, as elsewhere.

## Other formats

- **OFX/QFX**: both SGML (v1) and XML (v2) flavours. Read `STMTTRN`
  entries: `DTPOSTED` (date part only), `TRNAMT` (already signed in the
  convention we want), `FITID`, `NAME` and `MEMO` (joined into the raw
  description), `CHECKNUM`. Read `ACCTID` and `CURDEF`; a currency other than
  CAD warns and requires confirmation. No profile is needed.
- **Mint CSV**: a built-in profile for Mint's export (`Date`, `Description`,
  `Original Description`, `Amount`, `Transaction Type`, `Category`,
  `Account Name`, `Labels`, `Notes`). `Description` becomes the payee and
  `Original Description` the raw description. Categories map by name to ours,
  with unknown ones going to Uncategorized and reported. Because one Mint file
  covers many accounts, there is an extra step mapping each `Account Name` to
  an account, creating accounts on request.

## Core module layout

```text
src/core/import/
  csv.ts        parser, delimiter sniffing, decoding
  dates.ts      format detection and parsing
  mapping.ts    profile schema (validated), rows -> candidates
  match.ts      candidates + existing rows -> plan (pure)
  commit.ts     apply a plan in one transaction, write the batch
  history.ts    list, inspect, undo batches
  profiles.ts   save, list, fingerprint lookup
  ofx.ts        later, same candidate shape
  mint.ts       later, preset profile plus account mapping
```

IPC handlers follow the existing pattern in `core/ledger/handlers.ts`:
`readImportFile` (main shows the open dialog and returns the text and name),
`previewImport`, `commitImport`, `listImportBatches`, `undoImportBatch`,
`listImportProfiles`, `saveImportProfile`.

## UI

A wizard in the renderer: choose file, choose account, map columns (skipped
when a profile matches), preview, import, summary with an Undo button.
Keyboard friendly throughout. The preview groups rows by outcome and lets the
user change the choice for possible matches in bulk or one by one.

## Delivery order

1. CSV core: parser, dates, mapping, match, commit, with fixtures and tests.
   Migration 4.
2. IPC and the wizard for generic CSV, plus saved profiles.
3. Import history and undo.
4. OFX/QFX.
5. Mint CSV and bank presets.

Each step is usable on its own and goes through the session PR.

Status (2026-11-13): steps 1 to 5 are built: CSV, OFX/QFX, Mint CSV with
the per-account mapping step, and RBC, TD and Tangerine presets (all three
checked against real exports on 2026-11-13: header row and date format). Wealthsimple (added later) is a multi-account export like Mint: header `transaction_date, ..., account_number, account_type, ..., amount, currency, notes`, ISO dates, signed amounts, each row's account is "type number" and is mapped to a ledger account in the Mint-style step; non-CAD rows are skipped; batches are stored as `csv`. The layout comes from the user's header only, not yet checked against real rows. Not built:
presets for other banks, and Mint label-to-tag import.

## Moving from Monarch

The one-time move from Monarch is specific, not generic: a Monarch transactions
export (`Date, Merchant, Category, Account, Original Statement, Notes, Amount,
Tags, Owner, Reviewed, Reviewed At, Reviewed By, Pending, Id`) is detected by
header and goes through the same per-account mapping step as Mint and
Wealthsimple. ISO dates, signed amounts, `Merchant` is the payee, `Original
Statement` the raw description, `Id` the external id (re-imports are caught as
duplicates), `Pending` sets the status and `Tags` (comma separated) become
tags. Categories match by name or alias and unknown ones are mapped in the
preview. Batches are stored as `csv`. Not carried over: opening balances (the
export has none, so set them on the account), budgets, and Owner/Reviewed
fields. Transfers are not marked in the file, so Monarch's Transfer rows land
as ordinary transactions unless matched at import. The layout is taken from
the user's header only and is not yet checked against real rows.

Accounts and categories are created from the file: an account with no
same-named ledger account defaults to "Create a new account" with a type
guessed from its name (`guessAccountType`), and categories we do not have are
created at commit (income when every row with that name is money in, otherwise
expense) unless the user maps them to an existing category in the preview.
This applies to all multi-account imports (Mint, Monarch, Wealthsimple).

A multi-account file can be the very first import: with no accounts yet the wizard still
accepts it, since the file creates its own. Only single-account files (CSV, OFX) need an
account first.

Setup import: a checkbox on the account step ("replace my categories with the ones in this
file") makes the commit remove our non-system categories that the file does not use, so the
old tool's category set replaces the stock one. A category is only removed when nothing refers
to it (no transaction lines, rules, budgets or saved searches), so no history is lost. The
preview lists what will go.

## Spreadsheets (.xlsx)

An `.xlsx` file is converted to CSV text in the main process (first sheet only, ADR 0006) and then
handled like any CSV, so a Monarch spreadsheet is detected by its header row. The file picker, the
watched folder and drag and drop all accept it. The watched folder lists spreadsheets as ready
without inspecting them. The conversion is only checked against a synthetic fixture
(`test-data/import/monarch.xlsx`), not a real export.
