import type { ProviderId, Settings, TranscriptionBackend } from './types'
import { isValidAccelerator } from './accelerator'

export const DEFAULT_SYSTEM_PROMPT = `You are OpenClue, a concise, helpful desktop assistant.
- When a screenshot is attached, it shows the user's screen at the moment they asked. Refer to what you can actually see.
- When a transcript is attached, it is what the user's microphone heard. Use it as context.
- Answer directly. Prefer short paragraphs, bullet points and code blocks. Use Markdown.`

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  provider: 'ollama',
  ollama: { baseUrl: 'http://127.0.0.1:11434', model: 'qwen2.5vl:7b' },
  openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  anthropic: { baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-5-5' },
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  temperature: 0.4,
  hotkeys: {
    toggleOverlay: 'CommandOrControl+Shift+Space',
    askAboutScreen: 'CommandOrControl+Shift+Enter',
    toggleRecording: 'CommandOrControl+Shift+M',
    stopAll: 'CommandOrControl+Shift+Backspace'
  },
  privacy: {
    screenAccessEnabled: false,
    microphoneEnabled: false,
    saveHistory: true,
    saveScreenshots: false,
    historyRetentionDays: 30,
    hideOverlayDuringCapture: true
  },
  transcription: {
    backend: 'whisper-cpp-cli',
    whisperCliPath: 'whisper-cli',
    whisperModelPath: '',
    whisperServerUrl: 'http://127.0.0.1:8178',
    openaiBaseUrl: 'https://api.openai.com/v1',
    openaiModel: 'whisper-1',
    language: 'en',
    chunkSeconds: 5
  },
  appearance: { opacity: 0.82 },
  onboardingComplete: false
}

const PROVIDERS: ProviderId[] = ['ollama', 'openai', 'anthropic']
const BACKENDS: TranscriptionBackend[] = ['whisper-cpp-cli', 'whisper-cpp-server', 'openai-compatible']

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Recursively merge `patch` into `base`, only for keys that exist in `base` and have the same type. */
export function deepMerge<T>(base: T, patch: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(patch)) return base
  const out: Record<string, unknown> = { ...base }
  for (const [key, baseVal] of Object.entries(base)) {
    if (!(key in patch)) continue
    const val = patch[key]
    if (isPlainObject(baseVal)) {
      out[key] = deepMerge(baseVal, val)
    } else if (typeof val === typeof baseVal && val !== null) {
      out[key] = val
    }
  }
  return out as T
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

function cleanUrl(url: string, fallback: string): string {
  const trimmed = url.trim().replace(/\/+$/, '')
  try {
    const u = new URL(trimmed)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return fallback
    return trimmed
  } catch {
    return fallback
  }
}

/** Merge untrusted input (disk or renderer) over defaults and enforce invariants. */
export function sanitizeSettings(input: unknown, base: Settings = DEFAULT_SETTINGS): Settings {
  const s = deepMerge(structuredClone(base), input)
  const d = DEFAULT_SETTINGS

  if (!PROVIDERS.includes(s.provider)) s.provider = d.provider
  if (!BACKENDS.includes(s.transcription.backend)) s.transcription.backend = d.transcription.backend

  s.ollama.baseUrl = cleanUrl(s.ollama.baseUrl, d.ollama.baseUrl)
  s.openai.baseUrl = cleanUrl(s.openai.baseUrl, d.openai.baseUrl)
  s.anthropic.baseUrl = cleanUrl(s.anthropic.baseUrl, d.anthropic.baseUrl)
  s.transcription.whisperServerUrl = cleanUrl(s.transcription.whisperServerUrl, d.transcription.whisperServerUrl)
  s.transcription.openaiBaseUrl = cleanUrl(s.transcription.openaiBaseUrl, d.transcription.openaiBaseUrl)

  s.temperature = clamp(Number.isFinite(s.temperature) ? s.temperature : d.temperature, 0, 2)
  s.appearance.opacity = clamp(Number.isFinite(s.appearance.opacity) ? s.appearance.opacity : d.appearance.opacity, 0.4, 1)
  s.transcription.chunkSeconds = clamp(Math.round(s.transcription.chunkSeconds) || d.transcription.chunkSeconds, 2, 30)
  s.privacy.historyRetentionDays = clamp(Math.round(s.privacy.historyRetentionDays) || 0, 0, 3650)

  for (const key of Object.keys(s.hotkeys) as (keyof Settings['hotkeys'])[]) {
    if (s.hotkeys[key] !== '' && !isValidAccelerator(s.hotkeys[key])) s.hotkeys[key] = d.hotkeys[key]
  }

  // Screenshots can never be persisted if history itself is off.
  if (!s.privacy.saveHistory) s.privacy.saveScreenshots = false
  s.version = 1
  return s
}

/** Find hotkeys that are bound to the same accelerator. */
export function findHotkeyConflicts(hotkeys: Settings['hotkeys']): string[][] {
  const byAccel = new Map<string, string[]>()
  for (const [name, accel] of Object.entries(hotkeys)) {
    if (!accel) continue
    const norm = accel.toLowerCase().replace(/commandorcontrol|cmdorctrl/g, 'cmdorctrl')
    byAccel.set(norm, [...(byAccel.get(norm) ?? []), name])
  }
  return [...byAccel.values()].filter((names) => names.length > 1)
}
