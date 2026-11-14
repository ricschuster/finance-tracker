import { ChevronDown } from 'lucide-react'
import { createContext, useContext, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { Category, CategoryAlias } from '../../core/ledger/categories'
import { filterCategoryOptions } from '../../core/ledger/categoryPicker'
import { CategoryBadge } from './CategoryBadge'

const Aliases = createContext<CategoryAlias[]>([])
export const CategoryAliasProvider = Aliases.Provider

interface Item {
  id: number
  name: string
  indent: boolean
  /** Muted hint after the name: the parent when filtering, or the alias that matched. */
  hint: string | null
}

/**
 * Searchable category picker. A button shows the current category; opening it reveals a filter
 * box and the list. Typing narrows by name, parent name and alias; arrows move, Enter picks,
 * Escape closes. Parents with children are ordered before their children, as in the Categories tab.
 */
export function CategorySelect(props: {
  categories: Category[]
  value: number
  onChange: (id: number) => void
  'aria-label'?: string
  /** When set, adds a leading choice with value 0 (for example "Any category"). */
  anyLabel?: string
  /** Borderless look for use inside a table row. */
  inline?: boolean
}) {
  const { categories, value, onChange, anyLabel } = props
  const aliases = useContext(Aliases)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [up, setUp] = useState(false)
  const root = useRef<HTMLSpanElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const listId = useId()

  const items = useMemo<Item[]>(() => {
    const filtering = query.trim() !== ''
    const found = filterCategoryOptions(categories, aliases, query).map((o) => ({
      id: o.category.id,
      name: o.category.name,
      indent: o.parentName !== null && !filtering,
      hint: o.matchedAlias ? `also "${o.matchedAlias}"` : filtering ? o.parentName : null,
    }))
    const any: Item[] =
      anyLabel && (!filtering || anyLabel.toLowerCase().includes(query.trim().toLowerCase()))
        ? [{ id: 0, name: anyLabel, indent: false, hint: null }]
        : []
    return [...any, ...found]
  }, [categories, aliases, query, anyLabel])

  const close = (refocus: boolean) => {
    setOpen(false)
    setQuery('')
    if (refocus) trigger.current?.focus()
  }
  const pick = (item: Item | undefined) => {
    if (!item) return
    close(true)
    if (item.id !== value) onChange(item.id)
  }

  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) close(false)
    }
    // Capture on window so Escape closes only the picker, not a dialog around it.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      close(true)
    }
    document.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  useEffect(() => {
    if (open) input.current?.focus()
  }, [open])

  useEffect(() => {
    if (open) document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' })
  }, [open, active, listId])

  const openList = () => {
    const rect = trigger.current?.getBoundingClientRect()
    setUp(
      rect
        ? window.innerHeight - rect.bottom < 340 && rect.top > window.innerHeight - rect.bottom
        : false,
    )
    const at = items.findIndex((i) => i.id === value)
    setActive(Math.max(at, 0))
    setOpen(true)
  }

  const current = categories.find((c) => c.id === value)
  const label = value === 0 && anyLabel ? anyLabel : (current?.name ?? '')

  return (
    <span className={props.inline ? 'cat-picker inline' : 'cat-picker'} ref={root}>
      <button
        type="button"
        ref={trigger}
        className="cat-picker-button"
        role="combobox"
        aria-label={props['aria-label']}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => (open ? close(false) : openList())}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault()
            openList()
          }
        }}
      >
        {value !== 0 && <CategoryBadge id={value} size="sm" />}
        <span className="cat-picker-label">{label}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <div
          className={up ? 'cat-picker-pop up' : 'cat-picker-pop'}
          // A wrapping <label> would otherwise forward clicks in here to the trigger and reopen it.
          onClick={(e) => e.preventDefault()}
        >
          <input
            ref={input}
            className="cat-picker-search"
            placeholder="Type to filter"
            aria-label="Filter categories"
            aria-controls={listId}
            aria-activedescendant={items[active] ? `${listId}-${active}` : undefined}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActive((a) => Math.min(a + 1, items.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActive((a) => Math.max(a - 1, 0))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                e.stopPropagation()
                pick(items[active])
              } else if (e.key === 'Tab') {
                close(false)
              }
            }}
          />
          <ul className="cat-picker-list" role="listbox" id={listId} aria-label="Categories">
            {items.length === 0 && <li className="cat-picker-empty">No matching category</li>}
            {items.map((item, i) => (
              <li
                key={item.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={item.id === value}
                className={[
                  'cat-picker-option',
                  i === active ? 'active' : '',
                  item.indent ? 'indent' : '',
                ].join(' ')}
                onPointerMove={() => i !== active && setActive(i)}
                onClick={() => pick(item)}
              >
                {item.id !== 0 && <CategoryBadge id={item.id} size="sm" />}
                <span>{item.name}</span>
                {item.hint && <span className="muted cat-picker-hint">{item.hint}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </span>
  )
}
