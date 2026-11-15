// Click through the Cashflow tab: add a budget in the dialog, edit it from the row menu,
// step months, and remove it through the in-app confirm.
import { launch } from './lib.mjs'

const { app, page, errors, shot } = await launch()
await page.getByRole('tab', { name: 'Cashflow', exact: true }).click()
await page.waitForTimeout(400)
await page.getByRole('button', { name: 'Add budget' }).click()
const dialog = page.getByRole('dialog')
const opts = await dialog.getByLabel('Category to budget').locator('option').allInnerTexts()
console.log('OPTIONS:', opts.slice(0, 4))
await dialog.getByLabel('Category to budget').selectOption({ index: 1 })
await dialog.getByLabel('Monthly budget amount').fill('400')
await dialog.getByRole('button', { name: 'Add budget' }).click()
await page.waitForTimeout(500)
const rows = page.locator('.budget-row')
console.log('ROWS:', await rows.count(), '|', (await rows.first().innerText()).replace(/\n+/g, ' | '))

// A second, small budget so the over-budget state shows.
await page.getByRole('button', { name: 'Add budget' }).click()
await dialog.getByLabel('Category to budget').selectOption({ index: 1 })
await dialog.getByLabel('Monthly budget amount').fill('5')
await dialog.getByRole('button', { name: 'Add budget' }).click()
await page.waitForTimeout(500)
console.log('STATS:', (await page.locator('.stat-row').innerText()).replace(/\n+/g, ' | '))
await shot('budgets-added')

// The dashboard widget lists them, closest to the limit first, and links back.
await page.getByRole('tab', { name: 'Dashboard' }).click()
await page.waitForTimeout(500)
const widget = page.locator('.card', { has: page.getByRole('heading', { name: 'Budgets' }) })
console.log('WIDGET:', (await widget.innerText()).replace(/\n+/g, ' | '))
await shot('budgets-widget')
await widget.getByRole('button', { name: 'See all' }).click()
await page.waitForTimeout(300)

// Edit from the row menu.
await page.getByRole('button', { name: /^Actions for .* budget$/ }).first().click()
await page.getByRole('menuitem', { name: 'Edit amount' }).click()
await dialog.getByLabel('Monthly budget amount').fill('50')
await dialog.getByRole('button', { name: 'Save' }).click()
await page.waitForTimeout(500)
console.log('EDITED:', (await rows.first().locator('.budget-figures').innerText()).trim())

// Month stepper.
await page.getByRole('button', { name: 'Previous month' }).click()
await page.waitForTimeout(300)
console.log('MONTH:', await page.locator('.month-stepper strong').innerText())
await page.getByRole('button', { name: 'This month' }).click()
await page.waitForTimeout(300)

// Remove through the in-app confirm.
await page.getByRole('button', { name: /^Actions for .* budget$/ }).first().click()
await page.getByRole('menuitem', { name: 'Remove budget' }).click()
await page.getByTestId('confirm-dialog').getByRole('button', { name: 'Remove' }).click()
await page.waitForTimeout(500)
console.log('AFTER REMOVE:', await rows.count())
await shot('budgets-removed')
console.log('ERRORS:', errors)
await app.close()
