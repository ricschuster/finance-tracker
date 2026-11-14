# Session Handoff: 2026-11-14 (Accounts page)

## Summary

The sidebar lost its balances (previous PR), so "All accounts" had nowhere to show them. Added an
Accounts tab (design note 15).

## Completed

- `Accounts.tsx`: assets, owing and net worth summary; one card per account group with type and
  balance (liabilities read Owing); archived card; click a row to open its transactions.
- Nav item "Accounts" under Manage. The sidebar's "All accounts" opens it; the Transactions tab
  still shows all transactions.
- Manual, changelog, design note 15, `accounts-page.mjs` skill script, README screenshots.

## Current state

`npm run check` passes. Clicked through headless: no page errors. Still v0.4.0 (Unreleased holds
this and the previous PR); no release cut on purpose.

## Next actions

1. Owner reviews the Accounts page. Possible follow-ups: add/edit/archive from the page, dashboard
   widget, sparkline per account.
2. Remaining items from the v0.4.0 handoff (real-UI checks, budget rollover decision).
