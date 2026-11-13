// Renders the app + tray icons from SVG using Playwright's Chromium.
// Usage: node scripts/generate-icons.mjs   (requires `playwright` to be resolvable)
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const ring = (color, stroke = 3.2) => `
  <circle cx="16" cy="16" r="11" fill="none" stroke="${color}" stroke-width="${stroke}"
    stroke-dasharray="52 18" stroke-linecap="round" transform="rotate(-35 16 16)"/>
  <circle cx="16" cy="16" r="4" fill="${color}"/>`

const appIcon = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#262a3d"/><stop offset="1" stop-color="#0d0e15"/>
    </linearGradient>
    <linearGradient id="fg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#b8c2ff"/><stop offset="1" stop-color="#6d7dff"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.35" r="0.6">
      <stop offset="0" stop-color="#6d7dff" stop-opacity="0.35"/><stop offset="1" stop-color="#6d7dff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect x="100" y="100" width="824" height="824" rx="190" fill="url(#bg)"/>
  <rect x="100" y="100" width="824" height="824" rx="190" fill="url(#glow)"/>
  <rect x="101.5" y="101.5" width="821" height="821" rx="188.5" fill="none" stroke="#ffffff" stroke-opacity="0.12" stroke-width="3"/>
  <g transform="translate(512 512) scale(17) translate(-16 -16)">${ring('url(#fg)')}</g>
</svg>`

const tray = (color) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">${ring(color, 3.6)}</svg>`
const trayRec = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
  ${ring('#ff4d5e', 3.6)}<circle cx="16" cy="16" r="6.5" fill="#ff4d5e"/></svg>`

const outputs = [
  { svg: appIcon, size: 1024, file: 'build/icon.png' },
  { svg: appIcon, size: 512, file: 'resources/icon.png' },
  { svg: tray('#000000'), size: 16, file: 'resources/trayTemplate.png' },
  { svg: tray('#000000'), size: 32, file: 'resources/trayTemplate@2x.png' },
  { svg: trayRec, size: 16, file: 'resources/trayRecording.png' },
  { svg: trayRec, size: 32, file: 'resources/trayRecording@2x.png' }
]

const browser = await chromium.launch()
const page = await browser.newPage()
for (const o of outputs) {
  await page.setViewportSize({ width: o.size, height: o.size })
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${o.svg.replace(/width="\d+" height="\d+"/, `width="${o.size}" height="${o.size}"`)}</body></html>`
  )
  const out = join(root, o.file)
  mkdirSync(dirname(out), { recursive: true })
  await page.locator('svg').screenshot({ path: out, omitBackground: true })
  console.log('wrote', o.file)
}
await browser.close()
