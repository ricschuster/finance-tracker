# 03 Milestones

Phased plan. Open GitHub issues are the live tracker; this is the shape.

1. **Skeleton**: Electron + React + TypeScript app, SQLite with migrations,
   `core/` module, lint, typecheck, unit tests, CI job, dependabot.
2. **Ledger**: accounts, categories (starter set), transactions with splits,
   tags, notes, status, transfers. Transaction list.
3. **Import**: CSV with column mapping, OFX/QFX, Mint CSV, duplicate handling,
   import preview and history. See `04_import.md`.
4. **Rules**: engine, editor, ordered list, suggestions from manual edits,
   preview and apply to past, manual-edit locking, payee cleanup.
5. **Search**: instant search, filters, saved searches, bulk actions.
6. **Reports and dashboard**: category, income vs expenses, trends, top
   payees, periods. See `07_reports.md`.
7. **Data safety**: whole-database export/import, CSV export, periodic
   backups.
8. **Packaging**: installers for Mac, Windows, Linux built in CI.

After MVP: budgets and goals, receipt attachments, PDF statement import,
merge import between devices.
