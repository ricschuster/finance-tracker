# Session Handoff: 2026-11-13 (data safety)

## Summary

Added sample import files and built milestone 7, data safety. Work is on
`chore/sample-import-files` (not yet committed or pushed).

## Completed

- Synthetic import samples in `test-data/import/` (generic, debit/credit, OFX,
  QFX, Mint) and 2000-row versions in `large/`, made by
  `test-data/generate-large.mjs`. See `test-data/import/README.md`.
- Design note `docs/design/08_data_safety.md`.
- `src/core/backup/`: online-backup snapshot, validation of a candidate
  database, staged restore swapped in at startup (old data kept in
  `pre-restore/`), transactions CSV export (one row per split line, formula
  safe), backup settings, pruning and due check. Unit tested.
- `src/main/data-ipc.ts` (`data:*` channels, hourly backup timer), preload
  `api.data`, and a Data tab (`DataPanel.tsx`).
- Headless skill: `data.mjs`.

## Current state

- `npm run check` passes. The Data tab was driven headless: folder, save,
  back up now, export database, export CSV, staged restore all work.
- Found and fixed in testing: two backups in the same second collided on the
  file name (saving settings triggers an immediate due backup).
- Restore's live relaunch was not clicked through by hand; the swap itself is
  unit tested.

## Next actions

1. Open the PR for this branch (sample data and milestone 7 together).
2. Click through OFX/QFX and Mint import using the new sample files.
3. Check the RBC, TD and Tangerine presets against real export headers.
4. Milestone 8: packaging.

## Risks or decisions needed

- Backups are plain unencrypted SQLite files in the user's chosen folder.
- Loan accounts are still not part of reports.
- Auto-update mechanism and three-OS native rebuilds remain open.
