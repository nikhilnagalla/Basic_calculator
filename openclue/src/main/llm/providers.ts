// Streaming chat clients for Ollama, OpenAI-compatible APIs and Anthropic.
// All network calls run in the main process so API keys never reach the renderer.
import type { ChatMessage, ModelInfo, Settings } from '@shared/types'
import {
  describeHttpError,
  looksLikeVisionModel,
  prepareMessages,
  toAnthropicMessages,
  toOllamaMessages,
  toOpenAIMessages
} from './format'
import { iterateBody, LineSplitter, SSEParser } from './stream'

export interface StreamParams {
  settings: Settings
  messages: ChatMessage[]
  apiKey?: string
  signal: AbortSignal
  onDelta: (text: string) => void
}

export interface StreamResult {
  model: string
}

function connectionHint(provider: string, baseUrl: string, err: unknown): Error {
  if (err instanceof Error && err.name === 'AbortError') return err
  const cause = err instanceof Error ? ((err.cause as Error | undefined)?.message ?? err.message) : String(err)
  if (provider === 'ollama') {
    return new Error(`Couldn't reach Ollama at ${baseUrl} (${cause}). Is Ollama running? Start it with \`ollama serve\` or open the Ollama app.`)
  }
  return new Error(`Couldn't reach ${baseUrl} (${cause}).`)
}

async function request(provider: string, baseUrl: string, url: string, init: RequestInit): Promise<Response> {
  let res: Response
  try {
    res = await fetch(url, init)
  } catch (err) {
    throw connectionHint(provider, baseUrl, err)
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    let message = describeHttpError(res.status, body)
    if (provider === 'ollama' && res.status === 404) {
      message += ' — the model may not be installed. Pull it with `ollama pull <model>`.'
    }
    if (res.status === 401 || res.status === 403) message += ' — check the API key in Settings → Models.'
    throw new Error(message)
  }
  if (!res.body) throw new Error('Empty response body')
  return res
}

function requireKey(key: string | undefined, provider: string): string {
  if (!key) throw new Error(`No API key set for ${provider}. Add one in Settings → Models.`)
  return key
}

// ---------------------------------------------------------------- Ollama

async function streamOllama(p: StreamParams): Promise<StreamResult> {
  const { baseUrl, model } = p.settings.ollama
  const res = await request('ollama', baseUrl, `${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: p.signal,
    body: JSON.stringify({
      model,
      stream: true,
      messages: toOllamaMessages(p.settings.systemPrompt, prepareMessages(p.messages)),
      options: { temperature: p.settings.temperature }
    })
  })
  const lines = new LineSplitter()
  const handle = (line: string) => {
    if (!line.trim()) return
    const json = JSON.parse(line)
    if (json.error) throw new Error(String(json.error))
    const text = json.message?.content
    if (text) p.onDelta(text)
  }
  for await (const chunk of iterateBody(res.body!, p.signal)) lines.push(chunk).forEach(handle)
  lines.flush().forEach(handle)
  return { model: `ollama/${model}` }
}

async function listOllamaModels(settings: Settings): Promise<ModelInfo[]> {
  const { baseUrl } = settings.ollama
  const res = await request('ollama', baseUrl, `${baseUrl}/api/tags`, { signal: AbortSignal.timeout(5000) })
  const json = (await res.json()) as { models?: { name: string }[] }
  const names = (json.models ?? []).map((m) => m.name)
  // Newer Ollama versions report capabilities via /api/show; fall back to a name heuristic.
  return Promise.all(
    names.map(async (name): Promise<ModelInfo> => {
      try {
        const show = await fetch(`${baseUrl}/api/show`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: name }),
          signal: AbortSignal.timeout(3000)
        })
        if (show.ok) {
          const info = (await show.json()) as { capabilities?: string[] }
          if (Array.isArray(info.capabilities)) return { id: name, vision: info.capabilities.includes('vision') }
        }
      } catch {
        /* ignore */
      }
      return { id: name, vision: looksLikeVisionModel(name) }
    })
  )
}

// ---------------------------------------------------------------- OpenAI-compatible

async function streamOpenAI(p: StreamParams): Promise<StreamResult> {
  const { baseUrl, model } = p.settings.openai
  const key = requireKey(p.apiKey, 'the OpenAI-compatible provider')
  const res = await request('openai', baseUrl, `${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    signal: p.signal,
    body: JSON.stringify({
      model,
      stream: true,
      temperature: p.settings.temperature,
      messages: toOpenAIMessages(p.settings.systemPrompt, prepareMessages(p.messages))
    })
  })
  const sse = new SSEParser()
  const handle = (data: string) => {
    if (data === '[DONE]') return
    const json = JSON.parse(data)
    if (json.error) throw new Error(json.error.message ?? String(json.error))
    const text = json.choices?.[0]?.delta?.content
    if (text) p.onDelta(text)
  }
  for await (const chunk of iterateBody(res.body!, p.signal)) sse.push(chunk).forEach((e) => handle(e.data))
  sse.flush().forEach((e) => handle(e.data))
  return { model: model }
}

