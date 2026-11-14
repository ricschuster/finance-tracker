# 0006 Read .xlsx with read-excel-file

Status: accepted (2026-11-14)

## Context

Some exports, including a Monarch export, arrive as `.xlsx`. An xlsx file is a zip of XML, and the
app only read text formats.

## Decision

Add `read-excel-file` (runtime dependency, pure JavaScript, no native code). `src/core/import/xlsx.ts`
reads the first sheet and writes CSV text (dates as ISO `YYYY-MM-DD`, booleans as TRUE/FALSE). That text
then goes through the existing detection, mapping, preview and commit, so no import logic is duplicated.
Conversion happens in the main process: the file picker and watched folder read the file there, and a
dropped file is sent as bytes (`import:convertXlsx`).

## Consequences

- Only the first sheet is read; formulas are read as their cached values.
- A batch's file hash is over the converted CSV text, so re-importing the same spreadsheet is still
  caught as a duplicate.
- Rejected: writing our own zip and XML reader (more code to maintain and test for no gain).
