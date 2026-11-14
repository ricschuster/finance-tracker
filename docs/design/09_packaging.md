# 09 Packaging

Milestone 8. Decisions are in ADR 0004; this note is how it works.

## Targets

| OS      | Installer | Notes                                     |
| ------- | --------- | ----------------------------------------- |
| Linux   | AppImage  | x64                                       |
| Windows | NSIS exe  | x64, user picks the install folder        |
| macOS   | dmg       | Unsigned; host architecture of the runner |

Configuration is `electron-builder.yml`. Output goes to `release/`
(gitignored).

## Native module

better-sqlite3 must match Electron's Node ABI. `npm run package` runs
`rebuild:electron` first and `electron-builder` is told not to rebuild
(`npmRebuild: false`), because its own rebuild step left a Node-ABI binary in
place and the packaged app failed to start. The module is unpacked from the
asar (`asarUnpack`). Rebuilding for Electron leaves the working copy built for
Electron; `npm test` rebuilds it for Node again.

## Commands

- `npm run package:dir`: unpacked app for the current OS, quick smoke test.
- `npm run package`: full installer for the current OS.

## Releasing

1. Bump `version` in `package.json` and update `CHANGELOG.md` in a PR.
2. After merge, tag the commit `vX.Y.Z` and push the tag.
3. The Release workflow builds all three installers and publishes the release.
   Installers are attached to the release on the repository's Releases page.
   `macos-latest` runs on Apple silicon, so the dmg is arm64.
4. If the run fails before `publish`, no release exists yet: fix on `main`,
   delete the tag (locally and on `origin`) and push it again on the new
   commit.

The release run is the only place tests run on Windows and macOS (PR CI is
Linux only). v0.1.0's first run failed on Windows because tests left SQLite
files open before deleting them; close every handle in tests.

## Data and upgrades

The database is `finance.sqlite` in Electron's user data folder. Installing a
newer version over an old one keeps it, and migrations run at startup. Back up
first from the Data tab if unsure.

## Smoke test

Launch the unpacked Linux build with `FT_DB_PATH` and `--user-data-dir` pointing
at a temp folder, never the real data folder, and confirm the database is
created.

## Not built

Signing, notarization, auto-update, arm64 and deb/rpm packages.
