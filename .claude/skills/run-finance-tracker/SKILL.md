---
name: run-finance-tracker
description: Launch and drive the finance-tracker Electron app headless (Playwright under xvfb) to click through the UI and take screenshots. Use when asked to run, show, screenshot or UI-test the app.
---

The app is Electron. Headless Linux has no window, so drive the built app with
Playwright under xvfb. Everything runs on a synthetic demo database in
`SCREENSHOT_DIR` (default `/tmp/ft-shots`); real data is never touched.

## Build

```bash
npm run rebuild:electron && npm run build
```

`npm test` flips `better-sqlite3` back to the Node build, so repeat the rebuild
after any test run.

## Run

```bash
xvfb-run -a -s "-screen 0 1440x900x24" node .claude/skills/run-finance-tracker/tour.mjs
```

`tour.mjs` covers search, rules and CSV import; `import-formats.mjs` covers OFX, QFX (fitid duplicates) and Mint import from `test-data/import/`; `reports.mjs` covers the dashboard,
reports and the drill-down; `categories.mjs` covers the Categories tab (add, merge, rename, delete with reassign); `accounts-dashboard.mjs` covers account edit, archive and delete and the dashboard Customize panel; `budgets.mjs` covers the Budgets tab (add and edit dialogs, month stepper, remove); `rules.mjs` covers the Rules tab (editor dialog, reorder, turn off, preview and apply, delete); `data.mjs` covers the Data tab (backups, export, CSV, staged restore); `duplicates.mjs` covers Find duplicates (keep one, cross-account), the names-only sidebar and the all-accounts Transactions tab; `transactions.mjs` covers the Transactions dialogs, filters, bulk bar, row menu, split and the in-app confirms; `screens.mjs [outDir]` screenshots every screen in light and dark for look-and-feel review. The app opens on the Dashboard tab.

`lib.mjs` exports `launch()` returning `{ app, page, errors, shot, stubOpenDialog }`.
Write new flows as small scripts that import it. Then read the PNGs.

## Gotchas

- The sidebar nav items are `role="tab"`, not buttons: `getByRole('tab', { name: 'Rules' })`.
  Import history is a sub-tab: click the Import tab first.
- Clicking an account in the sidebar opens its transactions; account edit, archive and
  delete are in the Edit account dialog in the page header.
- Row actions are in a "..." menu on every list screen: click the button labelled
  `Actions for ...` (for example `Actions for transaction 12`, `Actions for Groceries`,
  `Actions for rule 2`, `Actions for import sample.csv`, `Actions for Home budget`),
  then `getByRole('menuitem', ...)`. Forms open as dialogs: scope with `page.getByRole('dialog')`.
- Confirms and alerts are in-app Radix dialogs, not `window.confirm`:
  `page.getByTestId('confirm-dialog')` and click its button. No screen uses
  `window.confirm` or `window.alert` any more; `lib.mjs` still accepts native dialogs and logs them.
- The database restore confirmation is a native message box from the main process; `data.mjs`
  stubs `dialog.showMessageBox`.
- The native file picker cannot be driven; `stubOpenDialog(file)` replaces it.
- Run the script from the repo; `playwright-core` is a devDependency and needs
  no browser download because Electron is the browser.
- `npm run dev` / `dev:demo` open a real window and are useless headless.
