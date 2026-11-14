import { useEffect, useState } from 'react'
import { CategoryBadge } from './CategoryBadge'
import { formatCents } from '../../core/money'
import type { AccountWithBalance } from '../../core/ledger/accounts'
import { monthPeriod, quarterPeriod, yearPeriod, type Period } from '../../core/reports/period'
import type {
  BigTransaction,
  CategorySpend,
  IncomeVsExpenses,
  PayeeTotal,
  TrendPoint,
} from '../../core/reports/queries'
import { Bar, percent } from './Bars'

type Kind = 'month' | 'quarter' | 'year' | 'custom'

const now = new Date()

interface Loaded {
  summary: IncomeVsExpenses
  categories: CategorySpend[]
  trend: TrendPoint[]
  payees: PayeeTotal[]
  biggest: BigTransaction[]
}

export function Reports({
  accounts,
  version,
  onOpenCategory,
}: {
  accounts: AccountWithBalance[]
  version: number
  onOpenCategory: (categoryId: number, from: string, to: string) => void
}) {
  const [kind, setKind] = useState<Kind>('month')
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [quarter, setQuarter] = useState(Math.floor(now.getMonth() / 3) + 1)
  const [custom, setCustom] = useState<Period>({
    from: `${now.getFullYear()}-01-01`,
    to: `${now.getFullYear()}-12-31`,
  })
  const [accountId, setAccountId] = useState(0)
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set())
  const [data, setData] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)

  const period: Period | null =
    kind === 'month'
      ? monthPeriod(year, month)
      : kind === 'quarter'
        ? quarterPeriod(year, quarter)
        : kind === 'year'
          ? yearPeriod(year)
          : custom.from && custom.to && custom.from <= custom.to
            ? custom
            : null

  const from = period?.from
  const to = period?.to
  useEffect(() => {
    if (!from || !to) return
    const p = { from, to }
    const f = accountId ? { accountIds: [accountId] } : {}
    let stale = false
    const { reports } = window.api
    void Promise.all([
      reports.incomeVsExpenses(p, f),
      reports.spendingByCategory(p, f),
      // The trend always shows whole months, so a custom range still lines up with the bars.
      reports.monthlyTrend(p, f),
      reports.topPayees(p, 10, f),
      reports.biggestTransactions(p, 10, f),
    ])
      .then(([summary, categories, trend, payees, biggest]) => {
        if (stale) return
        setError(null)
        setData({ summary, categories, trend, payees, biggest })
      })
      .catch((e: unknown) => {
        if (!stale) setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      stale = true
    }
  }, [from, to, accountId, version])

  const maxTrend = Math.max(1, ...(data?.trend ?? []).flatMap((t) => [t.income, t.spending]))

  return (
    <section aria-label="Reports">
      <div className="mapper">
        <label>
          Period
          <select value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
            <option value="month">Month</option>
            <option value="quarter">Quarter</option>
            <option value="year">Year</option>
            <option value="custom">Custom</option>
          </select>
        </label>
        {kind !== 'custom' && (
          <label>
            Year
            <input
              type="number"
              value={year}
              min={1970}
              max={2999}
              onChange={(e) => setYear(Number(e.target.value) || year)}
            />
          </label>
        )}
        {kind === 'month' && (
          <label>
            Month
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i} value={i + 1}>
                  {new Date(2000, i, 1).toLocaleString('en-CA', { month: 'long' })}
                </option>
              ))}
            </select>
          </label>
        )}
        {kind === 'quarter' && (
          <label>
            Quarter
            <select value={quarter} onChange={(e) => setQuarter(Number(e.target.value))}>
              {[1, 2, 3, 4].map((q) => (
                <option key={q} value={q}>
                  Q{q}
                </option>
              ))}
            </select>
          </label>
        )}
        {kind === 'custom' && (
          <>
            <label>
              From
              <input
                type="date"
                value={custom.from}
                onChange={(e) => setCustom({ ...custom, from: e.target.value })}
              />
            </label>
            <label>
              To
              <input
                type="date"
                value={custom.to}
                onChange={(e) => setCustom({ ...custom, to: e.target.value })}
              />
            </label>
          </>
        )}
        <label>
          Account
          <select value={accountId} onChange={(e) => setAccountId(Number(e.target.value))}>
            <option value={0}>All accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!period && <p className="error">Pick a start date that is not after the end date.</p>}
      {error && <p className="error">{error}</p>}
      {period && data && (
        <>
          <p className="muted">
            {period.from} to {period.to}. Transfers are not counted.
          </p>
          <div className="stat-row">
            <div className="stat">
              <span className="muted">Income</span>
              <strong className="pos">{formatCents(data.summary.income)}</strong>
            </div>
            <div className="stat">
              <span className="muted">Spending</span>
              <strong>{formatCents(data.summary.spending)}</strong>
            </div>
            <div className="stat">
              <span className="muted">Net</span>
              <strong className={data.summary.net < 0 ? 'neg' : 'pos'}>
                {formatCents(data.summary.net)}
              </strong>
              <span className="muted">
                {data.summary.savingsRate === null
                  ? 'No income'
                  : `Savings rate ${percent(data.summary.savingsRate)}`}
              </span>
            </div>
          </div>

          <h3>Spending by category</h3>
          {data.categories.length === 0 ? (
            <p className="muted">No spending in this period.</p>
          ) : (
            <table>
              <tbody>
                {data.categories.map((c) => (
                  <CategoryRows
                    key={c.categoryId}
                    c={c}
                    expanded={open.has(c.categoryId)}
                    onToggle={() =>
                      setOpen((prev) => {
                        const next = new Set(prev)
                        if (!next.delete(c.categoryId)) next.add(c.categoryId)
                        return next
                      })
                    }
                    onOpen={(id) => onOpenCategory(id, period.from, period.to)}
                  />
                ))}
              </tbody>
            </table>
          )}

          <h3>Income and spending by month</h3>
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th />
                <th className="num">Income</th>
                <th className="num">Spending</th>
                <th className="num">Net</th>
              </tr>
            </thead>
            <tbody>
              {data.trend.map((t) => (
                <tr key={t.month}>
                  <td>{t.month}</td>
                  <td>
                    <Bar fraction={t.income / maxTrend} tone="pos" />
                    <Bar fraction={t.spending / maxTrend} />
                  </td>
                  <td className="num">{formatCents(t.income)}</td>
                  <td className="num">{formatCents(t.spending)}</td>
                  <td className={`num ${t.net < 0 ? 'neg' : ''}`}>{formatCents(t.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="dash-grid">
            <div>
              <h3>Top payees</h3>
              {data.payees.length === 0 ? (
                <p className="muted">None.</p>
              ) : (
                <table>
                  <tbody>
                    {data.payees.map((p) => (
                      <tr key={p.payee}>
                        <td>{p.payee}</td>
                        <td className="num muted">{p.count}</td>
                        <td className="num">{formatCents(p.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div>
              <h3>Biggest transactions</h3>
              {data.biggest.length === 0 ? (
                <p className="muted">None.</p>
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
            </div>
          </div>
        </>
      )}
    </section>
  )
}

function CategoryRows({
  c,
  expanded,
  onToggle,
  onOpen,
}: {
  c: CategorySpend
  expanded: boolean
  onToggle: () => void
  onOpen: (categoryId: number) => void
}) {
  return (
    <>
      <tr>
        <td>
          {c.children.length > 0 && (
            <button
              type="button"
              className="link"
              aria-expanded={expanded}
              aria-label={`${expanded ? 'Collapse' : 'Expand'} ${c.name}`}
              onClick={onToggle}
            >
              {expanded ? '-' : '+'}
            </button>
          )}
        </td>
        <td>
          <button type="button" className="link" onClick={() => onOpen(c.categoryId)}>
            <CategoryBadge id={c.categoryId} showName />
          </button>
        </td>
        <td>
          <Bar fraction={c.share} />
        </td>
        <td className="num muted">{percent(c.share)}</td>
        <td className="num">{formatCents(c.total)}</td>
      </tr>
      {expanded &&
        c.children.map((k) => (
          <tr key={k.categoryId} className="child-row">
            <td />
            <td>
              <button type="button" className="link" onClick={() => onOpen(k.categoryId)}>
                {k.name}
              </button>
            </td>
            <td />
            <td className="num muted">{c.total > 0 ? percent(k.total / c.total) : ''}</td>
            <td className="num">{formatCents(k.total)}</td>
          </tr>
        ))}
    </>
  )
}
