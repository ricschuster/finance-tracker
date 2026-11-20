import {
  ArrowDown,
  ArrowUp,
  EyeOff,
  Eye,
  NotebookPen,
  Pencil,
  Split,
  StickyNote,
  Trash2,
  Wand2,
  Receipt,
} from 'lucide-react'
import { Fragment, useState } from 'react'
import type { Transaction } from '../../core/ledger/transactions'
import { formatCents } from '../../core/money'
import type { SortKey } from '../../core/search/query'
import { CategoryBadge } from './CategoryBadge'
import { CategorySelect } from './CategorySelect'
import { EditTransactionForm } from './EditTransactionForm'
import { SplitEditor } from './SplitEditor'
import { ActionMenu, Dialog, Empty, useConfirm, useToast } from './ui'
import type { LedgerState } from './useLedger'

const thisYear = String(new Date().getFullYear())

/** "Nov 14" this year, "Nov 14, 2025" otherwise. */
export const displayDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-CA', {
    month: 'short',
    day: 'numeric',
    ...(iso.startsWith(thisYear) ? {} : { year: 'numeric' }),
  })

const STATUS_PILL: Record<string, string> = {
  pending: 'pill warn',
  cleared: 'pill',
  reconciled: 'pill pos',
}

/** Inline editor for a transaction's free-text note. Saving an empty note removes it. */
function NoteEditor(props: {
  transactionId: number
  initial: string
  run: LedgerState['run']
  onClose: () => void
}) {
  const [text, setText] = useState(props.initial)
  const save = () =>
    void props
      .run(() => window.api.ledger.updateTransaction(props.transactionId, { notes: text.trim() }))
      .then((ok) => ok && props.onClose())
  return (
    <form
      className="note-editor"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      <input
        autoFocus
        aria-label={`Note for transaction ${props.transactionId}`}
        placeholder="Add a note"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && props.onClose()}
      />
      <button type="button" className="ghost small" onClick={props.onClose}>
        Cancel
      </button>
      <button type="submit" className="primary small">
        Save note
      </button>
    </form>
  )
}

