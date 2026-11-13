import clsx from 'clsx'
import { AlertTriangle, Check, Copy, ImageOff, Mic, Monitor, RotateCcw, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { formatAccelerator } from '@shared/accelerator'
import type { ChatMessage, PublicSettings } from '@shared/types'
import { isMac } from '../lib/util'
import { Markdown } from './Markdown'
import { Badge, Button, Kbd } from './ui'

interface Props {
  settings: PublicSettings
  messages: ChatMessage[]
  streamingId: string | null
  onRetry: () => void
  recording: boolean
  transcript: string
  transcribing: boolean
  recorderError: string | null
  includeTranscript: boolean
  onToggleIncludeTranscript: () => void
  onClearTranscript: () => void
  onEnableScreen: () => void
  onEnableMic: () => void
  onFinishOnboarding: () => void
}

function providerLabel(s: PublicSettings): { name: string; local: boolean } {
  if (s.provider === 'ollama') return { name: `Ollama · ${s.ollama.model}`, local: true }
  if (s.provider === 'openai') return { name: `${new URL(s.openai.baseUrl).host} · ${s.openai.model}`, local: /localhost|127\.0\.0\.1/.test(s.openai.baseUrl) }
  return { name: `Anthropic · ${s.anthropic.model}`, local: false }
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      title="Copy answer"
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-white/40 transition hover:bg-white/8 hover:text-white/80"
      onClick={() => {
        void navigator.clipboard.writeText(text)
        setDone(true)
        setTimeout(() => setDone(false), 1200)
      }}
    >
      {done ? <Check size={12} /> : <Copy size={12} />} {done ? 'Copied' : 'Copy'}
    </button>
  )
}

function UserMessage({ m }: { m: ChatMessage }) {
  const [zoom, setZoom] = useState(false)
  return (
    <div className="flex animate-slide-up justify-end">
      <div className="max-w-[85%] space-y-2">
        {m.screenshot ? (
          <>
            <button type="button" onClick={() => setZoom(true)} className="block overflow-hidden rounded-lg border border-white/10 transition hover:border-accent/50" title="Exactly what was sent — click to enlarge">
              <img src={m.screenshot} alt="Screenshot sent with this message" className="max-h-28 w-auto" />
            </button>
            {zoom && (
              <div className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-black/80 p-4" onClick={() => setZoom(false)}>
                <img src={m.screenshot} alt="Screenshot" className="max-h-full max-w-full rounded-lg" />
                <button type="button" className="absolute top-3 right-3 rounded-full bg-white/10 p-1.5 text-white" aria-label="Close">
                  <X size={16} />
                </button>
              </div>
            )}
          </>
        ) : (
          m.hadScreenshot && (
            <div className="flex items-center justify-end gap-1.5 text-[11px] text-white/40">
              <ImageOff size={12} /> Screenshot sent (not saved)
            </div>
          )
        )}
        {m.transcript && (
          <details className="rounded-lg border border-white/8 bg-white/4 px-2.5 py-1.5 text-[11.5px] text-white/55">
            <summary className="cursor-pointer select-none">
              <Mic size={11} className="mr-1 inline" /> Transcript attached
            </summary>
            <p className="selectable mt-1 whitespace-pre-wrap">{m.transcript}</p>
          </details>
        )}
        {m.content && (
          <div className="selectable rounded-2xl rounded-br-md bg-accent-strong/30 px-3.5 py-2 text-[13.5px] leading-relaxed whitespace-pre-wrap text-white">
            {m.content}
          </div>
        )}
      </div>
    </div>
  )
}

function AssistantMessage({ m, streaming, isLast, onRetry }: { m: ChatMessage; streaming: boolean; isLast: boolean; onRetry: () => void }) {
  if (m.error) {
    return (
      <div className="flex animate-slide-up items-start gap-2 rounded-xl border border-rec/25 bg-rec/10 px-3 py-2.5 text-[12.5px] text-white/85">
        <AlertTriangle size={15} className="mt-0.5 shrink-0 text-rec" />
        <div className="selectable min-w-0 flex-1 break-words">{m.error}</div>
        {isLast && (
          <Button size="sm" variant="ghost" onClick={onRetry}>
            <RotateCcw size={12} /> Retry
          </Button>
        )}
      </div>
    )
  }
  return (
    <div className="group animate-slide-up">
      {streaming && !m.content ? (
        <div className="thinking text-[13px] font-medium">Thinking…</div>
      ) : (
        <div className={clsx(streaming && 'caret')}>
          <Markdown text={m.content} />
        </div>
      )}
      {!streaming && m.content && (
        <div className="mt-1 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <CopyButton text={m.content} />
          {isLast && (
            <button type="button" onClick={onRetry} title="Regenerate" className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-white/40 transition hover:bg-white/8 hover:text-white/80">
              <RotateCcw size={12} /> Regenerate
            </button>
          )}
          {m.model && <span className="ml-auto text-[10.5px] text-white/25">{m.model}</span>}
        </div>
      )}
    </div>
  )
}

