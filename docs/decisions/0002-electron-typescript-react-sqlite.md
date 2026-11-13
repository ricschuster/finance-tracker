# Electron, TypeScript, React and SQLite

## Status

Accepted

## Context

The app must run as a double-click installer on Mac, Windows and Linux, keep
all data in one local file, feel app-like, and be maintained mostly by Claude.
Packaging effort matters more than binary size. PDF import is not in the MVP.

## Decision

Use Electron with TypeScript, React for the UI, and SQLite via better-sqlite3
(with FTS5 for search). Package with electron-builder in CI. Keep the rules
engine, import parsers and report queries in a framework-free `core/` module
that never imports from the UI or Electron.

Alternatives considered: Python (FastAPI) with React and PyInstaller (better
PDF libraries but two languages), and Tauri (small binary but needs a Rust
toolchain).

## Consequences

- One language end to end and mature cross-platform packaging.
- Larger installers (roughly 150 MB), accepted.
- Native module (better-sqlite3) needs rebuilding per platform in CI.
- PDF import later will rely on pdfjs-dist, which is weaker than Python tools.
