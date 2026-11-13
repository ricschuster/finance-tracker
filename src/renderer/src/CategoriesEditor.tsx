import { useEffect, useState } from 'react'
import type { Category } from '../../core/ledger/categories'
import { CategorySelect } from './CategorySelect'
import type { LedgerState } from './useLedger'

/** Add, rename and delete categories. System categories (Uncategorized, transfers) are read-only. */
export function CategoriesEditor({ ledger }: { ledger: LedgerState }) {
  const [usage, setUsage] = useState<Record<number, number>>({})
  const [renaming, setRenaming] = useState<{ id: number; name: string } | null>(null)
  const [adding, setAdding] = useState<{ parentId: number | null; name: string } | null>(null)
  const [deleting, setDeleting] = useState<{ id: number; reassignTo: number } | null>(null)

  useEffect(() => {
    window.api.ledger.categoryUsage().then(setUsage, () => setUsage({}))
  }, [ledger.version])

  const { categories } = ledger
  const parents = categories.filter((c) => c.parentId === null)
  const kids = (id: number) => categories.filter((c) => c.parentId === id)
  const count = (c: Category) =>
    (usage[c.id] ?? 0) + kids(c.id).reduce((n, k) => n + (usage[k.id] ?? 0), 0)

  const uncategorized = categories.find((c) => c.name === 'Uncategorized' && c.parentId === null)

  const startDelete = (c: Category) => {
    setRenaming(null)
    setAdding(null)
    setDeleting({ id: c.id, reassignTo: uncategorized?.id ?? 0 })
  }

  const row = (c: Category, child: boolean) => {
    const isRenaming = renaming?.id === c.id
    const isDeleting = deleting?.id === c.id
    const n = count(c)
    return (
      <li key={c.id} className={child ? 'category-child' : 'category-parent'}>
        <div className="category-row">
          {isRenaming ? (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                void ledger
                  .run(() => window.api.ledger.renameCategory(c.id, renaming.name))
                  .then((ok) => ok && setRenaming(null))
              }}
            >
              <input
                aria-label={`New name for ${c.name}`}
                value={renaming.name}
                autoFocus
                onChange={(e) => setRenaming({ id: c.id, name: e.target.value })}
              />
              <button type="submit">Save</button>
              <button type="button" onClick={() => setRenaming(null)}>
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
                    onClick={() => {
                      setAdding(null)
                      setDeleting(null)
                      setRenaming({ id: c.id, name: c.name })
                    }}
                  >
                    Rename
                  </button>
                  <button type="button" onClick={() => startDelete(c)}>
                    Delete
                  </button>
                </>
              )}
              {!child && c.kind !== 'transfer' && (
                <button
                  type="button"
                  onClick={() => {
                    setRenaming(null)
                    setDeleting(null)
                    setAdding({ parentId: c.id, name: '' })
                  }}
                >
                  Add subcategory
                </button>
              )}
            </>
          )}
        </div>
        {isDeleting && (
          <div className="category-delete" role="alert">
            <p>
              Delete {c.name}
              {kids(c.id).length > 0 ? ' and its subcategories' : ''}?{' '}
              {n > 0
                ? `Its ${n} transaction ${n === 1 ? 'line moves' : 'lines move'} to:`
                : 'Nothing uses it.'}{' '}
              Rules that set this category will stop applying.
            </p>
            {n > 0 && (
              <CategorySelect
                aria-label="Move lines to"
                categories={categories.filter((x) => x.id !== c.id && x.parentId !== c.id)}
                value={deleting.reassignTo}
                onChange={(id) => setDeleting({ id: c.id, reassignTo: id })}
              />
            )}
            <button
              type="button"
              onClick={() => {
                void ledger
                  .run(() =>
                    window.api.ledger.deleteCategory(c.id, deleting.reassignTo || undefined),
                  )
                  .then((ok) => ok && setDeleting(null))
              }}
            >
              Delete category
            </button>
            <button type="button" onClick={() => setDeleting(null)}>
              Cancel
            </button>
          </div>
        )}
        {adding?.parentId === c.id && addForm(c.name)}
        {!child && kids(c.id).length > 0 && <ul>{kids(c.id).map((k) => row(k, true))}</ul>}
      </li>
    )
  }

  const addForm = (parentName: string | null) =>
    adding && (
      <form
        className="category-add"
        onSubmit={(e) => {
          e.preventDefault()
          void ledger
            .run(() =>
              window.api.ledger.createCategory({
                name: adding.name,
                parentId: adding.parentId,
                kind: 'expense',
              }),
            )
            .then((ok) => ok && setAdding(null))
        }}
      >
        <input
          aria-label={parentName ? `New subcategory of ${parentName}` : 'New category name'}
          placeholder={parentName ? `New subcategory of ${parentName}` : 'New category'}
          value={adding.name}
          autoFocus
          onChange={(e) => setAdding({ ...adding, name: e.target.value })}
        />
        <button type="submit">Add</button>
        <button type="button" onClick={() => setAdding(null)}>
          Cancel
        </button>
      </form>
    )

  return (
    <section>
      <h2>Categories</h2>
      <p className="muted">
        Two levels. A subcategory takes its parent&apos;s kind. Deleting moves transactions to
        another category, Uncategorized by default.
      </p>
      <ul className="category-tree">{parents.map((p) => row(p, false))}</ul>
      {adding?.parentId === null ? (
        addForm(null)
      ) : (
        <button
          type="button"
          onClick={() => {
            setRenaming(null)
            setDeleting(null)
            setAdding({ parentId: null, name: '' })
          }}
        >
          Add category
        </button>
      )}
    </section>
  )
}
