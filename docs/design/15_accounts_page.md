# Accounts page

The sidebar lost its account list (feedback 2026-11-14); the Accounts tab holds balances and net worth. The plain account list (name and balance, grouped, active accounts only) returned to the sidebar on 2026-11-16 at the owner's request; net worth and the add button stay on the Accounts page.

- Nav item "Accounts" under Manage. The sidebar has no separate "All accounts" entry (it duplicated this page).
- Summary card: assets, owing on cards and loans, net worth (owing is already inside net worth).
- One card per account group (Cash, Credit cards, Loans, Other) listing name, type and balance
  text (`balanceText`, so liabilities read Owing). Archived accounts get their own card.
- Clicking an account opens its transactions. The Transactions tab always shows all accounts.
- Each row has an Edit account button (the same dialog as the header button on an account's page).
  Add account is a button in the page header. The sidebar no longer shows net worth or an add button
  (net worth is on this page).
- The sidebar lists active accounts under the nav; clicking one opens its transactions. Transactions has an Account filter (in Filters) to scope to one
  account; opening an account from this page sets it. Archived accounts appear in the filter.
