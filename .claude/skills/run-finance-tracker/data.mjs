// Click through the Data tab: backup folder, back up now, export database and CSV, stage a restore.
import fs from 'node:fs'
import path from 'node:path'
import { launch } from './lib.mjs'

const { app, page, errors, shot, outDir } = await launch()
const work = path.join(outDir, 'data-test')
fs.rmSync(work, { recursive: true, force: true })
fs.mkdirSync(work, { recursive: true })
const backups = path.join(work, 'backups')
const dbOut = path.join(work, 'export.sqlite')
const csvOut = path.join(work, 'transactions.csv')

// Stub native dialogs: open picks the backup folder or the exported database, save picks the outputs.
await app.evaluate(({ dialog }, p) => {
  dialog.showOpenDialog = async (...a) => {
    const o = a[a.length - 1]
    return { canceled: false, filePaths: [o.properties.includes('openDirectory') ? p.backups : p.dbOut] }
  }
  dialog.showSaveDialog = async (...a) => {
    const o = a[a.length - 1]
    return { canceled: false, filePath: o.title.includes('database') ? p.dbOut : p.csvOut }
  }
  dialog.showMessageBox = async () => ({ response: 0 })
}, { backups, dbOut, csvOut })

await page.getByRole('tab', { name: 'Data' }).click()
await page.getByRole('region', { name: 'Data' }).waitFor()
await shot('data-initial')

await page.getByRole('button', { name: 'Choose...' }).click()
await page.getByRole('button', { name: 'Save' }).click()
await page.getByRole('button', { name: 'Back up now' }).click()
await page.waitForTimeout(1500)
await shot('data-backup')
console.log((await page.getByRole('region', { name: 'Data' }).innerText()).split('\n').filter((l) => /fail|backup|error/i.test(l)).join(' | '))
await page.getByText('Backup written.').waitFor({ timeout: 3000 })
await page.getByRole('button', { name: 'Export database' }).click()
await page.getByText(/Database exported/).waitFor()
await page.getByRole('button', { name: 'Export CSV' }).click()
await page.getByText(/Transactions exported/).waitFor()
await shot('data-after')

console.log('backups:', fs.readdirSync(backups))
console.log('export.sqlite bytes:', fs.statSync(dbOut).size)
const csv = fs.readFileSync(csvOut, 'utf8').split('\r\n')
console.log('csv rows:', csv.length - 2, '| header:', csv[0], '| first:', csv[1])

// Staging a restore relaunches the app, which ends this session; check the staged file first.
const staged = path.join(outDir, 'ui.sqlite.restore')
page.getByRole('button', { name: 'Restore from file' }).click().catch(() => {})
for (let i = 0; i < 30 && !fs.existsSync(staged); i++) await new Promise((r) => setTimeout(r, 200))
console.log('restore staged:', fs.existsSync(staged))
console.log('errors:', JSON.stringify(errors))
process.exit(0)
