# Session Handoff: 2026-11-13 (UI click-through)

## Summary

Drove the real app headless for the first time and fixed what the click-through
found. Work is on `fix/ui-click-through`; no PR opened yet.

## Completed

- Headless UI driver as a project skill: `.claude/skills/run-finance-tracker/`
  (Playwright under xvfb, `playwright-core` devDependency). `tour.mjs` covers
  search, rule creation, CSV import, history and undo.
- Fix: "Save search" threw because Electron does not support `window.prompt()`.
  It now uses an inline name field.
- Fix: category filter and rule "Set category" were bare checkboxes; now selects
  with "Any category" and "Do not set".
- Fix: transaction table dates and actions no longer wrap; import wizard says
  "lines" instead of "rows" because the count includes the header.
- Verified in the running app: search, filters, bulk bar, saved searches, split
  editor, rule create and preview, CSV import with rule applied, history, undo.

## Current state

- `npm run check` passes. Run `npm run rebuild:electron` before any UI session;
  `npm test` flips `better-sqlite3` to the Node build.

## Next actions

1. Click through OFX/QFX and Mint CSV import, and rule apply-to-existing.
2. Check the RBC, TD and Tangerine presets against real export headers.
3. Decide whether Mint-imported categories count as hand edits.
4. Milestone 6: reports and dashboard.

## Risks or decisions needed

- Avoid `window.prompt()`; `confirm` and `alert` work.
- Auto-update mechanism and three-OS native rebuilds remain open.
