# Session Handoff: 2026-11-13 (look and feel, part 2, and budgets widget)

## Summary

Finished the look and feel pass on the remaining screens, removed the last
native dialogs, and built the budgets dashboard widget. PR #17
(`feat/look-and-feel-part-2`), squash-merged into `main` at the end of the
session.

## Completed

- Budgets: month stepper and Add budget in the page header, stat tiles,
  progress rows (amber from 85%, red and an over-budget pill when over), a card
  for spending without a budget with quick Budget buttons, add and edit
  dialogs, remove through the in-app confirm.
- Categories: a card per kind, row menu with dialogs for rename, colour and
  icon (Lucide picker with live preview), merge and delete. Add category picks
  kind (spending or income), colour and icon.
- Rules: numbered list with When / Then chips, move up and down, row menu (edit,
  turn on or off, delete), editor as a wide dialog, preview card with an in-app
  apply confirm.
- Import: stepper, drop area that accepts a dragged file, folder card with
  status pills, mapping cards with the used columns highlighted in the sample,
  review tiles and result pills, done card with undo; Mint import in the same
  cards. History: table with expandable rows and a row menu (show rows, undo).
  Import times are shown in local time (they are stored as SQLite UTC).
- Data: export and restore, CSV export and automatic backup cards.
- No `window.confirm` / `window.alert` remain. The undo question about edited
  rows is shared (`confirmDeleteEdited` in `ImportWizard.tsx`).
- Budgets dashboard widget (design note 12). Dashboard widget choices are now
  stored as hidden ids so new widgets show by default; the old visible-ids
  format still reads (design note 07). `BudgetsApi` is typed async like the
  other APIs (it was typed sync by mistake).
- Review pass (a subagent read the diff; no regressions found) led to these
  fixes: the main window blocks navigation and new windows, and the renderer
  ignores file drops outside the import drop area (a stray drop used to replace
  the app with the file); the rule editor dialog ignores outside clicks and
  Escape (`Dialog persistent`), so a typed or suggested rule is not lost;
  `createCategory` takes colour and icon so adding is one call; the import
  review's empty message no longer claims rows were imported before when they
  failed or were skipped; backup settings can be saved even if status failed
  to load.
- Headless scripts: `budgets.mjs` (dialogs, widget), `categories.mjs`,
  `tour.mjs` updated; new `rules.mjs`. All ten scripts run without page errors;
  `screens.mjs` reviewed in light and dark.
- `npm run check` green, 220 tests.

## Current state

- Every screen has had its layout pass (design note 13 is marked built).
- `better-sqlite3` is on the Electron build after the headless runs; run
  `npm test` before trusting core results.

## Next actions

1. First release tag (`v0.1.0`), which runs the release workflow on all three
   OSes for the first time (ADR 0004). Needs the user's go-ahead.
2. Budget rollover: needs a decision (carry unspent only, or overspending
   too; per category or global; from which month). Write it into design note 12
   before building.
3. Optional: split the renderer bundle (about 1.1 MB) with lazy screens if
   startup feels slow.

## Risks or decisions needed

- Back up the real database before the first launch on schema 12 (carried
  over).
- The restore confirmation is still a native message box from the main
  process, on purpose (it runs just before the relaunch).
