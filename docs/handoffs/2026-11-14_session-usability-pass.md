# Session Handoff: 2026-11-14 (usability pass from persona testing)

## Summary

Drove the built app headless as several personas (first-time user, careless typist, Quebec user,
messy-statement importer, hostile input, search-heavy, small laptop, keyboard user), then fixed
what turned up. Work was coordinated as five sequential tasks on one branch and one PR. Persona
testing found two bugs (decimal commas, squashed dashboard tiles) plus gaps in first-run, import
safety, narrow windows, search and keyboard use. This file supersedes the review-queue handoff
for next actions.

## Completed

- Amounts: `5,5` and `1,50` read as decimals (was $55 / $150); `1.234,56` and `1 234,56` work.
  Lone `1,234` stays 1234.00 (documented). Clear amount error text. Non-blocking warnings (zero,
  over $1,000,000, date over 1 year ahead or 20 years back) with a "Save anyway" step.
- Layout: dashboard stat tiles no longer clipped (they were `<button>`s picking up the global
  button style), sensible empty chart axis, ellipsis plus tooltip on long payees and rule names,
  header wrap, hidden Status column below 1000px, icon-rail sidebar below 900px.
- First run: "Get started" checklist on the Dashboard, "No accounts yet" and "No transactions
  yet" empty states. Import requires an explicit account when there are several (preselect only
  from a linked profile or a filename match, with a hint). Empty or header-only files get a clear
  notice and Preview is disabled.
- Search and keys: `searchTerms()` makes search predictable (quotes group, `*():` dropped,
  AND/OR/NOT are plain words, apostrophes ignored, punctuation-only terms ignored). "How search
  works" dialog. Shortcuts: `/`, `n`, `g` then `d t b r a i`, `?`, plus a sidebar footer button.
- Import summary no longer counts rows dropped by a skip rule ("Skipped by rule" tile). The history
  guess falls back to similar spellings (same word count and order, words 6+ letters), labelled
  "similar guess n/m".
- Design notes 16 (payee cleanup) and 17 (recurring payments), not implemented.
- Tests 294 to 334. Changelog, manual, design notes 04, 05, 06, 13 and README screenshots updated.

## Current state

Branch `feat/usability-pass`, one PR, version still 0.4.0, migrations still at 14. Throwaway
persona scripts live outside the repo; `lib.mjs` gained `chooseImportAccount`.

Known limits:

- Search is substring `LIKE`, so short words match inside longer ones ("or" in "Uncategorized").
  Amounts are not searched as text; use the amount filters.
- Sanity warnings are on transaction and transfer forms only, not splits, accounts or budgets.
- Similar history guess needs equal word counts ("SAFWAY STORE 12" does not pool with "SAFEWAY").
  Worst-case import preview with all-unseen descriptions is about 1.8 s on 2000 rows.
- The saved-profile account preselection and the over-$1M and far-date warnings have no
  headless coverage, only unit tests or code reading.
- The review queue and import toast still create `contains` rules, unpreviewed.

## Next actions

1. Owner tries the new flows on real data (first-run, import account choice, shortcuts). Never
   read real data.
2. Build the first slice of note 16 (payee cleanup) and note 17 (recurring payments).
3. Consider word-start matching for search if substring hits annoy.
4. Carried over: account dropdown beside the Transactions search, cut a release (0.5.0), budget
   rollover decision.

## Risks or decisions needed

- Decimal comma rule: `1,234` is thousands, not 1.234. Right for CAD/USD, wrong for someone typing
  a European thousand-less figure; the error would be silent. Confirm this is acceptable.
- Sidebar collapse hides labels below 900px; confirm tooltips are enough.
