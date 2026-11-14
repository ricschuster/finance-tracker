# 13 Look and feel

Status: built. Every screen has had its layout pass, and no screen uses
`window.confirm` or `window.alert`.

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
  from `ui.tsx`. Native `window.confirm` and `window.alert` are not used. The
  database restore confirmation stays a native message box, because it comes
  from the main process just before the app relaunches.
- Forms for one item (add or edit a budget, a category, a rule) open in a
  `Dialog` from a header button or the row menu, not inline in the list.
  Long forms (the rule editor) are `persistent`: outside clicks and Escape do
  not close them, only Cancel, Save or the close button.
- Files are dropped only on the import drop area. Drops elsewhere are ignored,
  and the main window refuses navigation, so a stray drop cannot replace the app.
- Empty lists use `Empty` with a short title and hint.
- Charts: `TrendChart` for income against spending by month (legend, gridlines,
  per-month tooltip); meter lists in the category colour for shares. No donuts.

## Screens

- Budgets: month stepper and Add budget in the page header; stat tiles for
  budgeted, spent and remaining (or over, with a per-day figure for the
  current month); one row per budget with a progress bar that turns amber
  from 85% and red when over, plus an over-budget pill; a card listing
  spending in categories without a budget, each with a quick Budget button.
- Categories: one card listing all categories, a row menu
  (rename, colour and icon, merge, delete), each opening a dialog. The colour
  and icon dialog shows the Lucide icons with a live preview. Add category
  picks the colour and icon up front.
- Rules: numbered list with When and Then chips, move up and down buttons, a
  row menu (edit, turn on or off, delete); the editor is a wide dialog with
  When and Then sections. The preview is a card above the list with an Apply
  button and an in-app confirm.
- Import: a stepper (choose file, map columns or choose account, review,
  done), a drop area that also accepts a dragged file, the watched folder as
  a card with status pills; mapping in cards with the used columns
  highlighted in the sample; review with count tiles and result pills; a
  done card with undo. Import history is a table with expandable rows and a
  row menu (show rows, undo import).
- Data: cards for export and restore, CSV export and automatic backups (on or
  off pill, last backup, count, settings form).

## Category picker, notes and toast (session feedback)

- Category picker: `CategorySelect` is a searchable combobox (button plus a filter box and
  listbox) used for every category choice. Filtering is `filterCategoryOptions` in
  `core/ledger/categoryPicker.ts`: every word must match the category name, its parent or an
  alias, ignoring case and accents. Aliases come from `listCategoryAliases` via `useLedger`.
  Keys: arrows move, Enter picks, Escape closes only the picker (also inside a dialog).
  The budget add dialog keeps a plain select because its options carry spent amounts.
- Notes: `transactions.notes` is edited from the row menu (Add or Edit note) in an inline
  row, shown as a note icon next to the payee with the text as tooltip, searched by the
  main search box and written to the CSV export. Rules do not match on notes.
- Toast: changing a category in the list no longer opens a dialog. A bottom toast offers
  Create rule, dismisses itself after 8 seconds, pauses while hovered or focused, and is
  replaced by the next one. `ToastProvider` and `useToast` live in `ui.tsx`.
