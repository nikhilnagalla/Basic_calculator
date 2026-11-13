// Menu-bar (tray) icon. Always mirrors what OpenClue is doing: recording and screen access are
// shown here even when the overlay is hidden, and both can be stopped from this menu.
import { Menu, nativeImage, Tray } from 'electron'
import trayIconPath from '../../resources/trayTemplate.png?asset'
import trayRecordingPath from '../../resources/trayRecording.png?asset'
import type { Settings } from '@shared/types'

const isMac = process.platform === 'darwin'

export interface TrayActions {
  toggleOverlay: () => void
  askAboutScreen: () => void
  toggleRecording: () => void
  setScreenAccess: (enabled: boolean) => void
  stopAll: () => void
  openSettings: () => void
  openHistory: () => void
  quit: () => void
}

let tray: Tray | null = null
let actions: TrayActions
let lastState: { settings: Settings; recording: boolean } | null = null

export function createTray(a: TrayActions, settings: Settings): void {
  actions = a
  const icon = nativeImage.createFromPath(trayIconPath)
  if (isMac) icon.setTemplateImage(true)
  tray = new Tray(icon)
  // On macOS a click opens the context menu automatically; elsewhere it toggles the overlay.
  if (!isMac) tray.on('click', () => actions.toggleOverlay())
  updateTray(settings, false)
}

export function updateTray(settings: Settings, recording: boolean): void {
  if (!tray) return
  lastState = { settings, recording }
  const screenOn = settings.privacy.screenAccessEnabled
  const hk = settings.hotkeys
  const accel = (a: string) => (a ? a : undefined)

  const recIcon = nativeImage.createFromPath(recording ? trayRecordingPath : trayIconPath)
  if (isMac && !recording) recIcon.setTemplateImage(true)
  tray.setImage(recIcon)

  const flags = [recording ? '● REC' : '', screenOn ? 'Screen on' : ''].filter(Boolean)
  if (isMac) tray.setTitle(flags.length ? ` ${flags.join(' · ')}` : '')
  tray.setToolTip(`OpenClue${flags.length ? ` — ${flags.join(', ')}` : ''}`)

  const menu = Menu.buildFromTemplate([
    { label: recording ? '● Recording microphone' : 'Microphone idle', enabled: false },
    { label: screenOn ? '◉ Screen access ON (captures only when you ask)' : 'Screen access off', enabled: false },
    { type: 'separator' },
    { label: 'Show / Hide Overlay', accelerator: accel(hk.toggleOverlay), click: actions.toggleOverlay },
    { label: 'Ask About Screen', accelerator: accel(hk.askAboutScreen), enabled: screenOn, click: actions.askAboutScreen },
    { label: recording ? 'Stop Recording' : 'Start Recording', accelerator: accel(hk.toggleRecording), click: actions.toggleRecording },
    { label: 'Allow Screen Access', type: 'checkbox', checked: screenOn, click: (item) => actions.setScreenAccess(item.checked) },
    { label: 'Stop Everything', accelerator: accel(hk.stopAll), enabled: recording || screenOn, click: actions.stopAll },
    { type: 'separator' },
    { label: 'History…', click: actions.openHistory },
    { label: 'Settings…', click: actions.openSettings },
    { type: 'separator' },
    { label: 'Quit OpenClue', click: actions.quit }
  ])
  tray.setContextMenu(menu)
}

export function refreshTray(): void {
  if (lastState) updateTray(lastState.settings, lastState.recording)
}
