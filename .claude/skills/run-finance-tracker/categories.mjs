// Click through the Categories tab: add (dialog), merge, rename, delete with reassign,
// colour and icon. Row actions are in a "..." menu; each opens a dialog.
import { launch } from './lib.mjs'

const { app, page, errors, shot } = await launch()
const list = async () =>
  (await page.locator('.category-card').allInnerTexts()).join(' | ').replace(/\n+/g, ' | ')
const dialog = page.getByRole('dialog')
const menu = async (name, item) => {
  await page.getByRole('button', { name: `Actions for ${name}`, exact: true }).click()
  await page.getByRole('menuitem', { name: item }).click()
}
const add = async (name) => {
  await page.getByRole('button', { name: 'Add category' }).click()
  await dialog.getByLabel('New category name').fill(name)
  await dialog.getByRole('button', { name: 'Add category' }).click()
  await page.waitForTimeout(400)
}

await page.getByRole('tab', { name: 'Categories', exact: true }).click()
await page.waitForTimeout(400)
await shot('categories-start')
console.log('START:', (await list()).slice(0, 300))

await page.getByRole('button', { name: 'Add category' }).click()
await dialog.getByLabel('New category name').fill('Pets')
await dialog.getByRole('button', { name: 'Icon pet' }).click()
await shot('categories-add')
await dialog.getByRole('button', { name: 'Add category' }).click()
await page.waitForTimeout(400)
console.log(
  'ADDED WITH ICON:',
  await page.getByRole('row', { name: 'Pets' }).locator('.category-icon svg').getAttribute('class'),
)

await add('Vet')
await menu('Vet', 'Merge into...')
await dialog.getByLabel('Merge into').selectOption({ label: 'Pets' })
await shot('categories-merge')
await dialog.getByRole('button', { name: 'Merge', exact: true }).click()
await page.waitForTimeout(400)
console.log('MERGED:', !/Vet/.test(await list()) && /Pets/.test(await list()))

await menu('Pets', 'Rename')
await dialog.getByLabel('New name for Pets').fill('Animals')
await dialog.getByRole('button', { name: 'Save' }).click()
await page.waitForTimeout(400)
console.log('RENAMED:', /Animals/.test(await list()))

await menu('Animals', 'Delete')
await shot('categories-delete')
console.log('DELETE PROMPT:', (await dialog.innerText()).replace(/\n+/g, ' | '))
await dialog.getByRole('button', { name: 'Delete category' }).click()
await page.waitForTimeout(400)
console.log('GONE:', !/Animals/.test(await list()))

// Colour and icon.
await menu('Groceries', 'Colour and icon')
await dialog.getByRole('button', { name: 'Icon pet' }).click()
await dialog.getByRole('button', { name: 'Colour #e15759' }).click()
await shot('categories-style')
await dialog.getByRole('button', { name: 'Save' }).click()
await page.waitForTimeout(300)
const groceries = page.getByRole('row', { name: 'Groceries' })
console.log(
  'STYLED:',
  await groceries.locator('.category-icon').first().getAttribute('style'),
  await groceries.locator('.category-icon svg').first().getAttribute('class'),
)

// A category in use: the delete dialog names the line count and offers a target.
await menu('Food & Dining', 'Delete')
console.log('IN USE PROMPT:', (await dialog.innerText()).replace(/\n+/g, ' | ').slice(0, 200))
await shot('categories-in-use')
await dialog.getByRole('button', { name: 'Cancel' }).click()
console.log(
  'BUILT IN HAS NO MENU:',
  (await page.getByRole('button', { name: 'Actions for Uncategorized' }).count()) === 0,
)
console.log('errors:', errors)
await app.close()
