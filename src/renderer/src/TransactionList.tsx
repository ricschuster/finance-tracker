import { Fragment, useState } from 'react'
import { formatCents } from '../../core/money'
import { CategorySelect } from './CategorySelect'
import { SplitEditor } from './SplitEditor'
import type { LedgerState } from './useLedger'

export function TransactionList({
  transactions,
  accounts,
  categories,
  run,
  showAccount,
  onSuggestRule,
  selected,
  onToggle,
  onToggleAll,
}: Pick<LedgerState, 'transactions' | 'accounts' | 'categories' | 'run'> & {
  showAccount: boolean
  onSuggestRule: (transactionId: number) => void
  selected: ReadonlySet<number>
  onToggle: (id: number) => void
  onToggleAll: () => void
}) {
  const [splitting, setSplitting] = useState<number | null>(null)
  const accountName = new Map(accounts.map((a) => [a.id, a.name]))
  if (transactions.length === 0) return <p className="muted">No matching transactions.</p>
  return (
    <table>
      <thead>
        <tr>
          <th>
            <input
              type="checkbox"
              aria-label="Select all shown"
              checked={transactions.every((t) => selected.has(t.id))}
              onChange={onToggleAll}
            />
          </th>
          <th>Date</th>
          {showAccount && <th>Account</th>}
          <th>Payee</th>
          <th>Category</th>
          <th>Tags</th>
          <th>Status</th>
          <th className="num">Amount</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {transactions.map((t) => {
          const isTransfer = t.transferPeerId !== null
          const single = t.lines.length === 1 ? t.lines[0] : undefined
          return (
            <Fragment key={t.id}>
              <tr>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Select transaction ${t.id}`}
                    checked={selected.has(t.id)}
                    onChange={() => onToggle(t.id)}
                  />
                </td>
                <td className="nowrap">{t.date}</td>
                {showAccount && <td>{accountName.get(t.accountId)}</td>}
                <td>{t.payee || t.rawDescription || <span className="muted">(none)</span>}</td>
                <td>
                  {isTransfer ? (
                    <span className="muted">Transfer</span>
                  ) : single ? (
                    <CategorySelect
                      aria-label={`Category for transaction ${t.id}`}
                      categories={categories}
                      value={single.categoryId}
                      onChange={(categoryId) =>
                        void run(() =>
                          window.api.ledger.updateTransaction(t.id, {
                            lines: [{ categoryId, amount: t.amount, memo: single.memo }],
                          }),
                        )
                      }
                    />
                  ) : (
                    <span className="muted">
                      Split ({t.lines.map((l) => l.categoryName).join(', ')})
                    </span>
                  )}
                </td>
                <td>
                  {t.tags.map((tag) => (
                    <span className="tag" key={tag}>
                      {tag}
                    </span>
                  ))}
                </td>
                <td>{t.status}</td>
                <td className={`num ${t.amount < 0 ? 'neg' : 'pos'}`}>{formatCents(t.amount)}</td>
                <td className="actions">
                  {!isTransfer && (
                    <button
                      type="button"
                      aria-label={`Split transaction ${t.id}`}
                      onClick={() => setSplitting(t.id)}
                    >
                      Split
                    </button>
                  )}{' '}
                  {!isTransfer && (
                    <button
                      type="button"
                      aria-label={`Suggest a rule from transaction ${t.id}`}
                      onClick={() => onSuggestRule(t.id)}
                    >
                      Rule
                    </button>
                  )}{' '}
                  <button
                    type="button"
                    aria-label={`Delete transaction ${t.id}`}
                    onClick={() => {
                      if (
                        window.confirm(
                          isTransfer
                            ? 'Delete both sides of this transfer?'
                            : 'Delete this transaction?',
                        )
                      ) {
                        void run(() => window.api.ledger.deleteTransaction(t.id))
                      }
                    }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
              {splitting === t.id && (
                <tr>
                  <td colSpan={showAccount ? 9 : 8}>
                    <SplitEditor
                      transaction={t}
                      categories={categories}
                      run={run}
                      onClose={() => setSplitting(null)}
                    />
                  </td>
                </tr>
              )}
            </Fragment>
          )
        })}
      </tbody>
    </table>
  )
}
