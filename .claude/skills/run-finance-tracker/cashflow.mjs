// Click through the Cashflow tab: signed amounts, category search, row drill-down, and Back
// returning to the month that was being viewed. Also checks the dashboard has no Budgets card.
import { launch } from './lib.mjs'

const { app, page, errors, shot } = await launch()
await page.getByRole('tab', { name: 'Cashflow', exact: true }).click()
await page.waitForTimeout(400)
console.log('TILES:', (await page.locator('.stat-row').innerText()).replace(/\n+/g, ' | '))
console.log('BUDGET UI:', await page.getByText(/budget/i).count(), '(want 0 outside the hidden-from-reports note)')

// Find a month with data: step back until the category list has rows.
let rows = page.locator('section[aria-label="Cashflow"] table tbody tr')
for (let i = 0; i < 6 && (await rows.count()) === 0; i++) {
  await page.getByRole('button', { name: 'Previous month' }).click()
  await page.waitForTimeout(300)
}
const label = await page.locator('.month-stepper strong').innerText()
const texts = await rows.allInnerTexts()
console.log('MONTH:', label, '| ROWS:', texts.length)
console.log('NEGATIVE ROWS:', texts.filter((t) => /-\$|−\$|\(\$/.test(t)).length, '| POSITIVE ROWS:', texts.filter((t) => !/-\$|−\$|\(\$/.test(t)).length)
await shot('cashflow')

// Move off the current month so Back has something to get wrong, then pick a month with rows.
await page.getByRole('button', { name: 'Previous month' }).click()
await page.waitForTimeout(300)
for (let i = 0; i < 6 && (await rows.count()) === 0; i++) {
  await page.getByRole('button', { name: 'Previous month' }).click()
  await page.waitForTimeout(300)
}
const label2 = await page.locator('.month-stepper strong').innerText()
console.log('DRILL MONTH:', label2, '| ROWS:', await rows.count())

// Search narrows the list.
const first = (await rows.first().innerText()).split(/\s+/)[0]
await page.getByLabel('Search categories').fill(first.slice(0, 3))
await page.waitForTimeout(200)
console.log('SEARCH', first.slice(0, 3), '->', await rows.count())
await page.getByLabel('Search categories').fill('zzzz-nothing')
console.log('NO MATCH:', await page.getByText(/No category matches/).count())
await page.getByLabel('Search categories').fill('')

// Drill down from a row, then Back must land on the same month.
await rows.first().getByRole('button').click()
await page.waitForTimeout(500)
console.log('DRILLED TO:', await page.locator('.page-header h2, h2').first().innerText())
await shot('cashflow-drill')
await page.getByRole('button', { name: 'Back' }).click()
await page.waitForTimeout(400)
const after = await page.locator('.month-stepper strong').innerText()
console.log('BACK MONTH:', after, after === label2 ? 'OK' : 'MISMATCH')

// Dashboard has no Budgets card or customize option.
await page.getByRole('tab', { name: 'Dashboard' }).click()
await page.waitForTimeout(500)
console.log('DASH BUDGETS HEADING:', await page.getByRole('heading', { name: 'Budgets' }).count())
await page.getByRole('button', { name: 'Customize' }).click()
console.log('CUSTOMIZE:', (await page.locator('.dash-customize').innerText()).replace(/\n+/g, ' | '))
console.log('ERRORS:', errors)
await app.close()
