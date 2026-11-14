import type {
  Action,
  Condition,
  Rule,
  RuleChanges,
  RuleField,
  RulePlan,
  RuleTarget,
  TextOp,
} from './types'
import { fuzzyMatches } from './fuzzy'

const regexCache = new Map<string, RegExp | null>()

/** Compile a user regex once; an invalid pattern yields null (the condition never matches). */
export function compileRegex(pattern: string): RegExp | null {
  if (regexCache.has(pattern)) return regexCache.get(pattern) ?? null
  let re: RegExp | null
  try {
    re = new RegExp(pattern, 'i')
  } catch {
    re = null
  }
  if (regexCache.size > 500) regexCache.clear()
  regexCache.set(pattern, re)
  return re
}

function textMatches(op: TextOp, haystack: string, needle: string): boolean {
  if (op === 'regex') return compileRegex(needle)?.test(haystack) ?? false
  if (op === 'similar') return fuzzyMatches(haystack, needle)
  const h = haystack.toLowerCase()
  const n = needle.toLowerCase()
  if (n === '') return false
  if (op === 'contains') return h.includes(n)
  if (op === 'starts_with') return h.startsWith(n)
  return h.trim() === n.trim()
}

export function conditionMatches(c: Condition, t: RuleTarget): boolean {
  if (c.type === 'text') {
    return textMatches(c.op, c.field === 'description' ? t.rawDescription : t.payee, c.value)
  }
  if (c.type === 'account') return t.accountId === c.accountId
  if (c.direction === 'expense' && t.amount >= 0) return false
  if (c.direction === 'income' && t.amount <= 0) return false
  const abs = Math.abs(t.amount)
  if (c.min !== undefined && abs < c.min) return false
  if (c.max !== undefined && abs > c.max) return false
  return true
}

export function ruleMatches(rule: Rule, t: RuleTarget): boolean {
  return (
    rule.enabled &&
    rule.conditions.length > 0 &&
    rule.conditions.every((c) => conditionMatches(c, t))
  )
}

function applyActions(
  actions: Action[],
  t: RuleTarget,
  categoryOk: (id: number) => boolean,
): { changes: RuleChanges; locked: RuleField[] } {
  const changes: RuleChanges = {}
  const locked = new Set<RuleField>()
  const has = (f: string) => t.editedFields.includes(f)
  // Later actions of the same kind override earlier ones, as the editor lists them in order.
  for (const a of actions) {
    if (a.type === 'setPayee') {
      if (has('payee')) locked.add('payee')
      else if (a.payee !== t.payee) changes.payee = a.payee
      else delete changes.payee
    } else if (a.type === 'setCategory') {
      if (has('categories') || t.lineCount !== 1) locked.add('categories')
      else if (!categoryOk(a.categoryId)) continue
      else if (a.categoryId !== t.categoryId) changes.categoryId = a.categoryId
      else delete changes.categoryId
    } else if (a.type === 'addTags') {
      if (has('tags')) {
        locked.add('tags')
        continue
      }
      const have = new Set(t.tags.map((x) => x.toLowerCase()))
      const add = new Set(changes.addTags ?? [])
      for (const raw of a.tags) {
        const tag = raw.trim()
        if (tag && !have.has(tag.toLowerCase())) add.add(tag)
      }
      if (add.size) changes.addTags = [...add]
    }
  }
  return { changes, locked: [...locked] }
}

/**
 * First enabled rule whose conditions all hold wins. Transfers are never touched. Returns null
 * when no rule matches.
 */
export function planRules(
  rules: readonly Rule[],
  t: RuleTarget,
  categoryOk: (id: number) => boolean = () => true,
): RulePlan | null {
  if (t.isTransfer) return null
  for (const rule of rules) {
    if (!ruleMatches(rule, t)) continue
    const { changes, locked } = applyActions(rule.actions, t, categoryOk)
    return { ruleId: rule.id, changes, locked }
  }
  return null
}

/**
 * The rule that drops a row at import: the first matching rule, when it has a skipImport action.
 * Same winner as `planRules`, so a skip never fights another rule over the same row.
 */
export function skipRule(rules: readonly Rule[], t: RuleTarget): Rule | null {
  if (t.isTransfer) return null
  const rule = rules.find((r) => ruleMatches(r, t))
  return rule?.actions.some((a) => a.type === 'skipImport') ? rule : null
}

export function hasChanges(c: RuleChanges): boolean {
  return c.payee !== undefined || c.categoryId !== undefined || (c.addTags?.length ?? 0) > 0
}
