import { useState } from 'react'
import { parseAmountToCents } from '../../core/money'
import { CategorySelect } from './CategorySelect'
import type { LedgerState } from './useLedger'

const today = () => new Date().toLocaleDateString('en-CA')

export function TransactionForm(
  props: Pick<LedgerState, 'accounts' | 'categories' | 'run'> & { accountId: number | null },
) {
  const { accounts, categories, run } = props
  const [accountPick, setAccountPick] = useState<number | null>(null)
  const [date, setDate] = useState(today())
  const [payee, setPayee] = useState('')
  const [direction, setDirection] = useState<'expense' | 'income'>('expense')
  const [amount, setAmount] = useState('')
  const [categoryPick, setCategoryPick] = useState<number | null>(null)
  const [tags, setTags] = useState('')
  const [notes, setNotes] = useState('')

  const accountId = props.accountId ?? accountPick ?? accounts[0]?.id
  const uncategorized = categories.find((c) => c.name === 'Uncategorized' && c.parentId === null)
  const categoryId = categoryPick ?? uncategorized?.id

  if (accounts.length === 0)
    return <p className="muted">Add an account to start entering transactions.</p>

  return (
    <form
      className="inline"
      onSubmit={(e) => {
        e.preventDefault()
        if (accountId === undefined || categoryId === undefined) return
        void run(async () => {
          const cents = Math.abs(parseAmountToCents(amount))
          const signed = direction === 'expense' ? -cents : cents
          await window.api.ledger.createTransaction({
            accountId,
            date,
            amount: signed,
            payee: payee.trim(),
            rawDescription: payee.trim(),
            notes,
            lines: [{ categoryId, amount: signed }],
            tags: tags
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean),
          })
          setPayee('')
          setAmount('')
          setTags('')
          setNotes('')
        })
      }}
    >
      {props.accountId === null && (
        <label>
          Account
          <select value={accountId} onChange={(e) => setAccountPick(Number(e.target.value))}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        Date
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </label>
      <label>
        Payee
        <input value={payee} onChange={(e) => setPayee(e.target.value)} />
      </label>
      <label>
        Type
        <select
          value={direction}
          onChange={(e) => setDirection(e.target.value as 'expense' | 'income')}
        >
          <option value="expense">Expense</option>
          <option value="income">Income</option>
        </select>
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
      <label>
        Category
        {categoryId !== undefined && (
          <CategorySelect categories={categories} value={categoryId} onChange={setCategoryPick} />
        )}
      </label>
      <label>
        Tags
        <input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="comma, separated"
        />
      </label>
      <label>
        Notes
        <input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <button type="submit">Add transaction</button>
    </form>
  )
}
