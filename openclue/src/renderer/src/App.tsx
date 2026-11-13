import { AlertTriangle, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { ApiKeyId, ChatMessage, Conversation, DeepPartial, OverlayCommand, PublicSettings, Settings } from '@shared/types'
import { ChatView } from './components/ChatView'
import { CommandBar } from './components/CommandBar'
import { ConsentDialog, type ConsentKind } from './components/ConsentDialog'
import { HistoryPanel } from './components/HistoryPanel'
import { SettingsPanel } from './components/SettingsPanel'
import { useRecorder } from './hooks/useRecorder'
import { errorMessage, isMac, uid } from './lib/util'

type Panel = 'chat' | 'settings' | 'history'
type Pending = 'ask-screen' | 'start-recording' | null

const api = window.openclue

function newConversation(): Conversation {
  const now = Date.now()
  return { id: uid(), title: '', createdAt: now, updatedAt: now, messages: [] }
}

function isCloud(s: PublicSettings): boolean {
  if (s.provider === 'ollama') return false
  if (s.provider === 'openai') return !/^https?:\/\/(localhost|127\.0\.0\.1)/.test(s.openai.baseUrl)
  return true
}

function providerName(s: PublicSettings): string {
  if (s.provider === 'ollama') return `Ollama · ${s.ollama.model}`
  if (s.provider === 'openai') return `${new URL(s.openai.baseUrl).host} · ${s.openai.model}`
  return `Anthropic · ${s.anthropic.model}`
}

export default function App() {
  const [settings, setSettings] = useState<PublicSettings | null>(null)
  const [canPersistKeys, setCanPersistKeys] = useState(true)
  const [hotkeyErrors, setHotkeyErrors] = useState<string[]>([])
  const [conv, setConv] = useState<Conversation>(newConversation)
  const [streamingId, setStreamingId] = useState<string | null>(null)
  const [panel, setPanel] = useState<Panel>('chat')
  const [expanded, setExpanded] = useState(false)
  const [input, setInput] = useState('')
  const [attachScreen, setAttachScreen] = useState(true)
  const [capturing, setCapturing] = useState(false)
  const [includeTranscript, setIncludeTranscript] = useState(true)
  const [consent, setConsent] = useState<{ kind: ConsentKind; then: Pending } | null>(null)
  const [banner, setBanner] = useState<{ tone: 'error' | 'info'; text: string } | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const recorder = useRecorder(settings?.transcription.chunkSeconds ?? 5)

  // Latest values for use inside long-lived event listeners.
  const live = useRef({ settings, conv, streamingId, input, attachScreen, includeTranscript, recorder, panel, expanded, consent })
  live.current = { settings, conv, streamingId, input, attachScreen, includeTranscript, recorder, panel, expanded, consent }

  // ---------------------------------------------------------------- bootstrap
  useEffect(() => {
    void api.getSettings().then(({ settings: s, canPersistKeys: c, hotkeyErrors: h }) => {
      setSettings(s)
      setCanPersistKeys(c)
      setHotkeyErrors(h)
      if (!s.onboardingComplete) setExpanded(true)
    })
    const offs = [
      api.onSettingsChanged((s) => {
        setSettings(s)
        // Revoking the microphone stops any recording immediately.
        if (!s.privacy.microphoneEnabled && live.current.recorder.recording) live.current.recorder.stop(true)
      }),
      api.onHotkeyErrors(setHotkeyErrors),
      api.onActivity((a) => typeof a.capturing === 'boolean' && setCapturing(a.capturing))
    ]
    return () => offs.forEach((off) => off())
  }, [])

  useEffect(() => {
    document.documentElement.style.setProperty('--glass-alpha', String(settings?.appearance.opacity ?? 0.82))
  }, [settings?.appearance.opacity])

  useEffect(() => {
    void api.setWindowMode(expanded || consent ? 'expanded' : 'compact')
  }, [expanded, consent])

  useEffect(() => {
    const onFocus = () => inputRef.current?.focus()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  // ---------------------------------------------------------------- chat streaming
  useEffect(
    () =>
      api.onChatEvent((ev) => {
        setConv((c) => {
          const idx = c.messages.findIndex((m) => m.id === ev.requestId)
          if (idx === -1) return c
          const messages = c.messages.slice()
          const m = { ...messages[idx] }
          if (ev.type === 'delta') m.content += ev.text
          else if (ev.type === 'done') m.model = ev.model || m.model
          else m.error = ev.message
          messages[idx] = m
          return { ...c, messages, updatedAt: Date.now() }
        })
        if (ev.type !== 'delta') setStreamingId((id) => (id === ev.requestId ? null : id))
      }),
    []
  )

  // Persist after each completed exchange (main decides whether history saving is on).
  useEffect(() => {
    if (streamingId || conv.messages.length === 0 || !settings?.privacy.saveHistory) return
    void api.saveConversation(conv).catch((e) => console.warn('save failed', e))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamingId, conv.messages.length])

  const cancelStreaming = useCallback(() => {
    const id = live.current.streamingId
    if (!id) return
    void api.cancelChat(id)
    setStreamingId(null)
  }, [])

  const runChat = useCallback(async (history: ChatMessage[]) => {
    const assistant: ChatMessage = { id: uid(), role: 'assistant', content: '', createdAt: Date.now() }
    setConv((c) => ({ ...c, messages: [...history, assistant], updatedAt: Date.now() }))
    setStreamingId(assistant.id)
    try {
      await api.startChat({ requestId: assistant.id, messages: history })
    } catch (e) {
      setConv((c) => ({
        ...c,
        messages: c.messages.map((m) => (m.id === assistant.id ? { ...m, error: errorMessage(e) } : m))
      }))
      setStreamingId(null)
    }
  }, [])

  const send = useCallback(
    async (opts: { forceScreenshot?: boolean } = {}) => {
      const { settings: s, conv: c, streamingId: sid, input: text, attachScreen: attach, includeTranscript: incT, recorder: rec } = live.current
      if (!s || sid) return
      const screenOn = s.privacy.screenAccessEnabled
      if (opts.forceScreenshot && !screenOn) {
        setConsent({ kind: 'screen', then: 'ask-screen' })
        return
      }
      const wantScreen = screenOn && (opts.forceScreenshot || attach)
      const transcript = incT && rec.transcript.trim() ? rec.transcript.trim() : undefined
      if (!text.trim() && !wantScreen && !transcript) return

      setBanner(null)
      let screenshot: string | undefined
      if (wantScreen) {
        try {
          screenshot = (await api.captureScreen()).dataUrl
        } catch (e) {
          setExpanded(true)
          setBanner({ tone: 'error', text: errorMessage(e) })
          return
        }
      }
      const user: ChatMessage = {
        id: uid(),
        role: 'user',
        content: text.trim(),
        createdAt: Date.now(),
        ...(screenshot ? { screenshot, hadScreenshot: true } : {}),
        ...(transcript ? { transcript } : {})
      }
      if (transcript) rec.clearTranscript()
      setInput('')
      setPanel('chat')
      setExpanded(true)
      await runChat([...c.messages, user])
    },
    [runChat]
  )

  const retry = useCallback(() => {
    const { conv: c, streamingId: sid } = live.current
    if (sid) return
    let end = c.messages.length
    while (end > 0 && c.messages[end - 1].role === 'assistant') end--
    if (end === 0) return
    void runChat(c.messages.slice(0, end))
  }, [runChat])

  const newChat = useCallback(() => {
    cancelStreaming()
    setConv(newConversation())
    setPanel('chat')
    setBanner(null)
    inputRef.current?.focus()
  }, [cancelStreaming])

  // ---------------------------------------------------------------- recording & screen
  const toggleRecording = useCallback(() => {
    const { settings: s, recorder: rec } = live.current
    if (!s) return
    if (rec.recording) {
      rec.stop()
      return
    }
    if (!s.privacy.microphoneEnabled) {
      setConsent({ kind: 'microphone', then: 'start-recording' })
      return
    }
    setExpanded(true)
    setPanel('chat')
    void rec.start()
  }, [])

  const toggleAttachScreen = useCallback(() => {
    const s = live.current.settings
    if (!s) return
    if (!s.privacy.screenAccessEnabled) setConsent({ kind: 'screen', then: null })
    else setAttachScreen((a) => !a)
  }, [])

  const onConsentAllow = useCallback(async () => {
    const c = live.current.consent
    if (!c) return
    setConsent(null)
    if (c.kind === 'screen') {
      const s = await api.setScreenAccess(true)
      setSettings(s)
      setAttachScreen(true)
      if (c.then === 'ask-screen') {
        // `send` reads from the ref, which only refreshes on the next render.
        live.current.settings = s
        void send({ forceScreenshot: true })
      }
    } else {
      const s = await api.setMicrophoneEnabled(true)
      setSettings(s)
      if (c.then === 'start-recording') {
        setExpanded(true)
        setPanel('chat')
        void live.current.recorder.start()
      }
    }
  }, [send])

  const stopAll = useCallback(() => {
    const { recorder: rec } = live.current
    rec.stop(true)
    cancelStreaming()
    setCapturing(false)
    setBanner({ tone: 'info', text: 'Stopped: recording off, answers cancelled, screen access turned off.' })
  }, [cancelStreaming])

  // ---------------------------------------------------------------- commands from main (hotkeys / tray)
  useEffect(
    () =>
      api.onCommand((cmd: OverlayCommand) => {
        switch (cmd.type) {
          case 'ask-about-screen':
            setPanel('chat')
            void send({ forceScreenshot: true })
            break
          case 'toggle-recording':
            toggleRecording()
            break
          case 'stop-all':
            stopAll()
            break
          case 'open-settings':
            setPanel('settings')
            setExpanded(true)
            break
          case 'open-history':
            setPanel('history')
            setExpanded(true)
            break
          case 'focus-input':
            inputRef.current?.focus()
            break
        }
      }),
    [send, toggleRecording, stopAll]
  )

  // ---------------------------------------------------------------- keyboard
  const openPanel = useCallback((p: 'settings' | 'history') => {
    setPanel((cur) => (cur === p ? 'chat' : p))
    setExpanded(true)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = isMac ? e.metaKey : e.ctrlKey
      if (e.key === 'Escape') {
        if (live.current.consent) return
        e.preventDefault()
        if (live.current.panel !== 'chat') setPanel('chat')
        else if (live.current.expanded) setExpanded(false)
        else void api.hideWindow()
        return
      }
      if (!mod || e.altKey) return
      const k = e.key.toLowerCase()
      if (k === 'k') {
        e.preventDefault()
        newChat()
      } else if (k === 'j') {
        e.preventDefault()
        openPanel('history')
      } else if (k === ',') {
        e.preventDefault()
        openPanel('settings')
      } else if (k === 'l') {
        e.preventDefault()
        inputRef.current?.focus()
      } else if (k === '.') {
        e.preventDefault()
        cancelStreaming()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [newChat, openPanel, cancelStreaming])

  const onInputKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      void send({ forceScreenshot: isMac ? e.metaKey : e.ctrlKey })
    }
  }

  // ---------------------------------------------------------------- settings helpers
  const update = useCallback(async (patch: DeepPartial<Settings>) => {
    try {
      setSettings(await api.updateSettings(patch))
    } catch (e) {
      setBanner({ tone: 'error', text: errorMessage(e) })
    }
  }, [])
  const setApiKey = useCallback(async (id: ApiKeyId, value: string | null) => {
    setSettings(await api.setApiKey(id, value))
  }, [])

  if (!settings) return <div className="glass h-full rounded-2xl" />

  const hotkeyBanner =
    hotkeyErrors.length > 0 ? `Some global shortcuts are taken by other apps (${hotkeyErrors.join(', ')}). Change them in Settings → Shortcuts.` : null

  return (
    <div className="glass relative flex h-full flex-col overflow-hidden rounded-2xl">
      <CommandBar
        ref={inputRef}
        settings={settings}
        input={input}
        onInput={setInput}
        onSubmit={() => void send()}
        onKeyDown={onInputKeyDown}
        streaming={streamingId !== null}
        onStopStreaming={cancelStreaming}
        attachScreen={attachScreen}
        onToggleAttachScreen={toggleAttachScreen}
        capturing={capturing}
        recording={recorder.recording}
        recordingStartedAt={recorder.startedAt}
        level={recorder.level}
        onToggleRecording={toggleRecording}
        expanded={expanded}
        onToggleExpanded={() => setExpanded((x) => !x)}
        panel={panel}
        onOpenPanel={openPanel}
        onHide={() => void api.hideWindow()}
        onStopAll={() => void api.stopAll()}
      />

      {expanded && (
        <div className="flex min-h-0 flex-1 animate-fade-in flex-col border-t border-white/8 pt-3">
          {(banner || hotkeyBanner) && (
            <div
              className={`mx-4 mb-2 flex items-start gap-2 rounded-lg border px-3 py-2 text-[12px] ${
                banner?.tone === 'info' ? 'border-white/10 bg-white/5 text-white/70' : 'border-rec/30 bg-rec/10 text-white/85'
              }`}
            >
              {banner?.tone !== 'info' && <AlertTriangle size={14} className="mt-px shrink-0 text-rec" />}
              <span className="selectable flex-1">{banner?.text ?? hotkeyBanner}</span>
              {banner && (
                <button type="button" onClick={() => setBanner(null)} className="text-white/40 hover:text-white" aria-label="Dismiss">
                  <X size={13} />
                </button>
              )}
            </div>
          )}

          <div className="min-h-0 flex-1">
            {panel === 'chat' && (
              <ChatView
                settings={settings}
                messages={conv.messages}
                streamingId={streamingId}
                onRetry={retry}
                recording={recorder.recording}
                transcript={recorder.transcript}
                transcribing={recorder.pending > 0}
                recorderError={recorder.error}
                includeTranscript={includeTranscript}
                onToggleIncludeTranscript={() => setIncludeTranscript((v) => !v)}
                onClearTranscript={recorder.clearTranscript}
                onEnableScreen={() => setConsent({ kind: 'screen', then: null })}
                onEnableMic={() => setConsent({ kind: 'microphone', then: null })}
                onFinishOnboarding={() => {
                  void update({ onboardingComplete: true })
                  inputRef.current?.focus()
                }}
              />
            )}
            {panel === 'settings' && (
              <SettingsPanel
                settings={settings}
                canPersistKeys={canPersistKeys}
                hotkeyErrors={hotkeyErrors}
                update={update}
                setApiKey={setApiKey}
                requestScreenAccess={() => setConsent({ kind: 'screen', then: null })}
                requestMicAccess={() => setConsent({ kind: 'microphone', then: null })}
              />
            )}
            {panel === 'history' && (
              <HistoryPanel
                currentId={conv.id}
                saveHistory={settings.privacy.saveHistory}
                onOpen={async (id) => {
                  const loaded = await api.getConversation(id)
                  if (loaded) {
                    cancelStreaming()
                    setConv(loaded)
                    setPanel('chat')
                  }
                }}
                onDeleted={() => undefined}
                onCleared={() => undefined}
              />
            )}
          </div>
        </div>
      )}

      {consent && (
        <ConsentDialog
          kind={consent.kind}
          cloud={isCloud(settings)}
          providerName={providerName(settings)}
          onAllow={() => void onConsentAllow()}
          onCancel={() => setConsent(null)}
        />
      )}
    </div>
  )
}
