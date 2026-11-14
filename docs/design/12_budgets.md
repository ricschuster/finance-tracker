# 12 Budgets

Post-MVP. Status: first version built. Scope is deliberately small.

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

A Budgets tab with a month picker. One row per expense category that has a
budget, with budget, spent, remaining and a bar that turns to the warning
colour when over. A total row compares the sum of budgets with the sum of
spent. Below, categories without a budget are listed so a budget can be added.
Editing an amount saves on blur; blank or zero removes the budget.

## Out for now

Rollover of unspent amounts, per-month overrides, income targets, savings
goals, alerts and a dashboard widget. Each needs its own decision.

## Data

Migration 12: `budgets (category_id PRIMARY KEY REFERENCES categories ON DELETE
CASCADE, amount INTEGER NOT NULL CHECK (amount > 0))`. Merging categories adds
the amounts when both have a budget (the survivor keeps the sum).
