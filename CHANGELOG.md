# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Dashboard drill-down: click the Income, Spending or Net tile, or a month in the six-month chart,
  to see the transactions behind the figure. Transactions has a Hide transfers filter for this.

### Fixed

- The dashboard's uncategorized Review button and category drill-downs now always search every
  account; a previously chosen account could hide the rows.

### Added (earlier)

- Accounts tab: every account with type and balance, plus assets, owing and net worth, with
  an Edit account button on each row. The sidebar's "All accounts" entry is removed.
- Find duplicates: "Keep first, delete rest" per group and "Keep one of each" for all groups, with
  one Undo; a group always keeps one row.
- Find duplicates can match across accounts (on by default).

### Changed

- The sidebar no longer lists accounts; use the Accounts tab, or the new Account filter on
  Transactions.
- Add account moved from the sidebar to the Accounts tab; the sidebar no longer shows net worth.
- Sidebar account rows show names only; the "Owing" summary line is gone.
- The Transactions tab always shows all accounts.

## [0.4.0] - 2026-11-14

### Added

- Import: the wizard guesses the column mapping from header names and content, labels it as a
  guess, and shows a live preview of the first rows that updates as you adjust the mapping.
- Find duplicates in the Transactions toolbar, with "Not a duplicate" dismissals and undoable
  delete.
- Link card payments: suggests equal and opposite payment pairs between a bank account and a card
  and links them, so the payment stops counting as spending.
- Notes: add or edit a note on a transaction from the row menu, shown as an icon in the list.
- Searchable category picker everywhere a category is chosen.

### Changed

- Categories no longer have a type (spending, income, transfer). Reports classify each category
  by the sign of its net amount for the period; the "Change type" action is gone. This is a
  one-way database migration, so export a backup first.
- Credit cards and loans show "Owing $X" instead of a red negative balance.
- The "make a rule" prompt is a bottom toast that disappears by itself after about 8 seconds.
- Import links more kinds of card payment wording automatically.
- README rewritten for the public repository, with screenshots generated from the demo database.

### Fixed

- RBC card CSVs (for example Mastercard) failed to import because the header row was misdetected
  when data rows omit the empty trailing USD$ cell. Missing-column errors now name the column and
  list the headers found.

## [0.3.0] - 2026-11-14

### Added

- First import from an empty database for multi-account files (Monarch, Mint,
  Wealthsimple). The setup option removes unused categories the file does not
  use.
- Spreadsheet (`.xlsx`) import, for example the Monarch spreadsheet export.
- In-app Manual in the sidebar.
- Categories tab: select several categories and delete them at once, and
  change a category's type (Spending, Income, Transfer).
- Transactions: sortable columns, and Delete all for every match of a search.

### Changed

- better-sqlite3 updated to 13.

### Fixed

- Imported categories now get the right type.

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
