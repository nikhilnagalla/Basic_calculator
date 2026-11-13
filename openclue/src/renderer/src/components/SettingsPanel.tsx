import clsx from 'clsx'
import { CheckCircle2, ExternalLink, Eye, KeyRound, Loader2, RefreshCw, XCircle } from 'lucide-react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { DEFAULT_SETTINGS, findHotkeyConflicts } from '@shared/settings'
import type { ApiKeyId, DeepPartial, HotkeySettings, MediaStatus, ModelInfo, PermissionState, PublicSettings, Settings } from '@shared/types'
import { errorMessage, isMac } from '../lib/util'
import { HotkeyRecorder } from './HotkeyRecorder'
import { Badge, Button, Field, inputClass, Row, Segmented, Toggle } from './ui'

type Tab = 'models' | 'voice' | 'shortcuts' | 'privacy'

interface Props {
  settings: PublicSettings
  canPersistKeys: boolean
  hotkeyErrors: string[]
  update: (patch: DeepPartial<Settings>) => Promise<void>
  setApiKey: (id: ApiKeyId, value: string | null) => Promise<void>
  requestScreenAccess: () => void
  requestMicAccess: () => void
  initialTab?: Tab
}

/** Text input that commits on blur / Enter, so half-typed URLs are never validated away. */
function TextSetting({
  value,
  onCommit,
  placeholder,
  list,
  mono
}: {
  value: string
  onCommit: (v: string) => void
  placeholder?: string
  list?: string
  mono?: boolean
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  const commit = () => draft !== value && onCommit(draft)
  return (
    <input
      value={draft}
      list={list}
      placeholder={placeholder}
      spellCheck={false}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          commit()
          ;(e.target as HTMLInputElement).blur()
        }
      }}
      className={clsx(inputClass, mono && 'font-mono text-[12px]')}
    />
  )
}

function ApiKeyField({
  id,
  saved,
  canPersist,
  setApiKey,
  label
}: {
  id: ApiKeyId
  saved: boolean
  canPersist: boolean
  setApiKey: Props['setApiKey']
  label: string
}) {
  const [draft, setDraft] = useState('')
  const [show, setShow] = useState(false)
  return (
    <Field
      label={label}
      hint={
        canPersist
          ? 'Encrypted with the system keychain. Keys never leave the main process.'
          : 'System encryption unavailable: the key is kept in memory for this session only.'
      }
    >
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <KeyRound size={13} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-white/35" />
          <input
            type={show ? 'text' : 'password'}
            value={draft}
            placeholder={saved ? '•••••••••••• (saved)' : 'Paste API key'}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && draft.trim()) {
                void setApiKey(id, draft).then(() => setDraft(''))
              }
            }}
            className={clsx(inputClass, 'pr-8 pl-8 font-mono text-[12px]')}
          />
          <button type="button" onClick={() => setShow((s) => !s)} className="absolute top-1/2 right-2 -translate-y-1/2 text-white/35 hover:text-white" title="Show/hide">
            <Eye size={13} />
          </button>
        </div>
        <Button size="sm" variant="primary" disabled={!draft.trim()} onClick={() => setApiKey(id, draft).then(() => setDraft(''))}>
          Save
        </Button>
        {saved && (
          <Button size="sm" variant="ghost" onClick={() => setApiKey(id, null)}>
            Remove
          </Button>
        )}
      </div>
    </Field>
  )
}

function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="rounded-xl border border-white/8 bg-white/[0.03] px-3.5 py-2">
      <div className="flex items-center justify-between pt-1 pb-1">
        <h3 className="text-[11px] font-semibold tracking-wider text-white/40 uppercase">{title}</h3>
        {aside}
      </div>
      <div className="divide-y divide-white/6">{children}</div>
    </section>
  )
}

// ------------------------------------------------------------------ Models

