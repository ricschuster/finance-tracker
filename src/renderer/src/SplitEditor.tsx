import { Plus, X } from 'lucide-react'
import { useState } from 'react'
import type { Transaction } from '../../core/ledger/transactions'
import { formatCents, parseAmountToCents } from '../../core/money'
import { CategorySelect } from './CategorySelect'
import type { LedgerState } from './useLedger'

interface Row {
  categoryId: number
  /** Positive magnitude as typed; the sign follows the transaction. */
  amount: string
  memo: string
}

/** Edit a transaction's split lines. Amounts are entered as magnitudes and must add up to the total. */
export function SplitEditor(props: {
  transaction: Transaction
  categories: LedgerState['categories']
  run: LedgerState['run']
  onClose: () => void
}) {
  const { transaction: t, categories, run, onClose } = props
  const sign = t.amount < 0 ? -1 : 1
  const [rows, setRows] = useState<Row[]>(
    t.lines.map((l) => ({
      categoryId: l.categoryId,
      amount: (Math.abs(l.amount) / 100).toFixed(2),
      memo: l.memo,
    })),
  )

  const parsed = rows.map((r) => {
    try {
      return Math.abs(parseAmountToCents(r.amount))
    } catch {
      return null
    }
  })
  const valid = parsed.every((p) => p !== null)
  const sum = parsed.reduce<number>((s, p) => s + (p ?? 0), 0)
  const remaining = Math.abs(t.amount) - sum
  const patch = (i: number, change: Partial<Row>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...change } : r)))

  return (
    <div className="split-editor" role="group" aria-label={`Split transaction ${t.id}`}>
      <h4>Split {formatCents(Math.abs(t.amount))} across categories</h4>
      {rows.map((r, i) => (
        <div className="split-line" key={i}>
          <CategorySelect
            aria-label={`Split ${i + 1} category`}
            categories={categories}
            value={r.categoryId}
            onChange={(categoryId) => patch(i, { categoryId })}
          />
          <input
            aria-label={`Split ${i + 1} amount`}
            value={r.amount}
            onChange={(e) => patch(i, { amount: e.target.value })}
          />
          <input
            aria-label={`Split ${i + 1} memo`}
            value={r.memo}
            placeholder="Memo"
            onChange={(e) => patch(i, { memo: e.target.value })}
          />
          <button
            type="button"
            className="ghost icon"
            aria-label={`Remove split ${i + 1}`}
            disabled={rows.length === 1}
            onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
          >
            <X size={15} />
          </button>
        </div>
      ))}
      <div className="split-footer">
        <button
          type="button"
          className="small"
          onClick={() =>
            setRows((rs) => [
              ...rs,
              {
                categoryId: rs[rs.length - 1]!.categoryId,
                amount: (Math.max(remaining, 0) / 100).toFixed(2),
                memo: '',
              },
            ])
          }
        >
          <Plus size={14} />
          Add split
        </button>
        <span className={remaining === 0 && valid ? 'pill pos' : 'pill neg'}>
          {valid
            ? remaining === 0
              ? 'Balanced'
              : `${formatCents(Math.abs(remaining))} ${remaining > 0 ? 'left to assign' : 'over'}`
            : 'Amounts like 12.50'}
        </span>
        <span className="spacer" />
        <button type="button" className="ghost small" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="primary small"
          disabled={!valid || remaining !== 0}
          onClick={() =>
            void run(async () => {
              await window.api.ledger.updateTransaction(t.id, {
                lines: rows.map((r, i) => ({
                  categoryId: r.categoryId,
                  amount: sign * (parsed[i] as number),
                  memo: r.memo,
                })),
              })
              onClose()
            })
          }
        >
          Save splits
        </button>
      </div>
    </div>
  )
}
