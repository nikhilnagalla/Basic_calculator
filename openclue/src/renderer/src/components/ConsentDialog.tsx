import { Mic, Monitor, ShieldCheck } from 'lucide-react'
import { useEffect } from 'react'
import { Button } from './ui'

export type ConsentKind = 'screen' | 'microphone'

interface Props {
  kind: ConsentKind
  cloud: boolean
  providerName: string
  onAllow: () => void
  onCancel: () => void
}

const COPY: Record<ConsentKind, { title: string; points: string[] }> = {
  screen: {
    title: 'Allow screen access?',
    points: [
      'OpenClue takes one screenshot only when you send a question with “Screen” on, or press the Ask-about-screen shortcut.',
      'There is no background or continuous capture. The image you sent is shown in the conversation.',
      'Turn it off at any time from the overlay, the menu bar, or with the Stop-everything shortcut.'
    ]
  },
  microphone: {
    title: 'Allow microphone transcription?',
    points: [
      'Audio is recorded only after you press the mic button or shortcut, and only while the red REC indicator is visible.',
      'Audio is transcribed in short chunks and never stored on disk.',
      'Stop instantly with the REC button, the menu bar, or the Stop-everything shortcut.'
    ]
  }
}

export function ConsentDialog({ kind, cloud, providerName, onAllow, onCancel }: Props) {
  const c = COPY[kind]
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCancel()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onCancel])

  return (
    <div className="absolute inset-0 z-40 flex animate-fade-in items-center justify-center bg-black/55 p-6" role="dialog" aria-modal="true" aria-labelledby="consent-title">
      <div className="w-full max-w-[460px] animate-slide-up rounded-2xl border border-white/12 bg-[#15161f] p-5 shadow-2xl">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/15 text-accent">
            {kind === 'screen' ? <Monitor size={18} /> : <Mic size={18} />}
          </div>
          <h2 id="consent-title" className="text-[15px] font-semibold text-white">
            {c.title}
          </h2>
        </div>
        <ul className="mt-3 space-y-1.5 text-[12.5px] leading-relaxed text-white/65">
          {c.points.map((pt) => (
            <li key={pt} className="flex gap-2">
              <ShieldCheck size={14} className="mt-0.5 shrink-0 text-ok" />
              <span>{pt}</span>
            </li>
          ))}
        </ul>
        {kind === 'screen' && (
          <div className={cloud ? 'mt-3 rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-[12px] text-warn' : 'mt-3 rounded-lg border border-ok/25 bg-ok/10 px-3 py-2 text-[12px] text-ok'}>
            {cloud
              ? `Screenshots will be sent to a cloud provider (${providerName}).`
              : `Screenshots stay on this computer (${providerName}).`}
          </div>
        )}
        <p className="mt-3 text-[11.5px] text-white/40">
          macOS will also ask for {kind === 'screen' ? 'Screen Recording' : 'Microphone'} permission the first time.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Not now
          </Button>
          <Button variant="primary" onClick={onAllow} autoFocus>
            Allow
          </Button>
        </div>
      </div>
    </div>
  )
}
