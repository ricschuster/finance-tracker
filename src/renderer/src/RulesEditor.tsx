import { useCallback, useEffect, useState } from 'react'
import type { RuleChange } from '../../core/rules/apply'
import type { Action, Condition, Rule, RuleInput, TextField, TextOp } from '../../core/rules/types'
import { formatCents, parseAmountToCents } from '../../core/money'
import { CategorySelect } from './CategorySelect'
import type { LedgerState } from './useLedger'

/** The editor shows one slot per kind of condition and action. */
interface FormState {
  name: string
  enabled: boolean
  textField: TextField
  textOp: TextOp
  textValue: string
  direction: '' | 'expense' | 'income'
  min: string
  max: string
  accountId: number
  payee: string
  categoryId: number
  tags: string
}

const blank = (): FormState => ({
  name: '',
  enabled: true,
  textField: 'description',
  textOp: 'contains',
  textValue: '',
  direction: '',
  min: '',
  max: '',
  accountId: 0,
  payee: '',
  categoryId: 0,
  tags: '',
})

const dollars = (cents: number) => (cents / 100).toFixed(2)

/** Null when the rule uses more than the slots can hold, so editing it here would lose data. */
function toForm(rule: RuleInput & { name?: string }): FormState | null {
  const f = blank()
  f.name = rule.name ?? ''
  f.enabled = rule.enabled !== false
  const seen = new Set<string>()
  for (const c of rule.conditions) {
    if (seen.has(c.type)) return null
    seen.add(c.type)
    if (c.type === 'text') {
      f.textField = c.field
      f.textOp = c.op
      f.textValue = c.value
    } else if (c.type === 'amount') {
      f.direction = c.direction ?? ''
      f.min = c.min === undefined ? '' : dollars(c.min)
      f.max = c.max === undefined ? '' : dollars(c.max)
    } else {
      f.accountId = c.accountId
    }
  }
  seen.clear()
  for (const a of rule.actions) {
    if (seen.has(a.type)) return null
    seen.add(a.type)
    if (a.type === 'setPayee') f.payee = a.payee
    else if (a.type === 'setCategory') f.categoryId = a.categoryId
    else f.tags = a.tags.join(', ')
  }
  return f
}

function toInput(f: FormState): RuleInput {
  const conditions: Condition[] = []
  if (f.textValue.trim()) {
    conditions.push({ type: 'text', field: f.textField, op: f.textOp, value: f.textValue })
  }
  if (f.direction || f.min.trim() || f.max.trim()) {
    conditions.push({
      type: 'amount',
      ...(f.direction && { direction: f.direction }),
      ...(f.min.trim() && { min: Math.abs(parseAmountToCents(f.min)) }),
      ...(f.max.trim() && { max: Math.abs(parseAmountToCents(f.max)) }),
    })
  }
  if (f.accountId) conditions.push({ type: 'account', accountId: f.accountId })
  const actions: Action[] = []
  if (f.payee.trim()) actions.push({ type: 'setPayee', payee: f.payee.trim() })
  if (f.categoryId) actions.push({ type: 'setCategory', categoryId: f.categoryId })
  const tags = f.tags
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
  if (tags.length) actions.push({ type: 'addTags', tags })
  return { name: f.name, enabled: f.enabled, conditions, actions }
}

function describeCondition(c: Condition, accounts: LedgerState['accounts']): string {
  if (c.type === 'text') {
    const op = { contains: 'contains', starts_with: 'starts with', equals: 'is', regex: 'matches' }
    return `${c.field === 'description' ? 'description' : 'payee'} ${op[c.op]} "${c.value}"`
  }
  if (c.type === 'account') {
    return `account is ${accounts.find((a) => a.id === c.accountId)?.name ?? '?'}`
  }
  const parts = [c.direction ?? 'amount']
  if (c.min !== undefined) parts.push(`at least ${formatCents(c.min)}`)
  if (c.max !== undefined) parts.push(`at most ${formatCents(c.max)}`)
  return parts.join(' ')
}

