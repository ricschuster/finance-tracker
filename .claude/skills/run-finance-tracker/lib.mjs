// Shared launcher for driving the built Electron app headless with Playwright.
// Run scripts under: xvfb-run -a -s "-screen 0 1440x900x24" node <script>
import { _electron as electron } from 'playwright-core'
import path from 'node:path'
import fs from 'node:fs'

const ROOT = path.resolve(import.meta.dirname, '../../..')

/** Launch the built app (run `npm run rebuild:electron && npm run build` first). */
export async function launch({ outDir = '/tmp/ft-shots', dbName = 'ui.sqlite', fresh = true } = {}) {
  fs.mkdirSync(outDir, { recursive: true })
  const db = path.join(outDir, dbName)
  if (fresh) for (const f of [db, db + '-wal', db + '-shm']) fs.rmSync(f, { force: true })
  const app = await electron.launch({
    executablePath: path.join(ROOT, 'node_modules/electron/dist/electron'),
    args: ['--no-sandbox', ROOT],
    env: { ...process.env, FT_DB_PATH: db, FT_SEED: 'demo' },
    timeout: 30000,
  })
  const page = await app.firstWindow()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  // window.confirm() is auto-cancelled by Playwright unless a handler accepts it.
  page.on('dialog', (d) => {
    console.log('DIALOG:', d.message())
    d.accept()
  })
  await page.setViewportSize({ width: 1400, height: 900 })
  await page.getByRole('tab', { name: 'Transactions' }).waitFor()
  const shot = (name) => page.screenshot({ path: path.join(outDir, name + '.png') })
  /** Replace the native open-file dialog so the import wizard gets this file. */
  const stubOpenDialog = (file) =>
    app.evaluate(({ dialog }, f) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [f] })
    }, file)
  return { app, page, errors, shot, stubOpenDialog, outDir }
}