function ModelsTab({ settings: s, update, setApiKey, canPersistKeys }: Props) {
  const [models, setModels] = useState<ModelInfo[]>([])
  const [status, setStatus] = useState<{ state: 'idle' | 'loading' | 'ok' | 'error'; msg?: string }>({ state: 'idle' })

  const refresh = useCallback(async () => {
    setStatus({ state: 'loading' })
    try {
      const list = await window.openclue.listModels()
      setModels(list)
      setStatus({ state: 'ok', msg: `Connected · ${list.length} model${list.length === 1 ? '' : 's'}` })
    } catch (e) {
      setModels([])
      setStatus({ state: 'error', msg: errorMessage(e) })
    }
  }, [])

  const keyed = s.provider !== 'ollama' && s.apiKeys[s.provider]
  const cfg = s.provider === 'ollama' ? s.ollama : s.provider === 'openai' ? s.openai : s.anthropic
  useEffect(() => {
    if (s.provider === 'ollama' || keyed) void refresh()
    else setStatus({ state: 'idle' })
  }, [s.provider, cfg.baseUrl, keyed, refresh])

  const current = models.find((m) => m.id === cfg.model)
  const setCfg = (patch: Partial<typeof cfg>) => update({ [s.provider]: patch } as DeepPartial<Settings>)

  return (
    <div className="space-y-3">
      <Section title="Provider">
        <div className="py-2.5">
          <Segmented
            value={s.provider}
            onChange={(provider) => update({ provider })}
            options={[
              { value: 'ollama', label: 'Ollama (local)' },
              { value: 'openai', label: 'OpenAI-compatible' },
              { value: 'anthropic', label: 'Anthropic' }
            ]}
          />
          {s.provider !== 'ollama' && (
            <p className="mt-2 text-[11.5px] text-warn">
              Cloud provider: your questions, transcripts and screenshots are sent to {new URL(cfg.baseUrl).host}.
            </p>
          )}
        </div>
        <Field
          label="Base URL"
          hint={
            s.provider === 'openai'
              ? 'Works with OpenAI, OpenRouter, Groq, Together, LM Studio, vLLM, Gemini (…/v1beta/openai) and others.'
              : undefined
          }
        >
          <TextSetting value={cfg.baseUrl} onCommit={(baseUrl) => setCfg({ baseUrl })} mono />
        </Field>
        <Field
          label="Model"
          hint={
            s.provider === 'ollama' ? (
              <>
                Use a vision model to ask about your screen, e.g. <code>qwen2.5vl:7b</code>, <code>llama3.2-vision</code>, <code>gemma3</code>. Install with{' '}
                <code>ollama pull &lt;name&gt;</code>.
              </>
            ) : undefined
          }
        >
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <TextSetting value={cfg.model} onCommit={(model) => setCfg({ model: model.trim() })} list="oc-models" mono />
            </div>
            {current && (current.vision ? <Badge tone="accent">Vision</Badge> : <Badge tone="warn">Text only</Badge>)}
            <Button size="sm" variant="ghost" onClick={refresh} title="Refresh model list">
              <RefreshCw size={12} className={status.state === 'loading' ? 'animate-spin' : ''} />
            </Button>
          </div>
          <datalist id="oc-models">
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label ?? (m.vision ? 'vision' : '')}
              </option>
            ))}
          </datalist>
        </Field>
        {models.length > 0 && s.provider === 'ollama' && (
          <div className="flex flex-wrap gap-1.5 py-2">
            {models.slice(0, 12).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setCfg({ model: m.id })}
                className={clsx(
                  'rounded-full border px-2 py-0.5 font-mono text-[11px] transition',
                  m.id === cfg.model ? 'border-accent/60 bg-accent/15 text-accent' : 'border-white/10 text-white/55 hover:border-white/25 hover:text-white'
                )}
              >
                {m.id}
                {m.vision ? ' 👁' : ''}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2 py-2 text-[12px]">
          {status.state === 'loading' && <Loader2 size={13} className="animate-spin text-white/50" />}
          {status.state === 'ok' && <CheckCircle2 size={13} className="text-ok" />}
          {status.state === 'error' && <XCircle size={13} className="shrink-0 text-rec" />}
          <span className={clsx('selectable', status.state === 'error' ? 'text-rec' : 'text-white/50')}>
            {status.msg ?? (s.provider !== 'ollama' && !keyed ? 'Add an API key to connect.' : '')}
          </span>
        </div>
        {s.provider !== 'ollama' && (
          <ApiKeyField
            id={s.provider}
            label={`${s.provider === 'openai' ? 'OpenAI-compatible' : 'Anthropic'} API key`}
            saved={s.apiKeys[s.provider]}
            canPersist={canPersistKeys}
            setApiKey={setApiKey}
          />
        )}
      </Section>

      <Section title="Behaviour">
        <Row title="Temperature" hint="Lower is more focused, higher is more creative.">
          <input
            type="range"
            min={0}
            max={1.5}
            step={0.1}
            value={s.temperature}
            onChange={(e) => update({ temperature: Number(e.target.value) })}
            className="no-drag w-32"
          />
          <span className="w-7 text-right font-mono text-[12px] text-white/60">{s.temperature.toFixed(1)}</span>
        </Row>
        <Field label="System prompt">
          <SystemPrompt value={s.systemPrompt} onCommit={(systemPrompt) => update({ systemPrompt })} />
        </Field>
      </Section>
    </div>
  )
}

