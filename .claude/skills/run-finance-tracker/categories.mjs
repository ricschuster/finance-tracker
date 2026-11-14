// Click through the Categories tab: add, add subcategory, rename, delete with reassign.
import { launch } from './lib.mjs'

const { app, page, errors, shot } = await launch()
const tree = async () => (await page.locator('.category-tree').innerText()).replace(/\n+/g, ' | ')

await page.getByRole('tab', { name: 'Categories', exact: true }).click()
await page.waitForTimeout(400)
await shot('categories-start')
console.log('START:', (await tree()).slice(0, 300))

await page.getByRole('button', { name: 'Add category' }).click()
await page.getByLabel('New category name').fill('Pets')
await page.locator('.category-add').getByRole('button', { name: 'Add', exact: true }).click()
await page.waitForTimeout(400)

const pets = page.locator('li.category-parent', { hasText: 'Pets' })
await pets.getByRole('button', { name: 'Add subcategory' }).click()
await page.getByLabel('New subcategory of Pets').fill('Vet')
await page.locator('.category-add').getByRole('button', { name: 'Add', exact: true }).click()
await page.waitForTimeout(400)
console.log('ADDED:', (await pets.innerText()).replace(/\n+/g, ' | '))

await pets.getByRole('button', { name: 'Rename' }).first().click()
await page.getByLabel('New name for Pets').fill('Animals')
await page.getByRole('button', { name: 'Save' }).click()
await page.waitForTimeout(400)
console.log('RENAMED:', /Animals/.test(await tree()))

const animals = page.locator('li.category-parent', { hasText: 'Animals' })
await animals.getByRole('button', { name: 'Delete' }).first().click()
await shot('categories-delete')
console.log('DELETE PROMPT:', (await animals.locator('.category-delete').innerText()).replace(/\n+/g, ' | '))
await page.getByRole('button', { name: 'Delete category' }).click()
await page.waitForTimeout(400)
console.log('GONE:', !/Animals/.test(await tree()))

// A category in use: delete one and check the line count text first.
await page.locator('li.category-parent', { hasText: 'Food & Dining' }).getByRole('button', { name: 'Delete' }).first().click()
console.log('IN USE PROMPT:', (await page.locator('.category-delete').innerText()).replace(/\n+/g, ' | ').slice(0, 200))
await shot('categories-in-use')
console.log('errors:', errors)
await app.close()
