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
reports and the drill-down; `categories.mjs` covers the Categories tab (add, merge, rename, delete with reassign); `accounts-dashboard.mjs` covers account edit, archive and delete and the dashboard Customize panel; `budgets.mjs` covers the Budgets tab; `data.mjs` covers the Data tab (backups, export, CSV, staged restore); `transactions.mjs` covers the Transactions dialogs, filters, bulk bar, row menu, split and the in-app confirms; `screens.mjs [outDir]` screenshots every screen in light and dark for look-and-feel review. The app opens on the Dashboard tab.

`lib.mjs` exports `launch()` returning `{ app, page, errors, shot, stubOpenDialog }`.
Write new flows as small scripts that import it. Then read the PNGs.

## Gotchas

- The sidebar nav items are `role="tab"`, not buttons: `getByRole('tab', { name: 'Rules' })`.
  Import history is a sub-tab: click the Import tab first.
- Clicking an account in the sidebar opens its transactions; account edit, archive and
  delete are in the Edit account dialog in the page header.
- Row actions on Transactions are in a menu: `getByRole('button', { name: /^Actions for transaction/ })`
  then `getByRole('menuitem', ...)`.
- In-app confirms (Transactions so far) are Radix dialogs, not `window.confirm`:
  `page.getByTestId('confirm-dialog')` and click its button.
- `window.confirm()` (still used by import undo, budgets, rules and data) is
  auto-cancelled by Playwright; `lib.mjs` accepts all dialogs and logs the message.
- The native file picker cannot be driven; `stubOpenDialog(file)` replaces it.
- Run the script from the repo; `playwright-core` is a devDependency and needs
  no browser download because Electron is the browser.
- `npm run dev` / `dev:demo` open a real window and are useless headless.
