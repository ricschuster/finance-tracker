// Accounts tab: grouped balances, summary, open an account, Transactions tab shows all.
import { launch } from './lib.mjs'
const { page, errors, shot } = await launch({ outDir: process.env.SCREENSHOT_DIR ?? '/tmp/ft-shots' })
await page.getByRole('navigation', { name: 'Accounts' }).getByRole('button', { name: 'All accounts' }).click()
console.log('title:', await page.locator('.page-header h2').innerText())
console.log(await page.locator('.main').innerText())
await shot('accounts-page')
await page.getByRole('button', { name: 'Open Visa' }).click()
console.log('after open:', await page.locator('.page-header h2').innerText())
await page.getByRole('tab', { name: 'Accounts' }).click()
console.log('tab title:', await page.locator('.page-header h2').innerText())
console.log('ERRORS', errors)
process.exit(0)
