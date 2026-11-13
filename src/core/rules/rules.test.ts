import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import { migrate } from '../db/migrations'
import { createAccount } from '../ledger/accounts'
import {
  createTransaction,
  createTransfer,
  getTransaction,
  updateTransaction,
} from '../ledger/transactions'
import { commitImport } from '../import/commit'
import { undoBatch } from '../import/history'
import { applyRules, previewRules } from './apply'
import { planRules } from './engine'
import { createRulesHandlers } from './handlers'
import {
  createRule,
  deleteRule,
  getRule,
  listRules,
  reorderRules,
  setRuleEnabled,
  updateRule,
} from './store'
import { suggestPattern, suggestRule } from './suggest'
import type { Rule, RuleInput, RuleTarget } from './types'

let db: Database.Database
let chq: number
let card: number

const cat = (name: string) =>
  (db.prepare('SELECT id FROM categories WHERE name = ?').get(name) as { id: number }).id

beforeEach(() => {
  db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  migrate(db)
  chq = createAccount(db, { name: 'Chequing', type: 'checking' })
  card = createAccount(db, { name: 'Card', type: 'credit_card' })
})

const txn = (desc: string, amount = -1000, accountId = chq) =>
  createTransaction(db, { accountId, date: '2026-02-01', amount, rawDescription: desc })

const contains = (value: string): RuleInput['conditions'][number] => ({
  type: 'text',
  field: 'description',
  op: 'contains',
  value,
})

const target = (o: Partial<RuleTarget> = {}): RuleTarget => ({
  accountId: 1,
  amount: -1000,
  rawDescription: 'SAFEWAY #44',
  payee: '',
  editedFields: [],
  isTransfer: false,
  lineCount: 1,
  categoryId: 1,
  tags: [],
  ...o,
})

const rule = (o: Partial<Rule> & Pick<Rule, 'conditions' | 'actions'>): Rule => ({
  id: 1,
  name: '',
  position: 0,
  enabled: true,
  ...o,
})

describe('engine', () => {
  it('matches text operators case insensitively', () => {
    const t = target({ rawDescription: 'Starbucks Coffee 123' })
    const m = (op: 'contains' | 'starts_with' | 'equals' | 'regex', value: string) =>
      planRules(
        [
          rule({
            conditions: [{ type: 'text', field: 'description', op, value }],
            actions: [{ type: 'setPayee', payee: 'X' }],
          }),
        ],
        t,
      ) !== null
    expect(m('contains', 'COFFEE')).toBe(true)
    expect(m('starts_with', 'starbucks')).toBe(true)
    expect(m('starts_with', 'coffee')).toBe(false)
    expect(m('equals', 'starbucks coffee 123')).toBe(true)
    expect(m('equals', 'starbucks')).toBe(false)
    expect(m('regex', '^star.*\\d{3}$')).toBe(true)
    expect(m('regex', '(')).toBe(false)
  })

  it('handles amount direction and bounds on the absolute value', () => {
    const r = (c: Extract<RuleInput['conditions'][number], { type: 'amount' }>) =>
      rule({ conditions: [c], actions: [{ type: 'setPayee', payee: 'X' }] })
    expect(
      planRules([r({ type: 'amount', direction: 'expense', min: 500 })], target()),
    ).not.toBeNull()
    expect(planRules([r({ type: 'amount', direction: 'income' })], target())).toBeNull()
    expect(planRules([r({ type: 'amount', max: 999 })], target())).toBeNull()
    expect(planRules([r({ type: 'amount', min: 1000, max: 1000 })], target())).not.toBeNull()
  })

  it('first match wins and disabled rules are skipped', () => {
    const rules = [
      rule({
        id: 1,
        enabled: false,
        conditions: [contains('safeway')],
        actions: [{ type: 'setPayee', payee: 'A' }],
      }),
      rule({
        id: 2,
        conditions: [contains('safeway')],
        actions: [{ type: 'setPayee', payee: 'B' }],
      }),
      rule({
        id: 3,
        conditions: [contains('safeway')],
        actions: [{ type: 'setPayee', payee: 'C' }],
      }),
    ]
    expect(planRules(rules, target())).toMatchObject({ ruleId: 2, changes: { payee: 'B' } })
  })

  it('locks hand edited fields but the rule still wins', () => {
    const rules = [
      rule({
        id: 1,
        conditions: [contains('safeway')],
        actions: [
          { type: 'setPayee', payee: 'Safeway' },
          { type: 'setCategory', categoryId: 7 },
        ],
      }),
      rule({
        id: 2,
        conditions: [contains('safeway')],
        actions: [{ type: 'addTags', tags: ['x'] }],
      }),
    ]
    const plan = planRules(rules, target({ editedFields: ['payee'] }))
    expect(plan).toEqual({ ruleId: 1, changes: { categoryId: 7 }, locked: ['payee'] })
  })

  it('skips transfers and split category changes, and drops no-op changes', () => {
    const r = rule({
      conditions: [contains('safeway')],
      actions: [
        { type: 'setCategory', categoryId: 7 },
        { type: 'addTags', tags: ['Food', ' '] },
      ],
    })
    expect(planRules([r], target({ isTransfer: true }))).toBeNull()
    expect(planRules([r], target({ lineCount: 2 }))?.locked).toEqual(['categories'])
    expect(planRules([r], target({ categoryId: 7, tags: ['food'] }))?.changes).toEqual({})
  })

  it('ignores a category that no longer exists', () => {
    const r = rule({
      conditions: [contains('safeway')],
      actions: [{ type: 'setCategory', categoryId: 99 }],
    })
    expect(planRules([r], target(), () => false)?.changes).toEqual({})
  })
})

