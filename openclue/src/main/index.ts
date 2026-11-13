// OpenClue main process: app lifecycle, IPC, permissions, hotkeys and tray.
import { app, BrowserWindow, ipcMain, Menu, session, shell, type IpcMainInvokeEvent } from 'electron'
import { IPC } from '@shared/ipc'
import type {
  ActivityState,
  ApiKeyId,
  ChatEvent,
  ChatMessage,
  ChatRequest,
  OverlayCommand,
  Settings,
  WindowMode
} from '@shared/types'
import { captureScreen } from './capture'
import {
  clearHistory,
  deleteConversation,
  getConversation,
  listConversations,
  pruneExpired,
  purgeSavedScreenshots,
  saveConversation
} from './history'
import { listModels, streamChat } from './llm/providers'
import { getPermissionState, openSystemSettings, requestMicrophoneAccess } from './permissions'
import { registerHotkeys, unregisterHotkeys } from './shortcuts'
import { store } from './store'
import { transcribe, silentWav } from './transcription/whisper'
import { createTray, refreshTray, updateTray } from './tray'
import { createOverlayWindow, getOverlay, hideOverlay, setWindowMode, showOverlay, toggleOverlay } from './window'

const isMac = process.platform === 'darwin'
const activeChats = new Map<string, AbortController>()
let recording = false
let hotkeyErrors: string[] = []

if (!app.requestSingleInstanceLock()) {
  app.quit()
}
app.setName('OpenClue')

// ------------------------------------------------------------------ helpers

function send(channel: string, payload: unknown): void {
  const w = getOverlay()
  if (w && !w.webContents.isDestroyed()) w.webContents.send(channel, payload)
}

function command(cmd: OverlayCommand): void {
  send(IPC.overlayCommand, cmd)
}

/** Only accept IPC from our own renderer page. */
function assertTrusted(e: IpcMainInvokeEvent): void {
  const url = e.senderFrame?.url ?? ''
  const devUrl = process.env.ELECTRON_RENDERER_URL
  const ok = url.startsWith('file://') || (!app.isPackaged && devUrl !== undefined && url.startsWith(devUrl))
  if (!ok || e.sender !== getOverlay()?.webContents) throw new Error('Untrusted IPC sender')
}

function handle<A extends unknown[], R>(channel: string, fn: (...args: A) => R | Promise<R>): void {
  ipcMain.handle(channel, async (e, ...args) => {
    assertTrusted(e)
    return fn(...(args as A))
  })
}

function setScreenAccess(enabled: boolean): void {
  store.update({ privacy: { screenAccessEnabled: enabled } })
}

/** Panic button: stop recording, cancel AI requests and revoke screen access immediately. */
function stopAll(): void {
  for (const ctrl of activeChats.values()) ctrl.abort()
  activeChats.clear()
  command({ type: 'stop-all' })
  if (store.get().privacy.screenAccessEnabled) setScreenAccess(false)
  recording = false
  updateTray(store.get(), recording)
}

function applyHotkeys(settings: Settings): void {
  hotkeyErrors = registerHotkeys(settings.hotkeys, {
    toggleOverlay,
    askAboutScreen: () => {
      showOverlay(true)
      command({ type: 'ask-about-screen' })
    },
    toggleRecording: () => {
      // Recording is always visible: bring the overlay up whenever the mic is toggled.
      showOverlay(true)
      command({ type: 'toggle-recording' })
    },
    stopAll
  })
  send(IPC.hotkeyErrors, hotkeyErrors)
}

function openPanel(type: 'open-settings' | 'open-history'): void {
  showOverlay(true)
  command({ type })
}

function buildAppMenu(): void {
  // An Edit menu is required on macOS for copy/paste shortcuts to work in text fields.
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: 'OpenClue',
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { label: 'Settings…', accelerator: 'CommandOrControl+,', click: () => openPanel('open-settings') },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'quit' as const }
            ]
          }
        ]
      : []),
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: app.isPackaged ? [{ role: 'resetZoom' }] : [{ role: 'reload' }, { role: 'toggleDevTools' }, { role: 'resetZoom' }]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function configurePermissions(): void {
  const ses = session.defaultSession
  // Microphone (audio only) is allowed solely while the user has opted in. Everything else is denied.
  ses.setPermissionRequestHandler((_wc, permission, callback, details) => {
    if (permission === 'media') {
      const types = (details as Electron.MediaAccessPermissionRequest).mediaTypes ?? []
      const audioOnly = types.length > 0 && types.every((t) => t === 'audio')
      return callback(audioOnly && store.get().privacy.microphoneEnabled)
    }
    callback(permission === 'clipboard-sanitized-write')
  })
  ses.setPermissionCheckHandler((_wc, permission, _origin, details) => {
    if (permission === 'media') return details.mediaType === 'audio' && store.get().privacy.microphoneEnabled
    return permission === 'clipboard-sanitized-write'
  })
  // The renderer never captures the screen itself; screenshots go through the main process.
  ses.setDisplayMediaRequestHandler((_req, callback) => callback({}))
}

// ------------------------------------------------------------------ IPC

function stripScreenshotsIfRevoked(messages: ChatMessage[]): ChatMessage[] {
  if (store.get().privacy.screenAccessEnabled) return messages
  // Screen access was revoked: nothing captured earlier is sent anymore.
  return messages.map(({ screenshot, ...m }) => (screenshot ? { ...m, hadScreenshot: true } : m))
}

