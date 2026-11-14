# 10 Balances, net worth and reconciliation

Post-MVP, first step. Budgets and net worth both depend on balances being
right, so this comes before them. Status: proposed, not built.

## Problems

1. Accounts have only an opening balance. Loans, mortgages and investments are
   meant to be snapshot-only (project brief) but cannot record a balance, so
   they are missing from reports and net worth cannot be shown.
2. There is no way to check an account against a bank statement. The
   `reconciled` status exists on transactions, but nothing sets it as part of a
   check, so missed imports and double entries go unnoticed.

## Design principles

- Follow ADR 0003: integer cents, expenses negative. A liability balance
  (loan, credit card) is stored negative, so net worth is a plain sum.
- Never change transactions to make a balance match. The app shows the
  difference and the user decides.
- Framework-free logic in `src/core/ledger/` and `src/core/reports/`, unit
  tested. UI only calls the preload API.

## Account kinds

Accounts split into two kinds:

- **Tracked**: balance is opening balance plus transactions (checking, savings,
  credit card, cash). Unchanged.
- **Snapshot-only**: balance comes from dated snapshots the user enters
  (loan, mortgage, investment, other). They may have no transactions at all.

Add `investment` and `mortgage` to the account types. The schema `CHECK` on
`accounts.type` forces a table rebuild in the migration. Existing `loan` and
`other` accounts keep their type and become snapshot-only only if the user
opts in (a per-account `balance_mode` of `tracked` or `snapshot`, default
`tracked`).

## Schema (migration)

```sql
CREATE TABLE balance_snapshots (
  id          INTEGER PRIMARY KEY,
  account_id  INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  date        TEXT NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  balance     INTEGER NOT NULL,
  note        TEXT NOT NULL DEFAULT '',
  UNIQUE (account_id, date)
);

CREATE TABLE reconciliations (
  id                INTEGER PRIMARY KEY,
  account_id        INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  statement_date    TEXT NOT NULL,
  statement_balance INTEGER NOT NULL,
  ledger_balance    INTEGER NOT NULL,
  completed_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
```

`accounts` gains `balance_mode TEXT NOT NULL DEFAULT 'tracked'`. Snapshots are
included in the whole-database export and restore automatically (same file).

## Balance as of a date

`balanceAsOf(db, accountId, date)`:

- Tracked: opening balance plus the sum of transactions on or before `date`.
- Snapshot-only: the most recent snapshot on or before `date`; if none, 0 and
  flagged "no data".

Snapshots on a tracked account are allowed and used only as a check (see
reconciliation), never to override the ledger balance.

## Net worth over time

`netWorthSeries(db, { from, to })` returns one point per month end: assets,
liabilities and net worth, summed over all non-archived accounts using
`balanceAsOf`. Dashboard gets a net worth tile; Reports gets a net worth
trend. Archived accounts are excluded from the current figure but included
for past months in which they had a balance, so history does not change when
an account is archived.

## Reconciliation flow

1. The user opens an account and chooses Reconcile, then enters the statement
   end date and statement ending balance.
2. The app computes the ledger balance as of that date and shows the
   difference.
3. It lists transactions up to the statement date that are not yet
   `reconciled`, each with a checkbox, defaulting to checked for `cleared`
   and unchecked for `pending`. The running difference updates as the user
   toggles them.
4. When the difference is zero, Finish marks the checked transactions
   `reconciled` and stores a `reconciliations` row. If it is not zero, the user
   can still finish with a recorded difference, after an explicit confirm, or
   cancel and fix transactions.
5. Reconciled transactions already show a marker in the list. Editing the
   amount or date of one asks for confirmation, because it breaks a past
   reconciliation.

Likely causes of a difference are shown as hints: an amount in the list that
equals the difference (a missed or extra transaction), and two identical rows
(possible duplicate).

## UI

- Accounts: show a balance and "as of" date per account, and an Add snapshot
  action for snapshot-only accounts.
- Account detail: Reconcile button, last reconciled date and balance.
- Dashboard: net worth tile with the change since last month.
- Reports: net worth trend.

## Out of scope

Investment holdings and returns, interest calculation on loans, amortization
schedules, and importing statement balances from OFX (`LEDGERBAL`). OFX ledger
balances are a good later shortcut: an import could offer to create a snapshot
or prefill the statement balance.

## Open questions

- Should credit card statement closing dates be remembered per account so the
  statement date is prefilled?
- Should a failed reconciliation (non-zero difference) block marking
  transactions reconciled, or only warn? This note proposes warn.
- Are mortgage and investment worth separate types, or is `other` enough?

## Build order

1. Migration, `balanceAsOf`, snapshots CRUD, tests.
2. Net worth series, dashboard tile and report.
3. Reconciliation core and flow.
4. OFX ledger balance prefill, if wanted.
