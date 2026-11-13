# Session Handoff: 2026-11-13 (search build)

## Summary

Merged the rules PR (#7), then built milestone 5 (search): design note,
migration 6, query and bulk-action core, saved searches, IPC, and a search and
filter bar with selection and bulk actions on the Transactions tab. All of it
is on `feat/search`, the single PR for the rest of this session.

## Completed

- #7 (rules) squash-merged to `main`, CI green.
- `docs/design/06_search.md`: query shape, `LIKE` over FTS5, saved searches,
  bulk action rules.
- Migration 6 (`saved_searches`).
- `src/core/search/`: `query` (text across payee, description, notes, tags and
  categories; filters for account, category tree, uncategorized, tag, status,
  dates, direction, amount; total and sum across all matches), `saved`,
  `bulk` (set category, add or remove tag, set status, delete; one database
  transaction; counts as hand edits so rules leave them alone), `handlers`.
- IPC (`src/main/search-ipc.ts`, preload `search`) and `TransactionSearch`
  with debounced instant search, a filter panel, saved searches, row
  checkboxes, "select all N matches" and a bulk bar.
- 13 new tests (149 total). The app starts under a virtual display with no
  errors; nobody has clicked through the UI.

## Current state

- The list shows the newest 500 matches; the count and sum cover all matches.
  Bulk "select all matches" is capped at 10,000.
- The sidebar account scopes the search and is not stored in saved searches.
- Set category skips transfers and splits and reports the skipped count.
- Search is substring `LIKE`; revisit FTS5 only if it feels slow.
- No paging controls yet beyond the 500 newest.

## Next actions

1. Click through `npm run dev:demo`: search, filters, saved searches, bulk
   actions, rules tab, import wizard. Fix rough edges.
2. Check the RBC, TD and Tangerine presets against real export headers.
3. Decide whether Mint-imported categories should count as hand edits.
4. Milestone 6: reports and dashboard.

## Risks or decisions needed

- Auto-update mechanism for installers is still undecided.
- Native module rebuilds will need care when packaging for three OSes.
- `better-sqlite3` flips between Node and Electron builds: use `npm test` and
  the dev scripts, never raw `vitest` after `npm run dev`.
