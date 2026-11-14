# 0007 Drop the category kind

Status: accepted (2026-11-14)

## Context

Each category had a kind (expense, income or transfer). Reports, budgets, merging and the category
pickers depended on it. The user found it confusing: a category should not be hard-coded to
spending or income, and a refund in Groceries should just reduce Groceries.

## Decision

Migration 13 drops `categories.kind`. Ids, aliases, colours, icons, budgets and foreign keys are
untouched.

- Transfers are identified by the system category named `Transfer` (plus `transfer_peer_id` on the
  transaction), exactly as before. Reports and budgets exclude both.
- Reports net line amounts per category (per month in the trend), then classify by sign: a
  negative net is spending, a positive net is income. Uncategorized is the one exception: its lines
  are classified one by one by sign, so an unsorted deposit never cancels an unsorted expense. Top payees and biggest transactions net per
  payee or per transaction and keep negative nets.
- Any category except Transfer may have a budget. Merging is allowed between any two non-system
  categories. Imports create missing categories without a kind.
- The "Change type" feature and kind selectors are removed.

## Consequences

- Refunds net naturally. A category whose refunds exceed its purchases in a period appears as
  income for that period, and an income category with a net clawback appears as spending.
- Totals can differ slightly from before: an "income" category with net negative used to count
  as negative income, and a refund-only expense category used to count as negative spending.
  Net (income minus spending) is unchanged.
- Existing databases migrate in place with no data loss. The column cannot be recovered, so the
  migration is one way.
