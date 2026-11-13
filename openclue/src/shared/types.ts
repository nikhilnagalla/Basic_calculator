// Types shared by the main process, preload bridge and renderer.

export type ProviderId = 'ollama' | 'openai' | 'anthropic'

export type TranscriptionBackend = 'whisper-cpp-cli' | 'whisper-cpp-server' | 'openai-compatible'

export interface OllamaConfig {
  baseUrl: string
  model: string
}

export interface OpenAIConfig {
  /** Any OpenAI-compatible endpoint: OpenAI, OpenRouter, Groq, LM Studio, Gemini's OpenAI shim... */
  baseUrl: string
  model: string
}

export interface AnthropicConfig {
  baseUrl: string
  model: string
}

export interface HotkeySettings {
  toggleOverlay: string
  askAboutScreen: string
  toggleRecording: string
  stopAll: string
}

export interface PrivacySettings {
  /** Master switch. Screenshots are refused by the main process while this is false. */
  screenAccessEnabled: boolean
  /** Master switch. Microphone requests are refused while this is false. */
  microphoneEnabled: boolean
  /** Store conversations on disk. */
  saveHistory: boolean
  /** Persist screenshot images inside saved history (off by default). */
  saveScreenshots: boolean
  /** Delete saved conversations older than this many days (0 = keep forever). */
  historyRetentionDays: number
  /** Hide the overlay for a moment while capturing so it is not part of the screenshot. */
  hideOverlayDuringCapture: boolean
}

export interface TranscriptionSettings {
  backend: TranscriptionBackend
  /** whisper.cpp CLI binary (e.g. `whisper-cli` from `brew install whisper-cpp`). */
  whisperCliPath: string
  /** Path to a ggml model file for whisper.cpp CLI. */
  whisperModelPath: string
  /** whisper.cpp `whisper-server` base URL. */
  whisperServerUrl: string
  /** OpenAI-compatible /audio/transcriptions base URL. */
  openaiBaseUrl: string
  openaiModel: string
  language: string
  /** Length of each audio chunk sent for transcription, in seconds. */
  chunkSeconds: number
}

export interface AppearanceSettings {
  opacity: number
}

export interface Settings {
  version: 1
  provider: ProviderId
  ollama: OllamaConfig
  openai: OpenAIConfig
  anthropic: AnthropicConfig
  systemPrompt: string
  temperature: number
  hotkeys: HotkeySettings
  privacy: PrivacySettings
  transcription: TranscriptionSettings
  appearance: AppearanceSettings
  onboardingComplete: boolean
}

/** Settings as seen by the renderer: secrets are replaced by presence flags. */
export interface PublicSettings extends Settings {
  apiKeys: Record<ApiKeyId, boolean>
}

export type ApiKeyId = 'openai' | 'anthropic' | 'transcription'

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] }

export type Role = 'user' | 'assistant'

export interface ChatMessage {
  id: string
  role: Role
  content: string
  createdAt: number
  /** PNG data URL of the screenshot attached to this message, if kept. */
  screenshot?: string
  /** True when a screenshot was sent, even if the image itself was not persisted. */
  hadScreenshot?: boolean
  /** Transcript text that was attached as context. */
  transcript?: string
  /** Provider/model that produced an assistant message. */
  model?: string
  error?: string
}

export interface Conversation {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messages: ChatMessage[]
}

export interface ConversationSummary {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messageCount: number
  preview: string
}

export interface ChatRequest {
  requestId: string
  messages: ChatMessage[]
}

export type ChatEvent =
  | { requestId: string; type: 'delta'; text: string }
  | { requestId: string; type: 'done'; model: string }
  | { requestId: string; type: 'error'; message: string }

export type MediaStatus = 'not-determined' | 'granted' | 'denied' | 'restricted' | 'unknown'

export interface PermissionState {
  platform: string
  microphone: MediaStatus
  screen: MediaStatus
}

export interface CaptureResult {
  dataUrl: string
  width: number
  height: number
  capturedAt: number
}

export interface ModelInfo {
  id: string
  label?: string
  vision?: boolean
}

export interface TranscribeResult {
  text: string
}

export type OverlayCommand =
  | { type: 'ask-about-screen' }
  | { type: 'toggle-recording' }
  | { type: 'stop-all' }
  | { type: 'open-settings' }
  | { type: 'open-history' }
  | { type: 'focus-input' }

export type WindowMode = 'compact' | 'expanded'

export interface ActivityState {
  recording: boolean
  capturing: boolean
}
