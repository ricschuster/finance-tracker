# Accounts page

The sidebar shows account names only (feedback 2026-11-14), so balances moved to an Accounts tab.

- Nav item "Accounts" under Manage. The sidebar has no separate "All accounts" entry (it duplicated this page).
- Summary card: assets, owing on cards and loans, net worth (owing is already inside net worth).
- One card per sidebar group (Cash, Credit cards, Loans, Other) listing name, type and balance
  text (`balanceText`, so liabilities read Owing). Archived accounts get their own card.
- Clicking an account opens its transactions. The Transactions tab always shows all accounts.
- Each row has an Edit account button (the same dialog as the header button on an account's page).
  Adding an account stays on the sidebar "+".
