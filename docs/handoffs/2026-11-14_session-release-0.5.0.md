# Session Handoff: 2026-11-14 (release 0.5.0)

## Summary

Short session: read the usability-pass handoff, confirmed its next actions were still open, and cut
v0.5.0. This file supersedes the usability-pass handoff for next actions.

## Completed

- Release 0.5.0 (PR #44): version bumped in `package.json` and `package-lock.json`, `[Unreleased]`
  in the changelog dated as `[0.5.0] - 2026-11-14`, `npm run check` and CI green, tag `v0.5.0`
  pushed after merge.
- The Release workflow succeeded in about 7 minutes. Assets on the release page: Linux AppImage,
  macOS arm64 and x64 dmg, Windows exe (all unsigned).
- `CLAUDE.md` status line updated for the release.

## Current state

- `main` is at the 0.5.0 release commit; migrations still at 14.
- No feature work this session; the open items from the usability-pass handoff are unchanged.
- The release installers have not been installed or opened by hand.

## Next actions

1. Owner installs 0.5.0 and tries the new flows on real data (first-run, import account choice,
   shortcuts, review queue). Never read real data.
2. Build the first slice of design note 16 (payee cleanup) and note 17 (recurring payments).
3. Account dropdown beside the Transactions search is already built (Account filter); drop it from
   the carried-over list if the owner agrees.
4. Consider word-start matching for search if substring hits annoy.
5. Budget rollover decision (design note 12).

## Risks or decisions needed

- Decimal comma rule: `1,234` is read as thousands (1234.00), not 1.234. Unconfirmed by the owner.
- Sidebar collapses to icons below 900px; confirm tooltips are enough.
- Known limits from the usability-pass handoff still apply (substring search, sanity warnings only
  on transaction and transfer forms, similar-guess needs equal word counts, unpreviewed rules from
  the review queue and import toast).
