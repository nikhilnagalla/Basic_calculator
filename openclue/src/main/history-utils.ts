// Pure helpers for conversation history. Unit-tested.
import type { Conversation, ConversationSummary } from '@shared/types'

export const CONVERSATION_ID_RE = /^[A-Za-z0-9_-]{1,64}$/

export function isValidConversationId(id: unknown): id is string {
  return typeof id === 'string' && CONVERSATION_ID_RE.test(id)
}

/** Remove screenshot image data, keeping a marker that one was sent. */
export function stripScreenshots(conv: Conversation): Conversation {
  return {
    ...conv,
    messages: conv.messages.map((m) => {
      if (!m.screenshot) return m
      const { screenshot: _drop, ...rest } = m
      return { ...rest, hadScreenshot: true }
    })
  }
}

export function deriveTitle(conv: Conversation): string {
  const first = conv.messages.find((m) => m.role === 'user' && m.content.trim())
  if (!first) return conv.messages.some((m) => m.hadScreenshot || m.screenshot) ? 'Screen question' : 'New conversation'
  const line = first.content.trim().split('\n')[0]
  return line.length > 60 ? `${line.slice(0, 57)}…` : line
}

export function summarize(conv: Conversation): ConversationSummary {
  const last = [...conv.messages].reverse().find((m) => m.content.trim())
  const preview = (last?.content ?? '').replace(/\s+/g, ' ').trim()
  return {
    id: conv.id,
    title: conv.title || deriveTitle(conv),
    createdAt: conv.createdAt,
    updatedAt: conv.updatedAt,
    messageCount: conv.messages.length,
    preview: preview.length > 120 ? `${preview.slice(0, 117)}…` : preview
  }
}

/** Ids of conversations older than the retention window (0 days = keep forever). */
export function expiredIds(convs: Pick<Conversation, 'id' | 'updatedAt'>[], retentionDays: number, now = Date.now()): string[] {
  if (!retentionDays || retentionDays <= 0) return []
  const cutoff = now - retentionDays * 24 * 60 * 60 * 1000
  return convs.filter((c) => c.updatedAt < cutoff).map((c) => c.id)
}

/** Validate an untrusted conversation object coming from the renderer or disk. */
export function isConversation(v: unknown): v is Conversation {
  if (typeof v !== 'object' || v === null) return false
  const c = v as Conversation
  return (
    isValidConversationId(c.id) &&
    typeof c.createdAt === 'number' &&
    typeof c.updatedAt === 'number' &&
    Array.isArray(c.messages) &&
    c.messages.every(
      (m) => typeof m === 'object' && m !== null && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string'
    )
  )
}
