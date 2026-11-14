# Session Handoff: 2026-11-13 (rule prompt, import folder, budgets)

## Summary

Built, in PR #15: a rule prompt when a category is changed in the list, the
watched import folder, default linking of card payments at import, category
aliases, the hide-from-budgets flag, and monthly budgets v1.

## Completed

- Category change in the list asks "Make this a rule?" and opens the draft in
  the rules editor (`TransactionList.tsx`, note 05).
- Watched import folder: `core/import/folder.ts`, IPC in `import-ipc.ts`,
  `ImportFolder.tsx` in the wizard. Checked when the import screen opens and on
  demand; no live watching. Files are never moved or deleted.
- Card payments: a new row with a transfer candidate is linked by default when
  either account is a credit card or loan and the text says payment. The
  checkbox can be cleared.
- Category aliases (migration 10): imports match name then alias; Mint preview
  maps unknown categories; merge keeps the old name as an alias.
- `exclude_from_budgets` (migration 11): row button, bulk buttons, markers in
  lists and the biggest-transactions report.
- Budgets (migration 12, note 12): standing monthly amount per expense
  category, Budgets tab with month picker, spent, remaining and add or edit.
- Headless script `budgets.mjs` run clean. 218 tests, `npm run check` green.

## Current state

- Schema is at version 12. `better-sqlite3` is on the Electron build after the
  headless run; run `npm test` before trusting core results.

## Next actions

1. Cut the v0.1.0 release tag and watch the CI release run on all three OSes.
2. Budget follow-ups: rollover, per-month overrides, dashboard widget, alerts.
3. Replace `window.alert` and `window.confirm` (new rule prompt uses confirm).
4. Live watching of the import folder, if wanted.
5. Carry-overs: open questions in note 10, sandbox on this host, backup folder
   in the deny lists.

## Risks or decisions needed

- Back up the real database before first launch: migrations 8 and 12 are the
  ones that change structure most.
- Default card-payment linking relies on payment words in the bank text; a
  payment worded otherwise stays opt-in.
- The folder check only runs when the import screen opens, not at app startup.
