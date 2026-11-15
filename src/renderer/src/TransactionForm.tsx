import { useState } from 'react'
import { amountProblem, parseAmountToCents, sanityWarnings } from '../../core/money'
import { CategorySelect } from './CategorySelect'
import { SanityNotice, safeCents } from './SanityNotice'
import type { LedgerState } from './useLedger'

const today = () => new Date().toLocaleDateString('en-CA')

/** New transaction form, shown in the Add transaction dialog. */
export function TransactionForm(
  props: Pick<LedgerState, 'accounts' | 'categories' | 'run'> & {
    accountId: number | null
    onDone?: () => void
  },
) {
  const { accounts, categories, run } = props
  const [accountPick, setAccountPick] = useState<number | null>(props.accountId)
  const [date, setDate] = useState(today())
  const [payee, setPayee] = useState('')
  const [direction, setDirection] = useState<'expense' | 'income'>('expense')
  const [amount, setAmount] = useState('')
  const [categoryPick, setCategoryPick] = useState<number | null>(null)
  const [tags, setTags] = useState('')
  const [notes, setNotes] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  // Warnings the user has already seen for this amount and date; saving again goes through.
  const [warned, setWarned] = useState<string | null>(null)

  const accountId = accountPick ?? accounts[0]?.id
  const uncategorized = categories.find((c) => c.name === 'Uncategorized' && c.parentId === null)
  const categoryId = categoryPick ?? uncategorized?.id

  if (accounts.length === 0)
    return <p className="muted">Add an account to start entering transactions.</p>

  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault()
        if (accountId === undefined || categoryId === undefined) return
        const bad = amountProblem(amount)
        setProblem(bad)
        if (bad) return
        const key = `${amount}|${date}`
        if (warned !== key && sanityWarnings(Math.abs(parseAmountToCents(amount)), date).length) {
          setWarned(key)
          return
        }
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
          setWarned(null)
        }).then((ok) => {
          if (ok) props.onDone?.()
        })
      }}
    >
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
      {direction === 'income' && (
        <p className="muted">
          Enter a refund or reimbursement as income, in the category it refunds, so it nets against
          that spending.
        </p>
      )}
      <div className="form-grid">
        <label className="field">
          Account
          <select value={accountId} onChange={(e) => setAccountPick(Number(e.target.value))}>
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
          <input value={payee} onChange={(e) => setPayee(e.target.value)} autoFocus />
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
        <label className="field span-2">
          Category
          {categoryId !== undefined && (
            <CategorySelect categories={categories} value={categoryId} onChange={setCategoryPick} />
          )}
        </label>
        <label className="field">
          Tags
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="comma, separated"
          />
        </label>
        <label className="field">
          Notes
          <input value={notes} onChange={(e) => setNotes(e.target.value)} />
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
          {warned === `${amount}|${date}` ? 'Save anyway' : 'Add transaction'}
        </button>
      </div>
    </form>
  )
}
