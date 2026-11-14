# 14 In-app manual

Post-MVP. Status: built.

## Goal

A user manual inside the app, so help is one click away and works offline. It
covers getting started, how money is recorded, and each tab.

## Design

- A Manual item in the sidebar (its own Help group) opens a two-column view: a
  contents list and one section at a time.
- Content is plain data in `src/renderer/src/manualContent.ts` (sections of
  paragraphs, lists and tips) and rendered by `Manual.tsx`. No markdown parser
  or new dependency, and the text is easy to edit.
- It documents what is built. Features that are only proposed (for example
  reconciliation in note 10) are left out, and known gaps are stated plainly
  (no budget rollover).

## Keeping it current

When behaviour changes in a way a user would notice, update the matching
section in the same pull request. There is no search yet; add it if the manual
grows past what the contents list handles.
