import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  Scale,
  SlidersHorizontal,
  Target,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import type { BudgetMonth } from '../../core/budgets/budgets'
import type { AccountWithBalance } from '../../core/ledger/accounts'
import { formatCents } from '../../core/money'
import type { Dashboard as DashboardData } from '../../core/reports/dashboard'
import { DASHBOARD_WIDGETS, type DashboardWidgetId } from '../../core/reports/widgets'
import { Bar, percent, TrendChart } from './Bars'
import { CategoryIcon, useCategoryLookup } from './CategoryBadge'
import { PageActions } from './PageActions'
import { Empty, PayeeAvatar, StatTile } from './ui'

const todayIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const monthName = (ym: string) =>
  new Date(`${ym}-01T00:00:00`).toLocaleString('en-CA', { month: 'short' })

const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleString('en-CA', { month: 'short', day: 'numeric' })

export function Dashboard({
  version,
  accounts,
  onOpenCategory,
  onOpenRange,
  onReviewUncategorized,
  onOpenBudgets,
}: {
  version: number
  accounts: AccountWithBalance[]
  onOpenCategory: (categoryId: number, from: string, to: string) => void
  onOpenRange: (from: string, to: string, direction?: 'expense' | 'income') => void
  onReviewUncategorized: () => void
  onOpenBudgets: () => void
}) {
  const [data, setData] = useState<DashboardData | null>(null)
  const [shown, setShown] = useState<DashboardWidgetId[] | null>(null)
  const [customizing, setCustomizing] = useState(false)
  const category = useCategoryLookup()

  useEffect(() => {
    void window.api.reports.getDashboardWidgets().then(setShown)
  }, [])

  const toggle = (id: DashboardWidgetId) => {
    if (!shown) return
    const next = shown.includes(id) ? shown.filter((x) => x !== id) : [...shown, id]
    setShown(next)
    void window.api.reports.setDashboardWidgets(next).then(setShown)
  }

  useEffect(() => {
    let stale = false
    void window.api.reports.dashboard(todayIso()).then((d) => {
      if (!stale) setData(d)
    })
    return () => {
      stale = true
    }
  }, [version])

  const [budgets, setBudgets] = useState<BudgetMonth | null>(null)
  const wantBudgets = shown?.includes('budgets') ?? false
  useEffect(() => {
    if (!wantBudgets) return
    let stale = false
    const now = new Date()
    void window.api.budgets.getBudgetMonth(now.getFullYear(), now.getMonth() + 1).then((b) => {
      if (!stale) setBudgets(b)
    })
    return () => {
      stale = true
    }
  }, [version, wantBudgets])

  if (!data || !shown) return <p className="muted">Loading</p>
  const show = (id: DashboardWidgetId) => shown.includes(id)
  const { summary, previousSpending, period } = data
  const delta = summary.spending - previousSpending
  const maxCategory = Math.max(1, ...data.topCategories.map((c) => c.total))
  const accountName = (id: number) => accounts.find((a) => a.id === id)?.name ?? ''

  return (
    <section aria-label="Dashboard" className="dashboard">
      <PageActions>
        <button
          type="button"
          aria-expanded={customizing}
          onClick={() => setCustomizing(!customizing)}
        >
          {customizing ? <Check size={15} /> : <SlidersHorizontal size={15} />}
          {customizing ? 'Done' : 'Customize'}
        </button>
      </PageActions>
      {customizing && (
        <fieldset className="dash-customize card">
          <legend>Show on the dashboard</legend>
          {DASHBOARD_WIDGETS.map((w) => (
            <label key={w.id}>
              <input type="checkbox" checked={show(w.id)} onChange={() => toggle(w.id)} /> {w.label}
            </label>
          ))}
        </fieldset>
      )}

      {show('review') && data.uncategorizedCount > 0 && (
        <div className="banner" role="status">
          <AlertCircle size={18} />
          <span className="grow">
            <strong>
              {data.uncategorizedCount} uncategorized transaction
              {data.uncategorizedCount === 1 ? '' : 's'}
            </strong>{' '}
            <span className="muted">need a category.</span>
          </span>
          <button type="button" className="small" onClick={onReviewUncategorized}>
            Review
          </button>
        </div>
      )}

      {(show('income') || show('spending') || show('net')) && (
        <div className="stat-row">
          {show('income') && (
            <StatTile
              label="Income"
              value={formatCents(summary.income)}
              icon={<ArrowDownLeft size={16} />}
              iconTone="pos"
              note="This month"
              onClick={() => onOpenRange(period.from, period.to, 'income')}
            />
          )}
          {show('spending') && (
            <StatTile
              label="Spending"
              value={formatCents(summary.spending)}
              icon={<ArrowUpRight size={16} />}
              iconTone="neg"
              onClick={() => onOpenRange(period.from, period.to, 'expense')}
              note={
                previousSpending === 0 && summary.spending === 0
                  ? 'Nothing yet'
                  : `${delta > 0 ? '+' : delta < 0 ? '-' : ''}${formatCents(Math.abs(delta))} vs last month so far`
              }
            />
          )}
          {show('net') && (
            <StatTile
              label="Net"
              value={formatCents(summary.net)}
              tone={summary.net < 0 ? 'neg' : 'pos'}
              icon={<Scale size={16} />}
              iconTone="accent"
              onClick={() => onOpenRange(period.from, period.to)}
              note={
                summary.savingsRate === null
                  ? 'No income yet'
                  : `Savings rate ${percent(summary.savingsRate)}`
              }
            />
          )}
        </div>
      )}

      <div className="dash-grid">
        {show('topCategories') && (
          <div className="card">
            <div className="card-header">
              <h3>Top categories</h3>
              <span className="subtle">{formatCents(summary.spending)} spent</span>
            </div>
            {data.topCategories.length === 0 ? (
              <Empty title="No spending this month" />
            ) : (
              <ul className="meter-list">
                {data.topCategories.map((c) => {
                  const cat = category(c.categoryId)
                  return (
                    <li key={c.categoryId}>
                      <button
                        type="button"
                        className="meter"
                        onClick={() => onOpenCategory(c.categoryId, period.from, period.to)}
                      >
                        <CategoryIcon color={cat?.color} icon={cat?.icon} />
                        <span className="meter-name">{c.name}</span>
                        <span className="meter-value">{formatCents(c.total)}</span>
                        <Bar fraction={c.total / maxCategory} color={cat?.color} />
                        <span className="meter-share">{percent(c.share)}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}
        {show('budgets') && budgets && <BudgetsWidget data={budgets} onOpen={onOpenBudgets} />}
        {show('trend') && (
          <div className="card">
            <div className="card-header">
              <h3>Last six months</h3>
            </div>
            <TrendChart
              data={data.trend.map((t) => ({ key: t.month, label: monthName(t.month), ...t }))}
              onSelect={(month) => {
                const [y, m] = month.split('-').map(Number) as [number, number]
                const last = new Date(y, m, 0).getDate()
                onOpenRange(`${month}-01`, `${month}-${String(last).padStart(2, '0')}`)
              }}
            />
          </div>
        )}
        {show('biggest') && (
          <div className="card">
            <div className="card-header">
              <h3>Biggest this month</h3>
            </div>
            {data.biggest.length === 0 ? (
              <Empty title="No transactions yet" />
            ) : (
              <table>
                <tbody>
                  {data.biggest.map((t) => (
                    <tr key={t.id}>
                      <td>
                        <div className="txn-cell">
                          <PayeeAvatar name={t.payee} />
                          <div>
                            {t.payee || 'No payee'}
                            <span className="sub">
                              {shortDate(t.date)} · {accountName(t.accountId)}
                              {t.excludeFromBudgets ? ' · hidden from budgets' : ''}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="num">{formatCents(t.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
      {shown.length === 0 && (
        <Empty title="Your dashboard is empty">Use Customize to choose what to show.</Empty>
      )}
    </section>
  )
}

/** Budgets for the current month, the ones closest to their limit first. */
function BudgetsWidget({ data, onOpen }: { data: BudgetMonth; onOpen: () => void }) {
  const category = useCategoryLookup()
  const share = (spent: number, budget: number) => (budget > 0 ? spent / budget : 0)
  const rows = [...data.rows]
    .sort((x, y) => share(y.spent, y.budget) - share(x.spent, x.budget))
    .slice(0, 5)
  const over = data.rows.filter((r) => r.spent > r.budget).length
  const remaining = data.totalBudget - data.totalSpent
  return (
    <div className="card">
      <div className="card-header">
        <h3>Budgets</h3>
        <button type="button" className="link" onClick={onOpen}>
          {data.rows.length === 0 ? 'Set up' : 'See all'}
        </button>
      </div>
      {data.rows.length === 0 ? (
        <Empty icon={<Target size={26} />} title="No budgets yet">
          Set a monthly target for a category to see how you are tracking.
        </Empty>
      ) : (
        <>
          <div className="budget-summary">
            <div>
              <strong>{formatCents(data.totalSpent)}</strong>
              <span className="muted"> of {formatCents(data.totalBudget)}</span>
            </div>
            <span className={remaining < 0 ? 'neg' : 'muted'}>
              {remaining < 0 ? `${formatCents(-remaining)} over` : `${formatCents(remaining)} left`}
              {over > 0 && ` · ${over} over budget`}
            </span>
          </div>
          <Bar
            fraction={share(data.totalSpent, data.totalBudget)}
            tone="pos"
            color={remaining < 0 ? 'var(--neg)' : undefined}
          />
          <ul className="meter-list budget-widget">
            {rows.map((r) => {
              const cat = category(r.categoryId)
              const f = share(r.spent, r.budget)
              return (
                <li key={r.categoryId} className="meter">
                  <CategoryIcon color={cat?.color} icon={cat?.icon} />
                  <span className="meter-name">{r.categoryName}</span>
                  <span className="meter-value">
                    {formatCents(r.spent)}
                    <span className="subtle"> / {formatCents(r.budget)}</span>
                  </span>
                  <Bar
                    fraction={f}
                    tone={f >= 0.85 ? 'warn' : 'pos'}
                    color={r.spent > r.budget ? 'var(--neg)' : undefined}
                  />
                  <span className={r.spent > r.budget ? 'meter-share neg' : 'meter-share'}>
                    {percent(Math.max(0, f))}
                  </span>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}
