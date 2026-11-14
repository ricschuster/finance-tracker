// Click through the Transactions screen: dialogs, filters, bulk bar, row menu, split, rule prompt.
// Usage: xvfb-run -a -s "-screen 0 1440x900x24" node .claude/skills/run-finance-tracker/transactions.mjs [outDir]
import { launch, pickCategory } from './lib.mjs'

const outDir = process.argv[2] ?? '/tmp/ft-shots/transactions'
const { app, page, errors, shot } = await launch({ outDir })
const confirmDialog = page.getByTestId('confirm-dialog')

await page.getByRole('tab', { name: 'Transactions' }).click()
await page.waitForTimeout(300)
await shot('list')

// Add transaction dialog
await page.getByRole('button', { name: 'Add transaction' }).click()
await page.getByLabel('Payee').fill('Test Cafe')
await page.getByLabel('Amount').fill('4.50')
await shot('add-dialog')
await page.getByRole('dialog').getByRole('button', { name: 'Add transaction' }).click()
await page.waitForTimeout(400)
console.log('ADDED:', await page.getByText('Test Cafe').count(), 'dialog closed:', (await page.getByRole('dialog').count()) === 0)

// Transfer dialog
await page.getByRole('button', { name: 'Transfer' }).click()
await shot('transfer-dialog')
await page.keyboard.press('Escape')

// Filters
await page.getByRole('button', { name: 'Filters' }).click()
await pickCategory(page, 'Category filter', 'Groceries')
await page.waitForTimeout(400)
await shot('filters')
console.log('FILTERED:', await page.locator('.result-summary').innerText())
await page.getByRole('button', { name: 'Clear' }).click()
await page.getByRole('button', { name: 'Filters' }).click()

// Bulk bar
await page.getByLabel('Select transaction', { exact: false }).nth(0).check()
await page.getByLabel('Select transaction', { exact: false }).nth(1).check()
await shot('bulk')
await page.getByRole('button', { name: 'Clear selection' }).click()

// Row menu and split
const firstMenu = page.getByRole('button', { name: /^Actions for transaction/ }).nth(1)
await firstMenu.click()
await shot('row-menu')
await page.getByRole('menuitem', { name: 'Split' }).click()
await page.waitForTimeout(200)
await shot('split')
await page.getByRole('button', { name: 'Cancel' }).click()

// Category change prompts for a rule (in-app dialog)
await pickCategory(page, /^Category for transaction/, 'Shopping', { nth: 2 })
await confirmDialog.waitFor()
await shot('rule-prompt')
console.log('PROMPT:', (await confirmDialog.innerText()).replace(/\n+/g, ' | '))
await confirmDialog.getByRole('button', { name: 'Not now' }).click()

// Delete via menu + confirm
await page.getByRole('row', { name: /Test Cafe/ }).getByRole('button', { name: /^Actions for transaction/ }).click()
await page.getByRole('menuitem', { name: 'Delete' }).click()
await confirmDialog.waitFor()
await shot('delete-confirm')
await confirmDialog.getByRole('button', { name: 'Delete' }).click()
await page.waitForTimeout(400)
console.log('DELETED Test Cafe:', (await page.getByText('Test Cafe').count()) === 0)

// Dark
await page.emulateMedia({ colorScheme: 'dark' })
await page.waitForTimeout(200)
await shot('list-dark')

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors')
await app.close()
