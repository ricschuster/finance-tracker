// Click through OFX, QFX (fitid duplicate detection) and Mint import using test-data/import.
import path from 'node:path'
import { launch, chooseImportAccount } from './lib.mjs'

const ROOT = path.resolve(import.meta.dirname, '../../..')
const sample = (f) => path.join(ROOT, 'test-data/import', f)
const { app, page, errors, shot, stubOpenDialog } = await launch()

async function start(file) {
  await stubOpenDialog(sample(file))
  await page.getByRole('tab', { name: 'Import', exact: true }).click()
  const another = page.getByRole('button', { name: 'Import another file' })
  if (await another.count()) await another.click()
  await page.getByRole('button', { name: /Choose file/ }).click()
  await chooseImportAccount(page)
}
const text = async () => (await page.locator('section[aria-label="Import"]').innerText()).replace(/\n+/g, ' | ')

// OFX, then QFX with the same fitids: the second should import nothing new.
for (const f of ['statement.ofx', 'statement.qfx']) {
  await start(f)
  await page.getByRole('button', { name: 'Preview', exact: true }).click()
  await page.waitForTimeout(500)
  await shot(`${f}-preview`)
  console.log(f, 'PREVIEW:', (await text()).slice(0, 600))
  await page.getByRole('button', { name: 'Import', exact: true }).last().click()
  await page.waitForTimeout(500)
  await shot(`${f}-done`)
  console.log(f, 'DONE:', (await text()).slice(0, 200))
}

// Mint
await start('mint.csv')
await page.waitForTimeout(500)
await shot('mint-accounts')
console.log('MINT MAP:', (await text()).slice(0, 400))
await page.getByRole('button', { name: 'Preview', exact: true }).click()
await page.waitForTimeout(500)
await shot('mint-preview')
console.log('MINT PREVIEW:', (await text()).slice(0, 700))
await page.getByRole('button', { name: 'Import', exact: true }).last().click()
await page.waitForTimeout(500)
await shot('mint-done')
console.log('MINT DONE:', (await text()).slice(0, 300))

await page.getByRole('tab', { name: 'Import history' }).click()
await page.waitForTimeout(500)
await shot('history')
console.log('HISTORY:', (await page.locator('section[aria-label="Import history"]').innerText()).replace(/\n+/g, ' | '))
console.log('errors:', errors)
await app.close()
