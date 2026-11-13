import type Database from 'better-sqlite3'
import type { SearchQuery } from './query'

export interface SavedSearch {
  id: number
  name: string
  query: SearchQuery
}

/** Paging is not part of a saved search. */
function stored(q: SearchQuery): string {
  const rest = { ...q }
  delete rest.limit
  delete rest.offset
  return JSON.stringify(rest)
}

export function listSavedSearches(db: Database.Database): SavedSearch[] {
  return (
    db.prepare('SELECT id, name, query FROM saved_searches ORDER BY name').all() as {
      id: number
      name: string
      query: string
    }[]
  ).map((r) => ({ id: r.id, name: r.name, query: JSON.parse(r.query) as SearchQuery }))
}

/** Saving an existing name replaces its query. Returns the id. */
export function saveSearch(db: Database.Database, name: string, query: SearchQuery): number {
  const n = name.trim()
  if (!n) throw new Error('A saved search needs a name')
  db.prepare(
    `INSERT INTO saved_searches (name, query) VALUES (?, ?)
     ON CONFLICT(name) DO UPDATE SET query = excluded.query`,
  ).run(n, stored(query))
  return (db.prepare('SELECT id FROM saved_searches WHERE name = ?').get(n) as { id: number }).id
}

export function deleteSavedSearch(db: Database.Database, id: number): void {
  if (db.prepare('DELETE FROM saved_searches WHERE id = ?').run(id).changes === 0) {
    throw new Error(`Saved search ${id} not found`)
  }
}
