# finance-tracker

A personal finance organizer in the spirit of Intuit Mint, built around manual
entry. Add transactions yourself, let rules categorize them, search everything,
and get monthly reports. No bank connections, so your data stays yours.

Status: design phase. See `docs/design/00_project_brief.md`.

## Remaining setup

- Choose a tech stack and record it as an ADR in `docs/decisions/`.
- Fill in `## Setup` in `CONTRIBUTING.md` and add a stack job to
  `.github/workflows/ci.yml` and an ecosystem to `.github/dependabot.yml`.
- Run `scripts/bootstrap-repo-settings.sh` once (branch protection, auto-merge,
  labels).
- Replace this section with real usage instructions.

## Solo-maintainer auto-merge (optional)

`.github/workflows-optional/` holds two workflows that make the owner's own
green PRs merge themselves. They are not active until you move them into
`.github/workflows/`.

- `auto-merge.yml` arms squash auto-merge on PRs opened by the repository
  owner (never on anyone else's, Dependabot included) and brings the PR level
  with `main`.
- `update-branches.yml` updates every armed PR after each push to `main`, so
  strict "up to date" branch protection does not leave them stuck BEHIND.

One-time setup: create a fine-grained personal access token for this repo only
(Contents, Pull requests and Workflows: read/write) and store it as the
`AUTO_MERGE_TOKEN` secret. `GITHUB_TOKEN` cannot be used because GitHub starts
no workflows for pushes or merges made with it, so the PR's checks would never
run on the updated branch. Rotate the PAT before it expires. `ci.yml` already
runs on PRs only: with strict protection every PR is tested against current
`main` before it merges.

## Cache warming (optional)

`.github/workflows-optional/warm-cache.yml` saves a cache from `main`, because
a PR can read caches saved on `main` but not caches saved by another PR. Use it
if a CI job downloads something slow on every run. Move it into
`.github/workflows/`, fill in the two placeholders, and use the same path and
key in the `actions/cache` step of your CI job.

## What's included

- `CLAUDE.md`: working rules and durable context, loaded automatically by
  Claude Code.
- `.claude/settings.json`: default tool permissions for Claude Code sessions
  in this repo.
- `docs/design/`: design notes, starting with a project brief template.
- `docs/decisions/`: Architecture Decision Records (ADRs).
- `docs/handoffs/`: session handoff template for continuity between work
  sessions.
- `.github/`: issue forms, PR template, Dependabot config, a stack-neutral CI
  workflow (docs-only PRs skip stack jobs, one required `checks` status), and
  optional solo-maintainer auto-merge and cache-warming workflows.
- `CONTRIBUTING.md`, `SECURITY.md`, `CHANGELOG.md`, `LICENSE`.
- `scripts/bootstrap-repo-settings.sh`: one-time repo settings setup (branch
  protection, auto-merge, labels) that a template cannot carry over on its
  own.

## License

GNU General Public License v3.0. Replace with your own choice if different.
