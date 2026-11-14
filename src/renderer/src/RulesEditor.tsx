import { useCallback, useEffect, useState } from 'react'
import type { RuleChange } from '../../core/rules/apply'
import type { Action, Condition, Rule, RuleInput, TextField, TextOp } from '../../core/rules/types'
import { formatCents, parseAmountToCents } from '../../core/money'
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Eye,
  Pencil,
  Plus,
  Power,
  PowerOff,
  Trash2,
  Wand2,
} from 'lucide-react'
import { CategoryBadge } from './CategoryBadge'
import { CategorySelect } from './CategorySelect'
import { PageActions } from './PageActions'
import type { LedgerState } from './useLedger'
import { ActionMenu, Dialog, Empty, useAlert, useConfirm } from './ui'

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
    return `${c.field === 'description' ? 'Description' : 'Payee'} ${op[c.op]} "${c.value}"`
  }
  if (c.type === 'account') {
    return `Account is ${accounts.find((a) => a.id === c.accountId)?.name ?? '?'}`
  }
  const parts = [
    c.direction === 'expense' ? 'Expense' : c.direction === 'income' ? 'Income' : 'Amount',
  ]
  if (c.min !== undefined) parts.push(`at least ${formatCents(c.min)}`)
  if (c.max !== undefined) parts.push(`at most ${formatCents(c.max)}`)
  return parts.join(' ')
}

