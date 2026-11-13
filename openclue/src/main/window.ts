// The floating overlay window: frameless, translucent, always on top, draggable.
import { app, BrowserWindow, screen, shell } from 'electron'
import { join } from 'node:path'
import type { WindowMode } from '@shared/types'
import { readJson, writeFileAtomic } from './fsutil'

const isMac = process.platform === 'darwin'
export const OVERLAY_WIDTH = 720
const HEIGHTS: Record<WindowMode, number> = { compact: 76, expanded: 600 }

interface WindowState {
  x: number
  y: number
}

let win: BrowserWindow | null = null
let mode: WindowMode = 'compact'
const statePath = () => join(app.getPath('userData'), 'window-state.json')

function defaultPosition(): WindowState {
  const { workArea } = screen.getPrimaryDisplay()
  return { x: Math.round(workArea.x + (workArea.width - OVERLAY_WIDTH) / 2), y: workArea.y + 48 }
}

/** Keep a saved position only if it is still on a connected display. */
function onScreen(s: WindowState): boolean {
  return screen.getAllDisplays().some(({ workArea: w }) =>
    s.x >= w.x - OVERLAY_WIDTH / 2 && s.x <= w.x + w.width - OVERLAY_WIDTH / 2 && s.y >= w.y && s.y <= w.y + w.height - 60
  )
}

let saveTimer: NodeJS.Timeout | undefined
function savePosition(): void {
  if (!win) return
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    if (!win || win.isDestroyed()) return
    const [x, y] = win.getPosition()
    void writeFileAtomic(statePath(), JSON.stringify({ x, y })).catch(() => undefined)
  }, 400)
}

export async function createOverlayWindow(): Promise<BrowserWindow> {
  const saved = await readJson<WindowState>(statePath())
  const pos = saved && typeof saved.x === 'number' && onScreen(saved) ? saved : defaultPosition()

  win = new BrowserWindow({
    width: OVERLAY_WIDTH,
    height: HEIGHTS.compact,
    x: pos.x,
    y: pos.y,
    show: false,
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    hasShadow: true,
    title: 'OpenClue',
    // macOS: native blur behind the dark glass. Elsewhere: a transparent window with CSS glass.
    ...(isMac
      ? { vibrancy: 'hud' as const, visualEffectState: 'active' as const, backgroundColor: '#00000000', roundedCorners: true }
      : { transparent: true, backgroundColor: '#00000000' }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
      // Keep recording timers accurate while the overlay is hidden.
      backgroundThrottling: false
    }
  })

  // Note: we deliberately do NOT call setContentProtection(). The overlay stays visible to
  // screen sharing, screenshots and recording/proctoring tools — OpenClue is not a stealth app.
  win.setAlwaysOnTop(true, 'floating')
  win.setVisibleOnAllWorkspaces(true)

  win.on('moved', savePosition)
  win.on('closed', () => {
    win = null
  })
  win.once('ready-to-show', () => win?.show())

  // Never navigate the overlay away from the app; open links in the default browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win?.webContents.getURL()) {
      e.preventDefault()
      if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    }
  })

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    await win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    await win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

export function getOverlay(): BrowserWindow | null {
  return win && !win.isDestroyed() ? win : null
}

export function setWindowMode(next: WindowMode): void {
  const w = getOverlay()
  if (!w || next === mode) return
  mode = next
  const b = w.getBounds()
  const height = HEIGHTS[next]
  // Keep the window on screen when expanding near the bottom edge.
  const area = screen.getDisplayMatching(b).workArea
  const y = Math.min(b.y, area.y + area.height - height)
  w.setBounds({ x: b.x, y: Math.max(area.y, y), width: OVERLAY_WIDTH, height }, isMac)
}

export function showOverlay(focus = true): void {
  const w = getOverlay()
  if (!w) return
  if (!w.isVisible()) w.show()
  if (focus) {
    w.focus()
    w.webContents.focus()
  }
}

export function hideOverlay(): void {
  getOverlay()?.hide()
}

export function toggleOverlay(): void {
  const w = getOverlay()
  if (!w) return
  if (w.isVisible() && w.isFocused()) hideOverlay()
  else showOverlay(true)
}
