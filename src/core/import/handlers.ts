import type Database from 'better-sqlite3'
import {
  categoryIdByName,
  commitImport,
  loadExistingForMatching,
  type ImportDecision,
  type ImportFormat,
} from './commit'
import { createCategory } from '../ledger/categories'
import { looksLikeMint, mapMint } from './mint'
import { looksLikeMonarch, mapMonarch } from './monarch'
import { looksLikeWealthsimple, mapWealthsimple } from './wealthsimple'
import { looksLikeOfx, parseOfx } from './ofx'
import { guessHeaderRow, parseCsv, type Delimiter } from './csv'
import { alreadyImportedWarning, findBatchByHash, hashFileText } from './filehash'
import { getBatchRows, listBatches, previewUndo, undoBatch } from './history'
import {
  headerFingerprint,
  mapRows,
  type Candidate,
  type MappingResult,
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
  /** Required for CSV; ignored for OFX/QFX. */
  profile?: MappingProfile
  /** Defaults to `csv`; `ofx` covers OFX and QFX files. */
  format?: ImportFormat
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
  /** The row looks like a card or loan payment, so linking it as a transfer is on unless the user clears it. */
  suggestLink: boolean
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

export interface OfxInspection {
  accountId: string | null
  currency: string | null
  count: number
}

function buildPlan(db: Database.Database, req: PreviewRequest) {
  let mapped: { candidates: Candidate[]; errors: RowIssue[]; skippedForeign: RowIssue[] }
  let currency: string | null = null
  if (req.format === 'ofx') {
    const s = parseOfx(req.text)
    currency = s.currency
    mapped = { candidates: s.candidates, errors: s.errors, skippedForeign: [] }
  } else {
    if (!req.profile) throw new Error('A mapping profile is required for CSV')
    const { rows } = parseCsv(req.text, req.delimiter)
    mapped = mapRows(rows, validateProfile(req.profile), { foreign: req.foreign ?? 'skip' })
  }
  const plan = planImport(req.accountId, mapped.candidates, loadExistingForMatching(db))
  return { mapped, plan, currency }
}

export type MultiSource = 'Mint' | 'Monarch' | 'Wealthsimple'

export interface MintInspection {
  /** Which multi-account export this is; the name is kept for the existing API. */
  source: MultiSource
  accountNames: string[]
  count: number
}

export interface MintRequest {
  text: string
  /** Mint account name to ledger account id. Every account in the file must be mapped. */
  accountMap: Record<string, number>
  overrides?: ChoiceOverride[]
}

export interface MintPreview {
  source: MultiSource
  accounts: Array<{ mintName: string; accountId: number; preview: ImportPreview }>
  /** Category names in the file that we do not have; those rows go to Uncategorized. */
  unknownCategories: string[]
}

type Mapped = { candidates: Candidate[]; errors: RowIssue[]; skippedForeign: RowIssue[] }

function makePreview(
  db: Database.Database,
  accountId: number,
  mapped: Mapped,
  plan: PlanItem[],
  currency: string | null,
  fileText?: string,
): ImportPreview {
  const account = db.prepare('SELECT type FROM accounts WHERE id = ?').get(accountId) as
    { type: 'checking' | 'savings' | 'credit_card' | 'cash' | 'loan' | 'other' } | undefined
  if (!account) throw new Error(`Account ${accountId} not found`)
  const known =
    fileText === undefined ? null : findBatchByHash(db, accountId, hashFileText(fileText))
  return {
    items: plan.map((p) => ({
      ...p,
      match: lookup(db, p.matchId),
      transfer: lookup(db, p.transferCandidateId),
      suggestLink: suggestsLink(db, accountId, p),
    })),
    errors: mapped.errors,
    skippedForeign: mapped.skippedForeign,
    warnings: [
      ...(known ? [alreadyImportedWarning(known)] : []),
      ...(currency && currency !== 'CAD'
        ? [`This file is in ${currency}, not CAD. Amounts would be imported as CAD.`]
        : []),
      ...sanityWarnings(plan, account.type, today()),
    ],
    summary: summarisePlan(plan),
  }
}

const PAYMENT_WORDS = /\b(payment|pmt|paiement|pymt|autopay|bill pay)\b/i

/**
 * A new row with a transfer candidate is a likely card or loan payment when either account is a
 * credit card or loan, or the bank text says payment. Such rows are linked by default so they stay
 * out of spending; the user can clear the box. Other candidates stay opt-in.
 */
function suggestsLink(db: Database.Database, accountId: number, p: PlanItem): boolean {
  if (p.outcome !== 'new' || p.transferCandidateId === null) return false
  const types = db
    .prepare(
      `SELECT a.type FROM accounts a WHERE a.id = ?
       UNION ALL SELECT a.type FROM transactions t JOIN accounts a ON a.id = t.account_id WHERE t.id = ?`,
    )
    .all(accountId, p.transferCandidateId) as Array<{ type: string }>
  return (
    types.some((t) => t.type === 'credit_card' || t.type === 'loan') &&
    PAYMENT_WORDS.test(p.candidate.rawDescription)
  )
}

/** Turn a plan plus the user's overrides into commit decisions. */
function decide(
  db: Database.Database,
  accountId: number,
  plan: PlanItem[],
  overrideList: ChoiceOverride[] = [],
): ImportDecision[] {
  const overrides = new Map(overrideList.map((o) => [o.line, o]))
  return plan.map((p) => {
    const o = overrides.get(p.candidate.line)
    const candidate = p.candidate
    if (p.outcome === 'duplicate') return { candidate, action: 'skip' as const }
    if (p.outcome === 'new') {
      if (o?.choice === 'skip') return { candidate, action: 'skip' as const }
      return {
        candidate,
        action: 'add' as const,
        ...((o?.linkTransfer ?? suggestsLink(db, accountId, p)) &&
          p.transferCandidateId !== null && { linkTransferId: p.transferCandidateId }),
      }
    }
    const choice = o?.choice ?? p.choice
    if (choice === 'merge' && p.matchId !== null)
      return { candidate, action: 'merge' as const, matchId: p.matchId }
    if (choice === 'skip') return { candidate, action: 'skip' as const }
    return { candidate, action: 'add' as const }
  })
}

/** Recognise a multi-account export (Mint, Monarch or Wealthsimple) and map it; null for anything else. */
function mapMulti(rows: string[][]): { source: MultiSource; mapped: MappingResult } | null {
  if (looksLikeMint(rows)) return { source: 'Mint', mapped: mapMint(rows) }
  if (looksLikeMonarch(rows)) return { source: 'Monarch', mapped: mapMonarch(rows) }
  if (looksLikeWealthsimple(rows)) return { source: 'Wealthsimple', mapped: mapWealthsimple(rows) }
  return null
}

/**
 * Create the categories a file uses that we do not have (by name or alias), so rows keep the
 * category they had in the old tool. A name only ever seen on money in becomes an income category.
 */
function createMissingCategories(db: Database.Database, candidates: Candidate[]): void {
  const seen = new Map<string, { name: string; income: boolean }>()
  for (const c of candidates) {
    const name = c.categoryName?.trim()
    if (!name || categoryIdByName(db, name) !== null) continue
    const key = name.toLowerCase()
    const entry = seen.get(key) ?? { name, income: true }
    if (c.amount <= 0) entry.income = false
    seen.set(key, entry)
  }
  for (const { name, income } of seen.values())
    createCategory(db, { name, kind: income ? 'income' : 'expense' })
}

/** Split a multi-account file by account and plan each part against its mapped ledger account. */
function mintGroups(db: Database.Database, req: MintRequest) {
  const { rows } = parseCsv(req.text)
  const found = mapMulti(rows)
  if (!found) throw new Error('This is not a Mint, Monarch or Wealthsimple export')
  const all = found.mapped
  const existing = loadExistingForMatching(db)
  const names = [...new Set(all.candidates.map((c) => c.accountName ?? ''))]
  const unmapped = names.filter((n) => req.accountMap[n] === undefined)
  if (unmapped.length > 0) throw new Error(`Map these accounts first: ${unmapped.join(', ')}`)
  return names.map((mintName) => {
    const accountId = req.accountMap[mintName]!
    const candidates = all.candidates.filter((c) => (c.accountName ?? '') === mintName)
    // Row errors have no account, so they are reported with the first group only.
    const first = mintName === names[0]
    const mapped: Mapped = {
      candidates,
      errors: first ? all.errors : [],
      skippedForeign: first ? all.skippedForeign : [],
    }
    return {
      source: found.source,
      mintName,
      accountId,
      candidates,
      mapped,
      plan: planImport(accountId, candidates, existing),
    }
  })
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

    /** Detects OFX/QFX; returns null for anything else (treat as CSV). */
    inspectOfx: (text: string): OfxInspection | null => {
      if (!looksLikeOfx(text)) return null
      const s = parseOfx(text)
      return {
        accountId: s.accountId,
        currency: s.currency,
        count: s.candidates.length + s.errors.length,
      }
    },

    previewImport: (req: PreviewRequest): ImportPreview => {
      const { mapped, plan, currency } = buildPlan(db, req)
      return makePreview(db, req.accountId, mapped, plan, currency, req.text)
    },

    /** Re-plans from the raw file so the renderer's view is never trusted, then applies the user's overrides. */
    commitImport: (req: CommitRequest) => {
      const { mapped, plan } = buildPlan(db, req)
      return commitImport(db, {
        accountId: req.accountId,
        sourceName: req.sourceName,
        format: req.format ?? 'csv',
        profileId: req.profileId ?? null,
        fileHash: hashFileText(req.text),
        decisions: decide(db, req.accountId, plan, req.overrides),
        rowsError: mapped.errors.length + mapped.skippedForeign.length,
        rowsTotal: mapped.candidates.length + mapped.errors.length + mapped.skippedForeign.length,
      })
    },

    /** Mint files cover many accounts; null means the text is not a Mint export. */
    inspectMint: (text: string): MintInspection | null => {
      const found = mapMulti(parseCsv(text).rows)
      if (!found) return null
      const m = found.mapped
      const accountNames = [...new Set(m.candidates.map((c) => c.accountName ?? ''))]
      return {
        source: found.source,
        accountNames,
        count: m.candidates.length + m.errors.length + m.skippedForeign.length,
      }
    },

    /** Make an outside category name (for example from Mint) land in one of our categories. */
    setCategoryAlias: (alias: string, categoryId: number): void => {
      const name = alias.trim()
      if (!name) throw new Error('Alias is required')
      if (!db.prepare('SELECT 1 FROM categories WHERE id = ?').get(categoryId))
        throw new Error(`Category ${categoryId} not found`)
      db.prepare(
        `INSERT INTO category_aliases (alias, category_id) VALUES (?, ?)
         ON CONFLICT(alias) DO UPDATE SET category_id = excluded.category_id`,
      ).run(name, categoryId)
    },

    previewMint: (req: MintRequest): MintPreview => {
      const groups = mintGroups(db, req)
      const known = new Set(
        (
          db
            .prepare('SELECT name FROM categories UNION SELECT alias FROM category_aliases')
            .all() as Array<{ name: string }>
        ).map((r) => r.name.toLowerCase()),
      )
      const unknown = new Set<string>()
      for (const g of groups)
        for (const c of g.candidates)
          if (c.categoryName && !known.has(c.categoryName.toLowerCase()))
            unknown.add(c.categoryName)
      return {
        source: groups[0]?.source ?? 'Mint',
        accounts: groups.map((g) => ({
          mintName: g.mintName,
          accountId: g.accountId,
          preview: makePreview(db, g.accountId, g.mapped, g.plan, null, req.text),
        })),
        unknownCategories: [...unknown].sort(),
      }
    },

    commitMint: (req: MintRequest & { sourceName: string }) =>
      db.transaction(() => {
        const groups = mintGroups(db, req)
        createMissingCategories(
          db,
          groups.flatMap((g) => g.candidates),
        )
        return groups.map((g) => ({
          mintName: g.mintName,
          ...commitImport(db, {
            accountId: g.accountId,
            sourceName: req.sourceName,
            // Only Mint has its own batch format value; Monarch and Wealthsimple are stored as csv.
            format: g.source === 'Mint' ? ('mint' as const) : ('csv' as const),
            fileHash: hashFileText(req.text),
            decisions: decide(db, g.accountId, g.plan, req.overrides),
            rowsError: g.mapped.errors.length + g.mapped.skippedForeign.length,
            rowsTotal:
              g.mapped.candidates.length + g.mapped.errors.length + g.mapped.skippedForeign.length,
          }),
        }))
      })(),

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
