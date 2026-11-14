// Screenshot every main screen in light and dark, for look-and-feel review.
// Usage: xvfb-run -a -s "-screen 0 1440x900x24" node .claude/skills/run-finance-tracker/screens.mjs [outDir]
import { launch } from './lib.mjs'

const outDir = process.argv[2] ?? '/tmp/ft-shots/screens'
const TABS = [
  'Dashboard',
  'Transactions',
  'Reports',
  'Budgets',
  'Import',
  'Import history',
  'Rules',
  'Categories',
  'Data',
]

const { app, page, errors, shot } = await launch({ outDir })
for (const scheme of ['light', 'dark']) {
  await page.emulateMedia({ colorScheme: scheme })
  for (const tab of TABS) {
    if (tab === 'Import history') await page.getByRole('tab', { name: 'Import', exact: true }).click()
    const el = page.getByRole('tab', { name: tab, exact: true })
    if ((await el.count()) === 0) {
      console.log('missing tab:', tab)
      continue
    }
    await el.click()
    await page.waitForTimeout(400)
    await shot(`${scheme}-${tab.toLowerCase().replace(/\s+/g, '-')}`)
  }
}
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors')
await app.close()
