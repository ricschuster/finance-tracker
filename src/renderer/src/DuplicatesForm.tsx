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
  const [crossAccount, setCrossAccount] = useState(true)
  const confirm = useConfirm()
  const toast = useToast()

  const load = useCallback(
    () =>
      void window.api.ledger
        .findDuplicateGroups({ windowDays, strictness, crossAccount })
        .then(setGroups),
    [windowDays, strictness, crossAccount],
  )
  useEffect(load, [load])

  /** Delete all but the first row of each given group, with one Undo for the lot. */
  const keepOne = async (targets: DuplicateGroup[]) => {
    const extras = targets.flatMap((g) => g.transactions.slice(1))
    if (extras.length === 0) return
    const ok = await confirm(
      `${extras.length} transaction${extras.length === 1 ? '' : 's'} will be deleted. The first row of each group (${targets.length} group${targets.length === 1 ? '' : 's'}) stays.`,
      { title: 'Keep one of each?', confirmLabel: 'Delete extras', danger: true },
    )
    if (!ok) return
    const snapshots = (
      await Promise.all(extras.map((t) => window.api.ledger.getTransaction(t.id)))
    ).filter((s) => s !== null)
    if (
      !(await run(() =>
        window.api.ledger.keepOneOfEach(targets.map((g) => g.transactions.map((t) => t.id))),
      ))
    )
      return
    load()
    toast({
      message: `${extras.length} transaction${extras.length === 1 ? '' : 's'} deleted.`,
      actionLabel: 'Undo',
      onAction: () =>
        void run(async () => {
          for (const s of snapshots)
            await window.api.ledger.createTransaction({
              accountId: s.accountId,
              date: s.date,
              amount: s.amount,
              rawDescription: s.rawDescription,
              payee: s.payee,
              notes: s.notes,
              status: s.status,
              lines: s.lines.map((l) => ({
                categoryId: l.categoryId,
                amount: l.amount,
                memo: l.memo,
              })),
              tags: s.tags,
            })
        }).then(load),
    })
  }

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
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
        <label>
          <input
            type="checkbox"
            checked={crossAccount}
            onChange={(e) => setCrossAccount(e.target.checked)}
          />{' '}
          Match across accounts
        </label>
        {groups && groups.length > 0 && (
          <button type="button" className="danger" onClick={() => void keepOne(groups)}>
            Keep one of each ({groups.length})
          </button>
        )}
      </div>
      {groups === null && <p className="muted">Looking for duplicates...</p>}
      {groups?.length === 0 && <p className="muted">No likely duplicates found.</p>}
      {groups?.map((g) => (
        <section
          key={g.transactions.map((t) => t.id).join('-')}
          style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
          data-testid="dup-group"
        >
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <strong style={{ flex: '1 1 100%' }}>{g.reason}</strong>
            <span className="muted" style={{ flex: 1 }}>
              Score {g.score}
            </span>
            <button type="button" className="danger" onClick={() => void keepOne([g])}>
              Keep first, delete rest
            </button>
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
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            {g.transactions.map((t) => (
              <li key={t.id} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <span style={{ flex: 1 }}>
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
