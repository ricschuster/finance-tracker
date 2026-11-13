import { useState } from 'react'
import { ACCOUNT_TYPES, type AccountType } from '../../core/ledger/accounts'
import { parseAmountToCents } from '../../core/money'
import type { LedgerState } from './useLedger'

export function AccountForm({ run }: Pick<LedgerState, 'run'>) {
  const [name, setName] = useState('')
  const [type, setType] = useState<AccountType>('checking')
  const [opening, setOpening] = useState('')

  return (
    <form
      className="inline"
      onSubmit={(e) => {
        e.preventDefault()
        void run(async () => {
          await window.api.ledger.createAccount({
            name,
            type,
            openingBalance: opening.trim() ? parseAmountToCents(opening) : 0,
          })
          setName('')
          setOpening('')
        })
      }}
    >
      <label>
        New account
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" required />
      </label>
      <label>
        Type
        <select value={type} onChange={(e) => setType(e.target.value as AccountType)}>
          {ACCOUNT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t.replace('_', ' ')}
            </option>
          ))}
        </select>
      </label>
      <label>
        Opening balance
        <input value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="0.00" />
      </label>
      <button type="submit">Add</button>
    </form>
  )
}