describe('store', () => {
  const input = (name: string): RuleInput => ({
    name,
    conditions: [contains(name)],
    actions: [{ type: 'setPayee', payee: name }],
  })

  it('creates in order, inserts at a position, reorders and deletes', () => {
    const a = createRule(db, input('a'))
    const b = createRule(db, input('b'))
    const c = createRule(db, input('c'), 0)
    expect(listRules(db).map((r) => r.id)).toEqual([c, a, b])
    reorderRules(db, [b, c, a])
    expect(listRules(db).map((r) => r.id)).toEqual([b, c, a])
    deleteRule(db, c)
    expect(listRules(db).map((r) => [r.id, r.position])).toEqual([
      [b, 0],
      [a, 1],
    ])
    expect(() => reorderRules(db, [a])).toThrow(/every rule/)
    expect(() => reorderRules(db, [a, a])).toThrow(/every rule/)
  })

  it('updates, toggles and trims tags', () => {
    const id = createRule(db, input('a'))
    updateRule(db, id, {
      name: ' New ',
      enabled: false,
      conditions: [contains('z')],
      actions: [{ type: 'addTags', tags: [' t1 ', ''] }],
    })
    expect(getRule(db, id)).toMatchObject({
      name: 'New',
      enabled: false,
      actions: [{ type: 'addTags', tags: ['t1'] }],
    })
    setRuleEnabled(db, id, true)
    expect(getRule(db, id)?.enabled).toBe(true)
    expect(() => updateRule(db, 999, input('a'))).toThrow(/not found/)
  })

  it('rejects invalid rules', () => {
    const bad = (o: Partial<RuleInput>) => () => createRule(db, { ...input('a'), ...o })
    expect(bad({ conditions: [] })).toThrow(/condition/)
    expect(bad({ actions: [] })).toThrow(/action/)
    expect(
      bad({ conditions: [{ type: 'text', field: 'description', op: 'regex', value: '(' }] }),
    ).toThrow(/regular expression/)
    expect(bad({ conditions: [contains('  ')] })).toThrow(/value/)
    expect(bad({ conditions: [{ type: 'amount' }] })).toThrow(/empty/)
    expect(bad({ conditions: [{ type: 'amount', min: 10, max: 5 }] })).toThrow(/above max/)
    expect(bad({ conditions: [{ type: 'amount', min: 1.5 }] })).toThrow(/cents/)
    expect(bad({ conditions: [{ type: 'account', accountId: 999 }] })).toThrow(/Account/)
    expect(bad({ actions: [{ type: 'setCategory', categoryId: 9999 }] })).toThrow(/Category/)
    expect(bad({ actions: [{ type: 'addTags', tags: [' '] }] })).toThrow(/tag/)
  })
})

