import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatCents, parseAmountToCents } from '../../core/money'
import type { TransactionStatus } from '../../core/ledger/transactions'
import type { SavedSearch } from '../../core/search/saved'
import type { SearchQuery, SearchResult } from '../../core/search/query'
import { CategorySelect } from './CategorySelect'
import { TransactionList } from './TransactionList'
import type { LedgerState } from './useLedger'

const PAGE = 500

/** Filter fields as typed, before conversion to a SearchQuery. */
interface Filters {
  text: string
  categoryId: number
  tag: string
  status: '' | TransactionStatus
  from: string
  to: string
  direction: '' | 'expense' | 'income'
  min: string
  max: string
  uncategorized: boolean
}

const empty: Filters = {
  text: '',
  categoryId: 0,
  tag: '',
  status: '',
  from: '',
  to: '',
  direction: '',
  min: '',
  max: '',
  uncategorized: false,
}

function toQuery(f: Filters): SearchQuery | string {
  const q: SearchQuery = {}
  if (f.text.trim()) q.text = f.text
  if (f.categoryId) q.categoryId = f.categoryId
  if (f.tag.trim()) q.tag = f.tag.trim()
  if (f.status) q.status = f.status
  if (f.from) q.from = f.from
  if (f.to) q.to = f.to
  if (f.direction) q.direction = f.direction
  if (f.uncategorized) q.uncategorized = true
  try {
    if (f.min.trim()) q.minAmount = Math.abs(parseAmountToCents(f.min))
    if (f.max.trim()) q.maxAmount = Math.abs(parseAmountToCents(f.max))
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
  return q
}

function fromQuery(q: SearchQuery): Filters {
  const dollars = (c: number) => (c / 100).toFixed(2)
  return {
    text: q.text ?? '',
    categoryId: q.categoryId ?? 0,
    tag: q.tag ?? '',
    status: q.status ?? '',
    from: q.from ?? '',
    to: q.to ?? '',
    direction: q.direction ?? '',
    min: q.minAmount === undefined ? '' : dollars(q.minAmount),
    max: q.maxAmount === undefined ? '' : dollars(q.maxAmount),
    uncategorized: q.uncategorized ?? false,
  }
}

export function TransactionSearch({
  accounts,
  categories,
  run,
  version,
  accountId,
  onSuggestRule,
  preset,
}: Pick<LedgerState, 'accounts' | 'categories' | 'run' | 'version'> & {
  accountId: number | null
  onSuggestRule: (id: number) => void
  /** A drill-down from reports; a new `key` replaces the filters with this category and range. */
  preset?: {
    key: number
    categoryId: number
    from: string
    to: string
    direction?: 'expense'
  } | null
}) {
  const [filters, setFilters] = useState<Filters>(empty)
  const [showMore, setShowMore] = useState(false)
  const [applied, setApplied] = useState<Filters>(empty)
  const [result, setResult] = useState<SearchResult | null>(null)
  const [badInput, setBadInput] = useState<string | null>(null)
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set())
  const [saved, setSaved] = useState<SavedSearch[]>([])
  // window.prompt() is unsupported in Electron, so naming a search uses an inline field.
  const [saveName, setSaveName] = useState<string | null>(null)
  const [bulkCategory, setBulkCategory] = useState(0)
  const [bulkTag, setBulkTag] = useState('')
  const [bulkStatus, setBulkStatus] = useState<TransactionStatus>('reconciled')

  const presetKey = preset?.key
  useEffect(() => {
    if (!preset) return
    const next = {
      ...empty,
      categoryId: preset.categoryId,
      from: preset.from,
      to: preset.to,
    }
    setFilters(next)
    setApplied(next)
    // Only a new key counts as a new drill-down.
  }, [presetKey])

  // Fetch shortly after typing stops, not on every keystroke.
  useEffect(() => {
    const id = setTimeout(() => setApplied(filters), 150)
    return () => clearTimeout(id)
  }, [filters])

  const query = useMemo(() => toQuery(applied), [applied])

  const fullQuery = useMemo<SearchQuery | null>(
    () =>
      typeof query === 'string'
        ? null
        : { ...query, ...(accountId !== null && { accountIds: [accountId] }) },
    [query, accountId],
  )

  useEffect(() => {
    if (typeof query === 'string') return setBadInput(query)
    setBadInput(null)
    let stale = false
    void window.api.search
      .searchTransactions({ ...fullQuery, limit: PAGE })
      .then((r) => {
        if (stale) return
        setResult(r)
        // Drop selections that are no longer shown.
        setSelected((prev) => {
          const shown = new Set(r.transactions.map((t) => t.id))
          const next = new Set([...prev].filter((id) => shown.has(id)))
          return next.size === prev.size ? prev : next
        })
      })
      .catch((e: unknown) => {
        if (!stale) setBadInput(e instanceof Error ? e.message : String(e))
      })
    return () => {
      stale = true
    }
  }, [query, fullQuery, version])

  const loadSaved = useCallback(() => {
    void window.api.search.listSavedSearches().then(setSaved)
  }, [])
  useEffect(loadSaved, [loadSaved])

  const [year, setYear] = useState('')
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((f) => ({ ...f, [key]: value }))

  const shown = result?.transactions ?? []
  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })
  const toggleAll = () =>
    setSelected(
      shown.every((t) => selected.has(t.id)) ? new Set() : new Set(shown.map((t) => t.id)),
    )

  async function bulk(action: Parameters<typeof window.api.search.bulkUpdate>[1], ids: number[]) {
    let outcome: { changed: number; skipped: number } | undefined
    const ok = await run(async () => {
      outcome = await window.api.search.bulkUpdate(ids, action)
    })
    if (ok && outcome) {
      setSelected(new Set())
      if (outcome.skipped > 0) {
        window.alert(
          `${outcome.changed} changed, ${outcome.skipped} skipped (no change needed or not applicable).`,
        )
      }
    }
  }

  async function allMatchingIds(): Promise<number[] | null> {
    if (!fullQuery) return null
    let ids: number[] | null = null
    await run(async () => {
      ids = await window.api.search.searchTransactionIds(fullQuery)
    })
    return ids
  }

  async function saveCurrent(name: string) {
    if (!fullQuery || !name.trim()) return
    // Account scoping comes from the sidebar, so it is not stored with the search.
    const stored = { ...fullQuery }
    delete stored.accountIds
    if (await run(() => window.api.search.saveSearch(name.trim(), stored))) {
      setSaveName(null)
      loadSaved()
    }
  }

  const hasSelection = selected.size > 0
  const total = result?.total ?? 0

  return (
    <section aria-label="Search">
      <div className="searchbar">
        <input
          type="search"
          aria-label="Search transactions"
          placeholder="Search payee, description, notes, tags, categories"
          value={filters.text}
          onChange={(e) => set('text', e.target.value)}
        />{' '}
        <button type="button" aria-expanded={showMore} onClick={() => setShowMore((v) => !v)}>
          Filters
        </button>{' '}
        <button type="button" onClick={() => setFilters(empty)}>
          Clear
        </button>{' '}
        <select
          aria-label="Saved searches"
          value=""
          onChange={(e) => {
            const s = saved.find((x) => x.id === Number(e.target.value))
            if (s) {
              setFilters(fromQuery(s.query))
              setApplied(fromQuery(s.query))
              setShowMore(true)
            }
          }}
        >
          <option value="">Saved searches</option>
          {saved.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>{' '}
        {saveName === null ? (
          <button type="button" onClick={() => setSaveName('')}>
            Save search
          </button>
        ) : (
          <form
            style={{ display: 'inline' }}
            onSubmit={(e) => {
              e.preventDefault()
              void saveCurrent(saveName)
            }}
          >
            <input
              autoFocus
              aria-label="Saved search name"
              placeholder="Name this search"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
            />{' '}
            <button type="submit" disabled={!saveName.trim()}>
              Save
            </button>{' '}
            <button type="button" onClick={() => setSaveName(null)}>
              Cancel
            </button>
          </form>
        )}
        {saved.length > 0 && (
          <>
            {' '}
            <select
              aria-label="Delete a saved search"
              value=""
              onChange={(e) => {
                const s = saved.find((x) => x.id === Number(e.target.value))
                if (s && window.confirm(`Delete saved search "${s.name}"?`)) {
                  void run(() => window.api.search.deleteSavedSearch(s.id)).then(loadSaved)
                }
              }}
            >
              <option value="">Delete saved...</option>
              {saved.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </>
        )}
      </div>

      {showMore && (
        <div className="mapper" aria-label="Filters">
          <label>
            Year
            <input
              type="number"
              min="1900"
              max="2999"
              placeholder="2026"
              aria-label="Year"
              value={year}
              onChange={(e) => {
                const y = e.target.value
                setYear(y)
                if (/^\d{4}$/.test(y)) {
                  setFilters((f) => ({ ...f, from: `${y}-01-01`, to: `${y}-12-31` }))
                }
              }}
            />
          </label>
          <label>
            From
            <input type="date" value={filters.from} onChange={(e) => set('from', e.target.value)} />
          </label>
          <label>
            To
            <input type="date" value={filters.to} onChange={(e) => set('to', e.target.value)} />
          </label>
          <label>
            Category
            <CategorySelect
              aria-label="Category filter"
              anyLabel="Any category"
              categories={categories}
              value={filters.categoryId}
              onChange={(id) => set('categoryId', id)}
            />
          </label>
          <label>
            Uncategorized only
            <input
              type="checkbox"
              checked={filters.uncategorized}
              onChange={(e) => set('uncategorized', e.target.checked)}
            />
          </label>
          <label>
            Tag
            <input value={filters.tag} onChange={(e) => set('tag', e.target.value)} />
          </label>
          <label>
            Status
            <select
              value={filters.status}
              onChange={(e) => set('status', e.target.value as Filters['status'])}
            >
              <option value="">Any</option>
              <option value="pending">Pending</option>
              <option value="cleared">Cleared</option>
              <option value="reconciled">Reconciled</option>
            </select>
          </label>
          <label>
            Direction
            <select
              value={filters.direction}
              onChange={(e) => set('direction', e.target.value as Filters['direction'])}
            >
              <option value="">Any</option>
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
          </label>
          <label>
            Amount at least
            <input value={filters.min} onChange={(e) => set('min', e.target.value)} />
          </label>
          <label>
            Amount at most
            <input value={filters.max} onChange={(e) => set('max', e.target.value)} />
          </label>
        </div>
      )}

      {badInput && (
        <p className="error" role="alert">
          {badInput}
        </p>
      )}
      {result && (
        <p className="muted" aria-live="polite">
          {total} match{total === 1 ? '' : 'es'}, {formatCents(result.sum)}
          {total > shown.length && ` (showing the newest ${shown.length})`}
        </p>
      )}

      {hasSelection && (
        <div className="bulkbar" role="toolbar" aria-label="Bulk actions">
          <strong>{selected.size} selected</strong>
          {total > shown.length && (
            <>
              {' '}
              <button
                type="button"
                onClick={() =>
                  void allMatchingIds().then((ids) => ids && setSelected(new Set(ids)))
                }
              >
                Select all {total} matches
              </button>
            </>
          )}{' '}
          <CategorySelect
            aria-label="Bulk category"
            categories={categories}
            value={bulkCategory || (categories[0]?.id ?? 0)}
            onChange={setBulkCategory}
          />{' '}
          <button
            type="button"
            onClick={() =>
              void bulk(
                { type: 'setCategory', categoryId: bulkCategory || (categories[0]?.id ?? 0) },
                [...selected],
              )
            }
          >
            Set category
          </button>{' '}
          <input
            aria-label="Bulk tag"
            placeholder="tag"
            value={bulkTag}
            onChange={(e) => setBulkTag(e.target.value)}
          />{' '}
          <button
            type="button"
            disabled={!bulkTag.trim()}
            onClick={() => void bulk({ type: 'addTag', tag: bulkTag }, [...selected])}
          >
            Add tag
          </button>{' '}
          <button
            type="button"
            disabled={!bulkTag.trim()}
            onClick={() => void bulk({ type: 'removeTag', tag: bulkTag }, [...selected])}
          >
            Remove tag
          </button>{' '}
          <select
            aria-label="Bulk status"
            value={bulkStatus}
            onChange={(e) => setBulkStatus(e.target.value as TransactionStatus)}
          >
            <option value="pending">Pending</option>
            <option value="cleared">Cleared</option>
            <option value="reconciled">Reconciled</option>
          </select>{' '}
          <button
            type="button"
            onClick={() => void bulk({ type: 'setStatus', status: bulkStatus }, [...selected])}
          >
            Set status
          </button>{' '}
          <button
            type="button"
            onClick={() =>
              void bulk({ type: 'setExcludeFromBudgets', exclude: true }, [...selected])
            }
          >
            Hide from budgets
          </button>{' '}
          <button
            type="button"
            onClick={() =>
              void bulk({ type: 'setExcludeFromBudgets', exclude: false }, [...selected])
            }
          >
            Include in budgets
          </button>{' '}
          <button
            type="button"
            onClick={() => {
              if (
                window.confirm(`Delete ${selected.size} transaction(s)? Transfers lose both sides.`)
              ) {
                void bulk({ type: 'delete' }, [...selected])
              }
            }}
          >
            Delete
          </button>{' '}
          <button type="button" onClick={() => setSelected(new Set())}>
            Clear selection
          </button>
        </div>
      )}

      <TransactionList
        transactions={shown}
        accounts={accounts}
        categories={categories}
        run={run}
        showAccount={accountId === null}
        onSuggestRule={onSuggestRule}
        selected={selected}
        onToggle={toggle}
        onToggleAll={toggleAll}
      />
    </section>
  )
}
