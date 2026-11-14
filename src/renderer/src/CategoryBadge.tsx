import { createContext, useContext, useMemo } from 'react'
import type { Category } from '../../core/ledger/categories'
import { CATEGORY_ICONS, type CategoryIconKey } from '../../core/ledger/categoryStyle'

const CategoryStyles = createContext<Category[]>([])
export const CategoryStyleProvider = CategoryStyles.Provider

/** Colour dot and icon for a category, looked up by id or by name (names are unique). */
export function CategoryBadge(props: { id?: number; name?: string; showName?: boolean }) {
  const categories = useContext(CategoryStyles)
  const c = useMemo(
    () =>
      categories.find((x) => (props.id !== undefined ? x.id === props.id : x.name === props.name)),
    [categories, props.id, props.name],
  )
  const glyph = c?.icon && c.icon in CATEGORY_ICONS ? CATEGORY_ICONS[c.icon as CategoryIconKey] : ''
  return (
    <span className="category-badge">
      <span
        className="category-dot"
        aria-hidden="true"
        style={{ background: c?.color ?? 'var(--muted, #888)' }}
      />
      {glyph && <span aria-hidden="true">{glyph}</span>}
      {props.showName && <span>{c?.name ?? props.name}</span>}
    </span>
  )
}
