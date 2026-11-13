import type Database from 'better-sqlite3'
import { commitImport, loadExistingForMatching, type ImportFormat } from './commit'
import { guessHeaderRow, parseCsv, type Delimiter } from './csv'
import { getBatchRows, listBatches, previewUndo, undoBatch } from './history'
import {
  headerFingerprint,
  mapRows,
  type Candidate,
  type ForeignPolicy,
  type MappingProfile,
  type RowIssue,
} from './mapping'
import { planImport, summarisePlan, type PlanItem, type PossibleChoice } from './match'
import type { ImportMethod } from './methods'
import {
  deleteProfile,
  findProfileByFingerprint,
  listProfiles,
  saveProfile,
  validateProfile,
  type ProfileInput,
  type SavedProfile,
} from './profiles'
import { sanityWarnings } from './sanity'

export const SAMPLE_ROWS = 40

export interface CsvInspection {
  delimiter: Delimiter
  totalRows: number
  /** The first rows, for the column mapper. */
  sample: string[][]
  headerRowGuess: number
  fingerprint: string
  /** A saved profile whose header fingerprint matches the guessed header row. */
  matchedProfile: SavedProfile | null
}

export interface PreviewRequest {
  text: string
  delimiter?: Delimiter
  profile: MappingProfile
  accountId: number
  foreign?: ForeignPolicy
}

export interface ExistingSummary {
  id: number
  date: string
  amount: number
  rawDescription: string
  payee: string
  accountName: string
}

export interface PreviewItem extends PlanItem {
  match: ExistingSummary | null
  transfer: ExistingSummary | null
}

export interface ImportPreview {
  items: PreviewItem[]
  errors: RowIssue[]
  skippedForeign: RowIssue[]
  warnings: string[]
  summary: ReturnType<typeof summarisePlan>
}

export interface ChoiceOverride {
  /** Candidate line number from the preview. */
  line: number
  choice: PossibleChoice
  /** For rows that would be added: link to the offered transfer row. */
  linkTransfer?: boolean
}

export interface CommitRequest extends PreviewRequest {
  sourceName: string
  profileId?: number | null
  overrides?: ChoiceOverride[]
  format?: ImportFormat
}

function lookup(db: Database.Database, id: number | null): ExistingSummary | null {
  if (id === null) return null
  const r = db
    .prepare(
      `SELECT t.id, t.date, t.amount, t.raw_description, t.payee, a.name AS account_name
       FROM transactions t JOIN accounts a ON a.id = t.account_id WHERE t.id = ?`,
    )
    .get(id) as
    | {
        id: number
        date: string
        amount: number
        raw_description: string
        payee: string
        account_name: string
      }
    | undefined
  return r
    ? {
        id: r.id,
        date: r.date,
        amount: r.amount,
        rawDescription: r.raw_description,
        payee: r.payee,
        accountName: r.account_name,
      }
    : null
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function buildPlan(db: Database.Database, req: PreviewRequest) {
  const profile = validateProfile(req.profile)
  const { rows } = parseCsv(req.text, req.delimiter)
  const mapped = mapRows(rows, profile, { foreign: req.foreign ?? 'skip' })
  const plan = planImport(req.accountId, mapped.candidates, loadExistingForMatching(db))
  return { mapped, plan }
}

/** The import API as plain functions over a database; arguments and results are structured-clone safe. */
export function createImportHandlers(db: Database.Database) {
  return {
    inspectCsv: (text: string, delimiter?: Delimiter): CsvInspection => {
      const parsed = parseCsv(text, delimiter)
      const headerRowGuess = guessHeaderRow(parsed.rows)
      const fingerprint = headerFingerprint(parsed.rows[headerRowGuess] ?? [])
      return {
        delimiter: parsed.delimiter,
        totalRows: parsed.rows.length,
        sample: parsed.rows.slice(0, SAMPLE_ROWS),
        headerRowGuess,
        fingerprint,
        matchedProfile: findProfileByFingerprint(db, fingerprint) ?? null,
      }
    },

    previewImport: (req: PreviewRequest): ImportPreview => {
      const { mapped, plan } = buildPlan(db, req)
      const account = db.prepare('SELECT type FROM accounts WHERE id = ?').get(req.accountId) as
        { type: 'checking' | 'savings' | 'credit_card' | 'cash' | 'loan' | 'other' } | undefined
      if (!account) throw new Error(`Account ${req.accountId} not found`)
      return {
        items: plan.map((p) => ({
          ...p,
          match: lookup(db, p.matchId),
          transfer: lookup(db, p.transferCandidateId),
        })),
        errors: mapped.errors,
        skippedForeign: mapped.skippedForeign,
        warnings: sanityWarnings(plan, account.type, today()),
        summary: summarisePlan(plan),
      }
    },

    /** Re-plans from the raw file so the renderer's view is never trusted, then applies the user's overrides. */
    commitImport: (req: CommitRequest) => {
      const { mapped, plan } = buildPlan(db, req)
      const overrides = new Map((req.overrides ?? []).map((o) => [o.line, o]))
      const decisions = plan.map((p) => {
        const o = overrides.get(p.candidate.line)
        const candidate: Candidate = p.candidate
        if (p.outcome === 'duplicate') return { candidate, action: 'skip' as const }
        if (p.outcome === 'new') {
          if (o?.choice === 'skip') return { candidate, action: 'skip' as const }
          return {
            candidate,
            action: 'add' as const,
            ...(o?.linkTransfer &&
              p.transferCandidateId !== null && {
                linkTransferId: p.transferCandidateId,
              }),
          }
        }
        const choice = o?.choice ?? p.choice
        if (choice === 'merge' && p.matchId !== null)
          return { candidate, action: 'merge' as const, matchId: p.matchId }
        if (choice === 'skip') return { candidate, action: 'skip' as const }
        return { candidate, action: 'add' as const }
      })
      return commitImport(db, {
        accountId: req.accountId,
        sourceName: req.sourceName,
        format: req.format ?? 'csv',
        profileId: req.profileId ?? null,
        decisions,
        rowsError: mapped.errors.length + mapped.skippedForeign.length,
        rowsTotal: mapped.candidates.length + mapped.errors.length + mapped.skippedForeign.length,
      })
    },

    listImportBatches: () => listBatches(db),
    getImportBatchRows: (batchId: number) => getBatchRows(db, batchId),
    previewUndoImport: (batchId: number) => previewUndo(db, batchId),
    undoImport: (batchId: number, options?: { deleteEdited?: boolean }) =>
      undoBatch(db, batchId, options),
    listImportProfiles: () => listProfiles(db),
    saveImportProfile: (input: ProfileInput) => saveProfile(db, input),
    deleteImportProfile: (id: number) => deleteProfile(db, id),
  } satisfies Record<ImportMethod, (...args: never[]) => unknown>
}

export type ImportApi = {
  [K in ImportMethod]: (
    ...args: Parameters<ReturnType<typeof createImportHandlers>[K]>
  ) => Promise<ReturnType<ReturnType<typeof createImportHandlers>[K]>>
}
