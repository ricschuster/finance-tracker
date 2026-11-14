// Review queue: open from the dashboard banner, apply with Enter, make a rule with R, skip with S.
import { launch } from './lib.mjs'
const outDir = process.env.SCREENSHOT_DIR ?? '/tmp/ft-shots'
const { page, errors, shot } = await launch({ outDir })
// Make sure there is something to review.
await page.evaluate(async () => {
  const accts = await window.api.ledger.listAccounts()
  for (const d of ['MYSTERY CAFE #1', 'MYSTERY CAFE #2', 'ODD SHOP'])
    await window.api.ledger.createTransaction({ accountId: accts[0].id, date: '2026-11-05', amount: -1500, rawDescription: d })
})
await page.getByRole('tab', { name: 'Transactions' }).click()
await page.getByRole('tab', { name: 'Dashboard' }).click()
await page.getByRole('button', { name: 'Review', exact: true }).click()
await page.waitForTimeout(400)
await shot('review-1')
console.log('card:', (await page.locator('.review-card').innerText()).replace(/\s+/g, ' '))
await page.getByLabel('Category').click()
await page.locator('.cat-picker-option', { hasText: 'Groceries' }).last().click()
await page.keyboard.press('r')
await page.waitForTimeout(500)
console.log('after R:', (await page.locator('.review-card').innerText()).replace(/\s+/g, ' '))
await page.keyboard.press('s')
await page.waitForTimeout(200)
console.log('after S:', (await page.locator('.review-card, .empty').first().innerText()).replace(/\s+/g, ' '))
await shot('review-2')
const rules = await page.evaluate(async () => (await window.api.rules.listRules()).map((r) => r.name))
console.log('rules:', JSON.stringify(rules))
console.log('ERRORS', errors)
process.exit(0)
