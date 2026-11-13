import { describe, expect, it } from 'vitest'
import type { Conversation } from '@shared/types'
import { deriveTitle, expiredIds, isConversation, isValidConversationId, stripScreenshots, summarize } from '../src/main/history-utils'

const conv = (over: Partial<Conversation> = {}): Conversation => ({
  id: 'abc-123',
  title: '',
  createdAt: 1,
  updatedAt: 2,
  messages: [
    { id: '1', role: 'user', content: 'How do I center a div?', createdAt: 1, screenshot: 'data:image/jpeg;base64,AAAA', hadScreenshot: true },
    { id: '2', role: 'assistant', content: 'Use **flexbox**.', createdAt: 2 }
  ],
  ...over
})

describe('conversation ids', () => {
  it('rejects path traversal', () => {
    expect(isValidConversationId('../../etc/passwd')).toBe(false)
    expect(isValidConversationId('a/b')).toBe(false)
    expect(isValidConversationId('')).toBe(false)
    expect(isValidConversationId('6f1c7a1e-2b9d-4f7e-9a51-0c2b8f0d9e11')).toBe(true)
  })
})

describe('stripScreenshots', () => {
  it('removes image data but remembers one was sent', () => {
    const out = stripScreenshots(conv())
    expect(out.messages[0].screenshot).toBeUndefined()
    expect(out.messages[0].hadScreenshot).toBe(true)
    expect(out.messages[1]).toEqual(conv().messages[1])
  })
})

describe('titles and summaries', () => {
  it('derives a title from the first user message', () => {
    expect(deriveTitle(conv())).toBe('How do I center a div?')
    expect(deriveTitle(conv({ messages: [] }))).toBe('New conversation')
  })
  it('truncates long titles', () => {
    const long = 'x'.repeat(100)
    expect(deriveTitle(conv({ messages: [{ id: '1', role: 'user', content: long, createdAt: 1 }] })).length).toBe(58)
  })
  it('summarises with the latest message as preview', () => {
    expect(summarize(conv())).toMatchObject({ id: 'abc-123', messageCount: 2, preview: 'Use **flexbox**.' })
  })
})

describe('expiredIds', () => {
  const day = 86_400_000
  const now = 100 * day
  it('returns conversations older than the retention window', () => {
    const items = [
      { id: 'old', updatedAt: now - 40 * day },
      { id: 'new', updatedAt: now - 2 * day }
    ]
    expect(expiredIds(items, 30, now)).toEqual(['old'])
  })
  it('keeps everything when retention is 0', () => {
    expect(expiredIds([{ id: 'old', updatedAt: 0 }], 0, now)).toEqual([])
  })
})

describe('isConversation', () => {
  it('validates shape', () => {
    expect(isConversation(conv())).toBe(true)
    expect(isConversation({ ...conv(), id: '../x' })).toBe(false)
    expect(isConversation({ ...conv(), messages: [{ role: 'system', content: 'x' }] })).toBe(false)
    expect(isConversation(null)).toBe(false)
  })
})
