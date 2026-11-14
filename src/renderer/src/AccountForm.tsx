import { useState } from 'react'
import { ACCOUNT_TYPES, type AccountType } from '../../core/ledger/accounts'
import { parseAmountToCents } from '../../core/money'
import { accountTypeLabel } from './accountTypes'
import type { LedgerState } from './useLedger'

/** New account form, shown in the Add account dialog. */
export function AccountForm({ run, onDone }: Pick<LedgerState, 'run'> & { onDone?: () => void }) {
  const [name, setName] = useState('')
  const [type, setType] = useState<AccountType>('checking')
  const [opening, setOpening] = useState('')

  return (
    <form
      className="stack"
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
        }).then((ok) => {
          if (ok) onDone?.()
        })
      }}
    >
      <label className="field">
        Account name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Everyday chequing"
          required
          autoFocus
        />
      </label>
      <div className="form-grid">
        <label className="field">
          Type
          <select value={type} onChange={(e) => setType(e.target.value as AccountType)}>
            {ACCOUNT_TYPES.map((t) => (
              <option key={t} value={t}>
                {accountTypeLabel(t)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Opening balance
          <input
            value={opening}
            onChange={(e) => setOpening(e.target.value)}
            placeholder="0.00"
            inputMode="decimal"
          />
        </label>
      </div>
      <div className="dialog-actions">
        <button type="submit">Add account</button>
      </div>
    </form>
  )
}
