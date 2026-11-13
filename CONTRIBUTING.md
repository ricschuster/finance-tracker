# Contributing

Feedback, bug reports, and ideas are welcome through GitHub issues.

The workflow is:

1. Branch from `main` (one short-lived branch per change).
2. Keep changes small and focused.
3. Run the project checks locally before pushing (format, lint, tests, build).
   See the Setup section below for the exact commands once they are defined.
4. Open a pull request into `main`. CI must pass before merge.

## Setup

Prerequisites: Node.js 22 and npm.

```bash
npm ci            # install
npm run dev       # rebuild native module for Electron, then launch the app
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
