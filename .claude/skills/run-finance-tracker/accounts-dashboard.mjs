// Click through account edit/archive/delete and the dashboard Customize panel.
import { launch } from './lib.mjs'

const { app, page, errors, shot } = await launch()
const side = async () => (await page.locator('.main').innerText()).replace(/\n+/g, ' | ')

// Dashboard customize
await page.getByRole('button', { name: 'Customize' }).click()
await page.locator('.dash-customize').waitFor()
await page.getByLabel('Top categories').uncheck()
await page.getByLabel('Biggest this month').uncheck()
await page.waitForTimeout(300)
await shot('dash-customized')
const dash = await page.locator('section[aria-label="Dashboard"]').innerText()
console.log('DASH hides top categories:', !/Top categories\n/.test(dash.replace(/Show on the dashboard[\s\S]*?Biggest this month\n/, '')), 'still has trend:', /Last six months/.test(dash))

// Account edit from the Accounts tab: Edit account on a row opens the dialog.
await page.getByRole('tab', { name: 'Accounts' }).click()
const editAccount = (name) => page.getByRole('button', { name: `Edit account ${name}` }).click()
await editAccount('Wallet')
await page.getByLabel('Name', { exact: true }).fill('Cash wallet')
await page.getByRole('button', { name: 'Save' }).click()
await page.waitForTimeout(400)
console.log('RENAMED:', /Cash wallet/.test(await side()))

// Archive, then see it in the Archived card
await editAccount('Cash wallet')
await page.getByRole('button', { name: 'Archive', exact: true }).click()
await page.waitForTimeout(400)
console.log('ARCHIVED:', /Archived/.test(await side()))
await editAccount('Cash wallet')
await page.getByRole('button', { name: 'Unarchive' }).click()
await page.waitForTimeout(400)
console.log('UNARCHIVED:', /Cash wallet/.test(await side()), !/Archived/.test(await side()))

// Delete with transactions
await editAccount('Cash wallet')
await page.getByRole('button', { name: 'Delete', exact: true }).click()
await shot('account-delete')
console.log('PROMPT:', (await page.locator('.account-editor .category-delete').innerText()).replace(/\n+/g, ' | ').slice(0, 260))
await page.getByRole('button', { name: 'Delete account' }).click()
await page.waitForTimeout(500)
console.log('DELETED:', !/Cash wallet/.test(await side()))
await shot('after-delete')
console.log('errors:', errors)
await app.close()
