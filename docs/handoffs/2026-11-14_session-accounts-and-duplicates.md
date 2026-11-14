# Session Handoff: 2026-11-14 (accounts, duplicates and sidebar rework)

## Summary

Second round of owner feedback after v0.4.0, delivered in three PRs (#37, #38, #39). No release was
cut on purpose; the changes sit under Unreleased in the changelog and more feedback is coming.
This file supersedes `2026-11-14_duplicates-and-all-accounts.md` and `2026-11-14_accounts-edit.md`
as the entry point (they hold the per-PR detail).

## Completed

- #37: Find duplicates can bulk delete ("Keep first, delete rest" per group, "Keep one of each" for
  all, one Undo; core `keepOneOfEach` always leaves one row) and match across accounts (on by
  default). The dialog got a real layout (`.row`, `.stack` and `.grow` have no CSS).
- #38 and #39: new Accounts tab under Manage (design note 15): assets, owing and net worth, a card
  per account group, Add account in the header, Edit account on each row, Archived card.
- Sidebar is navigation only: account list, balances, net worth, Owing line, "+" and "All
  accounts" are gone. Transactions always shows all accounts; an Account filter in Filters scopes it
  (archived accounts included, counted in the badge, reset by Clear).
- Manual, changelog, README screenshots and UI scripts (`accounts-page.mjs`, `duplicates.mjs`,
  updated `accounts-dashboard.mjs`) kept in step.

## Current state

`main` is at 75ef97e, version 0.4.0, migrations at 14, `npm run check` passes (278 tests). All of
the above was clicked through headless on the demo database with no page errors; the owner has not
yet used the new flow on real data.

## Next actions

1. Owner tries the sidebar-less flow, Find duplicates (cross-account matching) and the Accounts
   page on real data and reports back. Never read real data.
2. Possible follow-up: an account dropdown always visible beside the Transactions search box (today
   it is inside the collapsed Filters panel).
3. More feedback is expected; cut a release (0.5.0 or similar) once it lands.
4. Remaining items from the v0.4.0 handoff: real-UI checks (alias matching, toast "Create rule",
   headerless import guessing, dark theme of new components) and the budget rollover decision.

## Risks or decisions needed

- Cross-account duplicate matching is on by default and could flag legitimate repeats (for
  example the same subscription on two cards on one day). "Not a duplicate" hides a group for good.
- The Accounts page is the only place to see balances now.
