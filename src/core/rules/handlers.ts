import type Database from 'better-sqlite3'
import { applyRules, previewRules } from './apply'
import type { RulesMethod } from './methods'
import {
  createRule,
  deleteRule,
  listRules,
  reorderRules,
  setRuleEnabled,
  updateRule,
} from './store'
import { reviewQueue } from './review'
import { suggestRule } from './suggest'
import type { RuleInput } from './types'

/** The rules API as plain functions over a database, exposed over IPC unchanged. */
export function createRulesHandlers(db: Database.Database) {
  return {
    listRules: () => listRules(db),
    createRule: (input: RuleInput, position?: number) => createRule(db, input, position),
    updateRule: (id: number, input: RuleInput) => updateRule(db, id, input),
    setRuleEnabled: (id: number, enabled: boolean) => setRuleEnabled(db, id, enabled),
    deleteRule: (id: number) => deleteRule(db, id),
    reorderRules: (ids: number[]) => reorderRules(db, ids),
    previewRules: (opts?: { ids?: number[] }) => previewRules(db, opts),
    applyRules: (opts?: { ids?: number[] }) => applyRules(db, opts),
    suggestRule: (transactionId: number) => suggestRule(db, transactionId),
    reviewQueue: (limit?: number) => reviewQueue(db, limit),
  } satisfies Record<RulesMethod, (...args: never[]) => unknown>
}

export type RulesHandlers = ReturnType<typeof createRulesHandlers>

/** The renderer-side view: every handler becomes async. */
export type RulesApi = {
  [K in keyof RulesHandlers]: (
    ...args: Parameters<RulesHandlers[K]>
  ) => Promise<ReturnType<RulesHandlers[K]>>
}
