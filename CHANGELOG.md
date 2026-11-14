# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- The category guess in the import preview and review queue now also works for misspelt or varied descriptions ("SAFWAY STORE 9" with "SAFEWAY #4412"), labelled "similar guess"; short words must still match exactly.
- Design notes for payee cleanup suggestions and recurring payment detection (not built yet).
- Keyboard shortcuts: `/` focuses the Transactions search, `n` opens Add transaction, `g` then `d`, `t`, `b`, `r`, `a` or `i` goes to Dashboard, Transactions, Budgets, Reports, Accounts or Import, and `?` lists them. A keyboard button in the sidebar footer opens the same list. Shortcuts are ignored while typing or in a dialog.
- Search hint: a "How search works" popover next to the search box, and the empty result explains how terms are matched.
- First run: the Dashboard shows a Get started checklist (add an account, import or add a transaction, optional rules and budgets) until there is an account and a transaction. Transactions says "No transactions yet" with Add transaction and Import buttons, and asks for an account first when there are none.
- Import: with more than one account the wizard asks you to choose one ("Choose an account") instead of silently using the first; a saved profile or a file name that mentions an account preselects it and says why. A file with no data rows shows "This file has no transactions" and cannot be previewed; the "Nothing to import" message no longer points to missing notes.
- Add transaction and Transfer warn, without blocking, about a zero amount, an amount over $1,000,000 and a date more than a year ahead or 20 years back; Save anyway continues.
- Invalid amounts now say what is wrong ("abc" is not an amount. Enter an amount like 12.50 (up to 2 decimals).) instead of only "Amount".
- Review queue: the dashboard's uncategorized banner now opens a screen that steps through uncategorized transactions one at a time with the guessed category. Enter applies, R applies and saves a rule, S skips.
- Rule operator "is similar to": fuzzy text matching that ignores store numbers and tolerates typos, so one rule covers SAFEWAY #4412 and SAFWAY STORE 9.
- Changing a category in the import preview offers a toast to create a rule for that description, so the next import needs no pick. It saves straight away without leaving the wizard.
- Import preview shows the category each new row will get and lets you change it. Rows are
  guessed from how earlier transactions with the same description were filed (at least 60%
  agreeing); rules and the file's own category come first.
- Rule action "Skip on import": matching rows are listed as skipped in the preview, with
  Import anyway. It does not touch saved transactions.
- Dashboard drill-down: click the Income, Spending or Net tile, or a month in the six-month chart,
  to see the transactions behind the figure. Transactions has a Hide transfers filter for this.

### Changed

- The import preview's New, Money in and Money out tiles no longer count rows a skip rule drops; a Skipped by rule tile appears when there are any.
- Search is predictable: a typed word prefix finds the word, `sho*` works like `sho`, quotes group a phrase, AND/OR/NOT/NEAR are plain words, stray quotes, parentheses and colons no longer return nothing, punctuation-only input (a lone `-`) is ignored, and apostrophes are optional (`mcdonalds` finds McDonald's).
- Below 900px wide the sidebar collapses to icons only; tabs keep their names for screen readers and show them as tooltips.

### Fixed

- Dashboard Income, Spending and Net tiles were squashed and their captions clipped under the next card; the tiles now show in full in light and dark. The empty six-month chart axis shows $0 to $100 instead of "$1 $1 $1 $0".
- A very long payee, description or rule name no longer pushes columns off screen: Transactions, Reports, the dashboard, Rules and the import preview truncate it with an ellipsis and show the full text on hover.
- At narrow window widths the page header buttons wrap and the Transactions page no longer scrolls sideways (the Status column is hidden below 1000px).
- Typing 5,5 or 1,50 as an amount recorded $55.00 or $150.00. A single comma before one or two final digits is now a decimal comma (1.234,56 and 1 234,56 work too); other commas stay thousands separators.
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
