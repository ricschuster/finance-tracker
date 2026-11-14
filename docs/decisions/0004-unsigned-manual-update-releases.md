# Unsigned installers, manual updates, GitHub Releases

## Status

Accepted

## Context

Milestone 8 packages the app for macOS, Windows and Linux (ADR 0002 chose
electron-builder). The app is for personal use. Code signing needs paid
certificates and CI secrets, and auto-update practically requires signing on
macOS and Windows.

## Decision

- Installers are unsigned: a dmg, an NSIS installer and an AppImage. The macOS
  app carries an ad-hoc signature (no certificate, no notarization), because
  Apple silicon will not run arm64 code without any signature. Gatekeeper
  still treats it as unidentified. (Amended for v0.1.1.)
- macOS gets two dmgs, arm64 and x64, each built on a runner of that
  architecture. (Amended for v0.1.1, after v0.1.0 shipped arm64 only and did
  not run on an Intel Mac.)
- No auto-update. Users reinstall a newer version by hand. The database lives
  in the user data folder, outside the install, so reinstalling keeps data, and
  migrations run on the next start.
- Pushing a `v*` tag runs `.github/workflows/release.yml`, which builds on all
  three OSes and attaches the installers to a GitHub release.

## Consequences

- macOS Gatekeeper and Windows SmartScreen warn on first launch. The README
  documents the workaround.
- Revisit signing and auto-update if the app is shared beyond the author.
- Each OS is built on its own runner because better-sqlite3 is a native module.
