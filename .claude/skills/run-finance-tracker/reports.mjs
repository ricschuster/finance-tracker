// Click through the dashboard and reports, drill down to transactions, take screenshots.
import { launch } from './lib.mjs'

const { page, errors, shot } = await launch()
await page.getByRole('tab', { name: 'Dashboard' }).click()
await page.getByRole('region', { name: 'Dashboard' }).waitFor()
await shot('dashboard')

await page.getByRole('tab', { name: 'Reports' }).click()
await page.getByRole('region', { name: 'Reports' }).waitFor()
await page.getByLabel('Period').selectOption('year')
await shot('reports-year')

await page.getByRole('region', { name: 'Reports' }).locator('button.link').first().click()
await page.getByRole('tab', { name: 'Transactions', selected: true }).waitFor()
await page.waitForTimeout(500)
await shot('drilldown')
console.log('errors:', JSON.stringify(errors))
process.exit(0)
