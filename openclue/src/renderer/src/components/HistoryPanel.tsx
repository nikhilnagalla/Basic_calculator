import { MessageSquare, Search, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { ConversationSummary } from '@shared/types'
import { errorMessage, relativeTime } from '../lib/util'
import { Button, inputClass } from './ui'

interface Props {
  currentId: string
  saveHistory: boolean
  onOpen: (id: string) => void
  onDeleted: (id: string) => void
  onCleared: () => void
}

export function HistoryPanel({ currentId, saveHistory, onOpen, onDeleted, onCleared }: Props) {
  const [items, setItems] = useState<ConversationSummary[] | null>(null)
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)

  const load = () =>
    window.openclue
      .listHistory()
      .then(setItems)
      .catch((e) => setError(errorMessage(e)))

  useEffect(() => {
    void load()
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!items) return []
    return q ? items.filter((c) => `${c.title} ${c.preview}`.toLowerCase().includes(q)) : items
  }, [items, query])

  return (
    <div className="flex h-full min-h-0 animate-fade-in flex-col px-4 pb-4">
      <div className="flex items-center gap-2 pb-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-white/35" />
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search conversations" className={`${inputClass} pl-8`} />
        </div>
        {items && items.length > 0 &&
          (confirmClear ? (
            <>
              <Button
                variant="danger"
                size="sm"
                onClick={async () => {
                  await window.openclue.clearHistory()
                  setConfirmClear(false)
                  setItems([])
                  onCleared()
                }}
              >
                Delete all
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmClear(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setConfirmClear(true)}>
              <Trash2 size={12} /> Clear all
            </Button>
          ))}
      </div>

      {!saveHistory && (
        <div className="mb-3 rounded-lg border border-white/8 bg-white/4 px-3 py-2 text-[12px] text-white/50">
          History saving is off (Settings → Privacy). New conversations are not written to disk.
        </div>
      )}
      {error && <div className="mb-3 text-[12px] text-rec">{error}</div>}

      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
        {items === null ? (
          <div className="thinking py-6 text-center text-[12px]">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="py-10 text-center text-[12.5px] text-white/35">{query ? 'No matches.' : 'No saved conversations yet.'}</div>
        ) : (
          filtered.map((c) => (
            <div
              key={c.id}
              role="button"
              tabIndex={0}
              onClick={() => onOpen(c.id)}
              onKeyDown={(e) => e.key === 'Enter' && onOpen(c.id)}
              className={`group flex cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 transition-colors outline-none hover:bg-white/6 focus-visible:bg-white/8 ${c.id === currentId ? 'bg-white/8' : ''}`}
            >
              <MessageSquare size={14} className="mt-0.5 shrink-0 text-white/35" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="truncate text-[13px] font-medium text-white/90">{c.title}</span>
                  <span className="ml-auto shrink-0 text-[11px] text-white/35">{relativeTime(c.updatedAt)}</span>
                </div>
                <div className="truncate text-[12px] text-white/45">{c.preview || `${c.messageCount} messages`}</div>
              </div>
              <button
                type="button"
                title="Delete conversation"
                onClick={async (e) => {
                  e.stopPropagation()
                  await window.openclue.deleteConversation(c.id)
                  setItems((list) => list?.filter((x) => x.id !== c.id) ?? null)
                  onDeleted(c.id)
                }}
                className="rounded-md p-1 text-white/30 opacity-0 transition group-hover:opacity-100 hover:bg-rec/15 hover:text-rec"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