export function TransactionList({
  transactions,
  accounts,
  categories,
  run,
  showAccount,
  emptyKind,
  onAddAccount,
  onAddTransaction,
  onImport,
  onSuggestRule,
  selected,
  onToggle,
  onToggleAll,
  sort,
  dir,
  onSort,
}: Pick<LedgerState, 'transactions' | 'accounts' | 'categories' | 'run'> & {
  showAccount: boolean
  /** Why the list may be empty: nothing exists yet, or the filters match nothing. */
  emptyKind: 'noAccounts' | 'noTransactions' | 'noMatches'
  onAddAccount: () => void
  onAddTransaction: () => void
  onImport: () => void
  onSuggestRule: (transactionId: number) => void
  selected: ReadonlySet<number>
  onToggle: (id: number) => void
  onToggleAll: () => void
  sort: SortKey
  dir: 'asc' | 'desc'
  onSort: (key: SortKey) => void
}) {
  const head = (key: SortKey, label: string, className?: string) => (
    <th
      className={className}
      aria-sort={sort === key ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button type="button" className="sort-head" onClick={() => onSort(key)}>
        {label}
        {sort === key && (dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
      </button>
    </th>
  )
  const [splitting, setSplitting] = useState<number | null>(null)
  const [noting, setNoting] = useState<number | null>(null)
  const [editing, setEditing] = useState<Transaction | null>(null)
  const confirm = useConfirm()
  const toast = useToast()
  const accountName = new Map(accounts.map((a) => [a.id, a.name]))
  if (transactions.length === 0)
    return (
      <div className="card">
        {emptyKind === 'noAccounts' ? (
          <Empty icon={<Receipt size={28} />} title="No accounts yet">
            Add an account first, then add or import transactions into it.
            <div className="empty-actions">
              <button type="button" className="primary" onClick={onAddAccount}>
                Add account
              </button>
            </div>
          </Empty>
        ) : emptyKind === 'noTransactions' ? (
          <Empty icon={<Receipt size={28} />} title="No transactions yet">
            Add one by hand, or import a bank file.
            <div className="empty-actions">
              <button type="button" className="primary" onClick={onAddTransaction}>
                Add transaction
              </button>
              <button type="button" onClick={onImport}>
                Import
              </button>
            </div>
          </Empty>
        ) : (
          <Empty icon={<Receipt size={28} />} title="No matching transactions">
            Try clearing the search or filters. Search matches words inside payee, description,
            notes, tags and categories; quotes group a phrase and punctuation is ignored.
          </Empty>
        )}
      </div>
    )
  return (
    <div className="card flush">
      <table className="txn-table">
        <thead>
          <tr>
            <th className="check">
              <input
                type="checkbox"
                aria-label="Select all shown"
                checked={transactions.every((t) => selected.has(t.id))}
                onChange={onToggleAll}
              />
            </th>
            {head('date', 'Date')}
            {head('payee', 'Payee')}
            {head('category', 'Category')}
            {head('status', 'Status', 'col-status')}
            {head('amount', 'Amount', 'num')}
            <th />
          </tr>
        </thead>
        <tbody>
          {transactions.map((t) => {
            const isTransfer = t.transferPeerId !== null
            const single = t.lines.length === 1 ? t.lines[0] : undefined
            const sub = [showAccount ? accountName.get(t.accountId) : null].filter(Boolean)
            return (
              <Fragment key={t.id}>
                <tr className={selected.has(t.id) ? 'selected' : undefined}>
                  <td className="check">
                    <input
                      type="checkbox"
                      aria-label={`Select transaction ${t.id}`}
                      checked={selected.has(t.id)}
                      onChange={() => onToggle(t.id)}
                    />
                  </td>
                  <td className="nowrap muted">{displayDate(t.date)}</td>
                  <td className="payee">
                    <div className="payee-name">
                      {t.payee || t.rawDescription ? (
                        <span className="payee-text" title={t.payee || t.rawDescription}>
                          {t.payee || t.rawDescription}
                        </span>
                      ) : (
                        <span className="muted">(none)</span>
                      )}
                      {t.notes && (
                        <button
                          type="button"
                          className="note-indicator"
                          title={t.notes}
                          aria-label={`Note: ${t.notes}`}
                          onClick={() => setNoting(t.id)}
                        >
                          <StickyNote size={13} />
                        </button>
                      )}
                    </div>
                    {(sub.length > 0 || t.tags.length > 0) && (
                      <div className="payee-sub">
                        {sub.join(' · ')}
                        {t.tags.map((tag) => (
                          <span className="tag" key={tag}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td>
                    {isTransfer ? (
                      <span className="category-badge muted">
                        <CategoryBadge name="Transfer" size="sm" />
                        Transfer
                      </span>
                    ) : single ? (
                      <span className="cat-select">
                        <CategorySelect
                          inline
                          aria-label={`Category for transaction ${t.id}`}
                          categories={categories}
                          value={single.categoryId}
                          onChange={(categoryId) =>
                            void run(() =>
                              window.api.ledger.updateTransaction(t.id, {
                                lines: [{ categoryId, amount: t.amount, memo: single.memo }],
                              }),
                            ).then((ok) => {
                              if (ok)
                                toast({
                                  message:
                                    'Apply this category to similar transactions automatically?',
                                  actionLabel: 'Create rule',
                                  onAction: () => onSuggestRule(t.id),
                                })
                            })
                          }
                        />
                      </span>
                    ) : (
                      <span className="category-badge">
                        <span className="split-icon" aria-hidden="true">
                          <Split size={12} />
                        </span>
                        <span className="muted">
                          Split: {t.lines.map((l) => l.categoryName).join(', ')}
                        </span>
                      </span>
                    )}
                  </td>
                  <td className="nowrap col-status">
                    <span className={STATUS_PILL[t.status] ?? 'pill'}>{t.status}</span>
                    {t.excludeFromBudgets && (
                      <span
                        className="pill"
                        title="Hidden from reports and Cashflow"
                        style={{ marginLeft: 4 }}
                      >
                        <EyeOff size={11} /> not in budgets
                      </span>
                    )}
                  </td>
                  <td className={`num amount ${t.amount < 0 ? '' : 'pos'}`}>
                    {t.amount > 0 ? '+' : ''}
                    {formatCents(t.amount)}
                  </td>
                  <td className="actions">
                    <ActionMenu
                      label={`Actions for transaction ${t.id}`}
                      actions={[
                        {
                          label: 'Edit',
                          icon: <Pencil size={15} />,
                          onSelect: () => setEditing(t),
                        },
                        ...(isTransfer
                          ? []
                          : [
                              {
                                label: 'Split',
                                icon: <Split size={15} />,
                                onSelect: () => setSplitting(t.id),
                              },
                              {
                                label: t.notes ? 'Edit note' : 'Add note',
                                icon: <NotebookPen size={15} />,
                                onSelect: () => setNoting(t.id),
                              },
                              {
                                label: 'Make a rule',
                                icon: <Wand2 size={15} />,
                                onSelect: () => onSuggestRule(t.id),
                              },
                              {
                                label: t.excludeFromBudgets
                                  ? 'Include in reports'
                                  : 'Hide from reports',
                                icon: t.excludeFromBudgets ? (
                                  <Eye size={15} />
                                ) : (
                                  <EyeOff size={15} />
                                ),
                                onSelect: () =>
                                  void run(() =>
                                    window.api.ledger.updateTransaction(t.id, {
                                      excludeFromBudgets: !t.excludeFromBudgets,
                                    }),
                                  ),
                              },
                            ]),
                        {
                          label: 'Delete',
                          icon: <Trash2 size={15} />,
                          danger: true,
                          separatorBefore: !isTransfer,
                          onSelect: () =>
                            void confirm(
                              isTransfer
                                ? 'Both sides of this transfer will be deleted.'
                                : 'This transaction will be deleted.',
                              {
                                title: isTransfer ? 'Delete transfer?' : 'Delete transaction?',
                                confirmLabel: 'Delete',
                                danger: true,
                              },
                            ).then((ok) => {
                              if (ok) void run(() => window.api.ledger.deleteTransaction(t.id))
                            }),
                        },
                      ]}
                    />
                  </td>
                </tr>
                {noting === t.id && (
                  <tr className="split-row">
                    <td colSpan={7}>
                      <NoteEditor
                        transactionId={t.id}
                        initial={t.notes}
                        run={run}
                        onClose={() => setNoting(null)}
                      />
                    </td>
                  </tr>
                )}
                {splitting === t.id && (
                  <tr className="split-row">
                    <td colSpan={7}>
                      <SplitEditor
                        transaction={t}
                        categories={categories}
                        run={run}
                        onClose={() => setSplitting(null)}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
      <Dialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title="Edit transaction"
      >
        {editing && (
          <EditTransactionForm
            transaction={editing}
            accounts={accounts}
            run={run}
            onDone={() => setEditing(null)}
          />
        )}
      </Dialog>
    </div>
  )
}
