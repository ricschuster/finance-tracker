// Click through the Rules tab: new rule in the dialog, preview, apply through the in-app
// confirm, reorder, turn off, delete.
import { launch } from './lib.mjs'

const { app, page, errors, shot } = await launch()
const dialog = page.getByRole('dialog')
const confirmDialog = page.getByTestId('confirm-dialog')
const items = page.locator('.rule-item')

await page.getByRole('tab', { name: 'Rules' }).click()
await page.waitForTimeout(300)
await shot('rules-empty')

for (const [name, text, category] of [
  ['Coffee', 'tim hortons', 'Food & Dining'],
  ['Groceries', 'costco', 'Groceries'],
]) {
  await page.getByRole('button', { name: 'New rule' }).click()
  await dialog.getByLabel('Name').fill(name)
  await dialog.getByLabel('Text', { exact: true }).fill(text)
  await dialog.getByLabel('Category', { exact: true }).selectOption({ label: category })
  if (name === 'Coffee') await shot('rules-editor')
  await dialog.getByRole('button', { name: 'Save rule' }).click()
  await page.waitForTimeout(300)
}
console.log('RULES:', (await items.allInnerTexts()).map((t) => t.replace(/\n+/g, ' ')))

await page.getByRole('button', { name: 'Move rule 2 up' }).click()
await page.waitForTimeout(300)
console.log('FIRST AFTER MOVE:', (await items.first().innerText()).split('\n')[1])

await page.getByRole('button', { name: 'Actions for rule 2' }).click()
await page.getByRole('menuitem', { name: 'Turn off' }).click()
await page.waitForTimeout(300)
console.log('OFF:', await items.nth(1).getAttribute('class'))

await page.getByRole('button', { name: 'Preview on existing transactions' }).click()
await page.waitForTimeout(400)
console.log('PREVIEW:', await page.getByLabel('Rule preview').locator('h3').innerText())
await shot('rules-preview')
const apply = page.getByRole('button', { name: /^Apply to/ })
if (await apply.count()) {
  await apply.click()
  await confirmDialog.waitFor()
  console.log('CONFIRM:', (await confirmDialog.innerText()).replace(/\n+/g, ' | '))
  await confirmDialog.getByRole('button', { name: 'Apply' }).click()
  await page.waitForTimeout(400)
  console.log('PREVIEW CLOSED:', (await page.getByLabel('Rule preview').count()) === 0)
}

await page.getByRole('button', { name: 'Actions for rule 1' }).click()
await page.getByRole('menuitem', { name: 'Edit' }).click()
console.log('EDIT NAME:', await dialog.getByLabel('Name').inputValue())
await dialog.getByRole('button', { name: 'Cancel' }).click()

await page.getByRole('button', { name: 'Actions for rule 2' }).click()
await page.getByRole('menuitem', { name: 'Delete' }).click()
await confirmDialog.getByRole('button', { name: 'Delete' }).click()
await page.waitForTimeout(300)
console.log('AFTER DELETE:', await items.count())
await shot('rules-list')
console.log('ERRORS:', errors)
await app.close()
