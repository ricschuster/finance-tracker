import { useState } from 'react'
import type { Transaction, TransactionPatch } from '../../core/ledger/transactions'
import { amountProblem, formatCents, parseAmountToCents } from '../../core/money'
import type { LedgerState } from './useLedger'

/**
 * Edit a transaction's date, amount, payee, account and notes. Only changed fields are sent, so
 * untouched fields stay open to rules. Split transactions keep their amount (edit the split
 * instead); a transfer keeps its direction and its date and amount move both sides.
 */
export function EditTransactionForm(
  props: Pick<LedgerState, 'accounts' | 'run'> & { transaction: Transaction; onDone: () => void },
) {
  const { transaction: t, accounts, run } = props
  const isTransfer = t.transferPeerId !== null
  const isSplit = t.lines.length > 1
  const [accountId, setAccountId] = useState(t.accountId)
  const [date, setDate] = useState(t.date)
  const [payee, setPayee] = useState(t.payee)
  const [direction, setDirection] = useState<'expense' | 'income'>(
    t.amount < 0 ? 'expense' : 'income',
  )
  const [amount, setAmount] = useState((Math.abs(t.amount) / 100).toFixed(2))
  const [notes, setNotes] = useState(t.notes)
  const [problem, setProblem] = useState<string | null>(null)

  const submit = () => {
    const patch: TransactionPatch = {}
    if (!isSplit) {
      const bad = amountProblem(amount)
      if (bad) return setProblem(bad)
      const cents = Math.abs(parseAmountToCents(amount))
      const signed = direction === 'expense' ? -cents : cents
      if (signed !== t.amount) patch.amount = signed
    }
    if (accountId !== t.accountId) patch.accountId = accountId
    if (date !== t.date) patch.date = date
    if (payee.trim() !== t.payee) patch.payee = payee.trim()
    if (notes.trim() !== t.notes) patch.notes = notes.trim()
    if (Object.keys(patch).length === 0) return props.onDone()
    void run(() => window.api.ledger.updateTransaction(t.id, patch)).then(
      (ok) => ok && props.onDone(),
    )
  }

  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      {!isSplit && !isTransfer && (
        <div className="segmented" role="radiogroup" aria-label="Type">
          {(['expense', 'income'] as const).map((d) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={direction === d}
              onClick={() => setDirection(d)}
            >
              {d === 'expense' ? 'Expense' : 'Income / refund'}
            </button>
          ))}
        </div>
      )}
      {!isSplit && !isTransfer && direction === 'income' && (
        <p className="muted">
          Enter a refund or reimbursement as income, in the category it refunds, so it nets against
          that spending.
        </p>
      )}
      <div className="form-grid">
        <label className="field">
          Account
          <select value={accountId} onChange={(e) => setAccountId(Number(e.target.value))}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <label className="field">
          Payee
          <input
            value={payee}
            placeholder={t.rawDescription}
            onChange={(e) => setPayee(e.target.value)}
            autoFocus
          />
        </label>
        <label className="field">
          Amount
          <input
            value={amount}
            disabled={isSplit}
            onChange={(e) => {
              setAmount(e.target.value)
              setProblem(null)
            }}
            inputMode="decimal"
            aria-invalid={problem !== null}
            required
          />
        </label>
        <label className="field span-2">
          Notes
          <input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </div>
      {isSplit && (
        <p className="muted">
          This transaction is split, so its amount ({formatCents(t.amount)}) is changed in the split
          editor.
        </p>
      )}
      {isTransfer && (
        <p className="muted">Changing the date or amount of a transfer changes both sides.</p>
      )}
      {problem && (
        <p className="form-problem" role="alert">
          {problem}
        </p>
      )}
      <div className="dialog-actions">
        <button type="submit">Save changes</button>
      </div>
    </form>
  )
}
