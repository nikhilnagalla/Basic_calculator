// Converts OpenClue chat messages into each provider's request format. Pure + unit-tested.
import type { ChatMessage } from '@shared/types'

export const MISSING_SCREENSHOT_NOTE = '[A screenshot was attached to this message earlier but is not included anymore.]'

export interface PreparedMessage {
  role: 'user' | 'assistant'
  text: string
  image?: { mediaType: string; base64: string; dataUrl: string }
}

export function parseDataUrl(dataUrl: string): { mediaType: string; base64: string } | null {
  const m = /^data:([a-z]+\/[a-z0-9.+-]+);base64,(.+)$/i.exec(dataUrl)
  return m ? { mediaType: m[1].toLowerCase(), base64: m[2] } : null
}

export function composeUserText(content: string, transcript?: string): string {
  const question = content.trim()
  if (!transcript || !transcript.trim()) return question
  return `Microphone transcript (what was said recently):\n"""\n${transcript.trim()}\n"""\n\n${question || 'Help me with what was said above.'}`
}

/**
 * Normalise a conversation for an LLM:
 *  - drops failed / empty assistant turns,
 *  - merges consecutive messages of the same role (some APIs require alternation),
 *  - ensures it starts with a user turn,
 *  - keeps only the most recent screenshot image (older ones become a text note) to bound payload
 *    size and because many local vision models accept a single image.
 */
export function prepareMessages(messages: ChatMessage[]): PreparedMessage[] {
  const usable = messages.filter((m) => !(m.role === 'assistant' && (m.error || !m.content.trim())))
  let lastImageIdx = -1
  usable.forEach((m, i) => {
    if (m.role === 'user' && m.screenshot && parseDataUrl(m.screenshot)) lastImageIdx = i
  })

  const out: PreparedMessage[] = []
  usable.forEach((m, i) => {
    let text = m.role === 'user' ? composeUserText(m.content, m.transcript) : m.content.trim()
    let image: PreparedMessage['image']
    if (m.role === 'user' && (m.screenshot || m.hadScreenshot)) {
      const parsed = i === lastImageIdx && m.screenshot ? parseDataUrl(m.screenshot) : null
      if (parsed && m.screenshot) image = { ...parsed, dataUrl: m.screenshot }
      else text = `${MISSING_SCREENSHOT_NOTE}\n${text}`
    }
    if (!text && !image) return
    if (!text && image) text = 'Here is my screen. What do you see, and how can you help?'

    const prev = out[out.length - 1]
    if (prev && prev.role === m.role) {
      prev.text = `${prev.text}\n\n${text}`
      if (image) prev.image = image
    } else {
      out.push({ role: m.role, text, image })
    }
  })
  while (out.length > 0 && out[0].role !== 'user') out.shift()
  return out
}

export function toOllamaMessages(system: string, msgs: PreparedMessage[]) {
  return [
    ...(system.trim() ? [{ role: 'system', content: system }] : []),
    ...msgs.map((m) => ({
      role: m.role,
      content: m.text,
      ...(m.image ? { images: [m.image.base64] } : {})
    }))
  ]
}

export function toOpenAIMessages(system: string, msgs: PreparedMessage[]) {
  return [
    ...(system.trim() ? [{ role: 'system', content: system }] : []),
    ...msgs.map((m) =>
      m.image
        ? {
            role: m.role,
            content: [
              { type: 'text', text: m.text },
              { type: 'image_url', image_url: { url: m.image.dataUrl } }
            ]
          }
        : { role: m.role, content: m.text }
    )
  ]
}

export function toAnthropicMessages(msgs: PreparedMessage[]) {
  return msgs.map((m) =>
    m.image
      ? {
          role: m.role,
          content: [
            { type: 'image', source: { type: 'base64', media_type: m.image.mediaType, data: m.image.base64 } },
            { type: 'text', text: m.text }
          ]
        }
      : { role: m.role, content: m.text }
  )
}

const VISION_HINTS = [
  'llava', 'vision', 'vl', 'gemma3', 'minicpm-v', 'moondream', 'bakllava', 'llama4',
  'mistral-small3', 'granite3.2-vision', 'gpt-4o', 'gpt-4.1', 'gpt-5', 'claude', 'gemini', 'pixtral'
]

/** Best-effort guess at whether a model name supports images. */
export function looksLikeVisionModel(name: string): boolean {
  const n = name.toLowerCase()
  return VISION_HINTS.some((h) => (h === 'vl' ? /(^|[^a-z])vl|vl([^a-z]|$)/.test(n) : n.includes(h)))
}

/** Turn an HTTP error body into a short, readable message. */
export function describeHttpError(status: number, body: string): string {
  let msg = body.trim()
  try {
    const json = JSON.parse(body)
    msg = json?.error?.message ?? json?.error ?? json?.message ?? msg
    if (typeof msg !== 'string') msg = JSON.stringify(msg)
  } catch {
    /* not JSON */
  }
  if (msg.length > 300) msg = `${msg.slice(0, 300)}…`
  return `HTTP ${status}${msg ? `: ${msg}` : ''}`
}
