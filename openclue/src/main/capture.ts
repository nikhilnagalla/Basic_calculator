// User-initiated screenshots. Refuses unless the user has explicitly enabled screen access.
import { BrowserWindow, desktopCapturer, screen } from 'electron'
import type { CaptureResult } from '@shared/types'
import { getPermissionState } from './permissions'
import { store } from './store'

const MAX_WIDTH = 1920
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

export class ScreenAccessError extends Error {}

export async function captureScreen(win: BrowserWindow | null, onCapturing: (active: boolean) => void): Promise<CaptureResult> {
  const { screenAccessEnabled, hideOverlayDuringCapture } = store.get().privacy
  if (!screenAccessEnabled) {
    throw new ScreenAccessError('Screen access is off. Turn it on from the overlay or Settings → Privacy first.')
  }
  const perm = getPermissionState()
  if (perm.platform === 'darwin' && (perm.screen === 'denied' || perm.screen === 'restricted')) {
    throw new ScreenAccessError(
      'macOS has not granted Screen Recording permission. Open System Settings → Privacy & Security → Screen & System Audio Recording, enable OpenClue, then restart the app.'
    )
  }

  // Capture the display the overlay is on (or the one under the cursor).
  const point = win && !win.isDestroyed() ? (() => {
    const b = win.getBounds()
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
  })() : screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(point)
  const pxW = Math.round(display.size.width * display.scaleFactor)
  const pxH = Math.round(display.size.height * display.scaleFactor)
  const scale = Math.min(1, MAX_WIDTH / pxW)
  const thumbnailSize = { width: Math.round(pxW * scale), height: Math.round(pxH * scale) }

  onCapturing(true)
  const shouldHide = hideOverlayDuringCapture && win && !win.isDestroyed() && win.isVisible()
  try {
    if (shouldHide) {
      win!.setOpacity(0)
      await delay(140) // let the compositor drop the overlay from the frame
    }
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize })
    const source = sources.find((s) => s.display_id === String(display.id)) ?? sources[0]
    if (!source || source.thumbnail.isEmpty()) {
      throw new ScreenAccessError(
        'The screenshot came back empty. On macOS this usually means Screen Recording permission has not been granted to OpenClue yet (System Settings → Privacy & Security).'
      )
    }
    const jpeg = source.thumbnail.toJPEG(82)
    const size = source.thumbnail.getSize()
    return {
      dataUrl: `data:image/jpeg;base64,${jpeg.toString('base64')}`,
      width: size.width,
      height: size.height,
      capturedAt: Date.now()
    }
  } finally {
    if (shouldHide && win && !win.isDestroyed()) win.setOpacity(1)
    onCapturing(false)
  }
}
