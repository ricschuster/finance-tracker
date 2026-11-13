import type { Candidate } from './mapping'

export const MATCH_WINDOW_DAYS = 3

/** The slice of an existing transaction that matching needs. */
export interface ExistingTxn {
  id: number
  accountId: number
  date: string
  amount: number
  rawDescription: string
  externalId: string | null
  /** True when the row came from an import batch rather than manual entry. */
  imported: boolean
  transferPeerId: number | null
}

export type Outcome = 'new' | 'duplicate' | 'possible' | 'error'
export type PossibleChoice = 'merge' | 'new' | 'skip'

export interface PlanItem {
  candidate: Candidate
  outcome: Exclude<Outcome, 'error'>
  /** The existing transaction a duplicate or possible match points at. */
  matchId: number | null
  /** Default decision for a possible match; ignored for other outcomes. */
  choice: PossibleChoice
  /** An opposite-signed row in another account, offered as a transfer. Never linked automatically. */
  transferCandidateId: number | null
}

export function normaliseDescription(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim()
}

function dayNumber(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return Math.round(Date.UTC(y!, m! - 1, d!) / 86_400_000)
}

export function daysBetween(a: string, b: string): number {
  return Math.abs(dayNumber(a) - dayNumber(b))
}

/**
 * Classify candidates for a target account against a snapshot of the ledger.
 * Pure: candidates are processed in file order, each existing row is consumed at most once,
 * so two identical rows against one in the ledger yield one duplicate and one new row.
 */
export function planImport(
  accountId: number,
  candidates: Candidate[],
  existing: ExistingTxn[],
  windowDays: number = MATCH_WINDOW_DAYS,
): PlanItem[] {
  const inAccount = existing.filter((e) => e.accountId === accountId)
  const others = existing.filter((e) => e.accountId !== accountId && e.transferPeerId === null)
  const used = new Set<number>()
  const plan: PlanItem[] = []
  const free = (e: ExistingTxn) => !used.has(e.id)

  const transferFor = (c: Candidate): number | null => {
    const hit = others.find(
      (e) => e.amount === -c.amount && daysBetween(e.date, c.date) <= windowDays,
    )
    return hit ? hit.id : null
  }

  // Pass 1: external ids and exact fingerprints, which are the strong matches.
  const pending: Array<{ c: Candidate; idx: number }> = []
  for (const c of candidates) {
    let hit: ExistingTxn | undefined
    let conflictId: number | null = null
    if (c.externalId !== null) {
      const byId = inAccount.find((e) => e.externalId === c.externalId && free(e))
      if (byId) {
        if (byId.date === c.date && byId.amount === c.amount) hit = byId
        else conflictId = byId.id
      }
    }
    if (!hit && conflictId === null) {
      const norm = normaliseDescription(c.rawDescription)
      hit = inAccount.find(
        (e) =>
          free(e) &&
          e.date === c.date &&
          e.amount === c.amount &&
          normaliseDescription(e.rawDescription) === norm,
      )
    }
    if (hit) {
      used.add(hit.id)
      plan.push({
        candidate: c,
        outcome: 'duplicate',
        matchId: hit.id,
        choice: 'skip',
        transferCandidateId: null,
      })
    } else if (conflictId !== null) {
      used.add(conflictId)
      plan.push({
        candidate: c,
        outcome: 'possible',
        matchId: conflictId,
        choice: 'new',
        transferCandidateId: null,
      })
    } else {
      pending.push({ c, idx: plan.length })
      plan.push({
        candidate: c,
        outcome: 'new',
        matchId: null,
        choice: 'new',
        transferCandidateId: null,
      })
    }
  }

  // Pass 2: possible matches for what is left, nearest date first.
  for (const { c, idx } of pending) {
    const near = inAccount
      .filter((e) => free(e) && e.amount === c.amount && daysBetween(e.date, c.date) <= windowDays)
      .sort((x, y) => daysBetween(x.date, c.date) - daysBetween(y.date, c.date))[0]
    if (near) {
      used.add(near.id)
      plan[idx] = {
        candidate: c,
        outcome: 'possible',
        matchId: near.id,
        choice: near.imported ? 'new' : 'merge',
        transferCandidateId: null,
      }
    } else {
      plan[idx]!.transferCandidateId = transferFor(c)
    }
  }
  return plan
}

export function summarisePlan(plan: PlanItem[]) {
  let inflow = 0
  let outflow = 0
  const counts = { new: 0, duplicate: 0, possible: 0 }
  for (const p of plan) {
    counts[p.outcome]++
    const adds = p.outcome === 'new' || (p.outcome === 'possible' && p.choice === 'new')
    if (adds) {
      if (p.candidate.amount >= 0) inflow += p.candidate.amount
      else outflow += p.candidate.amount
    }
  }
  return { counts, inflow, outflow }
}
