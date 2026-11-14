# Session Handoff: 2026-11-14 (Wealthsimple and Monarch import)

## Summary

Added Wealthsimple and Monarch (the one-time move from the user's previous
tool) as multi-account imports. Both reuse the Mint per-account mapping step.
Accounts and categories found in the file are now created.

## Completed

- PR #23 (branch `feat/wealthsimple-preset`):
  - `src/core/import/wealthsimple.ts`: ISO dates, signed amounts, account is
    "type number", non-CAD rows skipped, `notes` is the memo.
  - `src/core/import/monarch.ts`: `Merchant` is the payee, `Original
    Statement` the raw description, `Id` the external id, `Pending` sets
    status, `Tags` become tags.
  - `handlers.ts`: `mapMulti` picks Mint, Monarch or Wealthsimple by header;
    `inspectMint` and friends now return a `source`. Names kept for API
    compatibility. Wealthsimple and Monarch batches are stored as `csv`
    (no migration).
  - `Candidate.tags` added and written by `commitImport`.
  - Missing categories are created at commit (income when every row is money
    in, otherwise expense), unless mapped to an existing one in the preview.
  - `accountType.ts`: `guessAccountType` for newly created accounts.
  - Design note 04 updated ("Moving from Monarch" and account/category
    creation).

## Current state

- `npm run check` passes (225 tests).
- Both layouts come from header images only. No real rows were seen and the
  app was not clicked through.

## Next actions

1. Import a real Monarch file into a copy of the database (or the demo one)
   and check dates, amounts, tags, guessed account types and new categories.
   Back up the real database first.
2. Set opening balances on the new accounts by hand (not in the Monarch
   export), so balances match Monarch.
3. Same check for a real Wealthsimple file.
4. Budget rollover still needs a decision (design note 12).
5. Confirm v0.1.1 installs on the Intel Mac (from the previous handoff).

## Risks or decisions needed

- Monarch Transfer rows import as ordinary transactions, not linked pairs.
- Monarch budgets and Owner/Reviewed fields are not carried over.
- Wealthsimple has no per-account currency setting: a USD account has all its
  rows skipped.
- Mint labels are still not imported as tags (only Monarch tags are).
