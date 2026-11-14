# 05 Rules

Milestone 4. Rules clean the payee, set the category and add tags. They are
transparent, ordered and editable. See the brief and ADR 0003.

## Model

A rule has a name, a position, an enabled flag, a list of conditions (all must
hold) and a list of actions. Rules run in position order and the first rule
whose conditions all hold wins; later rules are not consulted.

Conditions:

- `text`: `field` is `description` (the raw bank text) or `payee` (the current
  payee); `op` is `contains`, `starts_with`, `equals` or `regex`. All are case
  insensitive. Regex is validated when the rule is saved. `similar` is fuzzy: see
  "Fuzzy matching" below.
- `amount`: optional `direction` (`expense` or `income`), optional `min` and
  `max` in positive integer cents, compared against the absolute amount.
- `account`: `accountId`.

Actions:

- `setPayee`: replace the payee.
- `setCategory`: set the category of an unsplit transaction.
- `addTags`: add tags, keeping the existing ones.

"Mark transfer" from the brief is not an action: a transfer needs a peer, so
transfers stay with import matching and the transfer form. Rules skip any
transaction that is part of a transfer.

## Fuzzy matching

The `similar` operator (`core/rules/fuzzy.ts`) is for descriptions that vary: "SAFEWAY #4412",
"SAFWAY STORE 9". Both sides are reduced to lowercase letter-only words, so digits, store
numbers and punctuation vanish. Every word of the rule's text must match some word of the
description, in any order. A word may differ by typos (an adjacent swap counts as one): none
for words up to 4 letters, one for 5 to 8, two for 9 or more. It is a rule operator like the
others, so it is visible in the editor and the preview shows what it would change. It never
runs silently over history; the history guess for imports is unchanged.

## Locking

A rule never writes a field listed in `edited_fields` (`payee`, `categories`,
`tags`). Rule writes do not add to `edited_fields`, so a rule can be edited and
re-run and its own earlier results are replaced. Split transactions keep their
lines: `setCategory` is skipped for them. A locked or skipped action is
reported, not an error. A rule still "wins" when some of its actions are
locked, so a later rule cannot touch the transaction either.

## Apply

- On import, rules run over the newly added rows inside the same database
  transaction as the commit, so undo of the batch removes them as before.
- Apply to past: `previewRules` returns the changes it would make (before and
  after per transaction) without writing; `applyRules` writes them. Both take
  an optional list of transaction ids and otherwise cover everything.
- Rules only change a category when the result differs, so applying twice is a
  no-op.

## Suggestions

When the user changes the payee or category by hand, `suggestRule` builds a
draft: a `description contains` condition from the raw description with
reference numbers (digit runs, `#1234`) and trailing noise removed and the
first three words kept, plus `setPayee` and `setCategory` actions from the edit.
It also reports how many existing unlocked transactions the draft would change.
The user reviews and saves it; nothing is created silently.

Changing the category of a single-line transaction in the list asks "Make this
a rule for similar transactions?". Yes opens the draft in the rules editor,
the same path as the Suggest rule button; No leaves the edit as it was.

## Skip on import

An action `skipImport` leaves a row out of an import. It is import-only: it changes nothing
on saved transactions, so "apply rules to history" ignores it. The winner is the first
matching rule (the same rule `planRules` picks), and it skips only if that rule carries the
action, so a skip never fights another rule for the same row. The import preview lists such
rows as "Skipped by rule" with an "Import anyway" button; skipped rows are counted as skipped
in the import result. Only rows that would be added are skipped; a row that matches an existing
transaction still offers merge.

## Known gaps

- Rows imported with a category (Mint) can have it replaced by a matching
  rule, because the category is not recorded as a hand edit.
- The editor has one slot per kind of condition and action; a rule with two
  text conditions can be stored but not edited in the UI.
- A rule whose category was deleted keeps matching; its category action is
  skipped.
