import { Archive, ArchiveRestore, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ACCOUNT_TYPES, type AccountImpact, type AccountType } from '../../core/ledger/accounts'
import type { AccountWithBalance } from '../../core/ledger/accounts'
import { formatCents, parseAmountToCents } from '../../core/money'
import { accountTypeLabel } from './accountTypes'
import type { LedgerState } from './useLedger'

/** Edit, archive or delete an account. Shown in the Edit account dialog. */
export function AccountEditor({
  account,
  run,
  onDeleted,
  onDone,
}: {
  account: AccountWithBalance
  run: LedgerState['run']
  onDeleted: () => void
  onDone?: () => void
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
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault()
          void run(() =>
            window.api.ledger.updateAccount(account.id, {
              name,
              type,
              openingBalance: opening.trim() ? parseAmountToCents(opening) : 0,
            }),
          ).then((ok) => {
            if (ok) onDone?.()
          })
        }}
      >
        <label className="field">
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} required />
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
            <input value={opening} onChange={(e) => setOpening(e.target.value)} />
          </label>
        </div>
        <div className="dialog-actions split">
          <div className="account-actions">
            <button
              type="button"
              onClick={() =>
                void run(() =>
                  window.api.ledger.updateAccount(account.id, { archived: !account.archived }),
                ).then((ok) => {
                  if (ok) onDone?.()
                })
              }
            >
              {account.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
              {account.archived ? 'Unarchive' : 'Archive'}
            </button>
            <button type="button" className="danger" onClick={startDelete}>
              <Trash2 size={15} />
              Delete
            </button>
          </div>
          <button type="submit">Save</button>
        </div>
      </form>
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
            className="danger solid"
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
