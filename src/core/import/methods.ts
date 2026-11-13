/** Names of the import API methods shared by main (handlers) and preload (bridge). No imports on purpose. */
export const IMPORT_METHODS = [
  'inspectCsv',
  'previewImport',
  'commitImport',
  'listImportBatches',
  'getImportBatchRows',
  'previewUndoImport',
  'undoImport',
  'listImportProfiles',
  'saveImportProfile',
  'deleteImportProfile',
] as const

export type ImportMethod = (typeof IMPORT_METHODS)[number]
