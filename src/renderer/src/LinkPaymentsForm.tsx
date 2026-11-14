import { useEffect, useState } from 'react'
import type { TransferPairSuggestion } from '../../core/ledger/transferPairs'
import { formatCents } from '../../core/money'
import type { LedgerState } from './useLedger'

/** Lists card and loan payments that were never linked to the account that paid them. */
export function LinkPaymentsForm({
  run,
  onDone,
}: Pick<LedgerState, 'run'> & { onDone: () => void }) {
  const [pairs, setPairs] = useState<TransferPairSuggestion[] | null>(null)
  const load = () => void window.api.ledger.findTransferPairs().then(setPairs)
  useEffect(load, [])

  if (pairs === null) return <p className="muted">Looking for payments...</p>
  if (pairs.length === 0) return <p className="muted">No unlinked card or loan payments found.</p>
  return (
    <div className="stack">
      <p className="muted">
        Each pair is the same amount leaving one account and reducing a card or loan, within three
        days. Linking keeps it out of spending and is the same as a transfer.
      </p>
      <ul className="stack">
        {pairs.map((p) => (
          <li key={`${p.from.id}-${p.to.id}`} className="row">
            <span className="grow">
              {formatCents(p.to.amount)}: {p.from.accountName} {p.from.date} to {p.to.accountName}{' '}
              {p.to.date}
            </span>
            <button
              type="button"
              onClick={() =>
                void run(() => window.api.ledger.linkTransferPair(p.from.id, p.to.id)).then(
                  (ok) => ok && load(),
                )
              }
            >
              Link
            </button>
          </li>
        ))}
      </ul>
      <div className="dialog-actions">
        <button
          type="button"
          className="primary"
          onClick={() =>
            void run(async () => {
              for (const p of pairs) await window.api.ledger.linkTransferPair(p.from.id, p.to.id)
            }).then((ok) => ok && onDone())
          }
        >
          Link all ({pairs.length})
        </button>
      </div>
    </div>
  )
}
