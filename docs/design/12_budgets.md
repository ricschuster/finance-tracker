# 12 Cashflow (budgets removed)

Status: budget targets were removed on owner request (2026-11-20, migration 15 drops the `budgets` table). The rest of this note is kept as history; only the Cashflow page and the spending donut remain.

The Cashflow page now has a month stepper (the month lives in `App.tsx` so Back from a drill-down returns to it), Income, Spending and Net tiles, the spending donut, and a searchable list of every category with activity in the month. Amounts are signed (spending negative), so net refunds and income are visible. Each row opens the Transactions list for that category and month. Same exclusions as reports: transfers and transactions hidden from reports. Core: `src/core/cashflow/`.

---

## Original design (history)

Renamed in the UI: the Budgets tab is now called Cashflow (sidebar, page title, manual, shortcuts). This is a rename only. Scope stays spending budgets; internal names (`budgets` view, `budgets` module) are unchanged.

Post-MVP. Status: first version built. Scope is deliberately small.

## Any category

Any category except the system Transfer category can have a budget, since
categories have no kind (ADR 0007). Spent is the negated net of the month's
lines, so an income category with a budget shows negative spent while money
comes in.

## Model

A budget is a monthly amount in integer cents for one expense category. There
is one amount per category, the same every month (a "standing" budget). A
category with no budget row has no budget. Categories are flat (note 11), so
there is no parent roll-up.

## What counts as spent

For a month and a budgeted category, spent is the negated sum of that
category's line amounts over transactions dated in the month, so a refund in
the category reduces it. Excluded from spent, matching the reports plus the
flag from note 11 item 4:

- transfer-linked transactions and lines in `transfer` categories,
- transactions with `exclude_from_budgets` set.

Split transactions count per line. Remaining is budget minus spent and can be
negative (over budget).

## Screen

A Cashflow tab (formerly Budgets) with a month stepper in the page header. Tiles show the total
budgeted, spent and remaining (or over). One row per expense category that has
a budget, with spent of budget, what is left and a bar that turns amber from
85% and red when over. Spending in categories without a budget is listed with
a quick Budget button. Adding or editing an amount is a dialog; removing a
budget is in the row menu and asks first. See design note 13 for the look.

## Dashboard widget

A Budgets card on the dashboard (one of the Customize sections, on by default)
shows the current month: total spent of total budgeted with a bar, then up to
five budgets, the ones closest to or past their limit first. It links to the
Cashflow tab, or offers Set up when there are no budgets. It reads the same
`getBudgetMonth` as the tab, so the two always agree.

## Out for now

Rollover of unspent amounts, per-month overrides, income targets, savings
goals and alerts. Each needs its own decision.

## Data

Migration 12: `budgets (category_id PRIMARY KEY REFERENCES categories ON DELETE
CASCADE, amount INTEGER NOT NULL CHECK (amount > 0))`. Merging categories adds
the amounts when both have a budget (the survivor keeps the sum).

## Spending pie

Under the tiles, a donut chart shows spending by category for the selected
month (budgeted and unbudgeted categories with spent above zero), in the
category colours, with a legend of amount and share. Slices and legend rows
are buttons that open the Transactions list for that category and month, the
same drill-down the dashboard uses. A pie cannot show negatives, so categories
with net refunds are left out and named in a note beneath it.
