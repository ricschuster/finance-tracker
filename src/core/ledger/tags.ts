import type Database from 'better-sqlite3'

/** All tag names in use, alphabetical. */
export function listTags(db: Database.Database): string[] {
  return (
    db
      .prepare(
        'SELECT name FROM tags WHERE id IN (SELECT tag_id FROM transaction_tags) ORDER BY name',
      )
      .all() as { name: string }[]
  ).map((r) => r.name)
}
