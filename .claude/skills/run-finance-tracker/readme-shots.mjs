// Capture the README screenshots on the synthetic demo database, in light and dark.
// Usage: xvfb-run -a -s "-screen 0 1440x900x24" node .claude/skills/run-finance-tracker/readme-shots.mjs [outDir]
import { launch, pickCategory } from './lib.mjs'

const outDir = process.argv[2] ?? 'docs/images'
const { app, page, errors, shot } = await launch({ outDir: '/tmp/ft-shots/readme' })
const out = (name) => page.screenshot({ path: `${outDir}/${name}.png` })
const dialog = page.getByRole('dialog')
const tab = async (name) => {
  await page.getByRole('tab', { name, exact: true }).click()
  await page.waitForTimeout(500)
}

// Give the demo some budgets and rules so those screens are not empty.
await tab('Budgets')
for (const [cat, amount] of [
  ['Groceries', '600'],
  ['Food & Dining', '150'],
  ['Entertainment', '60'],
  ['Shopping', '120'],
]) {
  await page.getByRole('button', { name: 'Add budget' }).first().click()
  await dialog.getByLabel('Category to budget').selectOption({ label: cat })
  await dialog.getByLabel('Monthly budget amount').fill(amount)
  await dialog.getByRole('button', { name: 'Add budget' }).click()
  await page.waitForTimeout(400)
}
await tab('Rules')
for (const [name, text, category] of [
  ['Groceries', 'safeway', 'Groceries'],
  ['Groceries', 'costco', 'Groceries'],
  ['Streaming', 'netflix', 'Entertainment'],
  ['Coffee', 'starbucks', 'Food & Dining'],
]) {
  await page.getByRole('button', { name: 'New rule' }).click()
  await dialog.getByLabel('Name').fill(name)
  await dialog.getByLabel('Text', { exact: true }).fill(text)
  await pickCategory(dialog, 'Category', category, { exact: true })
  await dialog.getByRole('button', { name: 'Save rule' }).click()
  await page.waitForTimeout(300)
}

for (const scheme of ['light', 'dark']) {
  await page.emulateMedia({ colorScheme: scheme })
  const sfx = scheme === 'dark' ? '-dark' : ''
  for (const [name, file] of [
    ['Dashboard', 'dashboard'],
    ['Transactions', 'transactions'],
    ['Reports', 'reports'],
    ['Budgets', 'budgets'],
    ['Rules', 'rules'],
    ['Categories', 'categories'],
    ['Import', 'import'],
  ]) {
    await tab(name)
    await out(file + sfx)
  }
}
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors')
await app.close()
