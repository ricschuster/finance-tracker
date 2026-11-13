# Session Handoff: 2026-11-13 (import click-through, data privacy)

## Summary

Clicked through OFX, QFX and Mint import headless and merged the script. Set up
Claude Code so it cannot read the user's real financial data. Work is in PR #12.

## Completed

- `.claude/skills/run-finance-tracker/import-formats.mjs`: drives OFX, QFX and
  Mint import with `test-data/import/`. OFX imported 5 new; the same fitids as
  QFX gave 0 new and 5 already imported; Mint imported 3 + 4 rows across two
  accounts and flagged four unknown categories. No UI errors.
- Corrected `test-data/import/README.md` (Mint unknown categories) and the
  CLAUDE.md status line.
- User settings (`~/.claude/settings.json`, outside the repo): Read deny rules
  and sandbox `denyRead` for `~/Downloads`, `~/.config/finance-tracker`,
  `~/Finance` and `~/Documents/Finance`.

## Current state

- Deny rules verified: Read, Write and Bash `cat` on `~/Downloads` were refused.
- The command sandbox is disabled (`sandbox.enabled: false`). It failed to start
  here (`apply-seccomp: ... nested userns is capability-restricted`), which broke
  all Bash. So there is no OS-level read block; only the permission rules apply.
- The `denyRead` list is kept, so re-enabling is a one-word change.
- The demo app (`npm run dev:demo`) was started on the demo database to look at.

## Next actions

1. Fix the host so the sandbox can start (likely an AppArmor restriction on
   unprivileged user namespaces), then set `sandbox.enabled: true` and re-test
   with a dummy file. The user must run any system change themselves.
2. Add the user's backup folder to the deny lists once chosen in the Data tab.
3. Write a user-run script that copies only the header line of each CSV (and
   OFX tag names) into a readable folder, so Claude can see column layouts
   without data. Check for account numbers above the header row.
4. Verify the RBC, TD and Tangerine presets against real export headers.
5. Milestone 8: packaging (needs a design note: target OS, installer, updates).
6. Check that the headless skill still runs with the sandbox on; Electron may
   need a `/tmp` user-data dir instead of `~/.config/finance-tracker`.

## Risks or decisions needed

- Without the sandbox, a script run by Claude could still read the denied folders.
- Backups are plain unencrypted SQLite files.
- Loan accounts are not in reports; auto-update and three-OS rebuilds are open.
- Import history shows an Undo row for an import that added nothing.
