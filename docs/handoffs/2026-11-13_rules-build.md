# Session Handoff: 2026-11-13 (rules build)

## Summary

Built milestone 4 (rules): design note, migration 5, a pure engine, storage,
preview and apply, hand-edit suggestions, IPC and a basic editor tab. All of it
is on `feat/rules`, the single PR for this session.

## Completed

- `docs/design/05_rules.md`: model, locking, apply, suggestions, known gaps.
- Migration 5 (`rules` table). Conditions and actions are JSON.
- `src/core/rules/`: `engine` (pure, first match wins, locks hand edits, skips
  transfers and split categories), `store` (validated CRUD and ordering),
  `apply` (`previewRules`, `applyRules`), `suggest` (`suggestRule`), `handlers`.
- Rules run on newly imported rows inside the commit transaction, so undo still
  removes them cleanly.
- IPC (`src/main/rules-ipc.ts`, preload `rules`), a Rules tab (`RulesEditor`)
  and a "Rule" button per transaction that opens a suggested rule for review.
- 21 new tests (136 total). Typecheck, lint and format are clean.

## Current state

- Rule writes never touch `edited_fields`, so re-running replaces earlier rule
  results but never hand edits.
- The editor has one slot per condition and action kind. A rule with two text
  conditions can be stored but is not editable in the UI.
- Rows imported with a Mint category can have it replaced by a rule.
- Nobody has clicked through the rules UI or the import UI.

## Next actions

1. Click through `npm run dev:demo`: create a rule, preview, apply, and try
   "Rule" on a hand-edited transaction. Fix rough edges.
2. Check the RBC, TD and Tangerine presets against real export headers.
3. Decide whether Mint-imported categories should count as hand edits.
4. Milestone 5: search, filters, saved searches, bulk actions.

## Risks or decisions needed

- Auto-update mechanism for installers is still undecided.
- Native module rebuilds will need care when packaging for three OSes.
- `better-sqlite3` flips between Node and Electron builds: use `npm test` and
  the dev scripts, never raw `vitest` after `npm run dev`.
