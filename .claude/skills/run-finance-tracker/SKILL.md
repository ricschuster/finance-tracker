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

`tour.mjs` covers search, rules and import; `reports.mjs` covers the dashboard,
reports and the drill-down. The app opens on the Dashboard tab.

`lib.mjs` exports `launch()` returning `{ app, page, errors, shot, stubOpenDialog }`.
Write new flows as small scripts that import it. Then read the PNGs.

## Gotchas

- The tabs are `role="tab"`, not buttons: `getByRole('tab', { name: 'Rules' })`.
- `window.confirm()` (undo, delete) is auto-cancelled by Playwright; `lib.mjs`
  accepts all dialogs and logs the message.
- The native file picker cannot be driven; `stubOpenDialog(file)` replaces it.
- Run the script from the repo; `playwright-core` is a devDependency and needs
  no browser download because Electron is the browser.
- `npm run dev` / `dev:demo` open a real window and are useless headless.
