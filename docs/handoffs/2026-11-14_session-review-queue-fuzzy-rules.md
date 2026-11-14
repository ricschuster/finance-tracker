# Session Handoff: 2026-11-14 (import rule offer, fuzzy rules, review queue)

## Summary

Followed up on the ideas from `2026-11-14_session-feedback-round-3.md`: built idea 1 (rule offer
from the import preview) and idea 2 (review queue), plus a fuzzy rule operator the owner asked
for. All in PR #42, under Unreleased in the changelog; no release was cut. This file supersedes
the round 3 handoff for next actions.

## Completed

- Import preview: changing a category (guess, file category or none) raises a toast offering to
  save a `description contains` rule. It saves directly via `rules.createRule` so the wizard
  keeps its state. Rows set by a rule do not offer one. `suggestPattern` moved to
  `core/rules/pattern.ts` so the renderer can use it; `suggest.ts` re-exports it.
- Rule operator `similar` ("is similar to", `core/rules/fuzzy.ts`): every pattern word must match
  a description word, any order, digits and punctuation ignored, typos allowed by word length
  (0 up to 4 letters, 1 up to 8, 2 beyond). Design note 05, "Fuzzy matching".
- Review queue (`core/rules/review.ts`, `ReviewQueue.tsx`, view `review`): the dashboard
  uncategorized banner opens a one-at-a-time screen with the history guess. Enter applies, R
  applies and saves a rule, S skips, "Open as list" keeps the old filtered list. Capped at 500
  rows. The history guess was factored out of `enrich.ts` (`guessFromHistory`, `loadHistory`).
- Manual, changelog and design notes 04 and 05 updated; README dashboard screenshots
  regenerated; UI scripts `import-guess.mjs` (extended) and `review.mjs` (new). 294 tests pass.

## Current state

`main` has everything above once PR #42 is merged. Version 0.4.0, migrations still at 14. The
owner has not used any of this on real data. Never read real data.

Known limits:

- `similar` is a rule operator only. The history guess (import and review queue) is still exact
  on `suggestPattern`, so "SAFWAY" and "SAFEWAY" do not share guesses.
- The review queue is loaded once on open and skips split transactions.
- The rule made from the review queue and import toast is `contains`, not `similar`, and is
  not previewed before saving.
- The import preview's summary tiles (New, Money out) still count rows a skip rule drops.

## Next actions

1. Bring the owner back to ideas 3 and 4 from the round 3 handoff: payee cleanup suggestions
   (group "SAFEWAY #4412" and "SAFEWAY #9"; fuzzy matching could feed this and the history
   guess) and recurrence detection for subscriptions.
2. Decide whether the history guess should use fuzzy matching too.
3. Fix the import preview summary tiles so skipped rows are not counted.
4. Carried over: the owner tries the sidebar-less flow, Find duplicates, Accounts, review queue and
   fuzzy rules on real data; an account dropdown beside the Transactions search; cut a release
   (0.5.0 or similar) once feedback lands; the budget rollover decision.

## Risks or decisions needed

- A fuzzy rule can match more than intended (5-letter words allow one typo, so "shall" matches
  "shell"). The rule preview shows what it would change; check it before applying to history.
- A wrong history guess in the review queue is one Enter away from being applied; the
  "guess n/m" label is the only safeguard.
