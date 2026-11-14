import { ArrowDownLeft, ArrowUpRight, CalendarRange, ChevronRight, Scale } from 'lucide-react'
import { useEffect, useState } from 'react'
import { CategoryBadge, useCategoryLookup } from './CategoryBadge'
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
import { Bar, percent, TrendChart } from './Bars'
import { displayDate } from './TransactionList'
import { Empty, PayeeAvatar, StatTile } from './ui'

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

  const accountName = (id: number) => accounts.find((a) => a.id === id)?.name ?? ''
  const rangeLabel = period ? `${displayDate(period.from)} to ${displayDate(period.to)}` : ''
  const maxCategory = Math.max(1, ...(data?.categories ?? []).map((c) => c.total))

  return (
    <section aria-label="Reports">
      <div className="card filter-bar">
        <label className="field">
          Period
          <select value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
            <option value="month">Month</option>
            <option value="quarter">Quarter</option>
            <option value="year">Year</option>
            <option value="custom">Custom</option>
          </select>
        </label>
        {kind !== 'custom' && (
          <label className="field">
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
          <label className="field">
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
          <label className="field">
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
            <label className="field">
              From
              <input
                type="date"
                value={custom.from}
                onChange={(e) => setCustom({ ...custom, from: e.target.value })}
              />
            </label>
            <label className="field">
              To
              <input
                type="date"
                value={custom.to}
                onChange={(e) => setCustom({ ...custom, to: e.target.value })}
              />
            </label>
          </>
        )}
        <label className="field">
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
        <span className="spacer" />
        {period && (
          <span className="subtle range">
            <CalendarRange size={14} aria-hidden="true" />
            {rangeLabel} · transfers not counted
          </span>
        )}
      </div>

      {!period && <p className="error">Pick a start date that is not after the end date.</p>}
      {error && <p className="error">{error}</p>}
      {period && data && (
        <>
          <div className="stat-row">
            <StatTile
              label="Income"
              value={formatCents(data.summary.income)}
              icon={<ArrowDownLeft size={16} />}
              iconTone="pos"
            />
            <StatTile
              label="Spending"
              value={formatCents(data.summary.spending)}
              icon={<ArrowUpRight size={16} />}
              iconTone="neg"
            />
            <StatTile
              label="Net"
              value={formatCents(data.summary.net)}
              tone={data.summary.net < 0 ? 'neg' : 'pos'}
              icon={<Scale size={16} />}
              iconTone="accent"
              note={
                data.summary.savingsRate === null
                  ? 'No income'
                  : `Savings rate ${percent(data.summary.savingsRate)}`
              }
            />
          </div>

          <div className="card">
            <div className="card-header">
              <h3>Spending by category</h3>
              <span className="subtle">Select a category to see its transactions</span>
            </div>
            {data.categories.length === 0 ? (
              <Empty title="No spending in this period" />
            ) : (
              <table className="category-report">
                <tbody>
                  {data.categories.map((c) => (
                    <CategoryRows
                      key={c.categoryId}
                      c={c}
                      max={maxCategory}
                      nested={data.categories.some((x) => x.children.length > 0)}
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
          </div>

          <div className="card">
            <div className="card-header">
              <h3>Income and spending by month</h3>
            </div>
            {data.trend.length > 1 && (
              <div style={{ marginBottom: 20 }}>
                <TrendChart
                  data={data.trend.map((t) => ({
                    key: t.month,
                    label: new Date(`${t.month}-01T00:00:00`).toLocaleString('en-CA', {
                      month: 'short',
                      ...(data.trend.length > 12 ? { year: '2-digit' } : {}),
                    }),
                    ...t,
                  }))}
                />
              </div>
            )}
            <table>
              <thead>
                <tr>
                  <th>Month</th>
                  <th className="num">Income</th>
                  <th className="num">Spending</th>
                  <th className="num">Net</th>
                </tr>
              </thead>
              <tbody>
                {data.trend.map((t) => (
                  <tr key={t.month}>
                    <td>
                      {new Date(`${t.month}-01T00:00:00`).toLocaleString('en-CA', {
                        month: 'long',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="num">{formatCents(t.income)}</td>
                    <td className="num">{formatCents(t.spending)}</td>
                    <td className={`num ${t.net < 0 ? 'neg' : 'pos'}`}>{formatCents(t.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="dash-grid">
            <div className="card">
              <div className="card-header">
                <h3>Top payees</h3>
              </div>
              {data.payees.length === 0 ? (
                <Empty title="No payees" />
              ) : (
                <table>
                  <tbody>
                    {data.payees.map((p) => (
                      <tr key={p.payee}>
                        <td>
                          <div className="txn-cell">
                            <PayeeAvatar name={p.payee} />
                            <div title={p.payee}>
                              {p.payee}
                              <span className="sub">
                                {p.count} transaction{p.count === 1 ? '' : 's'}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="num">{formatCents(p.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="card">
              <div className="card-header">
                <h3>Biggest transactions</h3>
              </div>
              {data.biggest.length === 0 ? (
                <Empty title="No transactions" />
              ) : (
                <table>
                  <tbody>
                    {data.biggest.map((t) => (
                      <tr key={t.id}>
                        <td>
                          <div className="txn-cell">
                            <PayeeAvatar name={t.payee} />
                            <div title={t.payee || undefined}>
                              {t.payee || 'No payee'}
                              <span className="sub">
                                {displayDate(t.date)} · {accountName(t.accountId)}
                                {t.excludeFromBudgets && ' · not in budgets'}
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
          </div>
        </>
      )}
    </section>
  )
}

function CategoryRows({
  c,
  max,
  nested,
  expanded,
  onToggle,
  onOpen,
}: {
  c: CategorySpend
  max: number
  nested: boolean
  expanded: boolean
  onToggle: () => void
  onOpen: (categoryId: number) => void
}) {
  const category = useCategoryLookup()(c.categoryId)
  return (
    <>
      <tr>
        <td className="name">
          <div className="txn-cell">
            {c.children.length > 0 ? (
              <button
                type="button"
                className="ghost icon small expander"
                aria-expanded={expanded}
                aria-label={`${expanded ? 'Collapse' : 'Expand'} ${c.name}`}
                onClick={onToggle}
              >
                <ChevronRight size={15} />
              </button>
            ) : (
              nested && <span className="expander-space" />
            )}
            <button type="button" className="link" onClick={() => onOpen(c.categoryId)}>
              <CategoryBadge id={c.categoryId} showName />
            </button>
          </div>
        </td>
        <td className="bar-cell">
          <Bar fraction={c.total / max} color={category?.color} />
        </td>
        <td className="num muted">{percent(c.share)}</td>
        <td className="num strong">{formatCents(c.total)}</td>
      </tr>
      {expanded &&
        c.children.map((k) => (
          <tr key={k.categoryId} className="child-row">
            <td className="name">
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
