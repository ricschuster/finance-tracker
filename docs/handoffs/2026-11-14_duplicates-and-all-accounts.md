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

## Not verified in the real UI

- The new buttons, confirm dialog and Undo in Find duplicates, and the sidebar and tab changes,
  were not clicked through. README screenshots were not regenerated (the sidebar changed).

## Next actions

1. Regenerate README screenshots (`readme-shots.mjs`) since the sidebar looks different.
2. Owner confirms "across accounts" is what they meant by the duplicate search comment.
3. Remaining items from the v0.4.0 handoff (real-UI checks, budget rollover decision).
