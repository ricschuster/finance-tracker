# 13 Look and feel

Status: in progress. Shell, dashboard, transactions and reports are done;
budgets, categories, rules, import and data still use the base styles only.

## Direction

Mint was the reference the user picked. The goal is an app that reads as a
finished personal finance product rather than an MVP: calm surfaces, clear
hierarchy, money figures that are easy to scan, and both light and dark themes.

## Visual language

- Font: Inter Variable, bundled with `@fontsource-variable/inter` so nothing is
  fetched at runtime. 14px base, tabular figures for all money.
- Colour: tokens in `src/renderer/src/styles.css`, light under `:root`, dark
  under `:root[data-theme='dark']`. Soft grey page background, white cards,
  dark navy sidebar in both themes, teal-green accent (`--accent`).
- Positive and negative amounts use `--pos` and `--neg`. Expenses in lists are
  shown in normal text with a minus; income is green with a plus.
- Chart series (income `#0a9b83`, spending `#d9722a` light; `#1fa88b`,
  `#c96f30` dark) were checked with the dataviz palette validator for
  colour-blind separation. Red against green failed and is not used for series.
- Category icons: the stored icon keys map to Lucide icons drawn in a circle of
  the category colour (`CategoryIcon`). The emoji glyphs in `core` stay as the
  storage contract.
- Icons: Lucide throughout. Radix primitives for dialogs, menus and the confirm
  dialog, styled with our own CSS. See ADR 0005.

## Theme

Light, dark or match system, chosen from the switch in the sidebar footer and
kept in `localStorage` (`ft-theme`). It is applied before the first render to
avoid a flash. System is the default.

## Layout and navigation

- Sidebar: brand, primary views (Dashboard, Transactions, Budgets, Reports),
  a Manage group (Import, Rules, Categories, Data), then accounts grouped by
  type under a net worth figure. The add account button sits on the Accounts
  heading.
- Clicking an account opens Transactions filtered to it. Edit, archive and
  delete are in the Edit account dialog in the page header.
- Each screen has a page header with a title, a subtitle and actions. Screens
  add their own actions with `<PageActions>`, which portals into the header.
- Import history is a sub-tab of Import.
- Forms that used to sit above content (new account, new transaction,
  transfer) are dialogs opened from header buttons.

## Patterns

- Cards (`.card`) group a section; tables inside cards lose their own border.
- Row actions go in a "..." menu (`ActionMenu`), not a row of buttons.
- Destructive or notable confirmations use `useConfirm()` and `useAlert()`
  from `ui.tsx`. `window.confirm` and `window.alert` are being removed screen
  by screen; Transactions and the suggest-rule notice are done.
- Empty lists use `Empty` with a short title and hint.
- Charts: `TrendChart` for income against spending by month (legend, gridlines,
  per-month tooltip); meter lists in the category colour for shares. No donuts.

## Remaining

Budgets (progress bars, over-budget state), Categories (list with menus and an
icon picker using the Lucide icons), Rules, Import wizard, Data, and removing
the last `window.confirm` / `window.alert` calls.