function describeAction(a: Action, categories: LedgerState['categories']): string {
  if (a.type === 'setPayee') return `payee "${a.payee}"`
  if (a.type === 'addTags') return `tags ${a.tags.join(', ')}`
  return `category ${categories.find((c) => c.id === a.categoryId)?.name ?? '(deleted)'}`
}

export function RulesEditor({
  accounts,
  categories,
  run,
  draft,
  onDraftUsed,
}: Pick<LedgerState, 'accounts' | 'categories' | 'run'> & {
  /** A suggested rule to review, from the transaction list. */
  draft: RuleInput | null
  onDraftUsed: () => void
}) {
  const [rules, setRules] = useState<Rule[]>([])
  const [editing, setEditing] = useState<{ id: number | null; form: FormState } | null>(null)
  const [preview, setPreview] = useState<RuleChange[] | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const load = useCallback(() => {
    void window.api.rules.listRules().then(setRules)
  }, [])
  useEffect(load, [load])

  useEffect(() => {
    if (!draft) return
    const form = toForm(draft)
    if (form) setEditing({ id: null, form })
    onDraftUsed()
  }, [draft, onDraftUsed])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setEditing((e) => (e ? { ...e, form: { ...e.form, [key]: value } } : e))

  async function save() {
    if (!editing) return
    setFormError(null)
    let input: RuleInput
    try {
      input = toInput(editing.form)
    } catch (e) {
      return setFormError(e instanceof Error ? e.message : String(e))
    }
    const { rules: api } = window.api
    try {
      if (editing.id === null) await api.createRule(input)
      else await api.updateRule(editing.id, input)
    } catch (e) {
      return setFormError(e instanceof Error ? e.message : String(e))
    }
    setEditing(null)
    setPreview(null)
    load()
  }

  async function move(index: number, by: -1 | 1) {
    const ids = rules.map((r) => r.id)
    const j = index + by
    if (j < 0 || j >= ids.length) return
    ;[ids[index], ids[j]] = [ids[j]!, ids[index]!]
    if (await run(() => window.api.rules.reorderRules(ids))) {
      setPreview(null)
      load()
    }
  }

  async function applyAll() {
    if (!preview) return
    if (!window.confirm(`Apply rules to ${preview.length} transaction(s)?`)) return
    if (await run(() => window.api.rules.applyRules())) setPreview(null)
  }

  return (
    <section aria-label="Rules">
      <h2>Rules</h2>
      <p className="muted">
        The first matching rule wins. Rules never change a payee, category or tag you edited by
        hand, and they skip transfers.
      </p>
      {rules.length === 0 && <p className="muted">No rules yet.</p>}
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Rule</th>
            <th>When</th>
            <th>Then set</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rules.map((r, i) => (
            <tr key={r.id} className={r.enabled ? '' : 'muted'}>
              <td>{i + 1}</td>
              <td>{r.name || <span className="muted">(unnamed)</span>}</td>
              <td>{r.conditions.map((c) => describeCondition(c, accounts)).join(' and ')}</td>
              <td>{r.actions.map((a) => describeAction(a, categories)).join(', ')}</td>
              <td>
                <button
                  type="button"
                  aria-label={`Move rule ${i + 1} up`}
                  onClick={() => void move(i, -1)}
                >
                  Up
                </button>{' '}
                <button
                  type="button"
                  aria-label={`Move rule ${i + 1} down`}
                  onClick={() => void move(i, 1)}
                >
                  Down
                </button>{' '}
                <button
                  type="button"
                  onClick={() =>
                    void run(() => window.api.rules.setRuleEnabled(r.id, !r.enabled)).then(load)
                  }
                >
                  {r.enabled ? 'Disable' : 'Enable'}
                </button>{' '}
                <button
                  type="button"
                  onClick={() => {
                    const form = toForm(r)
                    if (!form) {
                      window.alert(
                        'This rule has several conditions of one kind and cannot be edited here.',
                      )
                      return
                    }
                    setFormError(null)
                    setEditing({ id: r.id, form })
                  }}
                >
                  Edit
                </button>{' '}
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('Delete this rule?')) {
                      void run(() => window.api.rules.deleteRule(r.id)).then(load)
                      setPreview(null)
                    }
                  }}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {!editing && (
        <p>
          <button
            type="button"
            onClick={() => {
              setFormError(null)
              setEditing({ id: null, form: { ...blank(), categoryId: 0 } })
            }}
          >
            New rule
          </button>{' '}
          <button
            type="button"
            disabled={rules.length === 0}
            onClick={() => void run(async () => setPreview(await window.api.rules.previewRules()))}
          >
            Preview on existing transactions
          </button>
        </p>
      )}

      {editing && (
        <form
          className="mapper"
          aria-label="Rule editor"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          <label>
            Name
            <input value={editing.form.name} onChange={(e) => set('name', e.target.value)} />
          </label>
          <label>
            Match on
            <select
              value={editing.form.textField}
              onChange={(e) => set('textField', e.target.value as TextField)}
            >
              <option value="description">Bank description</option>
              <option value="payee">Payee</option>
            </select>
          </label>
          <label>
            Text operator
            <select
              value={editing.form.textOp}
              onChange={(e) => set('textOp', e.target.value as TextOp)}
            >
              <option value="contains">contains</option>
              <option value="starts_with">starts with</option>
              <option value="equals">equals</option>
              <option value="regex">regular expression</option>
            </select>
          </label>
          <label>
            Text
            <input
              value={editing.form.textValue}
              onChange={(e) => set('textValue', e.target.value)}
            />
          </label>
          <label>
            Direction
            <select
              value={editing.form.direction}
              onChange={(e) => set('direction', e.target.value as FormState['direction'])}
            >
              <option value="">Any</option>
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
          </label>
          <label>
            Amount at least
            <input value={editing.form.min} onChange={(e) => set('min', e.target.value)} />
          </label>
          <label>
            Amount at most
            <input value={editing.form.max} onChange={(e) => set('max', e.target.value)} />
          </label>
          <label>
            Account
            <select
              value={editing.form.accountId}
              onChange={(e) => set('accountId', Number(e.target.value))}
            >
              <option value={0}>Any</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Set payee
            <input value={editing.form.payee} onChange={(e) => set('payee', e.target.value)} />
          </label>
          <label>
            Set category
            <CategorySelect
              aria-label="Category"
              anyLabel="Do not set"
              categories={categories}
              value={editing.form.categoryId}
              onChange={(id) => set('categoryId', id)}
            />
          </label>
          <label>
            Add tags (comma separated)
            <input value={editing.form.tags} onChange={(e) => set('tags', e.target.value)} />
          </label>
          <div>
            <button type="submit">Save rule</button>{' '}
            <button type="button" onClick={() => setEditing(null)}>
              Cancel
            </button>
            {formError && (
              <p className="error" role="alert">
                {formError}
              </p>
            )}
          </div>
        </form>
      )}

      {preview && (
        <div aria-label="Rule preview">
          <h3>{preview.length} transaction(s) would change</h3>
          {preview.length > 0 && (
            <>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Rule</th>
                    <th>Change</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 200).map((c) => (
                    <tr key={c.transactionId}>
                      <td>{c.date}</td>
                      <td>{c.rawDescription}</td>
                      <td>{c.ruleName || `#${c.ruleId}`}</td>
                      <td>
                        {[
                          c.changes.payee !== undefined &&
                            `payee "${c.before.payee}" to "${c.changes.payee}"`,
                          c.newCategoryName !== undefined &&
                            `category ${c.before.categoryName} to ${c.newCategoryName}`,
                          c.changes.addTags?.length && `add ${c.changes.addTags.join(', ')}`,
                        ]
                          .filter(Boolean)
                          .join('; ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.length > 200 && <p className="muted">Showing the first 200.</p>}
              <button type="button" onClick={() => void applyAll()}>
                Apply to {preview.length} transaction(s)
              </button>{' '}
            </>
          )}
          <button type="button" onClick={() => setPreview(null)}>
            Close preview
          </button>
        </div>
      )}
    </section>
  )
}
