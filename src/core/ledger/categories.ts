import type Database from 'better-sqlite3'

export type CategoryKind = 'expense' | 'income' | 'transfer'

export interface Category {
  id: number
  parentId: number | null
  name: string
  kind: CategoryKind
  isSystem: boolean
  sortOrder: number
}

interface CategoryRow {
  id: number
  parent_id: number | null
  name: string
  kind: CategoryKind
  is_system: number
  sort_order: number
}

const toCategory = (r: CategoryRow): Category => ({
  id: r.id,
  parentId: r.parent_id,
  name: r.name,
  kind: r.kind,
  isSystem: r.is_system === 1,
  sortOrder: r.sort_order,
})

export function listCategories(db: Database.Database): Category[] {
  const rows = db
    .prepare(
      'SELECT * FROM categories ORDER BY COALESCE(parent_id, id), parent_id IS NOT NULL, sort_order, name',
    )
    .all() as CategoryRow[]
  return rows.map(toCategory)
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

/** Create a category. A child inherits its parent's kind; only one level of nesting is allowed. */
export function createCategory(
  db: Database.Database,
  input: { name: string; parentId?: number | null; kind?: CategoryKind },
): number {
  const name = input.name.trim()
  if (!name) throw new Error('Category name is required')
  let kind: CategoryKind = input.kind ?? 'expense'
  if (input.parentId != null) {
    const parent = db
      .prepare('SELECT parent_id, kind FROM categories WHERE id = ?')
      .get(input.parentId) as { parent_id: number | null; kind: CategoryKind } | undefined
    if (!parent) throw new Error(`Parent category ${input.parentId} not found`)
    if (parent.parent_id !== null) throw new Error('Categories nest only one level deep')
    kind = parent.kind
  }
  const sort = (
    db
      .prepare(
        'SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM categories WHERE COALESCE(parent_id, 0) = ?',
      )
      .get(input.parentId ?? 0) as {
      n: number
    }
  ).n
  return Number(
    db
      .prepare('INSERT INTO categories (parent_id, name, kind, sort_order) VALUES (?, ?, ?, ?)')
      .run(input.parentId ?? null, name, kind, sort).lastInsertRowid,
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
 * Delete a category. Its transaction lines move to `reassignTo` (default Uncategorized);
 * children are deleted with it only if empty of lines, otherwise they are also reassigned.
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
    const ids = [
      id,
      ...(
        db.prepare('SELECT id FROM categories WHERE parent_id = ?').all(id) as { id: number }[]
      ).map((r) => r.id),
    ]
    if (ids.includes(target)) throw new Error('Cannot reassign lines to the category being deleted')
    const marks = ids.map(() => '?').join(',')
    db.prepare(`UPDATE transaction_lines SET category_id = ? WHERE category_id IN (${marks})`).run(
      target,
      ...ids,
    )
    db.prepare('DELETE FROM categories WHERE parent_id = ?').run(id)
    db.prepare('DELETE FROM categories WHERE id = ?').run(id)
  })()
}
