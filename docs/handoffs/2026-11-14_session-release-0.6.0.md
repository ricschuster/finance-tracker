# Session Handoff: 2026-11-14 (release 0.6.0)

## Summary

Short session: merged the 0.6.0 release PR and confirmed the tag-triggered release workflow
publishes. This file supersedes the feedback-round-4 handoff for next actions.

## Completed

- Merged PR #47 (release 0.6.0 version bump, changelog, transactions click-through script fix);
  all four CI checks were green.
- Tagged `v0.6.0` on the merge commit (`891fa6d`) and pushed it. The Release workflow succeeded,
  including the publish job.
- Assets on the release page: Linux AppImage, Windows exe, macOS arm64 and x64 dmg (all unsigned).

## Current state

- `main` is at the 0.6.0 release commit; migrations unchanged.
- No feature work this session.
- The release installers were only checked for upload, not installed or opened by hand.
- The workflow shows two warnings: Node 20 deprecation on `actions/upload-artifact@v4`, and the
  `ubuntu-latest` label moving to Ubuntu 26 (announced for 2026-10-19). Neither failed the run.

## Next actions

1. Owner installs 0.6.0 and tries the new flows (all transactions, edit, cashflow donut) on real
   data. Never read real data.
2. Build the first slices of design notes 16 (payee cleanup) and 17 (recurring payments).
3. Budget rollover decision (design note 12).
4. Bump `actions/upload-artifact` and pin the runner image if the warnings start to matter.

## Risks or decisions needed

- Carried-over limits and open questions from the release-0.5.0 and feedback-round-4 handoffs
  still apply.
