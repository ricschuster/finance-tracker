import { useCallback, useEffect, useState } from 'react'
import type {
  DuplicateGroup,
  DuplicateStrictness,
  DuplicateTransaction,
} from '../../core/ledger/duplicates'
import { formatCents } from '../../core/money'
import type { LedgerState } from './useLedger'
import { useConfirm, useToast } from './ui'

const WINDOWS = [
  { days: 0, label: 'Same day' },
  { days: 2, label: 'Within 2 days' },
  { days: 5, label: 'Within 5 days' },
]

/** Lists likely duplicate transactions already in the ledger, with delete and "not a duplicate". */
export function DuplicatesForm({ run }: Pick<LedgerState, 'run'>) {
  const [groups, setGroups] = useState<DuplicateGroup[] | null>(null)
  const [windowDays, setWindowDays] = useState(2)
  const [strictness, setStrictness] = useState<DuplicateStrictness>('normal')
  const confirm = useConfirm()
  const toast = useToast()

  const load = useCallback(
    () => void window.api.ledger.findDuplicateGroups({ windowDays, strictness }).then(setGroups),
    [windowDays, strictness],
  )
  useEffect(load, [load])

  const remove = async (t: DuplicateTransaction) => {
    const ok = await confirm(
      `${formatCents(t.amount)} on ${t.date} (${t.description || 'no description'}) will be deleted. The other rows stay.`,
      { title: 'Delete this transaction?', confirmLabel: 'Delete', danger: true },
    )
    if (!ok) return
    const snapshot = await window.api.ledger.getTransaction(t.id)
    if (!(await run(() => window.api.ledger.deleteTransaction(t.id)))) return
    load()
    if (snapshot)
      toast({
        message: 'Transaction deleted.',
        actionLabel: 'Undo',
        onAction: () =>
          void run(() =>
            window.api.ledger.createTransaction({
              accountId: snapshot.accountId,
              date: snapshot.date,
              amount: snapshot.amount,
              rawDescription: snapshot.rawDescription,
              payee: snapshot.payee,
              notes: snapshot.notes,
              status: snapshot.status,
              lines: snapshot.lines.map((l) => ({
                categoryId: l.categoryId,
                amount: l.amount,
                memo: l.memo,
              })),
              tags: snapshot.tags,
            }),
          ).then(load),
      })
  }

  return (
    <div className="stack">
      <div className="row" style={{ gap: 12 }}>
        <label>
          Dates{' '}
          <select value={windowDays} onChange={(e) => setWindowDays(Number(e.target.value))}>
            {WINDOWS.map((w) => (
              <option key={w.days} value={w.days}>
                {w.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Description{' '}
          <select
            value={strictness}
            onChange={(e) => setStrictness(e.target.value as DuplicateStrictness)}
          >
            <option value="normal">Similar</option>
            <option value="strict">Identical</option>
          </select>
        </label>
      </div>
      {groups === null && <p className="muted">Looking for duplicates...</p>}
      {groups?.length === 0 && <p className="muted">No likely duplicates found.</p>}
      {groups?.map((g) => (
        <section
          key={g.transactions.map((t) => t.id).join('-')}
          className="stack"
          data-testid="dup-group"
        >
          <div className="row" style={{ gap: 12 }}>
            <strong className="grow">{g.reason}</strong>
            <span className="muted">Score {g.score}</span>
            <button
              type="button"
              onClick={() =>
                void run(() =>
                  window.api.ledger.dismissDuplicateGroup(g.transactions.map((t) => t.id)),
                ).then((ok) => ok && load())
              }
            >
              Not a duplicate
            </button>
          </div>
          <ul className="stack" style={{ listStyle: 'none', padding: 0 }}>
            {g.transactions.map((t) => (
              <li key={t.id} className="row" style={{ gap: 12 }}>
                <span className="grow">
                  {t.date} {t.accountName}: {t.description || 'no description'}{' '}
                  {formatCents(t.amount)}
                  {t.split ? ' (split)' : ''}
                  {t.imported ? ' (imported)' : ' (manual)'}
                </span>
                <button type="button" className="danger" onClick={() => void remove(t)}>
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
