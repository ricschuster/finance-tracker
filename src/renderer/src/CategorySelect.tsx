import type { Category } from '../../core/ledger/categories'

/** Grouped select: parents are headings only when they have children, otherwise plain options. */
export function CategorySelect(props: {
  categories: Category[]
  value: number
  onChange: (id: number) => void
  'aria-label'?: string
}) {
  const parents = props.categories.filter((c) => c.parentId === null)
  return (
    <select
      aria-label={props['aria-label']}
      value={props.value}
      onChange={(e) => props.onChange(Number(e.target.value))}
    >
      {parents.map((p) => {
        const kids = props.categories.filter((c) => c.parentId === p.id)
        if (kids.length === 0) {
          return (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          )
        }
        return (
          <optgroup key={p.id} label={p.name}>
            <option value={p.id}>{p.name}</option>
            {kids.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </optgroup>
        )
      })}
    </select>
  )
}
