import clsx from 'clsx'
import { RotateCcw, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { formatAccelerator, isValidAccelerator, keyEventToAccelerator } from '@shared/accelerator'
import { isMac } from '../lib/util'

interface Props {
  value: string
  defaultValue: string
  onChange: (accel: string) => void
  error?: string
}

export function HotkeyRecorder({ value, defaultValue, onChange, error }: Props) {
  const [recording, setRecording] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const ref = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!recording) return
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        setRecording(false)
        return
      }
      const accel = keyEventToAccelerator(e, isMac)
      if (!accel) return
      if (!isValidAccelerator(accel)) {
        setHint('Add a modifier (⌘, ⌃, ⌥ or ⇧)')
        return
      }
      onChange(accel)
      setHint(null)
      setRecording(false)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [recording, onChange])

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1">
        <button
          ref={ref}
          type="button"
          onClick={() => {
            setHint(null)
            setRecording((r) => !r)
          }}
          onBlur={() => setRecording(false)}
          className={clsx(
            'no-drag min-w-[132px] rounded-lg border px-2.5 py-1 text-center font-mono text-[12px] transition-all',
            recording ? 'border-accent bg-accent/15 text-accent' : 'border-white/10 bg-black/25 text-white/85 hover:border-white/25',
            error && !recording && 'border-rec/50'
          )}
        >
          {recording ? 'Press keys…' : value ? formatAccelerator(value, isMac) : 'Not set'}
        </button>
        <button type="button" title="Reset to default" onClick={() => onChange(defaultValue)} className="rounded-md p-1 text-white/35 hover:bg-white/8 hover:text-white">
          <RotateCcw size={12} />
        </button>
        <button type="button" title="Disable" onClick={() => onChange('')} className="rounded-md p-1 text-white/35 hover:bg-white/8 hover:text-white">
          <X size={12} />
        </button>
      </div>
      {(hint || error) && <span className="text-[11px] text-rec">{hint ?? error}</span>}
    </div>
  )
}
