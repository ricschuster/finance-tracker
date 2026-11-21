import type Database from 'better-sqlite3'
import { CATEGORY_COLORS, isCategoryColor, isCategoryIcon } from './categoryStyle'

export interface Category {
  id: number
  parentId: number | null
  name: string
  isSystem: boolean
  sortOrder: number
  /** A key from `CATEGORY_COLORS`, or null. */
  color: string | null
  /** A key of `CATEGORY_ICONS`, or null. */
  icon: string | null
  /** Left out of Cashflow and the reports. */
  hideFromTrends: boolean
}

interface CategoryRow {
  id: number
  parent_id: number | null
  name: string
  is_system: number
  sort_order: number
  color: string | null
  icon: string | null
  hide_from_trends: number
}

const toCategory = (r: CategoryRow): Category => ({
  id: r.id,
  parentId: r.parent_id,
  name: r.name,
  isSystem: r.is_system === 1,
  sortOrder: r.sort_order,
  color: r.color,
  icon: r.icon,
  hideFromTrends: r.hide_from_trends === 1,
})

export function listCategories(db: Database.Database): Category[] {
  const rows = db
    .prepare(
      'SELECT * FROM categories ORDER BY COALESCE(parent_id, id), parent_id IS NOT NULL, sort_order, name',
    )
    .all() as CategoryRow[]
  return rows.map(toCategory)
}

/** Number of transaction lines per category id, for categories that have any. */
export function categoryUsage(db: Database.Database): Record<number, number> {
  const rows = db
    .prepare('SELECT category_id AS id, COUNT(*) AS n FROM transaction_lines GROUP BY category_id')
    .all() as { id: number; n: number }[]
  return Object.fromEntries(rows.map((r) => [r.id, r.n]))
}

export function getCategoryByName(
  db: Database.Database,
  name: string,
  parentId: number | null = null,
): Category | undefined {
  const row = db
    .prepare('SELECT * FROM categories WHERE name = ? AND COALESCE(parent_id, 0) = ?')
    .get(name, parentId ?? 0) as CategoryRow | undefined
  return row && toCategory(row)
}

/** Create a category. Categories are flat: there are no subcategories. */
export function createCategory(
  db: Database.Database,
  input: { name: string; color?: string | null; icon?: string | null },
): number {
  const name = input.name.trim()
  if (!name) throw new Error('Category name is required')
  if (input.color != null && !isCategoryColor(input.color)) throw new Error('Unknown colour')
  if (input.icon != null && !isCategoryIcon(input.icon)) throw new Error('Unknown icon')
  const sort = (
    db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM categories').get() as {
      n: number
    }
  ).n
  return Number(
    db
      .prepare('INSERT INTO categories (name, sort_order, color, icon) VALUES (?, ?, ?, ?)')
      .run(
        name,
        sort,
        input.color ?? CATEGORY_COLORS[(sort - 1) % CATEGORY_COLORS.length],
        input.icon ?? null,
      ).lastInsertRowid,
  )
}

export function renameCategory(db: Database.Database, id: number, name: string): void {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Category name is required')
  const cat = db.prepare('SELECT is_system FROM categories WHERE id = ?').get(id) as
    { is_system: number } | undefined
  if (!cat) throw new Error(`Category ${id} not found`)
  if (cat.is_system) throw new Error('System categories cannot be renamed')
  db.prepare('UPDATE categories SET name = ? WHERE id = ?').run(trimmed, id)
}

/**
 * Delete a category. Its transaction lines move to `reassignTo` (default Uncategorized).
 * Rules and saved searches that point at it are repointed the same way.
 */
export function deleteCategory(db: Database.Database, id: number, reassignTo?: number): void {
  db.transaction(() => {
    const cat = db.prepare('SELECT is_system FROM categories WHERE id = ?').get(id) as
      { is_system: number } | undefined
    if (!cat) throw new Error(`Category ${id} not found`)
    if (cat.is_system) throw new Error('System categories cannot be deleted')
    const target =
      reassignTo ??
      (
        db
          .prepare("SELECT id FROM categories WHERE name = 'Uncategorized' AND parent_id IS NULL")
          .get() as { id: number }
      ).id
    moveReferences(db, id, target)
    db.prepare('DELETE FROM categories WHERE id = ?').run(id)
  })()
}

/**
 * Delete several categories in one database transaction. Their lines, rules and saved searches
 * move to `reassignTo` (default Uncategorized), which must not be one of the deleted categories.
 * Nothing is deleted if any id is unknown or a system category.
 */