function SystemPrompt({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return (
    <div>
      <textarea
        value={draft}
        rows={5}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft !== value && onCommit(draft)}
        className={clsx(inputClass, 'resize-y leading-relaxed')}
      />
      <button type="button" className="mt-1 text-[11px] text-white/40 hover:text-white/70" onClick={() => onCommit(DEFAULT_SETTINGS.systemPrompt)}>
        Restore default
      </button>
    </div>
  )
}

// ------------------------------------------------------------------ Voice

function VoiceTab({ settings: s, update, setApiKey, canPersistKeys }: Props) {
  const t = s.transcription
  const [test, setTest] = useState<{ state: 'idle' | 'loading' | 'ok' | 'error'; msg?: string }>({ state: 'idle' })
  const setT = (patch: DeepPartial<Settings['transcription']>) => update({ transcription: patch })

  return (
    <div className="space-y-3">
      <Section title="Whisper backend">
        <div className="py-2.5">
          <Segmented
            value={t.backend}
            onChange={(backend) => setT({ backend })}
            options={[
              { value: 'whisper-cpp-cli', label: 'whisper.cpp (local)' },
              { value: 'whisper-cpp-server', label: 'whisper.cpp server' },
              { value: 'openai-compatible', label: 'OpenAI-compatible' }
            ]}
          />
        </div>
        {t.backend === 'whisper-cpp-cli' && (
          <>
            <Field label="whisper.cpp binary" hint={<>Install with <code>brew install whisper-cpp</code>. Name or absolute path.</>}>
              <TextSetting value={t.whisperCliPath} onCommit={(whisperCliPath) => setT({ whisperCliPath })} mono placeholder="whisper-cli" />
            </Field>
            <Field label="Model file (.bin)" hint="e.g. ~/Models/ggml-base.en.bin — see the README for download links.">
              <TextSetting value={t.whisperModelPath} onCommit={(whisperModelPath) => setT({ whisperModelPath })} mono placeholder="/path/to/ggml-base.en.bin" />
            </Field>
          </>
        )}
        {t.backend === 'whisper-cpp-server' && (
          <Field label="Server URL" hint={<>Run <code>whisper-server -m ggml-base.en.bin --port 8178</code>.</>}>
            <TextSetting value={t.whisperServerUrl} onCommit={(whisperServerUrl) => setT({ whisperServerUrl })} mono />
          </Field>
        )}
        {t.backend === 'openai-compatible' && (
          <>
            <p className="py-2 text-[11.5px] text-warn">Audio is sent to {new URL(t.openaiBaseUrl).host} for transcription.</p>
            <Field label="Base URL" hint="OpenAI, Groq, or a local speaches / faster-whisper-server.">
              <TextSetting value={t.openaiBaseUrl} onCommit={(openaiBaseUrl) => setT({ openaiBaseUrl })} mono />
            </Field>
            <Field label="Model">
              <TextSetting value={t.openaiModel} onCommit={(openaiModel) => setT({ openaiModel })} mono />
            </Field>
            <ApiKeyField id="transcription" label="Transcription API key" saved={s.apiKeys.transcription} canPersist={canPersistKeys} setApiKey={setApiKey} />
          </>
        )}
        <Row title="Language" hint="ISO code like en, de, fr — or auto.">
          <div className="w-24">
            <TextSetting value={t.language} onCommit={(language) => setT({ language: language.trim() || 'auto' })} mono />
          </div>
        </Row>
        <Row title="Chunk length" hint="Shorter chunks feel more live; longer chunks are more accurate.">
          <input type="range" min={2} max={15} step={1} value={t.chunkSeconds} onChange={(e) => setT({ chunkSeconds: Number(e.target.value) })} className="no-drag w-28" />
          <span className="w-8 text-right font-mono text-[12px] text-white/60">{t.chunkSeconds}s</span>
        </Row>
        <div className="flex items-center gap-2 py-2.5">
          <Button
            size="sm"
            onClick={async () => {
              setTest({ state: 'loading' })
              try {
                await window.openclue.testTranscription()
                setTest({ state: 'ok', msg: 'Backend responded correctly.' })
              } catch (e) {
                setTest({ state: 'error', msg: errorMessage(e) })
              }
            }}
          >
            {test.state === 'loading' ? <Loader2 size={12} className="animate-spin" /> : null} Test backend
          </Button>
          <span className={clsx('selectable text-[12px]', test.state === 'error' ? 'text-rec' : 'text-ok')}>{test.msg}</span>
        </div>
      </Section>
    </div>
  )
}

