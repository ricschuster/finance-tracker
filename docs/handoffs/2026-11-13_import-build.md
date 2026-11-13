# Session Handoff: 2026-11-13 (import build)

## Summary

Answered the milestone 3 open questions, then built the import feature
end to end for CSV, OFX/QFX and Mint CSV: pure core, migration 4, commit, undo, saved
profiles, IPC, and a wizard plus history UI. All of it is on
`feat/import-core` in PR #6, the single PR for this session.

## Completed

- Decisions recorded in `docs/design/04_import.md`: `csv-parse` dependency,
  Merge default for possible matches, 3-day window, RBC/TD/Tangerine presets
  first, foreign currency rows skipped with a per-import override.
- `src/core/import/`: `csv`, `dates`, `mapping` (three amount modes, flip
  sign, decimal comma, foreign column), `match` (external id, one-to-one
  fingerprint, possible match, transfer offer), `commit` (one DB
  transaction, merges keep hand edits, transfer linking), `history` (batches,
  undo with before images), `profiles` (validated, fingerprint lookup),
  `ofx` (SGML and XML), `sanity` (inverted sign and date warnings),
  `mint` (per-account split, categories by name), `presets`, and `handlers`/`methods` shared by IPC and tests.
- Migration 4: `import_batches`, `import_profiles`, `import_changes`,
  `transactions.external_id` and `import_batch_id`.
- IPC (`src/main/import-ipc.ts`, preload `importer`), `ImportWizard` and
  `ImportHistory` in the renderer, with Transactions, Import and Import
  history tabs.
- 115 tests; CI green on the PR at last check. The app starts under a virtual
  display with no errors, but nobody has clicked through the import UI.

## Current state

- Commit re-plans from the raw file in main, so the renderer is never trusted
  for outcomes; it only sends per-line overrides.
- Presets are written from memory and flagged "unverified layout".
- The wizard samples the first 40 rows for column mapping and date format
  guessing; later bad rows show up as preview errors.
- Mint: accounts chosen as "create new" are created when you press Preview,
  so abandoning the wizard afterwards leaves empty accounts. Labels are not
  imported as tags; unknown categories go to Uncategorized and are listed.
- Not built: presets for CIBC, BMO and Scotiabank, property test for import idempotence (an
  example-based one exists), bulk "undo" confirmation uses `window.confirm`.
- Transfers: an imported row can be linked to an opposite row in another
  account; undo restores the peer's category and link.

## Next actions

1. Click through `npm run dev:demo` with synthetic CSV and QFX files and fix
   rough edges in the wizard (never use real bank data in the repo).
2. Check the three presets against real export headers (header row and date
   format only) and flip `verified` in `presets.ts`.
3. More bank presets once real headers are available.
4. Milestone 4: rules and categorization.

## Risks or decisions needed

- Auto-update mechanism for installers is still undecided.
- Native module rebuilds will need care when packaging for three OSes.
- `better-sqlite3` flips between Node and Electron builds: use `npm test` and
  the dev scripts, never raw `vitest` after `npm run dev`.
