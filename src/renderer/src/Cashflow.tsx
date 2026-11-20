import { ChevronLeft, ChevronRight, Search, TrendingDown, TrendingUp, Wallet } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type { CashflowMonth } from '../../core/cashflow/cashflow'
import { formatCents } from '../../core/money'
import { CategoryIcon, useCategoryLookup } from './CategoryBadge'
import { PageActions } from './PageActions'
import { SpendingPie } from './SpendingPie'
import { Empty, StatTile } from './ui'

export interface CashflowMonthKey {
  year: number
  month: number
}

/**
 * The Cashflow page: money in and out of each category for a month, with a spending donut. The
 * month is owned by the parent so Back from a drill-down returns to the same month.
 * See docs/design/12_budgets.md.
 */
export function Cashflow({
  version,
  period,
  onPeriod,
  onOpenCategory,
}: {
  version: number
  period: CashflowMonthKey
  onPeriod: (p: CashflowMonthKey) => void
  onOpenCategory: (categoryId: number, from: string, to: string) => void
}) {
  const today = new Date()
  const { year, month } = period
  const [data, setData] = useState<CashflowMonth | null>(null)
  const [query, setQuery] = useState('')
  const category = useCategoryLookup()

  const load = useCallback(async () => {
    setData(await window.api.cashflow.getCashflowMonth(year, month))
  }, [year, month])

  useEffect(() => {
    void load()
  }, [load, version])

  function step(delta: number) {
    const d = new Date(year, month - 1 + delta, 1)
    onPeriod({ year: d.getFullYear(), month: d.getMonth() + 1 })
  }

  const isCurrent = year === today.getFullYear() && month === today.getMonth() + 1
  const label = new Date(year, month - 1, 1).toLocaleString('en-CA', {
    month: 'long',
    year: 'numeric',
  })
  const daysInMonth = new Date(year, month, 0).getDate()
  const mm = String(month).padStart(2, '0')
  const monthFrom = `${year}-${mm}-01`
  const monthTo = `${year}-${mm}-${String(daysInMonth).padStart(2, '0')}`

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
          onClick={() => onPeriod({ year: today.getFullYear(), month: today.getMonth() + 1 })}
        >
          This month
        </button>
      )}
    </PageActions>
  )

  if (!data) return header

  const pieSlices = data.categories
    .filter((c) => c.amount < 0)
    .map((c) => ({
      categoryId: c.categoryId,
      name: c.categoryName,
      amount: -c.amount,
      color: category(c.categoryId)?.color,
    }))
    .sort((a, b) => b.amount - a.amount)
  const needle = query.trim().toLowerCase()
  const shown = data.categories.filter((c) => c.categoryName.toLowerCase().includes(needle))

  return (
    <section aria-label="Cashflow">
      <h2>Cashflow</h2>
      {header}

      <div className="stat-row">
        <StatTile
          label="Income"
          value={formatCents(data.income)}
          icon={<TrendingUp size={16} />}
          iconTone="pos"
        />
        <StatTile
          label="Spending"
          value={formatCents(data.spending)}
          icon={<TrendingDown size={16} />}
          iconTone="neg"
        />
        <StatTile
          label="Net"
          value={formatCents(data.net)}
          tone={data.net < 0 ? 'neg' : 'pos'}
          icon={<Wallet size={16} />}
          iconTone={data.net < 0 ? 'neg' : 'pos'}
        />
      </div>

      {pieSlices.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h3>Spending by category</h3>
            <span className="subtle">{label}</span>
          </div>
          <SpendingPie
            slices={pieSlices}
            onSelect={(id) => onOpenCategory(id, monthFrom, monthTo)}
          />
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <h3>Categories</h3>
          <span className="subtle">{label}</span>
        </div>
        {data.categories.length === 0 ? (
          <Empty icon={<Wallet size={28} />} title="Nothing this month">
            No transactions are dated in {label}.
          </Empty>
        ) : (
          <>
            <label className="field">
              <span className="subtle">
                <Search size={13} /> Find a category
              </span>
              <input
                type="search"
                aria-label="Search categories"
                placeholder="Search categories"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            {shown.length === 0 ? (
              <p className="subtle">No category matches "{query.trim()}".</p>
            ) : (
              <table>
                <tbody>
                  {shown.map((c) => {
                    const cat = category(c.categoryId)
                    return (
                      <tr key={c.categoryId}>
                        <td>
                          <button
                            type="button"
                            className="link"
                            aria-label={`Show ${c.categoryName} transactions`}
                            onClick={() => onOpenCategory(c.categoryId, monthFrom, monthTo)}
                          >
                            <span className="category-badge">
                              <CategoryIcon color={cat?.color} icon={cat?.icon} size="sm" />
                              {c.categoryName}
                            </span>
                          </button>
                        </td>
                        <td className={c.amount < 0 ? 'num neg' : 'num pos'}>
                          {formatCents(c.amount)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </>
        )}
        <p className="subtle">
          Transfers and transactions hidden from reports are not counted. A negative amount is money
          spent; a positive one is income or net refunds.
        </p>
      </div>
    </section>
  )
}
