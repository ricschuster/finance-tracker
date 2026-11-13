import { useState } from 'react'
import { parseAmountToCents } from '../../core/money'
import type { LedgerState } from './useLedger'

const today = () => new Date().toLocaleDateString('en-CA')

export function TransferForm({ accounts, run }: Pick<LedgerState, 'accounts' | 'run'>) {
  const [from, setFrom] = useState<number | null>(null)
  const [to, setTo] = useState<number | null>(null)
  const [date, setDate] = useState(today())
  const [amount, setAmount] = useState('')

  if (accounts.length < 2) return null
  const fromId = from ?? accounts[0]!.id
  const toId = to ?? accounts[1]!.id

  return (
    <form
      className="inline"
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
        })
      }}
    >
      <label>
        Transfer from
        <select value={fromId} onChange={(e) => setFrom(Number(e.target.value))}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        to
        <select value={toId} onChange={(e) => setTo(Number(e.target.value))}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Date
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </label>
      <label>
        Amount
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          required
        />
      </label>
      <button type="submit">Add transfer</button>
    </form>
  )
}
