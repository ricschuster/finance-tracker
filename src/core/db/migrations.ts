import type Database from 'better-sqlite3'

/**
 * Ordered, append-only list of migrations. Never edit one that has shipped;
 * add a new entry. The schema version is stored in SQLite's user_version.
 */
export const migrations: readonly string[] = [
  `CREATE TABLE settings (
     key   TEXT PRIMARY KEY,
     value TEXT NOT NULL
   );
   INSERT INTO settings (key, value) VALUES ('home_currency', 'CAD');`,
]

export function migrate(db: Database.Database, list: readonly string[] = migrations): number {
  const current = db.pragma('user_version', { simple: true }) as number
  if (current > list.length) {
    throw new Error(`Database version ${current} is newer than this app supports (${list.length})`)
  }
  for (let v = current; v < list.length; v++) {
    const sql = list[v] as string
    db.transaction(() => {
      db.exec(sql)
      db.pragma(`user_version = ${v + 1}`)
    })()
  }
  return list.length
}
