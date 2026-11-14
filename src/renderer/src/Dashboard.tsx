import { useEffect, useState } from 'react'
import { formatCents } from '../../core/money'
import type { Dashboard as DashboardData } from '../../core/reports/dashboard'
import { DASHBOARD_WIDGETS, type DashboardWidgetId } from '../../core/reports/widgets'
import { Bar, percent } from './Bars'

const todayIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const monthName = (ym: string) =>
  new Date(`${ym}-01T00:00:00`).toLocaleString('en-CA', { month: 'short' })

export function Dashboard({
  version,
  onOpenCategory,
  onReviewUncategorized,
}: {
  version: number
  onOpenCategory: (categoryId: number, from: string, to: string) => void
  onReviewUncategorized: () => void
}) {
  const [data, setData] = useState<DashboardData | null>(null)
  const [shown, setShown] = useState<DashboardWidgetId[] | null>(null)
  const [customizing, setCustomizing] = useState(false)

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
  const maxTrend = Math.max(1, ...data.trend.flatMap((t) => [t.income, t.spending]))
  const monthLabel = new Date(`${period.from}T00:00:00`).toLocaleString('en-CA', {
    month: 'long',
    year: 'numeric',
  })

  return (
    <section aria-label="Dashboard" className="dashboard">
      <div className="dash-header">
        <h2>{monthLabel}</h2>
        <button
          type="button"
          aria-expanded={customizing}
          onClick={() => setCustomizing(!customizing)}
        >
          Customize
        </button>
      </div>
      {customizing && (
        <fieldset className="dash-customize">
          <legend>Show on the dashboard</legend>
          {DASHBOARD_WIDGETS.map((w) => (
            <label key={w.id}>
              <input type="checkbox" checked={show(w.id)} onChange={() => toggle(w.id)} /> {w.label}
            </label>
          ))}
        </fieldset>
      )}
      <div className="stat-row">
        {show('income') && (
          <div className="stat">
            <span className="muted">Income</span>
            <strong className="pos">{formatCents(summary.income)}</strong>
          </div>
        )}
        {show('spending') && (
          <div className="stat">
            <span className="muted">Spending</span>
            <strong>{formatCents(summary.spending)}</strong>
            <span className="muted">
              {previousSpending === 0 && summary.spending === 0
                ? 'Nothing yet'
                : `${delta > 0 ? '+' : delta < 0 ? '-' : ''}${formatCents(Math.abs(delta))} vs last month so far`}
            </span>
          </div>
        )}
        {show('net') && (
          <div className="stat">
            <span className="muted">Net</span>
            <strong className={summary.net < 0 ? 'neg' : 'pos'}>{formatCents(summary.net)}</strong>
            <span className="muted">
              {summary.savingsRate === null
                ? 'No income yet'
                : `Savings rate ${percent(summary.savingsRate)}`}
            </span>
          </div>
        )}
      </div>

      {show('review') && data.uncategorizedCount > 0 && (
        <p className="notice">
          {data.uncategorizedCount} uncategorized transaction
          {data.uncategorizedCount === 1 ? '' : 's'}.{' '}
          <button type="button" onClick={onReviewUncategorized}>
            Review
          </button>
        </p>
      )}

      <div className="dash-grid">
        {show('topCategories') && (
          <div>
            <h3>Top categories</h3>
            {data.topCategories.length === 0 ? (
              <p className="muted">No spending this month.</p>
            ) : (
              <table>
                <tbody>
                  {data.topCategories.map((c) => (
                    <tr key={c.categoryId}>
                      <td>
                        <button
                          type="button"
                          className="link"
                          onClick={() => onOpenCategory(c.categoryId, period.from, period.to)}
                        >
                          {c.name}
                        </button>
                      </td>
                      <td>
                        <Bar fraction={c.share} />
                      </td>
                      <td className="num">{formatCents(c.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
        {show('trend') && (
          <div>
            <h3>Last six months</h3>
            <table>
              <tbody>
                {data.trend.map((t) => (
                  <tr key={t.month}>
                    <td>{monthName(t.month)}</td>
                    <td>
                      <Bar fraction={t.income / maxTrend} tone="pos" />
                      <Bar fraction={t.spending / maxTrend} />
                    </td>
                    <td className={`num ${t.net < 0 ? 'neg' : ''}`}>{formatCents(t.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {show('biggest') && (
        <>
          <h3>Biggest this month</h3>
          {data.biggest.length === 0 ? (
            <p className="muted">None yet.</p>
          ) : (
            <table>
              <tbody>
                {data.biggest.map((t) => (
                  <tr key={t.id}>
                    <td>{t.date}</td>
                    <td>{t.payee || 'No payee'}</td>
                    <td className="num">{formatCents(t.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
      {shown.length === 0 && (
        <p className="muted">Nothing selected. Use Customize to choose what to show.</p>
      )}
    </section>
  )
}
