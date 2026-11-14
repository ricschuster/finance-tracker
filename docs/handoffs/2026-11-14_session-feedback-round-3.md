# Session Handoff: 2026-11-14 (feedback round 3: drill-downs, import guess, skip rules)

## Summary

Third round of owner feedback, delivered in PR #41. It sits under Unreleased in the changelog;
no release was cut. This file is the entry point and supersedes
`2026-11-14_session-accounts-and-duplicates.md` for next actions (that file still holds the
accounts and duplicates detail).

## Completed

- Dashboard drill-down: the Income, Spending and Net tiles and each month in the six-month chart
  open Transactions filtered to that figure. Transfers are left out, as in the reports, via a
  new `excludeTransfers` search option and a "Hide transfers" filter.
- Fix: the uncategorized Review button and category drill-downs showed nothing when an account
  had been picked earlier, because the account scope was kept. Drill-downs now reset it. Not
  reproduced on real data; the cause is inferred from the code.
- Import preview: a category per new row (`core/import/enrich.ts`, `enrichPlan`). Precedence:
  category picked in the preview, rule, file category (Mint), history guess. The guess keys on
  `suggestPattern(rawDescription)` plus direction and needs 60% agreement. The preview shows
  "guess n/m" and a picker.
- Rule action `skipImport`: import-only, first matching rule decides, preview shows "Skipped by
  rule" with Import anyway. Applying rules to history ignores it.
- Tests (287 pass), manual, changelog, design notes 04 and 05, and UI script
  `import-guess.mjs` kept in step.

## Current state

Branch `feat/dashboard-drilldown-import-guess` merged to `main`, version 0.4.0, migrations still
at 14 (no schema change). The owner has not yet used any of this on real data. Never read real
data.

## Next actions (start here: bring these ideas back to the owner)

Ideas proposed at the end of the session, none built yet:

1. Learn from corrections (smallest, most value): when the owner changes a guessed category in
   the import preview, offer to create a rule from it, as the category-change toast does now.
2. Review queue for uncategorized rows: the dashboard banner opens a screen that steps through
   uncategorized rows one at a time with the guess, the category list and a one-key "make a
   rule".
3. Payee cleanup suggestions: group "SAFEWAY #4412" and "SAFEWAY #9" under one payee, which
   also sharpens the guesses.
4. Recurrence detection: flag charges that repeat monthly at the same amount as subscription
   candidates.

Known small gap: the import preview's summary tiles (New, Money out) still count rows a skip
rule drops.

Carried over: the owner tries the sidebar-less flow, Find duplicates and the Accounts page on
real data; an account dropdown beside the Transactions search box; cut a release (0.5.0 or
similar) once feedback lands; real-UI checks from the v0.4.0 handoff; the budget rollover
decision.

## Risks or decisions needed

- A wrong history guess is applied silently if the owner does not look at the preview column;
  the 60% bar and the "guess n/m" label are the only safeguards.
- A skip rule drops rows without a record in the data after import (only the preview and the
  batch "skipped" count show it).
