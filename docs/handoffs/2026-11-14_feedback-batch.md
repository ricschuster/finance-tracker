# Session Handoff: 2026-11-14 (user feedback batch)

## Summary

Worked through the owner's feedback list in one PR, one sub-agent at a time.

## Completed

- Fixed RBC Mastercard CSV import: header detection chose a short data row because RBC drops the
  empty trailing USD$ cell. The missing-column error now names the column and lists the headers.
- Card payments: broader payment wording for auto-link at import, a "Link card payments" dialog
  for existing pairs, and cards and loans shown as "Owing $X" instead of a red negative balance.
- Dropped category kind (migration 13, ADR 0007). Reports classify each category by the sign of
  its net amount for the period. The "Change type" feature is gone and any non-system category
  can be budgeted or merged.
- Notes: add or edit from the row menu, with a note icon in the list.
- Searchable category picker used for every category choice.
- The "make a rule" prompt is now a bottom toast that disappears after about 8 seconds.
- Import wizard guesses the column mapping (header names and content) and shows a live preview.
- "Find duplicates" in the Transactions toolbar, with "Not a duplicate" dismissals (migration 14).
- README screenshots regenerated.

## Current state

`npm run check` passes (276 tests). Migrations are at 14.

## Not verified in the real UI

- Alias matching in the category picker (unit-tested only) and the toast's "Create rule" button.
- Import wizard: preset banner, headerless files, "Guess again", and the steps after the preview.
- The RBC fix was reproduced through core handlers, not the UI.
- Dark theme for the new picker, toast and dialogs.

## Next actions

1. Install the next release and try the RBC Mastercard file and a card payment link on real data
   (the owner reports back; never read real data).
2. Budget rollover decision (design note 12).
3. Optional: suggest rules from import history (needs a design note).
4. Import-time auto-link still needs the card row to exist first; a bare "VISA" description is
   caught by the Link card payments dialog instead.

## Risks or decisions needed

- Migration 13 (drop category kind) is one way. Income and spending totals can shift when a
  category nets across zero; net is unchanged.
- Undo for a deleted duplicate re-creates the row with a new id and loses hand-edit markers and
  the hide-from-budgets flag.
