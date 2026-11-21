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

Milestones 1 (skeleton) and 2 (ledger: schema, core queries, IPC, transaction list, transfers, splits) are built. Milestone 3 (import) is built: CSV, OFX/QFX and Mint CSV, mapping profiles, duplicate detection, undo, history, and bank presets for RBC, TD and Tangerine, verified against real export headers and date formats (see `docs/design/04_import.md`). Milestone 4 (rules) is built in core, IPC and a basic editor (see `docs/design/05_rules.md`). Milestone 5 (search) is built: filters, saved searches and bulk actions (see `docs/design/06_search.md`). Milestone 6 (reports and dashboard) is built: category, income vs expenses, trend, payee and biggest-transaction reports, a dashboard home screen and category drill-down (see `docs/design/07_reports.md`). Milestone 7 (data safety) is built: database export and restore, transactions CSV export and automatic backups (see `docs/design/08_data_safety.md`). OFX/QFX and Mint import were clicked through headless (`import-formats.mjs`). Milestone 8 (packaging) is built: unsigned installers via electron-builder and a tag-triggered release workflow (see `docs/design/09_packaging.md`, ADR 0004). v0.1.0 is released (Linux AppImage, Windows exe, macOS arm64 dmg on the GitHub release page). After the MVP review: a Categories tab (add, rename, delete with reassign), a customizable dashboard, and account edit, archive and delete from the sidebar. After the design review (`docs/design/11_review_feedback.md`): duplicate hardening, flat categories with merge, category colours and icons, and per-category search totals are built. Also built: a rule prompt when a category is changed in the list, the watched import folder, default linking of card payments at import, category aliases (migration 10) and the hide-from-budgets flag (migration 11). budgets v1 (monthly standing amount per category, see `docs/design/12_budgets.md`, migration 12) with a dashboard widget. Look and feel (`docs/design/13_look_and_feel.md`, ADR 0005) is built: design tokens, light and dark themes, sidebar shell, dialogs and a layout pass on every screen; no `window.alert`/`window.confirm` remain. An in-app Manual (`docs/design/14_manual.md`) is built; keep `manualContent.ts` in step with user-visible changes. Spreadsheet (.xlsx) import is built (ADR 0006). After the feedback batch (handoff 2026-11-14_feedback-batch): category kind dropped (ADR 0007), card payment linking, searchable category picker, notes, rule toast, import column guessing with preview, and Find duplicates. After the second feedback round (handoff 2026-11-14_session-accounts-and-duplicates): bulk duplicate cleanup with cross-account matching, an Accounts tab (design note 15), a navigation-only sidebar and an Account filter on Transactions. After the third feedback round (handoff 2026-11-14_session-feedback-round-3): dashboard drill-downs, import category guess and skip-on-import rules. After the follow-up (handoff 2026-11-14_session-review-queue-fuzzy-rules): import rule offer, fuzzy `similar` rule operator and a review queue for uncategorized rows. After persona testing (handoff 2026-11-14_session-usability-pass): decimal-comma fix, layout and narrow-window fixes, first-run guidance, explicit import account, predictable search, keyboard shortcuts, skip-aware import summary, similar-spelling history guess, and design notes 16 and 17. v0.5.0 is released (handoff 2026-11-14_session-release-0.5.0). After the fourth feedback round (handoff 2026-11-14_session-feedback-round-4): load all transactions, edit transaction, hidden-from-budgets leaves reports, net refunds and sorting on budgets, a spending donut, and Budgets renamed Cashflow. v0.6.0 is released. v0.7.0 adds set balance on a date and a Back button. v0.7.1 restores the account list to the sidebar. v0.8.0 removes budget targets (migration 15; design note 12 kept as history) and reworks Cashflow: signed categories, category search, drill-down from every row and a month that survives Back (handoff 2026-11-20_session-release-0.8.0). v0.9.0 adds hide-from-trends categories, positive spending and a month picker on Cashflow (handoff 2026-11-21_session-release-0.9.0). Next: build the first slices of design notes 16 and 17.

## Scope

In: manual transaction entry, accounts, categories, rules-based auto-categorization,
search and filters, monthly reports and cashflow. Out for now: budget targets (removed in 0.8.0), bank
syncing, multi-user, mobile apps, investment tracking. Do not expand scope
without a design note in `docs/design/` or an ADR.

## Stack

Electron, TypeScript, React, SQLite (better-sqlite3). See ADR 0002. Keep business logic (rules engine, import parsers, reports) framework-free under `core/` so it is unit-testable; `core/` never imports from the UI or Electron. Financial data is private: never commit real transaction data.

## Commands

- `npm run dev`: launch the app (rebuilds better-sqlite3 for Electron first).
- `npm run dev:demo`: launch on a synthetic demo database (`.dev-data/`, gitignored); `dev:demo:reset` wipes it. Never touches real data.
- `npm test`: unit tests for `src/core/` (rebuilds better-sqlite3 for Node first). Gate.
- `npm run lint`, `npm run typecheck`, `npm run format:check`: gates.
- `npm run package:dir` / `npm run package`: unpacked app / installer for the current OS (rebuilds better-sqlite3 for Electron first).
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
- Keep changes small and focused; update docs when behaviour or design changes. The repo is public: regenerate README screenshots (`readme-shots.mjs`, see CONTRIBUTING) after visible UI changes, and never commit real data.
- One pull request per working session: keep adding commits to the session's open PR rather than opening several.
