# Sample import files

Synthetic data for clicking through the import wizard. Nothing here is real.
Several rows overlap on purpose (same date, payee and amount across files, and
two identical Safeway lines in `generic.csv`) to exercise duplicate detection.

- `generic.csv`: signed amount column, ISO dates.
- `debit-credit.csv`: separate debit and credit columns, `MM/DD/YYYY` dates.
- `statement.ofx` and `statement.qfx`: same OFX content with fitids, to test
  fitid-based duplicate detection by importing one after the other.
- `mint.csv`: Mint export layout with two accounts and categories the demo
  database does not have (Dentist, Obscure Category, Paycheck, Television)
  that should land in Uncategorized.

## Large files

`large/` holds 2000-row versions of each format (two years of data), made by
`node test-data/generate-large.mjs [rowsPerFile]` (deterministic, so reruns
give identical files). Use them to check import speed, preview paging and
duplicate detection at volume. `mint-large.csv` splits rows across two
accounts; `statement-large.*` use fitids `LARGE-000001` onward.

- `rbc-mastercard.csv`: RBC card export with a BOM, M/D/YYYY dates, quoted
  account numbers, a USD$ row and data rows that drop the trailing empty USD$
  cell (so they are narrower than the header), plus a trailing blank line.
