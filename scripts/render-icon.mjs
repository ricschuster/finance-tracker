// Renders build/icon.svg to build/icon.png (1024x1024, transparent), which electron-builder turns
// into the macOS icns, the Windows ico and the Linux icon. Uses the project's Electron:
//   npx electron scripts/render-icon.mjs      (headless Linux: xvfb-run -a npx electron ...)
import { app, BrowserWindow } from 'electron'
import { Buffer } from 'node:buffer'
import { readFileSync, writeFileSync } from 'node:fs'
import { setTimeout } from 'node:timers/promises'
import { URL } from 'node:url'

const svgUrl = new URL('../build/icon.svg', import.meta.url)
const pngUrl = new URL('../build/icon.png', import.meta.url)
const svg = readFileSync(svgUrl, 'utf8')

app.disableHardwareAcceleration()
// No top-level await here: in an ESM main script it would hold back the ready event.
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1024,
    height: 1024,
    show: false,
    frame: false,
    transparent: true,
    webPreferences: { offscreen: true },
  })
  await win.loadURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`)
  await setTimeout(500)
  const image = await win.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 })
  writeFileSync(pngUrl, image.resize({ width: 1024, height: 1024 }).toPNG())
  app.quit()
})
