# Session Handoff: 2026-11-13 (reports and dashboard)

## Summary

Built milestone 6: report queries in core, IPC, a Dashboard home screen and a
Reports tab. Work is on `feat/reports-dashboard`.

## Completed

- Design note `docs/design/07_reports.md`: what counts (split lines, transfers
  out, income or expense by category kind, Uncategorized by sign), periods and
  each report.
- `src/core/reports/`: period helpers, `spendingByCategory` (parents with
  children), `incomeVsExpenses` (with savings rate), `monthlyTrend` (gap
  filled), `topPayees`, `biggestTransactions`, `dashboard`. Unit tested.
- IPC channel `reports:*`, preload `api.reports`.
- UI: Dashboard (default tab) and Reports (month, quarter, year, custom, account
  filter, expandable categories). Charts are CSS bars. Clicking a category opens
  Transactions filtered to it (and the period, from Reports and the dashboard).
- Dashboard "Review" button opens Transactions filtered to Uncategorized.
- Headless skill: `reports.mjs` added; `tour.mjs` now clicks the Transactions tab
  because the app opens on the Dashboard.

## Current state

- `npm run check` passes. Verified in the running app with screenshots.
- A custom range that starts mid-month shows the partial first and last months
  in the trend, counting only dates in range.
- Drill-down shows every line in the category, including refunds.

## Next actions

1. Click through OFX/QFX and Mint CSV import, and rule apply-to-existing.
2. Check the RBC, TD and Tangerine presets against real export headers.
3. Decide whether Mint-imported categories count as hand edits.
4. Milestone 7: data safety (database export/import, CSV export, backups).

## Risks or decisions needed

- Loan accounts are not part of reports yet; only categorized lines are.
- Auto-update mechanism and three-OS native rebuilds remain open.
