# Session Handoff: 2026-11-14 (first import, xlsx, manual, bulk delete)

## Summary

Made the Monarch move workable from an empty database, added spreadsheet import, an in-app
manual, and two bulk delete features. All in PR #26.

## Completed

- Multi-account files (Monarch, Mint, Wealthsimple) import with no accounts yet. CSV and OFX
  still need an account first (design note 04).
- Setup import checkbox: removes our unused non-system categories that the file does not use.
  Categories with lines, rules, budgets or saved searches are always kept. The preview lists
  what will go.
- `.xlsx` import via `read-excel-file` (ADR 0006): first sheet converted to CSV text in main;
  picker, drag and drop and the watched folder all accept it.
- In-app Manual (sidebar, Help group): `src/renderer/src/manualContent.ts`, design note 14.
- Categories tab: checkboxes, Select all, Select unused, Delete selected (one transaction,
  lines move to a chosen category).
- Transactions: Delete all N deletes every match with no cap (the 500 was only the page size).
- Tests 232 passing; each feature was clicked through headless on synthetic data.

## Current state

- PR #26 merged into `main`. Version is still 0.2.0 (no release cut).
- Nothing has been run against real files: the Monarch layout (xlsx or CSV) is still from
  header images and a synthetic fixture only.

## Next actions

1. User imports the real Monarch xlsx with Setup import ticked and reports what the preview
   shows (dates, amounts, tags, categories, account types). If rows error, fix the xlsx
   conversion or the Monarch mapper.
2. Set opening balances by hand on the new accounts.
3. Same check for a real Wealthsimple file.
4. Budget rollover still needs a decision (design note 12).
5. Consider a release (v0.3.0) once the real import is confirmed.

## Risks or decisions needed

- Only the first sheet of an xlsx is read; dates must be date cells or ISO text.
- Delete all and bulk category delete are not undoable; the dialogs recommend a backup.
- Monarch Transfer rows are not linked pairs, Wealthsimple USD accounts are skipped, Mint
  labels are not imported as tags (unchanged).
- Working rule from the user: never read their real financial data (database, backups or real
  export files), even to verify. Use synthetic data and ask them to report what they see.
