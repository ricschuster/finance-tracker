import type Database from 'better-sqlite3'
import { getTransaction } from '../ledger/transactions'
import type { Action, Rule, RuleInput } from './types'
import { previewRules } from './apply'
import { suggestPattern } from './pattern'

export { suggestPattern }

export interface RuleSuggestion {
  draft: RuleInput
  /** Existing transactions (other than this one) the rule would change right now. */
  wouldChange: number
}

/**
 * After a hand edit of the payee or category, draft a rule from it. Returns null when the edit
 * gives nothing to learn from. Nothing is saved; the user reviews the draft first.
 */
export function suggestRule(db: Database.Database, transactionId: number): RuleSuggestion | null {
  const t = getTransaction(db, transactionId)
  if (!t || t.transferPeerId !== null) return null
  const pattern = suggestPattern(t.rawDescription)
  if (!pattern) return null

  const actions: Action[] = []
  if (t.editedFields.includes('payee') && t.payee.trim()) {
    actions.push({ type: 'setPayee', payee: t.payee.trim() })
  }
  const line = t.lines[0]
  if (t.editedFields.includes('categories') && t.lines.length === 1 && line) {
    if (line.categoryName !== 'Uncategorized') {
      actions.push({ type: 'setCategory', categoryId: line.categoryId })
    }
  }
  if (actions.length === 0) return null

  const draft: RuleInput = {
    name: pattern,
    conditions: [{ type: 'text', field: 'description', op: 'contains', value: pattern }],
    actions,
  }
  const preview = previewRules(db, {
    rules: [{ id: 0, name: draft.name ?? '', position: 0, enabled: true, ...draft } as Rule],
  })
  return { draft, wouldChange: preview.filter((c) => c.transactionId !== transactionId).length }
}
