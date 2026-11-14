import type { Category } from './categories'
import type { CategoryAlias } from './categories'

export interface PickerOption {
  category: Category
  /** Parent name for a subcategory, so the list can show "Parent / Child". */
  parentName: string | null
  /** The alias that matched the query, when the name itself did not. */
  matchedAlias: string | null
}

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '')

/**
 * Options for a type-to-filter category picker, in the order of `categories`. Every word of the
 * query must appear in the category name, its parent's name, or one of its aliases (any order,
 * case and accent insensitive). An empty query keeps everything.
 */
export function filterCategoryOptions(
  categories: readonly Category[],
  aliases: readonly CategoryAlias[],
  query: string,
): PickerOption[] {
  const byId = new Map(categories.map((c) => [c.id, c]))
  const aliasesOf = new Map<number, string[]>()
  for (const a of aliases)
    aliasesOf.set(a.categoryId, [...(aliasesOf.get(a.categoryId) ?? []), a.alias])
  const words = norm(query).split(/\s+/).filter(Boolean)
  const out: PickerOption[] = []
  for (const category of categories) {
    const parentName =
      category.parentId === null ? null : (byId.get(category.parentId)?.name ?? null)
    const names = norm([category.name, parentName ?? ''].join(' '))
    const own = aliasesOf.get(category.id) ?? []
    let matchedAlias: string | null = null
    let ok = true
    for (const w of words) {
      if (names.includes(w)) continue
      const hit = own.find((a) => norm(a).includes(w))
      if (hit === undefined) {
        ok = false
        break
      }
      matchedAlias ??= hit
    }
    if (ok) out.push({ category, parentName, matchedAlias })
  }
  return out
}
