import { useCallback, useEffect, useState } from 'react'
import type { BudgetMonth } from '../../core/budgets/budgets'
import { formatCents, parseAmountToCents } from '../../core/money'
import { Bar } from './Bars'
import { CategoryBadge } from './CategoryBadge'
import type { LedgerState } from './useLedger'

const now = new Date()

/** Monthly budgets per expense category against spending. See docs/design/12_budgets.md. */
export function Budgets({
  run,
  version,
}: Pick<LedgerState, 'run'> & {
  version: number
}) {
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [data, setData] = useState<BudgetMonth | null>(null)
  const [adding, setAdding] = useState(0)
  const [addAmount, setAddAmount] = useState('')

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

  async function save(categoryId: number, text: string) {
    let cents: number
    try {
      cents = text.trim() === '' ? 0 : parseAmountToCents(text)
    } catch {
      window.alert('Enter an amount such as 400 or 400.00')
      return
    }
    if (cents < 0) return
    await run(async () => window.api.budgets.setBudget(categoryId, cents))
    await load()
  }

  const label = new Date(year, month - 1, 1).toLocaleString('en-CA', {
    month: 'long',
    year: 'numeric',
  })

  return (
    <section>
      <h2>Budgets</h2>
      <p>
        <button type="button" onClick={() => step(-1)} aria-label="Previous month">
          &lt;
        </button>{' '}
        <strong>{label}</strong>{' '}
        <button type="button" onClick={() => step(1)} aria-label="Next month">
          &gt;
        </button>
      </p>
      <p className="muted">
        Each budget repeats every month. Transfers and transactions hidden from budgets are not
        counted; refunds reduce spending.
      </p>
      {data && (
        <>
          {data.rows.length === 0 ? (
            <p className="muted">No budgets yet. Add one below.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Category</th>
                  <th className="num">Budget</th>
                  <th className="num">Spent</th>
                  <th className="num">Remaining</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.categoryId}>
                    <td>
                      <CategoryBadge id={r.categoryId} /> {r.categoryName}
                    </td>
                    <td className="num">
                      <input
                        aria-label={`Budget for ${r.categoryName}`}
                        key={`${r.categoryId}-${r.budget}`}
                        defaultValue={(r.budget / 100).toFixed(2)}
                        size={9}
                        onBlur={(e) => {
                          if (e.target.value !== (r.budget / 100).toFixed(2))
                            void save(r.categoryId, e.target.value)
                        }}
                      />
                    </td>
                    <td className="num">{formatCents(r.spent)}</td>
                    <td className={`num ${r.remaining < 0 ? 'neg' : 'pos'}`}>
                      {formatCents(r.remaining)}
                    </td>
                    <td>
                      <Bar
                        fraction={r.spent / r.budget}
                        tone={r.spent > r.budget ? 'neg' : 'pos'}
                      />
                    </td>
                  </tr>
                ))}
                <tr>
                  <td>
                    <strong>Total</strong>
                  </td>
                  <td className="num">{formatCents(data.totalBudget)}</td>
                  <td className="num">{formatCents(data.totalSpent)}</td>
                  <td className={`num ${data.totalBudget - data.totalSpent < 0 ? 'neg' : 'pos'}`}>
                    {formatCents(data.totalBudget - data.totalSpent)}
                  </td>
                  <td />
                </tr>
              </tbody>
            </table>
          )}
          {data.unbudgeted.length > 0 && (
            <>
              <h3>Add a budget</h3>
              <p>
                <select
                  aria-label="Category to budget"
                  value={adding}
                  onChange={(e) => setAdding(Number(e.target.value))}
                >
                  <option value={0}>Choose a category</option>
                  {data.unbudgeted.map((u) => (
                    <option key={u.categoryId} value={u.categoryId}>
                      {u.categoryName} (spent {formatCents(u.spent)} this month)
                    </option>
                  ))}
                </select>{' '}
                <input
                  aria-label="Monthly budget amount"
                  placeholder="Monthly amount"
                  value={addAmount}
                  onChange={(e) => setAddAmount(e.target.value)}
                  size={12}
                />{' '}
                <button
                  type="button"
                  disabled={adding === 0 || addAmount.trim() === ''}
                  onClick={() =>
                    void save(adding, addAmount).then(() => {
                      setAdding(0)
                      setAddAmount('')
                    })
                  }
                >
                  Add budget
                </button>
              </p>
            </>
          )}
        </>
      )}
    </section>
  )
}
