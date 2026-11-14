# Contributing

Feedback, bug reports, and ideas are welcome through GitHub issues.

The workflow is:

1. Branch from `main` (one short-lived branch per change).
2. Keep changes small and focused.
3. Run the project checks locally before pushing (format, lint, tests, build).
   See Setup below for the commands.
4. Open a pull request into `main`. CI must pass before merge.

## Setup

Prerequisites: Node.js 22 and npm.

```bash
npm ci            # install
npm run dev       # rebuild native module for Electron, then launch the app
npm run dev:demo  # same, on a separate .dev-data/demo.sqlite filled with synthetic data
npm run dev:demo:reset  # delete the demo database so it regenerates
npm run check     # format, lint, typecheck, test, build (what CI runs)
```

`better-sqlite3` is a native module built for either Node (tests) or Electron
(the app). `npm test` rebuilds it for Node and `npm run dev` rebuilds it for
Electron, so just use those scripts. See `CLAUDE.md` for architecture rules.

## Conventions

- Conventional Commits (for example `feat: ...`, `fix: ...`, `chore: ...`,
  `docs: ...`).
- No em dashes in code, comments, docs, commit messages, or user-facing text.
- See `CLAUDE.md` for the full working rules and `docs/` for design notes and
  decision records.

## README screenshots

The screenshots in `docs/images/` are generated from the synthetic demo
database, never from real data. After a visible UI change, rebuild
(`npm run rebuild:electron && npm run build`) and run:

```bash
xvfb-run -a -s "-screen 0 1440x900x24" node .claude/skills/run-finance-tracker/readme-shots.mjs
```

## Optional workflows

`.github/workflows-optional/` holds workflows that are not active until moved
into `.github/workflows/`.

- `auto-merge.yml` arms squash auto-merge on PRs opened by the repository
  owner (never on anyone else's, Dependabot included) and brings the PR level
  with `main`.
- `update-branches.yml` updates every armed PR after each push to `main`, so
  strict "up to date" branch protection does not leave them stuck BEHIND.
- `warm-cache.yml` saves a cache from `main`, because a PR can read caches
  saved on `main` but not caches saved by another PR.

The auto-merge pair needs a fine-grained personal access token for this repo
only (Contents, Pull requests and Workflows: read/write) stored as the
`AUTO_MERGE_TOKEN` secret. `GITHUB_TOKEN` cannot be used because GitHub starts
no workflows for pushes or merges made with it. Rotate the PAT before it
expires.

`scripts/bootstrap-repo-settings.sh` is a one-time script for repo settings
(branch protection, auto-merge, labels) that a template cannot carry over.
