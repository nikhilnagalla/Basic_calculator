// Conversation history on disk: one JSON file per conversation in <userData>/conversations.
import { app } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { Conversation, ConversationSummary } from '@shared/types'
import { readJson, writeFileAtomic } from './fsutil'
import { deriveTitle, expiredIds, isConversation, isValidConversationId, stripScreenshots, summarize } from './history-utils'
import { store } from './store'

const dir = () => join(app.getPath('userData'), 'conversations')
const fileFor = (id: string) => join(dir(), `${id}.json`)

async function readAll(): Promise<Conversation[]> {
  let names: string[] = []
  try {
    names = (await fs.readdir(dir())).filter((n) => n.endsWith('.json'))
  } catch {
    return []
  }
  const convs = await Promise.all(names.map((n) => readJson<Conversation>(join(dir(), n))))
  return convs.filter(isConversation)
}

export async function listConversations(): Promise<ConversationSummary[]> {
  const convs = await readAll()
  return convs.map(summarize).sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function getConversation(id: string): Promise<Conversation | null> {
  if (!isValidConversationId(id)) return null
  const conv = await readJson<Conversation>(fileFor(id))
  return isConversation(conv) ? conv : null
}

export async function saveConversation(conv: unknown): Promise<boolean> {
  const { saveHistory, saveScreenshots } = store.get().privacy
  if (!saveHistory) return false
  if (!isConversation(conv)) throw new Error('Invalid conversation')
  const toSave = saveScreenshots ? conv : stripScreenshots(conv)
  toSave.title = toSave.title || deriveTitle(toSave)
  await writeFileAtomic(fileFor(conv.id), JSON.stringify(toSave))
  return true
}

export async function deleteConversation(id: string): Promise<void> {
  if (!isValidConversationId(id)) return
  await fs.rm(fileFor(id), { force: true })
}

export async function clearHistory(): Promise<void> {
  await fs.rm(dir(), { recursive: true, force: true })
}

/** Remove screenshots from every saved conversation (used when the user turns that option off). */
export async function purgeSavedScreenshots(): Promise<void> {
  for (const conv of await readAll()) {
    if (conv.messages.some((m) => m.screenshot)) {
      await writeFileAtomic(fileFor(conv.id), JSON.stringify(stripScreenshots(conv)))
    }
  }
}

export async function pruneExpired(): Promise<number> {
  const ids = expiredIds(await readAll(), store.get().privacy.historyRetentionDays)
  await Promise.all(ids.map(deleteConversation))
  return ids.length
}
