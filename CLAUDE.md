# CLAUDE.md

Working rules and durable context for this project. This file is loaded into
context automatically, so keep it to direction and rules, not a task list.

## Project name

finance-tracker

## Project purpose

A personal finance organizer like Intuit Mint, but fed by manual entry (and
CSV import later). The user adds transactions; the app categorizes them via
user-defined rules, supports full-text search, and produces monthly reports.
See `docs/design/00_project_brief.md`.

## Project status

Milestones 1 (skeleton) and 2 (ledger: schema, core queries, IPC, transaction list, transfers, splits) are built. Milestone 3 (import) is built: CSV, OFX/QFX and Mint CSV, mapping profiles, duplicate detection, undo, history, and unverified bank presets (see `docs/design/04_import.md`). Milestone 4 (rules) is built in core, IPC and a basic editor (see `docs/design/05_rules.md`). Milestone 5 (search) is built: filters, saved searches and bulk actions (see `docs/design/06_search.md`). Milestone 6 (reports and dashboard) is built: category, income vs expenses, trend, payee and biggest-transaction reports, a dashboard home screen and category drill-down (see `docs/design/07_reports.md`). Next: verify bank presets against real export headers, click through OFX/QFX and Mint import, then milestone 7, data safety.

## Scope

In: manual transaction entry, accounts, categories, rules-based auto-categorization,
search and filters, monthly reports, budgets (post-MVP). Out for now: bank
syncing, multi-user, mobile apps, investment tracking. Do not expand scope
without a design note in `docs/design/` or an ADR.

## Stack

Electron, TypeScript, React, SQLite (better-sqlite3). See ADR 0002. Keep business logic (rules engine, import parsers, reports) framework-free under `core/` so it is unit-testable; `core/` never imports from the UI or Electron. Financial data is private: never commit real transaction data.

## Commands

- `npm run dev`: launch the app (rebuilds better-sqlite3 for Electron first).
- `npm run dev:demo`: launch on a synthetic demo database (`.dev-data/`, gitignored); `dev:demo:reset` wipes it. Never touches real data.
- `npm test`: unit tests for `src/core/` (rebuilds better-sqlite3 for Node first). Gate.
- `npm run lint`, `npm run typecheck`, `npm run format:check`: gates.
- `npm run check`: everything CI runs, about a minute. Gate.

## Repo structure

- `src/core/`: framework-free logic (money, db migrations, later rules, import,
  reports). Never imports Electron, React, `main/` or `renderer/` (enforced by
  ESLint).
- `src/main/`: Electron main process, owns the database and IPC handlers.
- `src/preload/`: the typed bridge exposed to the UI.
- `src/renderer/`: React UI. Talks to data only through the preload API.
- Conventions: ADR 0003 (integer cents, expenses negative, split lines).

## Working rules

- Branch from `main`; one short-lived branch per change. Open a pull request
  into `main`; CI must pass before merge.
- Conventional Commits (for example `feat: ...`, `fix: ...`, `chore: ...`,
  `docs: ...`).
- No em dashes in code, comments, docs, commit messages, or user-facing text.
- Significant technical or design decisions get an ADR in `docs/decisions/`.
- Design notes live in `docs/design/`; session handoffs in `docs/handoffs/`.
- Keep changes small and focused; update docs when behaviour or design changes.
- One pull request per working session: keep adding commits to the session's open PR rather than opening several.
