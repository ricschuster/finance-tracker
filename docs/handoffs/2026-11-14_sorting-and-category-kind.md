# Session Handoff: 2026-11-14 (transaction sorting, imported category kind)

## Summary

Added sortable columns to Transactions and fixed how imported categories are classified, after
the user saw a yearly report with low income, negative spending and a high positive net.
All in PR #27.

## Completed

- Transactions: click Date, Payee, Category, Status or Amount to sort; click again to reverse.
  Sorting is in SQL (`sort` and `dir` on `SearchQuery`), so it covers every match, not just the
  page. Default is still newest first. Manual updated.
- Import: a new category is now income or expense by the sum of its rows, not by "every row is
  positive". One stray negative row (a clawback) used to turn a paycheck category into spending.
  Tests added for both changes.

## Current state

- PR #27 merged into `main`. Version is still 0.2.0.
- The report symptom is a hypothesis: it fits the old classification rule, but it was not
  checked against real data (working rule: never read it).
- Categories already imported keep their old, possibly wrong, kind.

## Next actions

1. User checks the Categories tab for income-like categories listed under Spending.
2. Add a "change kind" option to the category editor (none exists today; `createCategory` is
   the only place kind is set) so wrong kinds can be fixed without re-importing. Offered, not
   yet approved.
3. If the report still looks wrong after fixing kinds, ask the user for the per-category
   figures and look at transfer-like categories (for example credit card payments).
4. Optional idea from the user: suggest rules from import history (merchant to category).
   Needs a design note first.
5. Real Monarch and Wealthsimple import checks, budget rollover decision and a v0.3.0 release
   are still open (see the previous handoff).

## Risks or decisions needed

- Sorting by Category uses the first split line's category only.
- Never read the user's real financial data; use synthetic data and ask them to report.
