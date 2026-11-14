# 17 Recurring payment (subscription) detection

Status: proposed, not built. Needs owner sign-off before code.

## Problem

Subscriptions and regular bills are easy to lose track of. The app has the data to show "what
repeats" but offers no view of it, and budgets are standing monthly amounts with no notion of
bills that land on a schedule.

## User stories

- A renter with many small card payments wants to see streaming, phone and gym charges listed with
  how often and how much, to spot ones she forgot or that crept up.
- A freelancer with irregular income wants it to tell a steady retainer from one-off payments, and
  not to flag lumpy deposits as a subscription.
- A couple sharing a card wants to know the monthly total of recurring charges, and to mark one
  as "ignore" (a charge that merely looks regular, such as weekly groceries at the same shop).

## Data and algorithm

Detection runs over transactions, never writes, and lives in `core/reports/recurring.ts`.

1. Group by direction and description key: `suggestPattern` lowercased, pooled with similar keys
   by the same fuzzy rule as the history guess (note 04), so "NETFLIX.COM 8812" and "NETFLIX.COM
   4471" are one group.
2. Within a group (at least 3 occurrences, spanning at least 2 periods) take the gaps between dates.
   A cadence is recognised when the median gap is near 7, 14, 30 (28 to 31), 91 or 365 days and
   at least 70% of gaps are within a tolerance (for example 3 days for monthly).
3. Amount stability: the typical amount is the median; a group is "fixed" when 80% of amounts are
   within 5% of it, otherwise "varies" (utilities). Irregular amounts with regular dates are
   still listed, flagged as varying.
4. Output: `{ label, cadence, typicalAmount, lastDate, nextExpected, occurrences, monthlyCost,
   status }`. Status is `active` (last seen within 1.5 cadences) or `lapsed`.
5. Excludes transfers. Ignored groups are stored by key (a small `recurring_ignored` table in a
   later migration, first slice may omit ignoring).

## UI placement

A "Recurring" section in Reports (list with cadence, typical amount, next expected and a monthly
total), and optionally a dashboard tile with the monthly total. Each row opens its transactions
through the existing drill-down. It is read-only; no budgets are created automatically.

## Risks

- False positives: weekly groceries at one store look regular. Mitigate with at least 3
  occurrences, an amount stability label, an Ignore action, and wording ("looks recurring").
- Misses: irregular income and a first or second payment are not detected; the freelancer sees
  fewer, not wrong, results.
- No silent changes: detection never edits transactions, categories or budgets. Ignore is the
  only stored state and is undoable.
- Cost: grouping is one pass over the history plus the similarity pooling already measured for the
  history guess; cache per report load.

## Proposed first slice

Core detection function with tests on synthetic series (monthly fixed, monthly varying, weekly,
irregular, lapsed), plus a read-only list in Reports with monthly total. No ignore table, no
dashboard tile, no budget integration.