describe('apply', () => {
  const safeway = (): RuleInput => ({
    name: 'Safeway',
    conditions: [contains('safeway')],
    actions: [
      { type: 'setPayee', payee: 'Safeway' },
      { type: 'setCategory', categoryId: cat('Groceries') },
      { type: 'addTags', tags: ['food'] },
    ],
  })

  it('previews without writing, then applies, and applying twice is a no-op', () => {
    createRule(db, safeway())
    const a = txn('SAFEWAY #4412')
    txn('SHELL 99')
    const preview = previewRules(db)
    expect(preview).toHaveLength(1)
    expect(preview[0]).toMatchObject({
      transactionId: a,
      ruleName: 'Safeway',
      newCategoryName: 'Groceries',
      before: { payee: '', categoryName: 'Uncategorized', tags: [] },
    })
    expect(getTransaction(db, a)?.payee).toBe('')

    expect(applyRules(db)).toEqual({ changed: 1 })
    const t = getTransaction(db, a)!
    expect(t.payee).toBe('Safeway')
    expect(t.lines[0]!.categoryName).toBe('Groceries')
    expect(t.tags).toEqual(['food'])
    expect(t.editedFields).toEqual([])
    expect(applyRules(db)).toEqual({ changed: 0 })
  })

  it('never overwrites hand edits', () => {
    createRule(db, safeway())
    const a = txn('SAFEWAY #1')
    updateTransaction(db, a, { payee: 'My store' })
    updateTransaction(db, a, { lines: [{ categoryId: cat('Gifts & Donations'), amount: -1000 }] })
    applyRules(db)
    const t = getTransaction(db, a)!
    expect(t.payee).toBe('My store')
    expect(t.lines[0]!.categoryName).toBe('Gifts & Donations')
    expect(t.tags).toEqual(['food'])
    expect(previewRules(db)).toHaveLength(0)
  })

  it('skips transfers and keeps split lines', () => {
    createRule(db, safeway())
    const { outId } = createTransfer(db, {
      fromAccountId: chq,
      toAccountId: card,
      date: '2026-02-02',
      amount: 500,
      description: 'SAFEWAY transfer',
    })
    const split = createTransaction(db, {
      accountId: chq,
      date: '2026-02-03',
      amount: -3000,
      rawDescription: 'SAFEWAY #9',
      lines: [
        { categoryId: cat('Groceries'), amount: -2000 },
        { categoryId: cat('Home'), amount: -1000 },
      ],
    })
    applyRules(db)
    expect(getTransaction(db, outId)?.payee).toBe('SAFEWAY transfer')
    const s = getTransaction(db, split)!
    expect(s.payee).toBe('Safeway')
    expect(s.lines.map((l) => l.categoryName)).toEqual(['Groceries', 'Home'])
  })

  it('limits work to the given ids and chunks long lists', () => {
    createRule(db, safeway())
    const a = txn('SAFEWAY 1')
    const b = txn('SAFEWAY 2')
    expect(applyRules(db, { ids: [a] })).toEqual({ changed: 1 })
    expect(getTransaction(db, b)?.payee).toBe('')
    const many = Array.from({ length: 1200 }, (_, i) => i + 10_000)
    expect(previewRules(db, { ids: [...many, b] })).toHaveLength(1)
  })

  it('first matching rule wins across the list', () => {
    createRule(db, {
      conditions: [contains('safeway')],
      actions: [{ type: 'setPayee', payee: 'One' }],
    })
    createRule(db, {
      conditions: [contains('safeway')],
      actions: [{ type: 'setPayee', payee: 'Two' }],
    })
    const a = txn('SAFEWAY')
    applyRules(db)
    expect(getTransaction(db, a)?.payee).toBe('One')
  })
})

