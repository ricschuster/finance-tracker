import { useEffect, useState } from 'react'
import { ACCOUNT_TYPES, type AccountImpact, type AccountType } from '../../core/ledger/accounts'
import type { AccountWithBalance } from '../../core/ledger/accounts'
import { formatCents, parseAmountToCents } from '../../core/money'
import type { LedgerState } from './useLedger'

/** Edit, archive or delete the selected account. */
export function AccountEditor({
  account,
  run,
  onDeleted,
}: {
  account: AccountWithBalance
  run: LedgerState['run']
  onDeleted: () => void
}) {
  const [name, setName] = useState(account.name)
  const [type, setType] = useState<AccountType>(account.type)
  const [opening, setOpening] = useState((account.openingBalance / 100).toFixed(2))
  const [impact, setImpact] = useState<AccountImpact | null>(null)

  useEffect(() => {
    setName(account.name)
    setType(account.type)
    setOpening((account.openingBalance / 100).toFixed(2))
    setImpact(null)
  }, [account.id, account.name, account.type, account.openingBalance])

  const startDelete = () => {
    void window.api.ledger.accountImpact(account.id).then(setImpact)
  }

  return (
    <section className="account-editor" aria-label="Edit account">
      <h3>Edit {account.name}</h3>
      <form
        className="inline"
        onSubmit={(e) => {
          e.preventDefault()
          void run(() =>
            window.api.ledger.updateAccount(account.id, {
              name,
              type,
              openingBalance: opening.trim() ? parseAmountToCents(opening) : 0,
            }),
          )
        }}
      >
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} required />
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
          <input value={opening} onChange={(e) => setOpening(e.target.value)} />
        </label>
        <button type="submit">Save</button>
      </form>
      <div className="account-actions">
        <button
          type="button"
          onClick={() =>
            void run(() =>
              window.api.ledger.updateAccount(account.id, { archived: !account.archived }),
            )
          }
        >
          {account.archived ? 'Unarchive' : 'Archive'}
        </button>
        <button type="button" onClick={startDelete}>
          Delete
        </button>
      </div>
      {impact && (
        <div className="category-delete" role="alert">
          <p>
            {impact.transactions === 0
              ? `Delete ${account.name}? It has no transactions.`
              : `Delete ${account.name} and its ${impact.transactions} transaction${impact.transactions === 1 ? '' : 's'}${
                  impact.transferPeers > 0
                    ? `, plus ${impact.transferPeers} matching transfer${impact.transferPeers === 1 ? '' : 's'} in other accounts`
                    : ''
                }? Balance now ${formatCents(account.balance)}. This cannot be undone; archive it to keep the history. Export a backup first if unsure.`}
          </p>
          <button
            type="button"
            onClick={() =>
              void run(() =>
                window.api.ledger.deleteAccount(account.id, { deleteTransactions: true }),
              ).then((ok) => {
                if (ok) onDeleted()
              })
            }
          >
            Delete account
          </button>
          <button type="button" onClick={() => setImpact(null)}>
            Cancel
          </button>
        </div>
      )}
    </section>
  )
}
