# Accounts page

The sidebar lost its account list, balances and net worth (feedback 2026-11-14); the Accounts tab holds them.

- Nav item "Accounts" under Manage. The sidebar has no separate "All accounts" entry (it duplicated this page).
- Summary card: assets, owing on cards and loans, net worth (owing is already inside net worth).
- One card per account group (Cash, Credit cards, Loans, Other) listing name, type and balance
  text (`balanceText`, so liabilities read Owing). Archived accounts get their own card.
- Clicking an account opens its transactions. The Transactions tab always shows all accounts.
- Each row has an Edit account button (the same dialog as the header button on an account's page).
  Add account is a button in the page header. The sidebar no longer shows net worth or an add button
  (net worth is on this page).
- The sidebar has no account list. Transactions has an Account filter (in Filters) to scope to one
  account; opening an account from this page sets it. Archived accounts appear in the filter.
