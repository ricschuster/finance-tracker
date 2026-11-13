# Unsigned installers, manual updates, GitHub Releases

## Status

Accepted

## Context

Milestone 8 packages the app for macOS, Windows and Linux (ADR 0002 chose
electron-builder). The app is for personal use. Code signing needs paid
certificates and CI secrets, and auto-update practically requires signing on
macOS and Windows.

## Decision

- Installers are unsigned: a dmg, an NSIS installer and an AppImage.
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
