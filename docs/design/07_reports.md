# 07 Reports and dashboard

Milestone 6. Read-only aggregates over the ledger, plus a dashboard as the home
screen. All logic lives in `src/core/reports/` and is unit tested; the UI only
renders what it returns.

## What counts

Reports query split lines, never transaction totals (ADR 0003).

- Transfers are excluded: a line is skipped when its transaction has a
  `transfer_peer_id` or its category kind is `transfer`.
- A line is income or expense by its category kind, not its sign, so a refund
  in an expense category reduces spending and a reversal in an income category
  reduces income. The exception is `Uncategorized`, which is classified by sign
  so an unsorted deposit is not shown as negative spending.
- Spending is reported as a positive number (the negated sum of expense lines).
  Income is positive. Net is income minus spending.
- Pending transactions count. Archived accounts count. An optional
  `accountIds` filter narrows every report.

## Periods

A `Period` is an inclusive `from` and `to` ISO date. Helpers build calendar
month, quarter, year and custom periods, and the previous period of equal
length for comparison. Dates are plain strings; no time zones.

## Reports

- `spendingByCategory(period)`: one row per top-level category with total,
  share of spending, transaction count and its children, so the UI can drill
  down. Sorted by total, largest first. Parents with only direct lines (such as
  Groceries) have no children.
- `incomeVsExpenses(period)`: income, spending, net and savings rate
  (net divided by income, `null` when income is zero).
- `monthlyTrend(from, to)`: one row per calendar month in range with income,
  spending and net, including months with no activity so charts have no gaps.
- `topPayees(period, limit)`: spending by cleaned payee (falling back to the
  raw description when blank), with count and total.
- `biggestTransactions(period, limit)`: the largest expenses by absolute
  amount, excluding transfers.
- `dashboard(today)`: current month summary, change in spending against the
  previous month to date, top five categories, last six months of trend, five
  biggest transactions and the count of uncategorized transactions to review.

## UI

A Dashboard tab becomes the first tab and the default view. A Reports tab holds
the period picker (month, quarter, year, custom), the account filter and the
four reports. Charts are plain CSS bars, no charting dependency. Clicking a
category opens the Transactions tab filtered to that category and period.

## Dashboard customization

A Customize button on the dashboard opens a checklist of sections: income,
spending, net and savings rate, the uncategorized reminder, top categories,
budgets, last six months and biggest this month. The choice is saved as JSON in
the `settings` table (`dashboard_widgets`), so it travels with database export
and restore. Everything is shown until the user changes it; display order is
fixed. The JSON holds the hidden ids (`{"hidden": [...]}`), so a widget added in
a later version shows by default. The first format held the visible ids; when
it is read, widgets added since (Budgets) are shown too.
Logic is in `src/core/reports/widgets.ts`.

## Out of scope

Budgets, forecasts, net worth over time, and report export (milestone 7 covers
CSV export of transactions).
