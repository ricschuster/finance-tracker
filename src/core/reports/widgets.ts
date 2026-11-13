import type Database from 'better-sqlite3'

/** The dashboard sections the user can show or hide, in display order. */
export const DASHBOARD_WIDGETS = [
  { id: 'income', label: 'Income' },
  { id: 'spending', label: 'Spending' },
  { id: 'net', label: 'Net and savings rate' },
  { id: 'review', label: 'Uncategorized reminder' },
  { id: 'topCategories', label: 'Top categories' },
  { id: 'trend', label: 'Last six months' },
  { id: 'biggest', label: 'Biggest this month' },
] as const

export type DashboardWidgetId = (typeof DASHBOARD_WIDGETS)[number]['id']

const KEY = 'dashboard_widgets'
const ALL: DashboardWidgetId[] = DASHBOARD_WIDGETS.map((w) => w.id)

/** Ids of the widgets to show. Everything is shown until the user chooses otherwise. */
export function getDashboardWidgets(db: Database.Database): DashboardWidgetId[] {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(KEY) as
    { value: string } | undefined
  if (!row) return [...ALL]
  try {
    const saved: unknown = JSON.parse(row.value)
    if (Array.isArray(saved)) return ALL.filter((id) => saved.includes(id))
  } catch {
    // fall through to the default
  }
  return [...ALL]
}

/** Save the visible widgets. Unknown ids are rejected; display order stays fixed. */
export function setDashboardWidgets(db: Database.Database, ids: string[]): DashboardWidgetId[] {
  const unknown = ids.filter((id) => !(ALL as string[]).includes(id))
  if (unknown.length > 0) throw new Error(`Unknown dashboard widget: ${unknown.join(', ')}`)
  const visible = ALL.filter((id) => ids.includes(id))
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run(KEY, JSON.stringify(visible))
  return visible
}
