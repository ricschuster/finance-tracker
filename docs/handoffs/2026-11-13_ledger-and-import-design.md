# Session Handoff: 2026-11-13 (ledger and import design)

## Summary

Built milestone 2 (the ledger) end to end, added a synthetic demo dataset,
seeded the starter category children, and wrote the milestone 3 import design
note. Everything is on `feat/ledger-schema` in PR #5, the single PR for this
session. No import code exists yet.

## Completed

- Migration 2 (accounts, categories, transactions, split lines, tags) and
  migration 3 (about 65 starter child categories, ADR 0003 updated).
- `src/core/ledger/`: accounts, categories, transactions (splits, transfers,
  hand-edit tracking), tags, and `handlers.ts`, the API shared by IPC and tests.
- IPC bridge (`src/main/ledger-ipc.ts`, preload built from `methods.ts`).
- Renderer: accounts sidebar with balances, add transaction, add transfer,
  inline category change, split editor, delete.
- `src/core/dev/seed.ts` and `npm run dev:demo` (separate gitignored
  `.dev-data/demo.sqlite`, about 460 synthetic transactions, deterministic);
  `npm run dev:demo:reset` regenerates it.
- `docs/design/04_import.md`: pipeline, mapping profiles, three-tier duplicate
  detection, transfer matching, schema for migration 4, undo, delivery order.
- CI fix: two unlabelled code fences in the design note failed markdownlint.

## Current state

- `npm run check` passes (55 tests). PR #5 is open; its first CI failure was
  the markdownlint issue above, fixed in the final commit.
- The Electron window was launched twice and started cleanly, but nobody has
  clicked through the UI yet. The user said testing was not useful at this
  stage.
- `edited_fields` is recorded but not enforced (rules milestone).
- Not supported: converting an existing transaction into a transfer, or
  unlinking one.
- Text search is deferred to milestone 5.
- Run `npm run dev:demo:reset` once if a demo database was created before the
  category children landed.

## Next actions

1. Confirm CI is green on PR #5 and get it reviewed and merged.
2. Get answers to the import open questions, then start step 1 of the
   delivery order in `04_import.md`: CSV parser, dates, mapping, match,
   commit, and migration 4, with synthetic fixtures.
3. Click through `npm run dev:demo` and fix rough edges in the ledger UI.

## Risks or decisions needed

- Import questions for the owner (also at the end of `04_import.md`): which
  banks to support first (RBC, TD and CIBC layouts are from memory and must be
  checked against real exports), Merge versus Import-as-new as the default for
  possible matches, the 3-day window, own CSV parser versus a dependency, and
  how to treat foreign-currency columns.
- Auto-update mechanism for installers is still undecided.
- Native module rebuilds will need care when packaging for three OSes.
- `better-sqlite3` flips between Node and Electron builds: use `npm test` and
  the dev scripts, never raw `vitest` after `npm run dev`.
