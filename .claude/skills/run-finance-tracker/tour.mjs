// Example flow: search, rule, CSV import, undo. Writes screenshots to $SCREENSHOT_DIR.
import fs from 'node:fs'
import path from 'node:path'
import { launch } from './lib.mjs'

const outDir = process.env.SCREENSHOT_DIR || '/tmp/ft-shots'
const { app, page, errors, shot, stubOpenDialog } = await launch({ outDir })

const csv = path.join(outDir, 'sample.csv')
fs.writeFileSync(csv, 'Date,Description,Amount\n2026-11-01,SPOTIFY P1234,-12.00\n2026-11-02,TIM HORTONS #55,-4.75\n2026-11-03,PAYROLL ACME,2500.00\n')

await page.getByRole('tab', { name: 'Transactions' }).click()
await page.getByPlaceholder(/Search payee/).fill('costco')
await page.waitForTimeout(800)
await shot('search')

await page.getByRole('tab', { name: 'Rules' }).click()
await page.getByRole('button', { name: 'New rule' }).click()
await page.getByLabel('Name').last().fill('Spotify')
await page.getByLabel('Text', { exact: true }).fill('spotify')
await page.getByLabel('Set payee').fill('Spotify')
await page.getByLabel('Category', { exact: true }).selectOption({ label: 'Entertainment' })
await page.getByRole('button', { name: 'Save rule' }).click()
await shot('rule-saved')

await stubOpenDialog(csv)
await page.getByRole('tab', { name: 'Import', exact: true }).click()
await page.getByRole('button', { name: /Choose file/ }).click()
await page.getByRole('button', { name: 'Preview', exact: true }).click()
await shot('import-preview')
await page.getByRole('button', { name: 'Import', exact: true }).last().click()
await shot('import-done')

await page.getByRole('tab', { name: 'Import history' }).click()
await page.getByRole('button', { name: 'Undo' }).click()
await page.waitForTimeout(800)
await shot('undo')

console.log('errors:', errors)
await app.close()
