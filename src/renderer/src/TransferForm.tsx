import { useState } from 'react'
import { amountProblem, parseAmountToCents, sanityWarnings } from '../../core/money'
import { SanityNotice, safeCents } from './SanityNotice'
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
  const [problem, setProblem] = useState<string | null>(null)
  const [warned, setWarned] = useState<string | null>(null)

  if (accounts.length < 2) return <p className="muted">Add a second account to make transfers.</p>
  const fromId = from ?? accounts[0]!.id
  const toId = to ?? accounts[1]!.id

  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault()
        const bad = amountProblem(amount)
        setProblem(bad)
        if (bad) return
        const key = `${amount}|${date}`
        if (warned !== key && sanityWarnings(Math.abs(parseAmountToCents(amount)), date).length) {
          setWarned(key)
          return
        }
        void run(async () => {
          await window.api.ledger.createTransfer({
            fromAccountId: fromId,
            toAccountId: toId,
            date,
            amount: Math.abs(parseAmountToCents(amount)),
          })
          setAmount('')
          setWarned(null)
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
            onChange={(e) => {
              setAmount(e.target.value)
              setProblem(null)
            }}
            placeholder="0.00"
            inputMode="decimal"
            aria-invalid={problem !== null}
            required
          />
        </label>
      </div>
      {problem && (
        <p className="form-problem" role="alert">
          {problem}
        </p>
      )}
      {warned === `${amount}|${date}` && (
        <SanityNotice cents={Math.abs(safeCents(amount))} date={date} />
      )}
      <div className="dialog-actions">
        <button type="submit">
          {warned === `${amount}|${date}` ? 'Save anyway' : 'Add transfer'}
        </button>
      </div>
    </form>
  )
}
