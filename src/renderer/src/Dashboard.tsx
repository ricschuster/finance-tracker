import { useEffect, useState } from 'react'
import { formatCents } from '../../core/money'
import type { Dashboard as DashboardData } from '../../core/reports/dashboard'
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

  useEffect(() => {
    let stale = false
    void window.api.reports.dashboard(todayIso()).then((d) => {
      if (!stale) setData(d)
    })
    return () => {
      stale = true
    }
  }, [version])

  if (!data) return <p className="muted">Loading</p>
  const { summary, previousSpending, period } = data
  const delta = summary.spending - previousSpending
  const maxTrend = Math.max(1, ...data.trend.flatMap((t) => [t.income, t.spending]))
  const monthLabel = new Date(`${period.from}T00:00:00`).toLocaleString('en-CA', {
    month: 'long',
    year: 'numeric',
  })

  return (
    <section aria-label="Dashboard" className="dashboard">
      <h2>{monthLabel}</h2>
      <div className="stat-row">
        <div className="stat">
          <span className="muted">Income</span>
          <strong className="pos">{formatCents(summary.income)}</strong>
        </div>
        <div className="stat">
          <span className="muted">Spending</span>
          <strong>{formatCents(summary.spending)}</strong>
          <span className="muted">
            {previousSpending === 0 && summary.spending === 0
              ? 'Nothing yet'
              : `${delta > 0 ? '+' : delta < 0 ? '-' : ''}${formatCents(Math.abs(delta))} vs last month so far`}
          </span>
        </div>
        <div className="stat">
          <span className="muted">Net</span>
          <strong className={summary.net < 0 ? 'neg' : 'pos'}>{formatCents(summary.net)}</strong>
          <span className="muted">
            {summary.savingsRate === null
              ? 'No income yet'
              : `Savings rate ${percent(summary.savingsRate)}`}
          </span>
        </div>
      </div>

      {data.uncategorizedCount > 0 && (
        <p className="notice">
          {data.uncategorizedCount} uncategorized transaction
          {data.uncategorizedCount === 1 ? '' : 's'}.{' '}
          <button type="button" onClick={onReviewUncategorized}>
            Review
          </button>
        </p>
      )}

      <div className="dash-grid">
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
      </div>

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
    </section>
  )
}