async function listOpenAIModels(settings: Settings, apiKey?: string): Promise<ModelInfo[]> {
  const { baseUrl } = settings.openai
  const key = requireKey(apiKey, 'the OpenAI-compatible provider')
  const res = await request('openai', baseUrl, `${baseUrl}/models`, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(8000)
  })
  const json = (await res.json()) as { data?: { id: string }[] }
  return (json.data ?? [])
    .map((m) => ({ id: m.id, vision: looksLikeVisionModel(m.id) }))
    .sort((a, b) => a.id.localeCompare(b.id))
}

// ---------------------------------------------------------------- Anthropic

const ANTHROPIC_VERSION = '2023-06-01'

async function streamAnthropic(p: StreamParams): Promise<StreamResult> {
  const { baseUrl, model } = p.settings.anthropic
  const key = requireKey(p.apiKey, 'Anthropic')
  const res = await request('anthropic', baseUrl, `${baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': ANTHROPIC_VERSION
    },
    signal: p.signal,
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      stream: true,
      temperature: Math.min(p.settings.temperature, 1),
      ...(p.settings.systemPrompt.trim() ? { system: p.settings.systemPrompt } : {}),
      messages: toAnthropicMessages(prepareMessages(p.messages))
    })
  })
  const sse = new SSEParser()
  const handle = (data: string) => {
    const json = JSON.parse(data)
    if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta') p.onDelta(json.delta.text)
    else if (json.type === 'error') throw new Error(json.error?.message ?? 'Anthropic stream error')
  }
  for await (const chunk of iterateBody(res.body!, p.signal)) sse.push(chunk).forEach((e) => handle(e.data))
  sse.flush().forEach((e) => handle(e.data))
  return { model }
}

async function listAnthropicModels(settings: Settings, apiKey?: string): Promise<ModelInfo[]> {
  const { baseUrl } = settings.anthropic
  const key = requireKey(apiKey, 'Anthropic')
  const res = await request('anthropic', baseUrl, `${baseUrl}/v1/models?limit=100`, {
    headers: { 'x-api-key': key, 'anthropic-version': ANTHROPIC_VERSION },
    signal: AbortSignal.timeout(8000)
  })
  const json = (await res.json()) as { data?: { id: string; display_name?: string }[] }
  return (json.data ?? []).map((m) => ({ id: m.id, label: m.display_name, vision: true }))
}

// ---------------------------------------------------------------- dispatch

export function streamChat(p: StreamParams): Promise<StreamResult> {
  switch (p.settings.provider) {
    case 'ollama':
      return streamOllama(p)
    case 'openai':
      return streamOpenAI(p)
    case 'anthropic':
      return streamAnthropic(p)
  }
}

export function listModels(settings: Settings, apiKey?: string): Promise<ModelInfo[]> {
  switch (settings.provider) {
    case 'ollama':
      return listOllamaModels(settings)
    case 'openai':
      return listOpenAIModels(settings, apiKey)
    case 'anthropic':
      return listAnthropicModels(settings, apiKey)
  }
}
