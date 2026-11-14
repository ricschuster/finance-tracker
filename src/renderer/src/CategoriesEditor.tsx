import { useEffect, useState } from 'react'
import type { Category } from '../../core/ledger/categories'
import { CategorySelect } from './CategorySelect'
import type { LedgerState } from './useLedger'

type Pending =
  | { type: 'rename'; id: number; name: string }
  | { type: 'delete'; id: number; reassignTo: number }
  | { type: 'merge'; id: number; into: number }
  | { type: 'add'; name: string }

/** Add, rename, merge and delete categories. The set is flat. System categories are read-only. */
export function CategoriesEditor({ ledger }: { ledger: LedgerState }) {
  const [usage, setUsage] = useState<Record<number, number>>({})
  const [pending, setPending] = useState<Pending | null>(null)

  useEffect(() => {
    window.api.ledger.categoryUsage().then(setUsage, () => setUsage({}))
  }, [ledger.version])

  const { categories } = ledger
  const uncategorized = categories.find((c) => c.name === 'Uncategorized')
  const finish = (ok: boolean) => ok && setPending(null)

  const row = (c: Category) => {
    const p = pending && pending.type !== 'add' && pending.id === c.id ? pending : null
    const n = usage[c.id] ?? 0
    const mergeTargets = categories.filter((x) => x.id !== c.id && !x.isSystem && x.kind === c.kind)
    return (
      <li key={c.id} className="category-parent">
        <div className="category-row">
          {p?.type === 'rename' ? (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                void ledger.run(() => window.api.ledger.renameCategory(c.id, p.name)).then(finish)
              }}
            >
              <input
                aria-label={`New name for ${c.name}`}
                value={p.name}
                autoFocus
                onChange={(e) => setPending({ ...p, name: e.target.value })}
              />
              <button type="submit">Save</button>
              <button type="button" onClick={() => setPending(null)}>
                Cancel
              </button>
            </form>
          ) : (
            <>
              <span className="category-name">{c.name}</span>
              <span className="muted">
                {n} {n === 1 ? 'line' : 'lines'}
                {c.isSystem ? ', built in' : ''}
              </span>
              {!c.isSystem && (
                <>
                  <button
                    type="button"
                    onClick={() => setPending({ type: 'rename', id: c.id, name: c.name })}
                  >
                    Rename
                  </button>
                  {mergeTargets.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setPending({ type: 'merge', id: c.id, into: mergeTargets[0]!.id })
                      }
                    >
                      Merge into...
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      setPending({ type: 'delete', id: c.id, reassignTo: uncategorized?.id ?? 0 })
                    }
                  >
                    Delete
                  </button>
                </>
              )}
            </>
          )}
        </div>
        {p?.type === 'merge' && (
          <div className="category-delete" role="alert">
            <p>
              Merge {c.name} into another category? Its {n} transaction {n === 1 ? 'line' : 'lines'}
              , and any rules or saved searches that use it, move over. {c.name} is then removed.
            </p>
            <CategorySelect
              aria-label="Merge into"
              categories={mergeTargets}
              value={p.into}
              onChange={(id) => setPending({ ...p, into: id })}
            />
            <button
              type="button"
              onClick={() =>
                void ledger.run(() => window.api.ledger.mergeCategory(c.id, p.into)).then(finish)
              }
            >
              Merge
            </button>
            <button type="button" onClick={() => setPending(null)}>
              Cancel
            </button>
          </div>
        )}
        {p?.type === 'delete' && (
          <div className="category-delete" role="alert">
            <p>
              Delete {c.name}?{' '}
              {n > 0
                ? `Its ${n} transaction ${n === 1 ? 'line moves' : 'lines move'} to:`
                : 'Nothing uses it.'}{' '}
              Rules and saved searches that use it move the same way.
            </p>
            {n > 0 && (
              <CategorySelect
                aria-label="Move lines to"
                categories={categories.filter((x) => x.id !== c.id)}
                value={p.reassignTo}
                onChange={(id) => setPending({ ...p, reassignTo: id })}
              />
            )}
            <button
              type="button"
              onClick={() =>
                void ledger
                  .run(() => window.api.ledger.deleteCategory(c.id, p.reassignTo || undefined))
                  .then(finish)
              }
            >
              Delete category
            </button>
            <button type="button" onClick={() => setPending(null)}>
              Cancel
            </button>
          </div>
        )}
      </li>
    )
  }

  return (
    <section>
      <h2>Categories</h2>
      <p className="muted">
        A short, flat list. Merging or deleting moves transactions to another category,
        Uncategorized by default.
      </p>
      <ul className="category-tree">{categories.map(row)}</ul>
      {pending?.type === 'add' ? (
        <form
          className="category-add"
          onSubmit={(e) => {
            e.preventDefault()
            void ledger
              .run(() => window.api.ledger.createCategory({ name: pending.name, kind: 'expense' }))
              .then(finish)
          }}
        >
          <input
            aria-label="New category name"
            placeholder="New category"
            value={pending.name}
            autoFocus
            onChange={(e) => setPending({ type: 'add', name: e.target.value })}
          />
          <button type="submit">Add</button>
          <button type="button" onClick={() => setPending(null)}>
            Cancel
          </button>
        </form>
      ) : (
        <button type="button" onClick={() => setPending({ type: 'add', name: '' })}>
          Add category
        </button>
      )}
    </section>
  )
}