function registerIpc(): void {
  handle(IPC.settingsGet, () => ({ settings: store.getPublic(), canPersistKeys: store.canPersistKeys(), hotkeyErrors }))
  handle(IPC.settingsUpdate, (patch: unknown) => {
    store.update(patch)
    return store.getPublic()
  })
  handle(IPC.settingsReset, () => {
    store.reset()
    return store.getPublic()
  })
  handle(IPC.apiKeySet, async (id: ApiKeyId, value: string | null) => {
    await store.setApiKey(id, typeof value === 'string' ? value : null)
    return store.getPublic()
  })

  handle(IPC.chatStart, (req: ChatRequest) => {
    if (!req || typeof req.requestId !== 'string' || !Array.isArray(req.messages)) throw new Error('Bad chat request')
    const ctrl = new AbortController()
    activeChats.set(req.requestId, ctrl)
    const settings = store.get()
    const apiKey = settings.provider === 'ollama' ? undefined : store.getApiKey(settings.provider)
    const emit = (ev: ChatEvent) => send(IPC.chatEvent, ev)
    streamChat({
      settings,
      apiKey,
      messages: stripScreenshotsIfRevoked(req.messages),
      signal: ctrl.signal,
      onDelta: (text) => emit({ requestId: req.requestId, type: 'delta', text })
    })
      .then(({ model }) => emit({ requestId: req.requestId, type: 'done', model }))
      .catch((err: Error) => {
        if (ctrl.signal.aborted) emit({ requestId: req.requestId, type: 'done', model: '' })
        else emit({ requestId: req.requestId, type: 'error', message: err.message || String(err) })
      })
      .finally(() => activeChats.delete(req.requestId))
    return { ok: true }
  })
  handle(IPC.chatCancel, (requestId: string) => {
    activeChats.get(requestId)?.abort()
    activeChats.delete(requestId)
  })

  handle(IPC.modelsList, async () => {
    const s = store.get()
    return listModels(s, s.provider === 'ollama' ? undefined : store.getApiKey(s.provider))
  })

  handle(IPC.screenSetAccess, (enabled: boolean) => {
    setScreenAccess(Boolean(enabled))
    return store.getPublic()
  })
  handle(IPC.screenCapture, () =>
    captureScreen(getOverlay(), (capturing) => send(IPC.activityUpdate, { capturing } satisfies Partial<ActivityState>))
  )

  handle(IPC.micSetEnabled, (enabled: boolean) => {
    store.update({ privacy: { microphoneEnabled: Boolean(enabled) } })
    return store.getPublic()
  })
  handle(IPC.micRequestAccess, async () => {
    if (!store.get().privacy.microphoneEnabled) return false
    return requestMicrophoneAccess()
  })
  handle(IPC.transcribe, async (chunk: ArrayBuffer | Uint8Array) => {
    if (!store.get().privacy.microphoneEnabled) throw new Error('Microphone access is off')
    const buf = Buffer.from(chunk instanceof ArrayBuffer ? new Uint8Array(chunk) : chunk)
    return transcribe(buf, store.get(), store.getApiKey('transcription'))
  })
  handle(IPC.transcriptionTest, async () => {
    const result = await transcribe(silentWav(1), store.get(), store.getApiKey('transcription'))
    return { ok: true, text: result.text }
  })

  handle(IPC.permissionsGet, () => getPermissionState())
  handle(IPC.permissionsOpenSystemSettings, (kind: 'microphone' | 'screen') =>
    openSystemSettings(kind === 'screen' ? 'screen' : 'microphone')
  )

  handle(IPC.historyList, () => listConversations())
  handle(IPC.historyGet, (id: string) => getConversation(id))
  handle(IPC.historySave, (conv: unknown) => saveConversation(conv))
  handle(IPC.historyDelete, (id: string) => deleteConversation(id))
  handle(IPC.historyClear, () => clearHistory())

  handle(IPC.stopAll, () => stopAll())
  handle(IPC.windowSetMode, (mode: WindowMode) => setWindowMode(mode === 'expanded' ? 'expanded' : 'compact'))
  handle(IPC.windowHide, () => hideOverlay())
  handle(IPC.windowQuit, () => app.quit())
  handle(IPC.activityUpdate, (state: Partial<ActivityState>) => {
    if (typeof state?.recording === 'boolean') {
      recording = state.recording
      updateTray(store.get(), recording)
    }
  })
  handle(IPC.openExternal, async (url: string) => {
    if (typeof url === 'string' && /^https:\/\//.test(url)) await shell.openExternal(url)
  })
}

// ------------------------------------------------------------------ lifecycle

store.on('change', (next: Settings, prev: Settings) => {
  if (JSON.stringify(next.hotkeys) !== JSON.stringify(prev.hotkeys)) applyHotkeys(next)
  if (prev.privacy.saveScreenshots && !next.privacy.saveScreenshots) void purgeSavedScreenshots()
  if (next.privacy.historyRetentionDays !== prev.privacy.historyRetentionDays) void pruneExpired()
  updateTray(next, recording)
  send(IPC.settingsChanged, store.getPublic())
})

app.on('second-instance', () => showOverlay(true))

app.whenReady().then(async () => {
  await store.load()
  configurePermissions()
  buildAppMenu()
  registerIpc()
  await createOverlayWindow()
  createTray(
    {
      toggleOverlay,
      askAboutScreen: () => {
        showOverlay(true)
        command({ type: 'ask-about-screen' })
      },
      toggleRecording: () => {
        showOverlay(true)
        command({ type: 'toggle-recording' })
      },
      setScreenAccess,
      stopAll,
      openSettings: () => openPanel('open-settings'),
      openHistory: () => openPanel('open-history'),
      quit: () => app.quit()
    },
    store.get()
  )
  applyHotkeys(store.get())
  void pruneExpired()

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createOverlayWindow()
    showOverlay(true)
  })
  refreshTray()
})

app.on('window-all-closed', () => {
  if (!isMac) app.quit()
})

app.on('will-quit', () => {
  for (const ctrl of activeChats.values()) ctrl.abort()
  unregisterHotkeys()
})
