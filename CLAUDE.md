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

Design phase, stack chosen (ADR 0002). Next milestone: skeleton app (see `docs/design/03_milestones.md`).

## Scope

In: manual transaction entry, accounts, categories, rules-based auto-categorization,
search and filters, monthly reports, budgets (post-MVP). Out for now: bank
syncing, multi-user, mobile apps, investment tracking. Do not expand scope
without a design note in `docs/design/` or an ADR.

## Stack

Electron, TypeScript, React, SQLite (better-sqlite3). See ADR 0002. Keep business logic (rules engine, import parsers, reports) framework-free under `core/` so it is unit-testable; `core/` never imports from the UI or Electron. Financial data is private: never commit real transaction data.

## Commands

To be filled in once the stack is chosen.

## Repo structure

See the tree; `docs/` holds design notes, ADRs and handoffs.

## Working rules

- Branch from `main`; one short-lived branch per change. Open a pull request
  into `main`; CI must pass before merge.
- Conventional Commits (for example `feat: ...`, `fix: ...`, `chore: ...`,
  `docs: ...`).
- No em dashes in code, comments, docs, commit messages, or user-facing text.
- Significant technical or design decisions get an ADR in `docs/decisions/`.
- Design notes live in `docs/design/`; session handoffs in `docs/handoffs/`.
- Keep changes small and focused; update docs when behaviour or design changes.