export function deleteCategories(
  db: Database.Database,
  ids: number[],
  reassignTo?: number,
): { deleted: number } {
  const unique = [...new Set(ids)]
  if (reassignTo !== undefined && unique.includes(reassignTo))
    throw new Error('Cannot move transactions into a category that is being deleted')
  db.transaction(() => {
    for (const id of unique) deleteCategory(db, id, reassignTo)
  })()
  return { deleted: unique.length }
}

/**
 * Merge `fromId` into `intoId`: lines, rule actions and saved searches move over and `fromId` is
 * deleted. The source must not be a system category.
 */
export function mergeCategory(db: Database.Database, fromId: number, intoId: number): void {
  db.transaction(() => {
    if (fromId === intoId) throw new Error('Cannot merge a category into itself')
    const get = db.prepare('SELECT is_system FROM categories WHERE id = ?')
    const from = get.get(fromId) as { is_system: number } | undefined
    const into = get.get(intoId) as { is_system: number } | undefined
    if (!from) throw new Error(`Category ${fromId} not found`)
    if (!into) throw new Error(`Category ${intoId} not found`)
    if (from.is_system) throw new Error('System categories cannot be merged')
    if (into.is_system) throw new Error('Cannot merge into a system category')
    moveReferences(db, fromId, intoId)
    const name = (
      db.prepare('SELECT name FROM categories WHERE id = ?').get(fromId) as {
        name: string
      }
    ).name
    // Aliases that pointed at the merged category follow it, and its own name becomes an alias so
    // later imports that still use the old name land in the surviving category.
    db.prepare('UPDATE category_aliases SET category_id = ? WHERE category_id = ?').run(
      intoId,
      fromId,
    )
    db.prepare('DELETE FROM categories WHERE id = ?').run(fromId)
    db.prepare(
      `INSERT INTO category_aliases (alias, category_id) VALUES (?, ?)
       ON CONFLICT(alias) DO UPDATE SET category_id = excluded.category_id`,
    ).run(name, intoId)
  })()
}

/** Point lines, rule actions and saved searches at `to` instead of `from`. */
function moveReferences(db: Database.Database, from: number, to: number): void {
  db.prepare('UPDATE transaction_lines SET category_id = ? WHERE category_id = ?').run(to, from)
  const rules = db.prepare('SELECT id, actions FROM rules').all() as {
    id: number
    actions: string
  }[]
  for (const r of rules) {
    const actions = JSON.parse(r.actions) as Array<{ type: string; categoryId?: number }>
    let changed = false
    for (const a of actions) {
      if (a.type === 'setCategory' && a.categoryId === from) {
        a.categoryId = to
        changed = true
      }
    }
    if (changed) {
      db.prepare('UPDATE rules SET actions = ? WHERE id = ?').run(JSON.stringify(actions), r.id)
    }
  }
  const searches = db.prepare('SELECT id, query FROM saved_searches').all() as {
    id: number
    query: string
  }[]
  for (const sv of searches) {
    const q = JSON.parse(sv.query) as { categoryId?: number }
    if (q.categoryId === from) {
      q.categoryId = to
      db.prepare('UPDATE saved_searches SET query = ? WHERE id = ?').run(JSON.stringify(q), sv.id)
    }
  }
}

/** Set a category's colour and icon; pass null to clear one. Values must come from the fixed sets. */
export function setCategoryStyle(
  db: Database.Database,
  id: number,
  style: { color: string | null; icon: string | null },
): void {
  if (style.color !== null && !isCategoryColor(style.color)) throw new Error('Unknown colour')
  if (style.icon !== null && !isCategoryIcon(style.icon)) throw new Error('Unknown icon')
  const r = db
    .prepare('UPDATE categories SET color = ?, icon = ? WHERE id = ?')
    .run(style.color, style.icon, id)
  if (r.changes === 0) throw new Error(`Category ${id} not found`)
}

/** Leave a category out of (or put it back into) Cashflow and the reports. Allowed on every category. */
export function setCategoryHidden(db: Database.Database, id: number, hidden: boolean): void {
  const r = db
    .prepare('UPDATE categories SET hide_from_trends = ? WHERE id = ?')
    .run(hidden ? 1 : 0, id)
  if (r.changes === 0) throw new Error(`Category ${id} not found`)
}

export interface CategoryAlias {
  alias: string
  categoryId: number
}

/** Every alias (an alternative name that import maps to a category), for the category picker. */
export function listCategoryAliases(db: Database.Database): CategoryAlias[] {
  const rows = db
    .prepare('SELECT alias, category_id FROM category_aliases ORDER BY alias')
    .all() as { alias: string; category_id: number }[]
  return rows.map((r) => ({ alias: r.alias, categoryId: r.category_id }))
}
