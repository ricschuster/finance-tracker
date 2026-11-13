# 00 Project Brief

## What this is

finance-tracker is a personal finance organizer modeled on Intuit Mint, with
manual transaction entry instead of bank syncing.

It is a private, single-user tool, not a bank aggregator or a multi-tenant
service. The goal is to let one person record transactions, have them sorted
automatically, and see where their money goes each month.

## Who it is for

- The repo owner, as a daily personal-finance tool.
- Anyone who wants a self-hosted, privacy-first Mint alternative.

## The core idea (one screen)

You enter a transaction (date, amount, payee, account, optional notes). Rules
you define (for example "payee contains COSTCO sets category Groceries")
categorize it automatically; anything unmatched is flagged for manual
categorization, and you can turn that choice into a new rule. You can search
across all transactions and view a monthly report of spending by category,
income versus expenses, and trends.

## MVP scope

1. Transactions: add, edit, delete; accounts and categories.
2. Rules engine: match on payee, amount, account, notes; set category; apply
   to new and existing transactions.
3. Search and filters: text, date range, category, account, amount.
4. Monthly report: spending by category, income vs expenses, month over month.
5. Local persistent storage, with export to CSV.

See `docs/design/03_milestones.md` (if present) for the phased plan.

## Explicit non-goals (for now)

- Bank or card syncing (the point is manual control and privacy).
- Multi-user, sharing, or cloud accounts.
- Investment and net-worth tracking.

## Design principles

1. Your data stays local and exportable; no lock-in.
2. Rules are transparent and editable; no opaque auto-categorization.
3. Manual entry must be fast (keyboard-first, sensible defaults).

## Open questions

- Tech stack (web app vs CLI vs desktop; storage choice).
- CSV import in MVP or just after.
- Budgets and recurring transactions: which milestone.