function EmptyState(p: Props) {
  const s = p.settings
  const hk = s.hotkeys
  const prov = providerLabel(s)
  const shortcuts: [string, string][] = [
    [formatAccelerator(hk.toggleOverlay, isMac), 'Show / hide overlay'],
    [formatAccelerator(hk.askAboutScreen, isMac), 'Ask about screen'],
    [formatAccelerator(hk.toggleRecording, isMac), 'Start / stop recording'],
    [formatAccelerator(hk.stopAll, isMac), 'Stop everything'],
    [isMac ? '⌘K' : 'Ctrl+K', 'New chat'],
    [isMac ? '⌘J' : 'Ctrl+J', 'History']
  ]
  return (
    <div className="flex h-full animate-fade-in flex-col justify-center gap-5 px-2">
      <div>
        <div className="text-[17px] font-semibold text-white">{s.onboardingComplete ? 'How can I help?' : 'Welcome to OpenClue'}</div>
        <div className="mt-1 text-[12.5px] leading-relaxed text-white/50">
          {s.onboardingComplete
            ? 'Ask a question, attach your screen, or start a recording to bring what you hear into the conversation.'
            : 'A transparent, local-first assistant. No account needed. Nothing is captured until you turn it on — and you can turn it off at any time.'}
        </div>
      </div>

      {!s.onboardingComplete && (
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-white/8 bg-white/4 p-3">
            <div className="flex items-center gap-2 text-[12.5px] font-medium">
              <Monitor size={14} className="text-accent" /> Screen access
              {s.privacy.screenAccessEnabled ? <Badge tone="ok">On</Badge> : <Badge>Off</Badge>}
            </div>
            <p className="mt-1 text-[11.5px] leading-snug text-white/45">One screenshot per question, only when you send it.</p>
            {!s.privacy.screenAccessEnabled && (
              <Button size="sm" className="mt-2" onClick={p.onEnableScreen}>
                Enable…
              </Button>
            )}
          </div>
          <div className="rounded-xl border border-white/8 bg-white/4 p-3">
            <div className="flex items-center gap-2 text-[12.5px] font-medium">
              <Mic size={14} className="text-accent" /> Microphone
              {s.privacy.microphoneEnabled ? <Badge tone="ok">On</Badge> : <Badge>Off</Badge>}
            </div>
            <p className="mt-1 text-[11.5px] leading-snug text-white/45">Live transcription while the red REC indicator is shown.</p>
            {!s.privacy.microphoneEnabled && (
              <Button size="sm" className="mt-2" onClick={p.onEnableMic}>
                Enable…
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
        {shortcuts.map(([k, label]) => (
          <div key={label} className="flex items-center justify-between text-[12px] text-white/55">
            <span>{label}</span>
            <Kbd>{k}</Kbd>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[11.5px] text-white/40">
          <span className={clsx('h-1.5 w-1.5 rounded-full', prov.local ? 'bg-ok' : 'bg-warn')} />
          {prov.name}
          {prov.local ? <Badge tone="ok">Local</Badge> : <Badge tone="warn">Cloud</Badge>}
        </div>
        {!s.onboardingComplete && (
          <Button variant="primary" size="sm" onClick={p.onFinishOnboarding}>
            Get started
          </Button>
        )}
      </div>
    </div>
  )
}

function TranscriptStrip(p: Props) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: 'smooth' })
  }, [p.transcript])
  if (!p.recording && !p.transcript && !p.recorderError) return null
  return (
    <div className="mx-4 mb-2 animate-slide-up rounded-xl border border-white/8 bg-black/25">
      <div className="flex items-center gap-2 border-b border-white/6 px-3 py-1.5 text-[11px] font-medium text-white/50">
        {p.recording ? (
          <span className="inline-flex items-center gap-1.5 text-rec">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rec" /> Recording microphone
          </span>
        ) : (
          <span>Transcript</span>
        )}
        {p.transcribing && <span className="thinking">transcribing…</span>}
        <div className="ml-auto flex items-center gap-1">
          <label className="flex cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-0.5 hover:bg-white/6">
            <input type="checkbox" checked={p.includeTranscript} onChange={p.onToggleIncludeTranscript} className="accent-[#8b9cff]" />
            Include in next question
          </label>
          {p.transcript && (
            <button type="button" title="Clear transcript" onClick={p.onClearTranscript} className="rounded-md p-1 text-white/40 hover:bg-white/8 hover:text-white">
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>
      <div ref={ref} className="selectable max-h-[72px] overflow-y-auto px-3 py-2 text-[12.5px] leading-relaxed text-white/75">
        {p.recorderError ? (
          <span className="text-rec">{p.recorderError}</span>
        ) : p.transcript ? (
          p.transcript
        ) : (
          <span className="text-white/35">Listening… text appears every few seconds.</span>
        )}
      </div>
    </div>
  )
}

export function ChatView(p: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const last = p.messages[p.messages.length - 1]

  useEffect(() => {
    const el = scrollRef.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [p.messages, last?.content])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TranscriptStrip {...p} />
      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
        }}
        className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-4"
      >
        {p.messages.length === 0 ? (
          <EmptyState {...p} />
        ) : (
          p.messages.map((m, i) =>
            m.role === 'user' ? (
              <UserMessage key={m.id} m={m} />
            ) : (
              <AssistantMessage key={m.id} m={m} streaming={p.streamingId === m.id} isLast={i === p.messages.length - 1} onRetry={p.onRetry} />
            )
          )
        )}
      </div>
    </div>
  )
}
