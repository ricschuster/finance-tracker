# 16 Payee cleanup suggestions

Status: proposed, not built. Needs owner sign-off before code.

## Problem

Bank descriptions are noisy: "SAFEWAY #4412", "SAFEWAY #9", "SAFWAY STORE 9", "SQ *BLUE BOTTLE".
The same shop appears as many spellings, so search, the payee report and rules fragment. Rules and
the history guess already cope per feature; nothing helps the user get one clean payee name.

## User stories

- A renter with many small card payments sees dozens of coffee, transit and grocery spellings in
  the payee report. She wants "SAFEWAY #4412" and "SAFEWAY #9" proposed as one payee "Safeway"
  and to accept it with one click.
- A freelancer with irregular income gets deposits like "E-TRANSFER 8841 ACME LTD" and "ACME LTD
  INV 22". He wants income grouped under "Acme" without touching the ones he named himself.
- A couple sharing a card sees the same merchant spelled by two banks' exports. They want
  suggestions to be reviewable and reversible, because either may have set payees by hand.

## Data and algorithm

Uses only existing pieces; no new tables are required for the first slice.

1. Candidates: transactions whose `payee` is empty, or equals the raw description, and that have
   no hand-edited payee (`edited_fields` lacks `payee`).
2. Key: `suggestPattern(rawDescription)` (core/rules/pattern.ts), lowercased.
3. Cluster: exact keys first; then merge keys that are similar under the same rule the history
   guess uses (same word count, words of 6+ letters may differ by `fuzzy.ts` edits). Short words
   never merge, so "shall" and "shell" stay apart.
4. Proposed name: the most common existing non-empty payee in the cluster if one exists, else the
   cluster's most frequent key in title case.
5. Output: `{ name, keys, transactionIds, count, example descriptions }`, sorted by count. Pure
   function in `core/ledger/payeeCleanup.ts`, reads only, framework-free.

Applying a suggestion writes the payee through the normal `updateTransaction` path, or better, by
saving a `setPayee` rule (description similar to / contains the key) and running it, so future
imports are cleaned too.

## UI placement

A "Clean up payees" button in the Transactions page toolbar beside Find duplicates, opening a
dialog of clusters (name field, example descriptions, count, Apply / Skip / Not the same). It
follows the Find duplicates pattern. An optional later entry point is a dashboard hint once there
are many clusters.

## Risks

- False positives: two shops merged ("Shell" fuel and "Shell" restaurant). Mitigate with the 6
  letter rule, showing examples, and per-cluster removal of individual rows before applying.
- Undo: one Apply is one undoable action (as bulk duplicate removal is), restoring the previous
  payees exactly.
- Never silently rewrite history: nothing runs on its own; transactions with a hand-set payee are
  excluded; every change is previewed with counts first.
- Performance: pairwise comparison is quadratic in distinct keys; bucket by word count and first
  letters, and cap at a few thousand keys.

## Proposed first slice

Core function plus tests, a read-only dialog listing clusters with the proposed names and a single
"Apply to these n transactions" per cluster using `setPayee` on the rows (no rule yet), with Undo.
Rule creation, per-row exclusion and the dashboard hint follow if the slice is useful.
