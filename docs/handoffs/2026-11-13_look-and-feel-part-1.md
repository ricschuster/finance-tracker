# Session Handoff: 2026-11-13 (look and feel, part 1)

## Summary

Goal for the session: make the app look professional, with Mint as the
reference, light and dark themes, and layout and navigation changes allowed.
The direction was approved from dashboard screenshots. About half the screens
are done; the rest continue next session on the same patterns.

## Completed

- Design tokens, Inter (bundled), light and dark themes with a Light / Dark /
  System switch in the sidebar footer (`theme.ts`, `styles.css`).
- New shell: dark navy sidebar with grouped navigation, accounts grouped by
  type under net worth, page header with title, subtitle and actions
  (`PageActions` portal). Import history is a sub-tab of Import.
- Dialogs for add account, edit account (archive, delete), add transaction and
  transfer. In-app `useConfirm` / `useAlert` (`ui.tsx`).
- Category icons as Lucide icons in coloured circles (`CategoryIcon`).
- Dashboard: stat tiles, category meters, six-month trend chart with tooltip,
  biggest transactions with payee avatars.
- Transactions: search toolbar, filter card with active count, sticky bulk bar,
  compact table (payee with account underneath, inline category picker, status
  pills), row "..." menu, restyled split editor, in-app confirms for delete and
  the rule prompt.
- Reports: filter bar, stat tiles, category meters, trend chart plus table,
  top payees and biggest transactions as cards.
- Docs: design note 13, ADR 0005 (Radix, Lucide, Inter). New headless scripts
  `screens.mjs` and `transactions.mjs`; `accounts-dashboard.mjs`,
  `categories.mjs` and `tour.mjs` updated (the tour's "Subscriptions" category
  no longer existed after flat categories). All nine scripts run clean.
- `npm run check` green, 218 tests.

## Current state

- Budgets, Categories, Rules, Import and Data pick up the new base styles
  (controls, tables, page header) but have not had their own layout pass.
- `window.confirm` / `window.alert` remain in Budgets, RulesEditor,
  ImportWizard, ImportHistory and DataPanel.
- `better-sqlite3` is on the Electron build after the headless runs; run
  `npm test` before trusting core results.
- Before and after screenshots of the session were taken with
  `screens.mjs <outDir>` (light and dark, every screen).

## Next actions

1. Budgets: card per category or table with progress bars, over-budget pill,
   month stepper with chevrons in the page header, add budget as a dialog.
2. Categories: list in a card, row menu (rename, colour and icon, merge,
   delete), icon picker showing the Lucide icons (`CATEGORY_LUCIDE`).
3. Rules: list as cards or a table with a menu, editor in a card or dialog.
4. Import: wizard steps as a stepper, file drop area look, folder card;
   history table with a menu.
5. Data: three cards (export and restore, CSV export, automatic backups).
6. Replace the remaining `window.confirm` / `window.alert`; update the headless
   scripts that rely on `lib.mjs` auto-accepting dialogs (tour undo, budgets,
   data restore).
7. Then: first release tag, budget follow-ups.

## Risks or decisions needed

- Renderer bundle is about 1.1 MB (Vite warns over 500 kB). Fine for a local
  Electron app; split later if startup feels slow.
- Back up the real database before the first launch on schema 12 (carried
  over from the last handoff).
