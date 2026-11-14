import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  Scale,
  SlidersHorizontal,
} from 'lucide-react'
import { useEffect, useState } from 'react'
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
  onReviewUncategorized,
}: {
  version: number
  accounts: AccountWithBalance[]
  onOpenCategory: (categoryId: number, from: string, to: string) => void
  onReviewUncategorized: () => void
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
            />
          )}
          {show('spending') && (
            <StatTile
              label="Spending"
              value={formatCents(summary.spending)}
              icon={<ArrowUpRight size={16} />}
              iconTone="neg"
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
        {show('trend') && (
          <div className="card">
            <div className="card-header">
              <h3>Last six months</h3>
            </div>
            <TrendChart
              data={data.trend.map((t) => ({ key: t.month, label: monthName(t.month), ...t }))}
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
