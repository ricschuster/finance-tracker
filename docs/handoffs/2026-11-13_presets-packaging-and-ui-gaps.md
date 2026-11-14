# Session Handoff: 2026-11-13 (presets, packaging, UI gaps)

## Summary

Verified the RBC, TD and Tangerine presets against the user's real exports,
built milestone 8 (packaging), wrote the next design note, and closed three UI
gaps found in an app review: category editing, a customizable dashboard, and
account edit, archive and delete. All of it is in PR #13.

## Completed

- Presets: RBC and TD matched; Tangerine's date column is `Date`, not
  `Transaction date` (fixed). All three marked verified (header row and date
  format only, no data committed).
- Packaging: `electron-builder.yml`, `npm run package` and `package:dir`, a
  tag-triggered `release.yml` (AppImage, NSIS, dmg), ADR 0004 (unsigned,
  manual updates, GitHub Releases), `docs/design/09_packaging.md`, README
  install section. The Linux unpacked build was smoke-tested on a temp database.
- Design note `docs/design/10_balances_and_reconciliation.md` (proposed).
- Categories tab: add, subcategory, rename, delete with reassign, usage counts.
- Dashboard Customize: show or hide seven sections, saved in `settings`.
- Accounts: edit, archive (with an Archived list) and delete with an impact
  prompt. Deleting removes the account's transactions and the other half of
  transfers.
- Headless scripts `categories.mjs` and `accounts-dashboard.mjs`.

## Current state

- 183 unit tests pass and CI is green.
- `better-sqlite3` flips between Node and Electron builds: `npm test` and
  `rebuild:node` build for Node, `dev`, `package` and the headless scripts need
  `rebuild:electron`. A failing core test after UI work is usually this.
- The release workflow and the Windows and macOS builds have never run.

## Next actions

1. Decide the open questions in note 10, then build balance snapshots and net
   worth, then reconciliation.
2. Cut the first release: bump `version`, update `CHANGELOG.md`, tag `v0.1.0`,
   and watch the three-OS workflow.
3. Category move (change parent) and merge are not built.
4. Replace `window.alert` and `window.confirm` with in-app dialogs.
5. Handoff items still open from before: fix the sandbox on this host, add the
   backup folder to the deny lists, header-only copies of exports.
6. Then budgets, recurring transactions and an import review queue.

## Risks or decisions needed

- Note 10 questions: remember statement dates per card, warn or block on a
  non-zero reconciliation difference (proposed: warn), separate mortgage and
  investment types.
- Deleting a category leaves rules pointing at it; they stop applying silently.
- Account delete cannot be undone except from a backup.
- Backups are unencrypted; loan accounts are not in reports yet.