describe('import integration', () => {
  it('runs rules on added rows and undo removes them', () => {
    createRule(db, {
      conditions: [contains('safeway')],
      actions: [{ type: 'setPayee', payee: 'Safeway' }],
    })
    const r = commitImport(db, {
      accountId: chq,
      sourceName: 'f.csv',
      format: 'csv',
      decisions: [
        {
          action: 'add',
          candidate: {
            line: 2,
            date: '2026-01-06',
            amount: -4500,
            rawDescription: 'SAFEWAY #4412',
            payee: '',
            memo: '',
            externalId: null,
            status: 'cleared',
          },
        },
      ],
    })
    const id = (db.prepare('SELECT id FROM transactions').get() as { id: number }).id
    expect(getTransaction(db, id)?.payee).toBe('Safeway')
    undoBatch(db, r.batchId)
    expect(db.prepare('SELECT COUNT(*) n FROM transactions').get()).toEqual({ n: 0 })
  })
})

describe('suggestions', () => {
  it('builds a phrase without reference numbers', () => {
    expect(suggestPattern('SAFEWAY #4412 VANCOUVER BC')).toBe('SAFEWAY VANCOUVER BC')
    expect(suggestPattern('POS 4421 TIM HORTONS 0192 TORONTO')).toBe('POS TIM HORTONS')
    expect(suggestPattern('12345 6789')).toBe('')
  })

  it('drafts a rule from a manual edit and counts what it would change', () => {
    const a = txn('SAFEWAY #4412')
    txn('SAFEWAY #77')
    txn('SHELL 1')
    updateTransaction(db, a, {
      payee: 'Safeway',
      lines: [{ categoryId: cat('Groceries'), amount: -1000 }],
    })
    const s = suggestRule(db, a)!
    expect(s.draft.conditions).toEqual([contains('SAFEWAY')])
    expect(s.draft.actions).toEqual([
      { type: 'setPayee', payee: 'Safeway' },
      { type: 'setCategory', categoryId: cat('Groceries') },
    ])
    expect(s.wouldChange).toBe(1)
    createRule(db, s.draft)
    expect(suggestRule(db, a)?.wouldChange).toBe(1)
  })

  it('offers nothing without a hand edit, for Uncategorized, or for transfers', () => {
    const a = txn('SAFEWAY #4412')
    expect(suggestRule(db, a)).toBeNull()
    updateTransaction(db, a, { notes: 'hi' })
    expect(suggestRule(db, a)).toBeNull()
    updateTransaction(db, a, { lines: [{ categoryId: cat('Uncategorized'), amount: -1000 }] })
    expect(suggestRule(db, a)).toBeNull()
    const { outId } = createTransfer(db, {
      fromAccountId: chq,
      toAccountId: card,
      date: '2026-02-02',
      amount: 500,
    })
    expect(suggestRule(db, outId)).toBeNull()
  })
})

describe('handlers', () => {
  it('round trips through the handler layer', () => {
    const h = createRulesHandlers(db)
    const id = h.createRule({
      conditions: [contains('shell')],
      actions: [{ type: 'setCategory', categoryId: cat('Auto & Transport') }],
    })
    const a = txn('SHELL 99')
    expect(h.previewRules({ ids: [a] })).toHaveLength(1)
    expect(h.applyRules()).toEqual({ changed: 1 })
    h.deleteRule(id)
    expect(h.listRules()).toEqual([])
  })
})
