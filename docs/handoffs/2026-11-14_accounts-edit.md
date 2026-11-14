# Session Handoff: 2026-11-14 (Accounts page edit buttons)

## Summary

Follow-up to the Accounts page (PR #38): the sidebar's "All accounts" duplicated it.

## Completed

- Removed "All accounts" from the sidebar; Accounts (under Manage) is the one entry point.
- Each Accounts row has an Edit account button opening the same dialog (rename, archive, delete).
  The dialog now keys off its own `editId` instead of the selected account, so it works from the
  Accounts page as well as from an account's header button.
- Manual, changelog, design note 15, `accounts-page.mjs` and README screenshots updated.

- Add account is now a button on the Accounts page header. The sidebar's "+" and its Net worth
  block are gone (net worth is on the Accounts page). - The sidebar account list (and archived group) is removed. Transactions has an Account filter in
  Filters (also lists archived accounts, counts in the filter badge, reset by Clear); opening an
  account from the Accounts page sets it. UI scripts (`accounts-dashboard.mjs`, `duplicates.mjs`,
  `accounts-page.mjs`) were moved to the new flow.

## Current state

`npm run check` passes. Clicked through headless (edit and rename from a row, header edit still
works), no page errors. Still v0.4.0; no release cut on purpose.

## Next actions

1. Owner tries the sidebar-less flow. Possible follow-up: show the account filter outside the
   collapsed Filters panel.
2. Remaining items from the v0.4.0 handoff (real-UI checks, budget rollover decision).
