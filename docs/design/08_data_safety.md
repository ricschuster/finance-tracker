# 08 Data safety

Milestone 7. The user's data is one SQLite file and must always be exportable,
recoverable and never silently lost. Logic lives in `src/core/backup/` (Node
`fs` and better-sqlite3 only, no Electron) and is unit tested. `src/main/` owns
file dialogs, the timer and the restart.

## Whole-database export

- Uses SQLite's online backup (`db.backup(path)`), which gives a consistent
  snapshot even in WAL mode while the app is running. Copying the `.sqlite`
  file directly is not safe and is never done.
- The result is a single standalone `.sqlite` file (no `-wal` or `-shm`).
- Default file name: `finance-YYYY-MM-DD.sqlite`.

## Restore (import of a whole database)

1. The user picks a file. `validateDatabaseFile` opens it read-only and checks:
   it is a SQLite database, `PRAGMA integrity_check` is `ok`, the expected core
   tables exist, and `user_version` is not newer than this app supports. Older
   versions are accepted and migrated on the next start.
2. The app shows a confirmation naming what will happen: the current data is
   replaced, and a copy of it is kept first.
3. The validated file is copied next to the live database as
   `finance.sqlite.restore`. The app relaunches.
4. At startup, before opening the database, if a `.restore` file exists the
   current database is moved to `pre-restore-<timestamp>.sqlite` in the backups
   folder (its `-wal` and `-shm` files are removed after a clean close), then
   the restore file takes its place.

Swapping on restart avoids replacing a database that open handlers still use.
The pre-restore copy is never pruned automatically.

## Transactions to CSV

`exportTransactionsCsv(db, filter?)` returns CSV text. One row per split line,
so splits keep their own category and amount and the file can be summed by
column. Columns: `Transaction ID`, `Date`, `Account`, `Payee`, `Description`,
`Amount` (the line amount in dollars, expenses negative per ADR 0003),
`Category` (`Parent: Child` for children), `Memo`, `Tags`, `Notes`, `Status`,
`Transfer`. A transfer row says `yes`. Sorted by date then id. An optional
date range narrows the export. Fields are quoted per RFC 4180, and values that
start with `=`, `+`, `-` (non-numeric), `@` or a tab are prefixed with `'` so
spreadsheets do not run them as formulas.

## Automatic backups

- Settings (table `settings`): `backup_folder` (empty means off),
  `backup_interval_days` (default 7) and `backup_keep` (default 10).
- A backup is `finance-backup-YYYY-MM-DD-HHmmss.sqlite` made with the same
  online backup as export.
- Main checks at startup and then hourly. A backup is due when the folder is
  set and the newest backup file is older than the interval, or none exists.
  The check reads the folder, not a setting, so a deleted backup triggers a new
  one.
- After each backup, only files matching the backup name pattern beyond the
  newest `backup_keep` are deleted. Other files in the folder are never touched.
- "Back up now" runs the same path on demand. Failures (folder missing, disk
  full) are shown in the Data tab and never crash the app.

## UI

A Data tab with: export database, restore from file, export transactions to CSV,
backup folder, interval, keep count, last backup time and Back up now.

## Status (2026-11-13)

Built and verified in the running app (`data.mjs` in the headless skill):
export, CSV, backup now, pruning, staging a restore. The restart swap is
covered by a unit test; the live relaunch has not been clicked through by hand.
Backups started in the same second get the next free second in their name.

## Out of scope

Encryption of backups, cloud destinations, and merging two databases (post
MVP, see the milestones).
