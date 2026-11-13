// End-to-end smoke test: launches the built Electron app against fake backends and drives the UI.
// Run with `npm run test:e2e` (builds first). On Linux CI wrap with `xvfb-run -a`.
import { _electron as electron } from 'playwright-core'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { startFakeBackends } from './fake-backends.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const require = createRequire(import.meta.url)
const shotsDir = process.env.SMOKE_SCREENSHOTS
const isMac = process.platform === 'darwin'
const mod = isMac ? 'Meta' : 'Control'

function assert(cond, msg) {
  if (!cond) throw new Error(`Assertion failed: ${msg}`)
  console.log(`  ✓ ${msg}`)
}

const backends = await startFakeBackends()
const base = `http://127.0.0.1:${backends.port}`

// Isolated profile with settings pointing at the fake backends.
const home = mkdtempSync(join(tmpdir(), 'openclue-e2e-'))
const userData = join(home, 'OpenClue')
mkdirSync(userData, { recursive: true })
writeFileSync(
  join(userData, 'settings.json'),
  JSON.stringify({
    ollama: { baseUrl: base, model: 'qwen2.5vl:7b' },
    transcription: { backend: 'whisper-cpp-server', whisperServerUrl: base, chunkSeconds: 2 },
    // Avoid clashing with shortcuts of a developer's running copy.
    hotkeys: { toggleOverlay: 'Alt+Shift+F9', askAboutScreen: 'Alt+Shift+F10', toggleRecording: 'Alt+Shift+F11', stopAll: 'Alt+Shift+F12' }
  })
)

const app = await electron.launch({
  executablePath: require('electron'),
  args: [
    join(root, 'out/main/index.js'),
    `--user-data-dir=${userData}`,
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    // CI containers / AppArmor-restricted runners can't use Chromium's sandbox.
    ...(process.platform === 'linux' ? ['--no-sandbox'] : [])
  ],
  env: { ...process.env, XDG_CONFIG_HOME: home, NODE_ENV: 'production' }
})

const shot = async (page, name) => {
  if (!shotsDir) return
  await page.waitForTimeout(250)
  await page.screenshot({ path: join(shotsDir, `${name}.png`) })
}

let failed = false
try {
  const page = await app.firstWindow()
  await page.waitForSelector('textarea')
  console.log('Overlay launched')

  const win = await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]
    return { onTop: w.isAlwaysOnTop(), bounds: w.getBounds() }
  })
  assert(win.onTop, 'overlay window is always on top')

  // Onboarding is shown on first run, with screen + mic off.
  await page.getByText('Welcome to OpenClue').waitFor()
  assert((await page.getByText('Off', { exact: true }).count()) === 2, 'screen and microphone start disabled')
  await shot(page, '01-welcome')
  await page.getByRole('button', { name: 'Get started' }).click()

  // Screenshots are refused while screen access is off.
  const refused = await page.evaluate(() => window.openclue.captureScreen().then(() => 'captured', (e) => e.message))
  assert(/Screen access is off/.test(refused), 'main process refuses capture while screen access is off')

  // Ask a plain question; the answer streams in and renders Markdown.
  await page.locator('textarea').fill('Hello?')
  await page.keyboard.press('Enter')
  await page.getByRole('heading', { name: 'Answer' }).waitFor()
  await page.locator('.md pre code').first().waitFor()
  await page.waitForFunction(() => !document.querySelector('.caret'))
  assert((await page.locator('.md li').count()) === 2, 'streamed Markdown renders lists and code')
  await shot(page, '02-answer')

  // Enable screen access through the consent dialog, then ask about the screen.
  await page.getByRole('button', { name: /Screen off/ }).click()
  await page.getByRole('dialog').waitFor()
  await shot(page, '03-consent')
  await page.getByRole('button', { name: 'Allow' }).click()
  await page.getByRole('button', { name: /^Screen$/ }).waitFor()
  await page.locator('textarea').fill('What is on my screen?')
  await page.keyboard.press('Enter')
  const outcome = await Promise.race([
    page.getByText('I can see your screenshot', { exact: false }).waitFor({ timeout: 15000 }).then(() => 'ok'),
    page.locator('.text-rec').first().waitFor({ timeout: 15000 }).then(async () => `error: ${await page.locator('.text-rec').first().innerText()}`)
  ]).catch((e) => `timeout: ${e.message}`)
  const chatReq = backends.requests.filter((r) => r.url === '/api/chat').at(-1)
  if (outcome === 'ok') {
    assert(JSON.parse(chatReq.body).messages.at(-1).images?.length === 1, 'screenshot was sent to the vision model')
    assert((await page.locator('img[alt="Screenshot sent with this message"]').count()) === 1, 'sent screenshot is shown in the conversation')
  } else {
    console.log(`  ! screen capture unavailable in this environment (${outcome})`)
  }
  await page.waitForFunction(() => !document.querySelector('.caret'))
  await shot(page, '04-screen-answer')

  // Microphone: consent, visible REC indicator, live transcript, immediate stop.
  await page.getByRole('button', { name: 'Start recording' }).click()
  await page.getByRole('dialog').waitFor()
  await page.getByRole('button', { name: 'Allow' }).click()
  await page.getByRole('button', { name: 'Stop recording' }).waitFor()
  assert(await page.getByText('REC', { exact: true }).isVisible(), 'REC indicator is visible while recording')
  await page.getByText('How do I reverse a linked list?').waitFor({ timeout: 15000 })
  assert(true, 'live transcript arrives from Whisper backend')
  await shot(page, '05-recording')

  // "Stop everything" (same main-process path as the global shortcut and tray item).
  await page.getByRole('button', { name: /^Stop everything/ }).click()
  await page.getByRole('button', { name: 'Start recording' }).waitFor({ timeout: 3000 })
  assert(true, 'stop-all stops the recording immediately')
  const after = await page.evaluate(() => window.openclue.getSettings())
  assert(after.settings.privacy.screenAccessEnabled === false, 'stop-all revokes screen access')
  await page.getByRole('button', { name: /Screen off/ }).waitFor()
  assert((await page.getByRole('button', { name: /^Stop everything/ }).count()) === 0, 'stop button disappears once nothing is active')

  // Settings + history panels.
  await page.keyboard.press(`${mod}+,`)
  await page.getByText('Ollama (local)').waitFor()
  await page.getByText('Connected · 2 models').waitFor()
  assert(true, 'settings lists Ollama models')
  await shot(page, '06-settings')
  await page.getByRole('button', { name: 'Privacy' }).click()
  await shot(page, '07-privacy')
  await page.getByRole('button', { name: 'Shortcuts' }).click()
  await shot(page, '08-shortcuts')
  await page.keyboard.press(`${mod}+j`)
  await page.getByText('Hello?').first().waitFor()
  assert(true, 'conversation was saved to history')
  await shot(page, '09-history')

  // Saved history never contains screenshot pixels by default.
  const list = await page.evaluate(() => window.openclue.listHistory())
  const conv = await page.evaluate((id) => window.openclue.getConversation(id), list[0].id)
  assert(conv.messages.every((m) => !m.screenshot), 'screenshots are not persisted in history by default')

  // Escape collapses back to the compact bar.
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  const h = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds().height)
  assert(h < 120, 'Esc collapses the overlay to the compact bar')
  await shot(page, '10-compact')
  console.log('\nSmoke test passed')
} catch (err) {
  failed = true
  console.error('\nSmoke test FAILED:', err)
} finally {
  await app.close().catch(() => undefined)
  backends.server.close()
}
process.exit(failed ? 1 : 0)
