# 00 Project Brief

## What this is

finance-tracker is a personal finance organizer modeled on Intuit Mint, with
manual entry and file import instead of bank syncing.

It is a local, private desktop app, not a bank aggregator or a hosted service.
The goal is to let one household record or import transactions, have them
sorted automatically by transparent rules, find anything quickly, and see where
the money goes each month.

## Who it is for

- The repo owner and their partner. Each device runs its own copy with its own
  data. Sharing between devices is a manual export and import.
- Anyone who wants a privacy-first Mint alternative.

Assumptions: one home currency (CAD, Canadian English, YYYY-MM-DD dates). Under
1 percent of transactions are foreign, so multi-currency is out of scope.
Runs on Mac (primary), Windows and Linux.

## The core idea (one screen)

Transactions arrive by manual entry or by importing bank files (CSV with column
mapping, OFX/QFX, Mint export CSV; PDF later). Duplicates are skipped or
flagged. An ordered list of rules (first match wins) cleans the payee, sets the
category, and adds tags. Anything unmatched is flagged Uncategorized. When the
user fixes one by hand, the app offers to create a rule. Manually edited fields
are never overwritten by rules. The dashboard shows the current month, and
reports cover spending by category, income vs expenses, trends and top payees.

## MVP scope

1. Accounts: chequing/savings, credit cards, cash, and snapshot-only
   loans/mortgage/investments.
2. Transactions: add, edit, delete, split across categories, notes, tags,
   pending/reconciled status. Transfers between accounts, with match
   suggestions on import.
3. Categories: a short flat list (10 to 15, no subcategories), editable, with merge, plus tags.
4. Import: CSV with saved per-bank column mapping, OFX/QFX, Mint export CSV.
   Exact duplicates skipped, near matches flagged.
5. Rules: text match on payee/description (contains, starts with, regex),
   amount and account conditions, multiple actions (rename payee, set
   category, add tags, mark transfer). Ordered, first match wins. Suggest
   rules from manual edits. Preview then apply to past transactions, skipping
   manual edits.
6. Search: instant text search, filters (date, amount, account, category, tag,
   status), saved searches, bulk actions on results.
7. Reports: spending by category with drill-down, income vs expenses and
   savings rate, trends over months, top payees and biggest transactions.
   Calendar months, quarters, year, and custom ranges.
8. Dashboard as the home screen.
9. Data: single SQLite file; export/import the whole database as one file;
   transactions to CSV; automatic periodic backups to a chosen folder.
10. Distribution: single installer per OS, built in CI.

See `docs/design/03_milestones.md` for the phased plan.

## Explicit non-goals (for now)

- Bank or card syncing.
- Multi-user, accounts, shared live view or cloud sync.
- Multi-currency.
- Budgets and savings goals (planned after MVP).
- Receipt attachments (planned after MVP).
- PDF statement import (planned after MVP).
- Investment tracking beyond balance snapshots.
- Database encryption; protection relies on OS disk encryption.

## Design principles

1. Data stays local, in one file, and is always exportable.
2. Rules are transparent, ordered and editable; no opaque auto-categorization.
3. Never silently overwrite what the user set by hand.
4. Manual entry and review must be fast and keyboard friendly.
5. Business logic (rules, import parsing, reports) is framework-free and unit
   tested, separate from the UI.

## Open questions

- Merge import (combining two devices' data) is deferred; whole-file restore
  only for now.
- Auto-update mechanism for installers.
