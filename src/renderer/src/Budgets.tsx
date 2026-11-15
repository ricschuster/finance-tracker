import {
  ChevronLeft,
  ChevronRight,
  PiggyBank,
  Pencil,
  Plus,
  Target,
  Trash2,
  TrendingDown,
  Wallet,
} from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { BudgetMonth, BudgetRow } from '../../core/budgets/budgets'
import { formatCents, parseAmountToCents } from '../../core/money'
import { Bar, percent } from './Bars'
import { CategoryIcon, useCategoryLookup } from './CategoryBadge'
import { PageActions } from './PageActions'
import { SpendingPie } from './SpendingPie'
import type { LedgerState } from './useLedger'
import { ActionMenu, Dialog, Empty, StatTile, useConfirm } from './ui'

/** Share of a budget past which a row is shown as close to the limit. */
const NEAR = 0.85

type Editing = { mode: 'add' } | { mode: 'edit'; row: BudgetRow }

/** The Cashflow page: monthly budgets against spending, plus a spending pie. See docs/design/12_budgets.md. */
export function Budgets({
  run,
  version,
  onOpenCategory,
}: Pick<LedgerState, 'run'> & {
  version: number
  onOpenCategory: (categoryId: number, from: string, to: string) => void
}) {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [data, setData] = useState<BudgetMonth | null>(null)
  const [editing, setEditing] = useState<Editing | null>(null)
  const [presetCategory, setPresetCategory] = useState(0)
  const category = useCategoryLookup()
  const confirm = useConfirm()

  const load = useCallback(async () => {
    setData(await window.api.budgets.getBudgetMonth(year, month))
  }, [year, month])

  useEffect(() => {
    void load()
  }, [load, version])

  function step(delta: number) {
    const d = new Date(year, month - 1 + delta, 1)
    setYear(d.getFullYear())
    setMonth(d.getMonth() + 1)
  }

  async function save(categoryId: number, cents: number): Promise<boolean> {
    const ok = await run(async () => window.api.budgets.setBudget(categoryId, cents))
    await load()
    return ok
  }

  async function remove(row: BudgetRow) {
    const ok = await confirm(
      `Stop budgeting ${row.categoryName}? Spending in it is kept; only the monthly target goes.`,
      { title: 'Remove budget', confirmLabel: 'Remove', danger: true },
    )
    if (ok) await save(row.categoryId, 0)
  }

  const isCurrent = year === today.getFullYear() && month === today.getMonth() + 1
  const label = new Date(year, month - 1, 1).toLocaleString('en-CA', {
    month: 'long',
    year: 'numeric',
  })
  const daysInMonth = new Date(year, month, 0).getDate()
  const daysLeft = isCurrent ? daysInMonth - today.getDate() + 1 : 0

  const header = (
    <PageActions>
      <div className="month-stepper" role="group" aria-label="Month">
        <button
          type="button"
          className="ghost icon small"
          onClick={() => step(-1)}
          aria-label="Previous month"
        >
          <ChevronLeft size={16} />
        </button>
        <strong aria-live="polite">{label}</strong>
        <button
          type="button"
          className="ghost icon small"
          onClick={() => step(1)}
          aria-label="Next month"
        >
          <ChevronRight size={16} />
        </button>
      </div>
      {!isCurrent && (
        <button
          type="button"
          onClick={() => {
            setYear(today.getFullYear())
            setMonth(today.getMonth() + 1)
          }}
        >
          This month
        </button>
      )}
      <button
        type="button"
        className="primary"
        disabled={!data || data.unbudgeted.length === 0}
        onClick={() => {
          setPresetCategory(0)
          setEditing({ mode: 'add' })
        }}
      >
        <Plus size={16} />
        Add budget
      </button>
    </PageActions>
  )

  if (!data) return header

  const remaining = data.totalBudget - data.totalSpent
  const overRows = data.rows.filter((r) => r.spent > r.budget)
  const unbudgetedSpending = data.unbudgeted.filter((u) => u.spent > 0)
  const spendingRows = [...data.rows, ...data.unbudgeted]
  const pieSlices = spendingRows
    .filter((r) => r.spent > 0)
    .map((r) => ({
      categoryId: r.categoryId,
      name: r.categoryName,
      amount: r.spent,
      color: category(r.categoryId)?.color,
    }))
    .sort((a, b) => b.amount - a.amount)
  const netRefunds = spendingRows.filter((r) => r.spent < 0)
  const monthFrom = `${year}-${String(month).padStart(2, '0')}-01`
  const monthTo = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`

  return (
    <section aria-label="Cashflow">
      <h2>Cashflow</h2>
      {header}

      {data.rows.length > 0 && (
        <div className="stat-row">
          <StatTile
            label="Budgeted"
            value={formatCents(data.totalBudget)}
            icon={<Target size={16} />}
            iconTone="accent"
            note={`${data.rows.length} categor${data.rows.length === 1 ? 'y' : 'ies'}`}
          />
          <StatTile
            label="Spent"
            value={formatCents(data.totalSpent)}
            icon={<TrendingDown size={16} />}
            iconTone="neg"
            note={
              data.totalBudget > 0
                ? `${percent(data.totalSpent / data.totalBudget)} of budget`
                : undefined
            }
          />
          <StatTile
            label={remaining < 0 ? 'Over budget' : 'Remaining'}
            value={formatCents(Math.abs(remaining))}
            tone={remaining < 0 ? 'neg' : 'pos'}
            icon={<Wallet size={16} />}
            iconTone={remaining < 0 ? 'neg' : 'pos'}
            note={
              overRows.length > 0
                ? `${overRows.length} categor${overRows.length === 1 ? 'y' : 'ies'} over`
                : isCurrent && remaining > 0
                  ? `${formatCents(Math.floor(remaining / daysLeft))} a day for ${daysLeft} day${daysLeft === 1 ? '' : 's'}`
                  : 'All within budget'
            }
          />
        </div>
      )}

      {(pieSlices.length > 0 || netRefunds.length > 0) && (
        <div className="card">
          <div className="card-header">
            <h3>Spending by category</h3>
            <span className="subtle">{label}</span>
          </div>
          {pieSlices.length > 0 ? (
            <SpendingPie
              slices={pieSlices}
              onSelect={(id) => onOpenCategory(id, monthFrom, monthTo)}
            />
          ) : (
            <p className="subtle">No spending this month.</p>
          )}
          {netRefunds.length > 0 && (
            <p className="subtle budget-note">
              Left out because refunds exceed spending:{' '}
              {netRefunds
                .map((r) => `${r.categoryName} (+${formatCents(-r.spent)} net refund)`)
                .join(', ')}
              .
            </p>
          )}
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <h3>Monthly budgets</h3>
          <span className="subtle">Repeats every month</span>
        </div>
        {data.rows.length === 0 ? (
          <Empty icon={<PiggyBank size={28} />} title="No budgets yet">
            Set a monthly target for a spending category to track it here.
          </Empty>
        ) : (
          <ul className="budget-list">
            {data.rows.map((r) => {
              const cat = category(r.categoryId)
              const share = r.budget > 0 ? r.spent / r.budget : 0
              const over = r.spent > r.budget
              const near = !over && share >= NEAR
              return (
                <li key={r.categoryId} className="budget-row" aria-label={r.categoryName}>
                  <CategoryIcon color={cat?.color} icon={cat?.icon} />
                  <div className="budget-main">
                    <div className="budget-line">
                      <span className="budget-name">{r.categoryName}</span>
                      {over && <span className="pill neg">Over budget</span>}
                      {near && <span className="pill warn">Almost there</span>}
                      <span className="spacer" />
                      <span className="budget-figures">
                        <strong className={r.spent < 0 ? 'pos' : undefined}>
                          {r.spent < 0
                            ? `+${formatCents(-r.spent)} net refund`
                            : formatCents(r.spent)}
                        </strong>
                        <span className="muted"> of {formatCents(r.budget)}</span>
                      </span>
                    </div>
                    <Bar
                      fraction={share}
                      tone={near ? 'warn' : 'pos'}
                      color={over ? 'var(--neg)' : undefined}
                    />
                    <div className="budget-line subtle">
                      <span>{percent(Math.max(0, share))} spent</span>
                      <span className="spacer" />
                      <span className={over ? 'neg' : undefined}>
                        {over
                          ? `${formatCents(-r.remaining)} over`
                          : `${formatCents(r.remaining)} left`}
                      </span>
                    </div>
                  </div>
                  <ActionMenu
                    label={`Actions for ${r.categoryName} budget`}
                    actions={[
                      {
                        label: 'Edit amount',
                        icon: <Pencil size={14} />,
                        onSelect: () => setEditing({ mode: 'edit', row: r }),
                      },
                      {
                        label: 'Remove budget',
                        icon: <Trash2 size={14} />,
                        danger: true,
                        separatorBefore: true,
                        onSelect: () => void remove(r),
                      },
                    ]}
                  />
                </li>
              )
            })}
          </ul>
        )}
        <p className="subtle budget-note">
          Transfers and transactions hidden from budgets are not counted; refunds reduce spending.
        </p>
      </div>

      {unbudgetedSpending.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h3>Spending without a budget</h3>
            <span className="subtle">{label}</span>
          </div>
          <table>
            <tbody>
              {unbudgetedSpending.map((u) => {
                const cat = category(u.categoryId)
                return (
                  <tr key={u.categoryId}>
                    <td>
                      <span className="category-badge">
                        <CategoryIcon color={cat?.color} icon={cat?.icon} size="sm" />
                        {u.categoryName}
                      </span>
                    </td>
                    <td className="num">{formatCents(u.spent)}</td>
                    <td className="actions" style={{ width: 1 }}>
                      <button
                        type="button"
                        className="small"
                        aria-label={`Set a budget for ${u.categoryName}`}
                        onClick={() => {
                          setPresetCategory(u.categoryId)
                          setEditing({ mode: 'add' })
                        }}
                      >
                        <Plus size={14} />
                        Budget
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing?.mode === 'edit' ? `Budget for ${editing.row.categoryName}` : 'Add budget'}
        description="A monthly spending target. It repeats every month until you change it."
      >
        {editing && (
          <BudgetForm
            key={editing.mode === 'edit' ? editing.row.categoryId : `add-${presetCategory}`}
            editing={editing}
            options={data.unbudgeted}
            presetCategory={presetCategory}
            onSave={async (categoryId, cents) => {
              if (await save(categoryId, cents)) setEditing(null)
            }}
            onCancel={() => setEditing(null)}
          />
        )}
      </Dialog>
    </section>
  )
}

function BudgetForm({
  editing,
  options,
  presetCategory,
  onSave,
  onCancel,
}: {
  editing: Editing
  options: BudgetMonth['unbudgeted']
  presetCategory: number
  onSave: (categoryId: number, cents: number) => Promise<void>
  onCancel: () => void
}) {
  const [categoryId, setCategoryId] = useState(
    editing.mode === 'edit' ? editing.row.categoryId : presetCategory,
  )
  const [amount, setAmount] = useState(
    editing.mode === 'edit' ? (editing.row.budget / 100).toFixed(2) : '',
  )
  const [error, setError] = useState<string | null>(null)
  const picked = options.find((o) => o.categoryId === categoryId)

  function submit(e: FormEvent) {
    e.preventDefault()
    let cents: number
    try {
      cents = parseAmountToCents(amount)
    } catch {
      setError('Enter an amount such as 400 or 400.00')
      return
    }
    if (cents <= 0) {
      setError('Enter an amount above zero. To stop budgeting, remove the budget instead.')
      return
    }
    void onSave(categoryId, cents)
  }

  return (
    <form className="stack" onSubmit={submit}>
      {editing.mode === 'add' && (
        <label className="field">
          Category
          <select
            aria-label="Category to budget"
            value={categoryId}
            onChange={(e) => setCategoryId(Number(e.target.value))}
          >
            <option value={0}>Choose a category</option>
            {options.map((u) => (
              <option key={u.categoryId} value={u.categoryId}>
                {u.categoryName}
              </option>
            ))}
          </select>
          {picked && (
            <span className="subtle">Spent {formatCents(picked.spent)} this month so far</span>
          )}
        </label>
      )}
      <label className="field">
        Monthly amount
        <input
          aria-label="Monthly budget amount"
          placeholder="400.00"
          inputMode="decimal"
          autoFocus
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value)
            setError(null)
          }}
        />
        {error && (
          <span className="neg" role="alert">
            {error}
          </span>
        )}
      </label>
      <div className="dialog-actions">
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" disabled={categoryId === 0 || amount.trim() === ''}>
          {editing.mode === 'edit' ? 'Save' : 'Add budget'}
        </button>
      </div>
    </form>
  )
}