function describeAction(a: Action, categories: LedgerState['categories']): string {
  if (a.type === 'setPayee') return `Payee "${a.payee}"`
  if (a.type === 'addTags') return `Tags ${a.tags.join(', ')}`
  return `Category ${categories.find((c) => c.id === a.categoryId)?.name ?? '(deleted)'}`
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
  const [editing, setEditing] = useState<{
    id: number | null
    form: FormState
    suggested?: boolean
  } | null>(null)
  const [preview, setPreview] = useState<RuleChange[] | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const confirm = useConfirm()
  const alert = useAlert()

  const load = useCallback(() => {
    void window.api.rules.listRules().then(setRules)
  }, [])
  useEffect(load, [load])

  useEffect(() => {
    if (!draft) return
    const form = toForm(draft)
    if (form) {
      setFormError(null)
      setEditing({ id: null, form, suggested: true })
    }
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
      return setFormError(messageOf(e))
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

  async function edit(r: Rule) {
    const form = toForm(r)
    if (!form) {
      await alert(
        'This rule has several conditions of one kind and cannot be edited here.',
        'Cannot edit this rule',
      )
      return
    }
    setFormError(null)
    setEditing({ id: r.id, form })
  }

  async function remove(r: Rule, n: number) {
    const ok = await confirm(
      `Delete ${r.name ? `"${r.name}"` : `rule ${n}`}? Transactions it already changed stay as they are.`,
      { title: 'Delete rule', confirmLabel: 'Delete', danger: true },
    )
    if (!ok) return
    setPreview(null)
    await run(() => window.api.rules.deleteRule(r.id))
    load()
  }

  async function applyAll() {
    if (!preview) return
    const n = preview.length
    const ok = await confirm(
      `Apply your rules to ${n} transaction${n === 1 ? '' : 's'}? Fields you edited by hand are kept.`,
      { title: 'Apply rules', confirmLabel: 'Apply' },
    )
    if (!ok) return
    if (await run(() => window.api.rules.applyRules())) setPreview(null)
  }

  const category = (id: number) => categories.find((c) => c.id === id)

  return (
    <section aria-label="Rules">
      <h2>Rules</h2>
      <PageActions>
        <button
          type="button"
          disabled={rules.length === 0}
          onClick={() => void run(async () => setPreview(await window.api.rules.previewRules()))}
        >
          <Eye size={15} />
          Preview on existing transactions
        </button>
        <button
          type="button"
          className="primary"
          onClick={() => {
            setFormError(null)
            setEditing({ id: null, form: blank() })
          }}
        >
          <Plus size={16} />
          New rule
        </button>
      </PageActions>
      <p className="section-intro">
        The first matching rule wins. Rules never change a payee, category or tag you edited by
        hand, and they skip transfers.
      </p>

      {preview && (
        <div className="card" aria-label="Rule preview">
          <div className="card-header">
            <h3>
              {preview.length} transaction{preview.length === 1 ? '' : 's'} would change
            </h3>
            <div className="page-actions">
              <button type="button" onClick={() => setPreview(null)}>
                Close preview
              </button>
              {preview.length > 0 && (
                <button type="button" className="primary" onClick={() => void applyAll()}>
                  <Check size={15} />
                  Apply to {preview.length}
                </button>
              )}
            </div>
          </div>
          {preview.length === 0 ? (
            <Empty title="Nothing to change">Your transactions already match your rules.</Empty>
          ) : (
            <div className="table-wrap">
              <table className="preview-table">
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
                      <td className="nowrap">{c.date}</td>
                      <td>{c.rawDescription}</td>
                      <td>{c.ruleName || `#${c.ruleId}`}</td>
                      <td>
                        <div className="chips">
                          {c.changes.payee !== undefined && (
                            <span className="chip">
                              <span className="muted">{c.before.payee || 'No payee'}</span>
                              <ArrowRight size={12} />
                              {c.changes.payee}
                            </span>
                          )}
                          {c.newCategoryName !== undefined && (
                            <span className="chip">
                              <span className="muted">{c.before.categoryName}</span>
                              <ArrowRight size={12} />
                              <CategoryBadge name={c.newCategoryName} size="sm" showName />
                            </span>
                          )}
                          {c.changes.addTags?.map((t) => (
                            <span key={t} className="tag">
                              +{t}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {preview.length > 200 && <p className="subtle">Showing the first 200.</p>}
        </div>
      )}

      <div className="card flush">
        <div className="card-header">
          <h3>Your rules</h3>
          <span className="subtle">
            {rules.length} rule{rules.length === 1 ? '' : 's'}, checked top to bottom
          </span>
        </div>
        {rules.length === 0 ? (
          <Empty icon={<Wand2 size={28} />} title="No rules yet">
            Rules set the payee, category and tags of new transactions for you.
          </Empty>
        ) : (
          <ol className="rule-list">
            {rules.map((r, i) => (
              <li
                key={r.id}
                className={r.enabled ? 'rule-item' : 'rule-item off'}
                aria-label={r.name || `Rule ${i + 1}`}
              >
                <span className="rule-order">{i + 1}</span>
                <div className="rule-body">
                  <div className="rule-title">
                    <strong>{r.name || <span className="muted">Unnamed rule</span>}</strong>
                    {!r.enabled && <span className="pill">Off</span>}
                  </div>
                  <div className="chips">
                    <span className="chip-label">When</span>
                    {r.conditions.length === 0 && <span className="chip">any transaction</span>}
                    {r.conditions.map((c, k) => (
                      <span key={k} className="chip">
                        {describeCondition(c, accounts)}
                      </span>
                    ))}
                    <span className="chip-label">then</span>
                    {r.actions.map((a, k) =>
                      a.type === 'setCategory' ? (
                        <span key={k} className="chip">
                          {category(a.categoryId) ? (
                            <CategoryBadge id={a.categoryId} size="sm" showName />
                          ) : (
                            'category (deleted)'
                          )}
                        </span>
                      ) : (
                        <span key={k} className="chip">
                          {describeAction(a, categories)}
                        </span>
                      ),
                    )}
                  </div>
                </div>
                <div className="rule-actions">
                  <button
                    type="button"
                    className="ghost icon small"
                    aria-label={`Move rule ${i + 1} up`}
                    title="Move up"
                    disabled={i === 0}
                    onClick={() => void move(i, -1)}
                  >
                    <ChevronUp size={16} />
                  </button>
                  <button
                    type="button"
                    className="ghost icon small"
                    aria-label={`Move rule ${i + 1} down`}
                    title="Move down"
                    disabled={i === rules.length - 1}
                    onClick={() => void move(i, 1)}
                  >
                    <ChevronDown size={16} />
                  </button>
                  <ActionMenu
                    label={`Actions for rule ${i + 1}`}
                    actions={[
                      {
                        label: 'Edit',
                        icon: <Pencil size={14} />,
                        onSelect: () => void edit(r),
                      },
                      {
                        label: r.enabled ? 'Turn off' : 'Turn on',
                        icon: r.enabled ? <PowerOff size={14} /> : <Power size={14} />,
                        onSelect: () =>
                          void run(() => window.api.rules.setRuleEnabled(r.id, !r.enabled)).then(
                            load,
                          ),
                      },
                      {
                        label: 'Delete',
                        icon: <Trash2 size={14} />,
                        danger: true,
                        separatorBefore: true,
                        onSelect: () => void remove(r, i + 1),
                      },
                    ]}
                  />
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      <Dialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        wide
        persistent
        title={
          editing?.id != null
            ? 'Edit rule'
            : editing?.suggested
              ? 'New rule from your edit'
              : 'New rule'
        }
        description={
          editing?.suggested
            ? 'Check the suggestion, then save it to apply it to future transactions.'
            : 'Leave a field empty to ignore it.'
        }
      >
        {editing && (
          <form
            className="rule-form"
            aria-label="Rule editor"
            onSubmit={(e) => {
              e.preventDefault()
              void save()
            }}
          >
            <div className="form-grid">
              <label className="field">
                Name
                <input
                  value={editing.form.name}
                  placeholder="For example Spotify"
                  autoFocus
                  onChange={(e) => set('name', e.target.value)}
                />
              </label>
              <label className="check rule-enabled">
                <input
                  type="checkbox"
                  checked={editing.form.enabled}
                  onChange={(e) => set('enabled', e.target.checked)}
                />
                Rule is on
              </label>
            </div>

            <fieldset className="rule-section">
              <legend>When a transaction</legend>
              <div className="rule-text-row">
                <label className="field">
                  Match on
                  <select
                    value={editing.form.textField}
                    onChange={(e) => set('textField', e.target.value as TextField)}
                  >
                    <option value="description">Bank description</option>
                    <option value="payee">Payee</option>
                  </select>
                </label>
                <label className="field">
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
                <label className="field">
                  Text
                  <input
                    value={editing.form.textValue}
                    placeholder="spotify"
                    onChange={(e) => set('textValue', e.target.value)}
                  />
                </label>
              </div>
              <div className="rule-amount-row">
                <label className="field">
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
                <label className="field">
                  Amount at least
                  <input
                    value={editing.form.min}
                    inputMode="decimal"
                    placeholder="0.00"
                    onChange={(e) => set('min', e.target.value)}
                  />
                </label>
                <label className="field">
                  Amount at most
                  <input
                    value={editing.form.max}
                    inputMode="decimal"
                    placeholder="0.00"
                    onChange={(e) => set('max', e.target.value)}
                  />
                </label>
                <label className="field">
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
              </div>
            </fieldset>

            <fieldset className="rule-section">
              <legend>Then</legend>
              <div className="rule-text-row">
                <label className="field">
                  Set payee
                  <input
                    value={editing.form.payee}
                    placeholder="Keep as is"
                    onChange={(e) => set('payee', e.target.value)}
                  />
                </label>
                <label className="field">
                  Set category
                  <CategorySelect
                    aria-label="Category"
                    anyLabel="Do not set"
                    categories={categories}
                    value={editing.form.categoryId}
                    onChange={(id) => set('categoryId', id)}
                  />
                </label>
                <label className="field">
                  Add tags (comma separated)
                  <input
                    value={editing.form.tags}
                    placeholder="subscription, music"
                    onChange={(e) => set('tags', e.target.value)}
                  />
                </label>
              </div>
            </fieldset>

            {formError && (
              <div className="error" role="alert">
                {formError}
              </div>
            )}
            <div className="dialog-actions">
              <button type="button" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button type="submit">Save rule</button>
            </div>
          </form>
        )}
      </Dialog>
    </section>
  )
}

/** Electron wraps IPC errors as "Error invoking remote method '...': Error: <message>". */
function messageOf(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  return msg.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}
