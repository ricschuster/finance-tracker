# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.2.0] - 2026-11-14

### Added

- Wealthsimple and Monarch CSV import. Both reuse the per-account mapping step
  used for Mint.
- Accounts and categories found in an import file are created, with a guessed
  account type. Monarch tags are imported.

### Notes

- Both layouts were built from header images only; no real files have been
  tried yet. Monarch Transfer rows import as ordinary transactions.

## [0.1.1] - 2026-11-13

### Added

- macOS installer for Intel Macs (`mac-x64.dmg`) next to the Apple silicon one.
- App icon: the sidebar's leaf mark on the teal gradient (`build/icon.svg`,
  rendered by `scripts/render-icon.mjs`).
- The Release workflow can be run by hand to build installers without
  publishing.

### Changed

- The macOS app carries an ad-hoc signature, so it can run on Apple silicon.
- README: macOS first-launch steps for macOS 15 (Open Anyway in Privacy &
  Security).

### Fixed

- v0.1.0 had no macOS build for Intel Macs.

## [0.1.0] - 2026-11-13

First release. Installers are unsigned (ADR 0004): Linux AppImage, Windows
NSIS installer and macOS dmg.

### Added

- Ledger: accounts, categories, manual transaction entry, transfers and split
  transactions, stored as integer cents (ADR 0003).
- Import: CSV with mapping profiles, OFX/QFX and Mint CSV; presets for RBC, TD
  and Tangerine; duplicate detection, undo and import history; a watched
  import folder; card payments linked as transfers by default.
- Rules: user-defined categorization rules with an editor, preview and apply,
  and a prompt to create a rule when a category is changed in the list.
- Search: filters, saved searches, per-category totals and bulk actions.
- Reports: category, income vs expenses, trend, payee and biggest
  transactions, with category drill-down; a customizable dashboard home.
- Categories: flat list with add, rename, merge, delete with reassign,
  colours, icons, aliases and a hide-from-budgets flag.
- Budgets: a monthly standing amount per category, with a dashboard widget.
- Data safety: database export and restore, transactions CSV export and
  automatic backups.
- Look and feel: light and dark themes, sidebar shell and in-app dialogs.
- Packaging: electron-builder config and a tag-triggered release workflow.
- CI: `changes` job so docs-only PRs skip stack jobs, a single required
  `checks` job, a commented cache example, and an opt-in `warm-cache.yml`.
- Hints in `CLAUDE.md`, `CONTRIBUTING.md`, `.gitignore` and the handoff
  template.
- Initial project harness: issue and PR templates, contribution and security
  policies, docs structure (design, decisions, handoffs), and Claude Code
  working rules.

### Changed

- `ci.yml` runs on pull requests only; `bootstrap-repo-settings.sh` gates on
  `checks` by default.
