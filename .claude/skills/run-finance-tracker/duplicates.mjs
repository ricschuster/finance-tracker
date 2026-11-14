// Find duplicates (keep one, cross-account), names-only sidebar, Transactions tab shows all accounts.
import { launch } from './lib.mjs'

const { page, errors, shot } = await launch({ outDir: process.env.SCREENSHOT_DIR ?? '/tmp/ft-shots' })

// Seed duplicates through the preload API: a triple in one account and a pair across two accounts.
const ids = await page.evaluate(async () => {
  const accts = await window.api.ledger.listAccounts()
  const [a, b] = accts
  const mk = (accountId, date) =>
    window.api.ledger.createTransaction({ accountId, date, amount: -12345, payee: 'Zed Dup Test' })
  await mk(a.id, '2026-02-10')
  await mk(a.id, '2026-02-10')
  await mk(a.id, '2026-02-11')
  await mk(a.id, '2026-02-20').then(() => undefined)
  await window.api.ledger.createTransaction({ accountId: a.id, date: '2026-02-20', amount: -777, payee: 'Cross Pay' })
  await window.api.ledger.createTransaction({ accountId: b.id, date: '2026-02-20', amount: -777, payee: 'Cross Pay' })
  return accts.map((x) => x.name)
})
console.log('accounts', ids)
await page.reload()
await page.getByRole('tab', { name: 'Dashboard' }).waitFor()

// Sidebar: names only
const sidebar = await page.getByRole('navigation', { name: 'Accounts' }).innerText()
console.log('SIDEBAR:\n' + sidebar)
console.log('has $ in sidebar accounts:', /\$/.test(sidebar.replace(/Net worth[\s\S]*?\n\n?/, '').split('All accounts')[1] ?? ''))

// Transactions tab shows all accounts even after picking one
await page.getByRole('navigation', { name: 'Accounts' }).getByRole('button', { name: 'Savings' }).click()
console.log('title after account:', await page.locator('.page-header h2').innerText())
await page.getByRole('tab', { name: 'Transactions' }).click()
console.log('title after tab:', await page.locator('.page-header h2').innerText())
console.log('subtitle:', await page.locator('.subtitle').innerText())

// Duplicates
await page.getByRole('button', { name: 'Find duplicates' }).click()
const dlg = page.getByRole('dialog')
await dlg.getByTestId('dup-group').first().waitFor()
console.log('groups (cross on):', await dlg.getByTestId('dup-group').count())
await shot('dup-dialog')
await dlg.getByLabel('Match across accounts').uncheck()
await page.waitForTimeout(400)
console.log('groups (cross off):', await dlg.getByTestId('dup-group').count())
await dlg.getByLabel('Match across accounts').check()
await page.waitForTimeout(400)

// Keep one of each, then undo, then again
await dlg.getByRole('button', { name: /Keep one of each/ }).click()
await page.getByTestId('confirm-dialog').screenshot({ path: '/tmp/ft-shots/dup-confirm.png' })
await page.getByTestId('confirm-dialog').getByRole('button', { name: 'Delete extras' }).click()
await page.waitForTimeout(500)
console.log('groups after keep-one:', await dlg.getByTestId('dup-group').count(), await dlg.innerText().then((t) => t.includes('No likely duplicates')))
await shot('dup-after')
await page.getByRole('button', { name: 'Undo' }).click()
await page.waitForTimeout(700)
console.log('groups after undo:', await dlg.getByTestId('dup-group').count())
console.log('ERRORS', errors)
process.exit(0)
