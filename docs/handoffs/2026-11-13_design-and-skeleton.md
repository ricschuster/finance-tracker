# Session Handoff: 2026-11-13

## Summary

Created the repo from the project template, ran a long design Q&A, recorded the
decisions, and built the milestone 1 skeleton (Electron, React, TypeScript,
SQLite). Repo settings were bootstrapped, so `main` is protected and all
changes go through one PR per session.

## Completed

- Repo `ricschuster/finance-tracker` (private) created from the template;
  `scripts/bootstrap-repo-settings.sh` run.
- PR #1: project brief, ADR 0002 (stack), milestone plan.
- PR #2: ADR 0003 (data model conventions), skeleton app, CI build job,
  Dependabot npm, updated CLAUDE.md, CONTRIBUTING.md and README.

## Current state

- `npm run check` passes (format, lint, typecheck, 18 tests, build).
- `src/core/` has money helpers and a migration runner with a single
  `settings` table. No ledger tables yet.
- The UI is a placeholder page showing app version and schema version.
- The window was launched by hand only after the PR was merged; see the PR
  discussion if anything looked wrong.
- `better-sqlite3` flips between Node and Electron builds; use `npm test` and
  `npm run dev`, which rebuild it first.

## Next actions

1. Milestone 2, the ledger: accounts, categories (starter parents in ADR
   0003, children still to settle), transactions with split lines, tags,
   notes, status, transfers, and the transaction list. Start with the schema
   migration and core queries with tests, then the UI.

## Risks or decisions needed

- Final children of each starter category.
- Merge import between devices is deferred.
- Auto-update mechanism for installers.
- Native module rebuilds will need care when packaging for three OSes.