// ------------------------------------------------------------------ Shortcuts

const HOTKEY_LABELS: Record<keyof HotkeySettings, { title: string; hint: string }> = {
  toggleOverlay: { title: 'Show / hide overlay', hint: 'Works from any app.' },
  askAboutScreen: { title: 'Ask about screen', hint: 'Captures one screenshot and asks. Requires screen access.' },
  toggleRecording: { title: 'Start / stop recording', hint: 'Always brings the overlay up so the indicator is visible.' },
  stopAll: { title: 'Stop everything', hint: 'Stops recording, cancels answers and turns screen access off.' }
}

function ShortcutsTab({ settings: s, update, hotkeyErrors }: Props) {
  const conflicts = findHotkeyConflicts(s.hotkeys).flat()
  const mod = isMac ? '⌘' : 'Ctrl+'
  const local: [string, string][] = [
    ['Enter', 'Send'],
    ['Shift+Enter', 'New line'],
    [`${mod}Enter`, 'Send with screenshot'],
    [`${mod}.`, 'Stop generating'],
    [`${mod}K`, 'New conversation'],
    [`${mod}J`, 'History'],
    [`${mod},`, 'Settings'],
    [`${mod}L`, 'Focus input'],
    ['Esc', 'Back / collapse / hide']
  ]
  return (
    <div className="space-y-3">
      <Section title="Global shortcuts">
        {(Object.keys(HOTKEY_LABELS) as (keyof HotkeySettings)[]).map((k) => (
          <Row key={k} title={HOTKEY_LABELS[k].title} hint={HOTKEY_LABELS[k].hint}>
            <HotkeyRecorder
              value={s.hotkeys[k]}
              defaultValue={DEFAULT_SETTINGS.hotkeys[k]}
              onChange={(accel) => update({ hotkeys: { [k]: accel } })}
              error={
                conflicts.includes(k)
                  ? 'Used by another action'
                  : hotkeyErrors.includes(k)
                    ? 'Taken by another app — choose another'
                    : undefined
              }
            />
          </Row>
        ))}
      </Section>
      <Section title="In the overlay">
        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 py-2.5">
          {local.map(([k, label]) => (
            <div key={label} className="flex items-center justify-between text-[12px] text-white/60">
              <span>{label}</span>
              <kbd className="kbd">{k}</kbd>
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}

// ------------------------------------------------------------------ Privacy

function statusBadge(st: MediaStatus) {
  if (st === 'granted') return <Badge tone="ok">macOS: granted</Badge>
  if (st === 'denied' || st === 'restricted') return <Badge tone="rec">macOS: {st}</Badge>
  if (st === 'not-determined') return <Badge>macOS: not asked yet</Badge>
  return null
}

function PrivacyTab({ settings: s, update, requestScreenAccess, requestMicAccess }: Props) {
  const p = s.privacy
  const [perm, setPerm] = useState<PermissionState | null>(null)
  const [confirm, setConfirm] = useState<'clear' | 'reset' | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    const load = () => void window.openclue.getPermissions().then(setPerm)
    load()
    window.addEventListener('focus', load)
    return () => window.removeEventListener('focus', load)
  }, [])
  const setP = (patch: DeepPartial<Settings['privacy']>) => update({ privacy: patch })

  return (
    <div className="space-y-3">
      <Section title="Access">
        <Row
          title="Screen access"
          hint="When on, a screenshot is taken only when you send a question with Screen enabled. Never in the background."
        >
          {perm && statusBadge(perm.screen)}
          <Toggle label="Screen access" checked={p.screenAccessEnabled} onChange={(v) => (v ? requestScreenAccess() : void window.openclue.setScreenAccess(false))} />
        </Row>
        <Row title="Microphone transcription" hint="Recording only runs while the red REC indicator is visible.">
          {perm && statusBadge(perm.microphone)}
          <Toggle label="Microphone" checked={p.microphoneEnabled} onChange={(v) => (v ? requestMicAccess() : void window.openclue.setMicrophoneEnabled(false))} />
        </Row>
        {perm?.platform === 'darwin' && (
          <div className="flex flex-wrap gap-2 py-2.5">
            <Button size="sm" onClick={() => window.openclue.openSystemSettings('screen')}>
              <ExternalLink size={12} /> Screen Recording settings
            </Button>
            <Button size="sm" onClick={() => window.openclue.openSystemSettings('microphone')}>
              <ExternalLink size={12} /> Microphone settings
            </Button>
          </div>
        )}
        <Row title="Hide overlay while capturing" hint="Keeps OpenClue itself out of your screenshots (it briefly fades out).">
          <Toggle label="Hide overlay while capturing" checked={p.hideOverlayDuringCapture} onChange={(v) => setP({ hideOverlayDuringCapture: v })} />
        </Row>
      </Section>

      <Section title="History">
        <Row title="Save conversations" hint="Stored locally as JSON in the app's data folder. Nothing is synced.">
          <Toggle label="Save conversations" checked={p.saveHistory} onChange={(v) => setP({ saveHistory: v })} />
        </Row>
        <Row title="Save screenshots in history" hint="Off by default: only a note that a screenshot was sent is kept.">
          <Toggle label="Save screenshots" checked={p.saveScreenshots} disabled={!p.saveHistory} onChange={(v) => setP({ saveScreenshots: v })} />
        </Row>
        <Row title="Delete conversations after" hint="0 keeps them until you delete them.">
          <input
            type="number"
            min={0}
            max={3650}
            value={p.historyRetentionDays}
            onChange={(e) => setP({ historyRetentionDays: Number(e.target.value) })}
            className={clsx(inputClass, 'w-20 text-right')}
          />
          <span className="text-[12px] text-white/50">days</span>
        </Row>
        <div className="flex items-center gap-2 py-2.5">
          {confirm === 'clear' ? (
            <>
              <Button
                size="sm"
                variant="danger"
                onClick={async () => {
                  await window.openclue.clearHistory()
                  setConfirm(null)
                  setNotice('All saved conversations were deleted.')
                }}
              >
                Yes, delete all history
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>
                Cancel
              </Button>
            </>
          ) : (
            <Button size="sm" variant="danger" onClick={() => setConfirm('clear')}>
              Delete all history…
            </Button>
          )}
          {notice && <span className="text-[12px] text-ok">{notice}</span>}
        </div>
      </Section>

      <Section title="Appearance & reset">
        <Row title="Overlay opacity">
          <input
            type="range"
            min={0.5}
            max={1}
            step={0.02}
            value={s.appearance.opacity}
            onChange={(e) => update({ appearance: { opacity: Number(e.target.value) } })}
            className="no-drag w-32"
          />
        </Row>
        <Row title="Reset all settings" hint="Restores defaults and turns screen and microphone access off. API keys are kept.">
          {confirm === 'reset' ? (
            <>
              <Button size="sm" variant="danger" onClick={() => window.openclue.resetSettings().then(() => setConfirm(null))}>
                Reset
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>
                Cancel
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={() => setConfirm('reset')}>
              Reset…
            </Button>
          )}
        </Row>
      </Section>

      <p className="px-1 pb-1 text-[11.5px] leading-relaxed text-white/35">
        OpenClue has no account, no telemetry and no analytics. The overlay is intentionally visible to screen sharing and recording software.
      </p>
    </div>
  )
}

// ------------------------------------------------------------------ Panel

const TABS: { id: Tab; label: string }[] = [
  { id: 'models', label: 'Models' },
  { id: 'voice', label: 'Transcription' },
  { id: 'shortcuts', label: 'Shortcuts' },
  { id: 'privacy', label: 'Privacy' }
]

export function SettingsPanel(props: Props) {
  const [tab, setTab] = useState<Tab>(props.initialTab ?? 'models')
  useEffect(() => {
    if (props.initialTab) setTab(props.initialTab)
  }, [props.initialTab])
  return (
    <div className="flex h-full min-h-0 animate-fade-in flex-col">
      <div className="flex items-center gap-1 px-4 pb-3">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={clsx(
              'rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors',
              tab === t.id ? 'bg-white/12 text-white' : 'text-white/50 hover:bg-white/6 hover:text-white/85'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {tab === 'models' && <ModelsTab {...props} />}
        {tab === 'voice' && <VoiceTab {...props} />}
        {tab === 'shortcuts' && <ShortcutsTab {...props} />}
        {tab === 'privacy' && <PrivacyTab {...props} />}
      </div>
    </div>
  )
}
