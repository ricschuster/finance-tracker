# Session Handoff: 2026-11-14 (duplicates cleanup and all-accounts view)

## Summary

Second round of owner feedback after v0.4.0, in one PR. No version cut; more changes are coming.

## Completed

- Find duplicates: "Keep first, delete rest" per group and "Keep one of each (N)" for all groups.
  Core `keepOneOfEach` always leaves the first row of each group; one Undo restores a batch.
- Find duplicates: new `crossAccount` option and a "Match across accounts" checkbox (default on).
  The finder was never limited to the selected account; it only compared rows within one account.
- Sidebar account rows show names only; the "Owing on cards and loans" line is removed.
- The Transactions tab now clears the account filter and shows all accounts.
- Manual and changelog updated; tests added for cross-account matching and `keepOneOfEach`.

## Current state

`npm run check` passes. Migrations are still at 14. Version is still 0.4.0 (Unreleased section in
the changelog holds these changes).

## Verified in the real UI (headless)

- New `duplicates.mjs` skill script: seeds duplicates, checks the names-only sidebar, the
  all-accounts Transactions tab, cross-account on and off, Keep one of each, and Undo. No page errors.
- The Find duplicates dialog had no layout (`.row`, `.stack` and `.grow` have no CSS); fixed with
  inline flex styles. Its description no longer says "same account".
- README screenshots regenerated (sidebar changed; demo data makes some figures differ).

## Next actions

1. Owner confirms "across accounts" is what they meant by the duplicate search comment.
2. Remaining items from the v0.4.0 handoff (real-UI checks, budget rollover decision).
