import clsx from 'clsx'
import { ChevronDown, ChevronUp, EyeOff, History, Mic, Monitor, OctagonX, Send, Settings2, Square, X } from 'lucide-react'
import { forwardRef, useEffect, useState, type KeyboardEvent } from 'react'
import { formatAccelerator } from '@shared/accelerator'
import type { PublicSettings } from '@shared/types'
import { formatDuration, isMac } from '../lib/util'
import { IconButton } from './ui'

interface Props {
  settings: PublicSettings
  input: string
  onInput: (v: string) => void
  onSubmit: () => void
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void
  streaming: boolean
  onStopStreaming: () => void
  attachScreen: boolean
  onToggleAttachScreen: () => void
  capturing: boolean
  recording: boolean
  recordingStartedAt: number | null
  level: number
  onToggleRecording: () => void
  expanded: boolean
  onToggleExpanded: () => void
  panel: 'chat' | 'settings' | 'history'
  onOpenPanel: (p: 'settings' | 'history') => void
  onHide: () => void
  onStopAll: () => void
}

function Logo() {
  return (
    <div className="drag flex h-9 w-9 shrink-0 items-center justify-center" title="Drag to move">
      <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden>
        <defs>
          <linearGradient id="oc-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#a9b6ff" />
            <stop offset="1" stopColor="#6d7dff" />
          </linearGradient>
        </defs>
        <circle cx="16" cy="16" r="11" fill="none" stroke="url(#oc-g)" strokeWidth="3.2" strokeDasharray="52 18" strokeLinecap="round" transform="rotate(-35 16 16)" />
        <circle cx="16" cy="16" r="4" fill="url(#oc-g)" />
      </svg>
    </div>
  )
}

function useNow(active: boolean): number {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(t)
  }, [active])
  return now
}

export const CommandBar = forwardRef<HTMLTextAreaElement, Props>(function CommandBar(p, ref) {
  const now = useNow(p.recording)
  const screenOn = p.settings.privacy.screenAccessEnabled
  const hk = p.settings.hotkeys

  return (
    <div className="drag flex h-[76px] shrink-0 items-center gap-2 px-3">
      <Logo />

      <div
        className={clsx(
          'no-drag flex h-11 min-w-0 flex-1 items-center gap-1 rounded-xl border bg-black/25 pr-1 pl-3 transition-colors duration-200',
          'border-white/10 focus-within:border-accent/50 focus-within:bg-black/35'
        )}
      >
        <textarea
          ref={ref}
          rows={1}
          value={p.input}
          onChange={(e) => p.onInput(e.target.value)}
          onKeyDown={p.onKeyDown}
          placeholder={
            p.recording ? 'Listening… ask about what was said' : screenOn && p.attachScreen ? 'Ask about your screen…' : 'Ask anything…'
          }
          spellCheck={false}
          className="selectable h-[22px] min-w-0 flex-1 resize-none bg-transparent text-[14px] leading-[22px] text-white outline-none placeholder:text-white/35"
        />

        {/* Screen chip: only meaningful once screen access is enabled. */}
        <button
          type="button"
          onClick={p.onToggleAttachScreen}
          title={
            screenOn
              ? p.attachScreen
                ? 'A screenshot will be attached to your next message (click to turn off)'
                : 'Attach a screenshot to your next message'
              : 'Screen access is off — click to enable'
          }
          className={clsx(
            'inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[11.5px] font-medium transition-all duration-150 active:scale-95',
            p.capturing && 'animate-pulse',
            screenOn && p.attachScreen ? 'bg-accent/18 text-accent' : 'text-white/45 hover:bg-white/8 hover:text-white/80'
          )}
        >
          {screenOn ? <Monitor size={15} /> : <EyeOff size={15} />}
          <span>{p.capturing ? 'Capturing…' : screenOn ? (p.attachScreen ? 'Screen' : 'No screen') : 'Screen off'}</span>
        </button>

        {p.streaming ? (
          <IconButton label="Stop generating (⌘.)" onClick={p.onStopStreaming} className="text-white">
            <Square size={14} fill="currentColor" />
          </IconButton>
        ) : (
          <IconButton label="Send (Enter)" onClick={p.onSubmit} disabled={!p.input.trim() && !(screenOn && p.attachScreen)}>
            <Send size={15} />
          </IconButton>
        )}
      </div>

      {/* Microphone: a clearly visible recording state with elapsed time and live level. */}
      <button
        type="button"
        onClick={p.onToggleRecording}
        title={
          p.recording
            ? `Stop recording (${formatAccelerator(hk.toggleRecording, isMac)})`
            : `Start recording (${formatAccelerator(hk.toggleRecording, isMac)})`
        }
        aria-label={p.recording ? 'Stop recording' : 'Start recording'}
        className={clsx(
          'no-drag inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-2.5 text-[12px] font-semibold transition-all duration-200 active:scale-95',
          p.recording ? 'animate-rec-pulse bg-rec text-white' : 'text-white/65 hover:bg-white/10 hover:text-white'
        )}
      >
        {p.recording ? (
          <>
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/70" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
            </span>
            <span>REC</span>
            <span className="font-mono tabular-nums">{formatDuration(now - (p.recordingStartedAt ?? now))}</span>
            <span className="flex h-4 items-end gap-[2px]" aria-hidden>
              {[0.5, 1, 0.7].map((m, i) => (
                <span
                  key={i}
                  className="w-[3px] rounded-full bg-white/90 transition-[height] duration-100"
                  style={{ height: `${Math.max(3, Math.min(16, p.level * 16 * m + 3))}px` }}
                />
              ))}
            </span>
          </>
        ) : (
          <Mic size={16} />
        )}
      </button>

      <div className="flex items-center gap-0.5">
        {(p.recording || screenOn) && (
          <IconButton
            label={`Stop everything — recording, answers and screen access (${formatAccelerator(hk.stopAll, isMac)})`}
            onClick={p.onStopAll}
            className="animate-fade-in text-rec/80 hover:bg-rec/15 hover:text-rec"
          >
            <OctagonX size={16} />
          </IconButton>
        )}
        <IconButton label="History (⌘J)" active={p.panel === 'history'} onClick={() => p.onOpenPanel('history')}>
          <History size={16} />
        </IconButton>
        <IconButton label="Settings (⌘,)" active={p.panel === 'settings'} onClick={() => p.onOpenPanel('settings')}>
          <Settings2 size={16} />
        </IconButton>
        <IconButton label={p.expanded ? 'Collapse' : 'Expand'} onClick={p.onToggleExpanded}>
          {p.expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </IconButton>
        <IconButton label={`Hide (${formatAccelerator(hk.toggleOverlay, isMac)})`} onClick={p.onHide}>
          <X size={16} />
        </IconButton>
      </div>
    </div>
  )
})
