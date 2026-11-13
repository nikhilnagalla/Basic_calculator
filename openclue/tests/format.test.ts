import { describe, expect, it } from 'vitest'
import type { ChatMessage } from '@shared/types'
import {
  composeUserText,
  describeHttpError,
  looksLikeVisionModel,
  MISSING_SCREENSHOT_NOTE,
  parseDataUrl,
  prepareMessages,
  toAnthropicMessages,
  toOllamaMessages,
  toOpenAIMessages
} from '../src/main/llm/format'

const IMG = 'data:image/jpeg;base64,QUJD'
let n = 0
const msg = (role: 'user' | 'assistant', content: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id: String(++n),
  role,
  content,
  createdAt: n,
  ...extra
})

describe('parseDataUrl', () => {
  it('extracts media type and payload', () => {
    expect(parseDataUrl(IMG)).toEqual({ mediaType: 'image/jpeg', base64: 'QUJD' })
    expect(parseDataUrl('https://example.com/x.png')).toBeNull()
  })
})

describe('composeUserText', () => {
  it('prefixes the transcript as context', () => {
    const t = composeUserText('What did they ask?', 'How do I reverse a list')
    expect(t).toContain('Microphone transcript')
    expect(t).toContain('How do I reverse a list')
    expect(t.endsWith('What did they ask?')).toBe(true)
  })
  it('uses a default question when only a transcript is present', () => {
    expect(composeUserText('', 'hello')).toContain('Help me with what was said above.')
  })
})

describe('prepareMessages', () => {
  it('drops failed and empty assistant turns and merges same-role neighbours', () => {
    const out = prepareMessages([msg('user', 'a'), msg('assistant', '', { error: 'boom' }), msg('user', 'b'), msg('assistant', 'ok')])
    expect(out).toEqual([
      { role: 'user', text: 'a\n\nb', image: undefined },
      { role: 'assistant', text: 'ok', image: undefined }
    ])
  })

  it('keeps only the latest screenshot as an image', () => {
    const out = prepareMessages([
      msg('user', 'first', { screenshot: IMG }),
      msg('assistant', 'r1'),
      msg('user', 'second', { screenshot: IMG })
    ])
    expect(out[0].image).toBeUndefined()
    expect(out[0].text.startsWith(MISSING_SCREENSHOT_NOTE)).toBe(true)
    expect(out[2].image?.base64).toBe('QUJD')
  })

  it('notes screenshots that were not persisted', () => {
    const out = prepareMessages([msg('user', 'q', { hadScreenshot: true })])
    expect(out[0].text).toContain(MISSING_SCREENSHOT_NOTE)
    expect(out[0].image).toBeUndefined()
  })

  it('adds a default prompt for screenshot-only questions', () => {
    const out = prepareMessages([msg('user', '', { screenshot: IMG })])
    expect(out[0].text).toMatch(/screen/i)
    expect(out[0].image).toBeDefined()
  })

  it('never starts with an assistant turn', () => {
    expect(prepareMessages([msg('assistant', 'hi'), msg('user', 'q')])[0].role).toBe('user')
  })
})

describe('provider formats', () => {
  const prepared = prepareMessages([msg('user', 'look', { screenshot: IMG })])

  it('ollama puts raw base64 in images[]', () => {
    const out = toOllamaMessages('sys', prepared)
    expect(out[0]).toEqual({ role: 'system', content: 'sys' })
    expect(out[1]).toMatchObject({ role: 'user', content: 'look', images: ['QUJD'] })
  })

  it('openai uses image_url content parts with a data URL', () => {
    const out = toOpenAIMessages('', prepared)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      role: 'user',
      content: [{ type: 'text', text: 'look' }, { type: 'image_url', image_url: { url: IMG } }]
    })
  })

  it('anthropic uses base64 image blocks before the text', () => {
    const out = toAnthropicMessages(prepared)
    expect(out[0]).toMatchObject({
      role: 'user',
      content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'QUJD' } }, { type: 'text', text: 'look' }]
    })
  })
})

describe('looksLikeVisionModel', () => {
  it.each(['llava:13b', 'llama3.2-vision', 'qwen2.5vl:7b', 'qwen2-vl', 'gemma3:4b', 'gpt-4o-mini', 'moondream'])('%s → vision', (m) =>
    expect(looksLikeVisionModel(m)).toBe(true)
  )
  it.each(['llama3.1:8b', 'mistral', 'qwen2.5-coder', 'deepseek-r1'])('%s → text', (m) => expect(looksLikeVisionModel(m)).toBe(false))
})

describe('describeHttpError', () => {
  it('extracts nested error messages', () => {
    expect(describeHttpError(401, '{"error":{"message":"bad key"}}')).toBe('HTTP 401: bad key')
    expect(describeHttpError(404, '{"error":"model \\"x\\" not found"}')).toBe('HTTP 404: model "x" not found')
    expect(describeHttpError(500, '')).toBe('HTTP 500')
  })
})
