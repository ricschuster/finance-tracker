import { useState } from 'react'
import { parseAmountToCents } from '../../core/money'
import type { LedgerState } from './useLedger'

const today = () => new Date().toLocaleDateString('en-CA')

/** New transfer form, shown in the Transfer dialog. */
export function TransferForm({
  accounts,
  run,
  onDone,
}: Pick<LedgerState, 'accounts' | 'run'> & { onDone?: () => void }) {
  const [from, setFrom] = useState<number | null>(null)
  const [to, setTo] = useState<number | null>(null)
  const [date, setDate] = useState(today())
  const [amount, setAmount] = useState('')

  if (accounts.length < 2) return <p className="muted">Add a second account to make transfers.</p>
  const fromId = from ?? accounts[0]!.id
  const toId = to ?? accounts[1]!.id

  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault()
        void run(async () => {
          await window.api.ledger.createTransfer({
            fromAccountId: fromId,
            toAccountId: toId,
            date,
            amount: Math.abs(parseAmountToCents(amount)),
          })
          setAmount('')
        }).then((ok) => {
          if (ok) onDone?.()
        })
      }}
    >
      <div className="form-grid">
        <label className="field">
          From
          <select value={fromId} onChange={(e) => setFrom(Number(e.target.value))}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          To
          <select value={toId} onChange={(e) => setTo(Number(e.target.value))}>
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
          Amount
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            inputMode="decimal"
            required
          />
        </label>
      </div>
      <div className="dialog-actions">
        <button type="submit">Add transfer</button>
      </div>
    </form>
  )
}
