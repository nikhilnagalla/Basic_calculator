// Microphone capture + chunked Whisper transcription.
// Recording only starts from an explicit user action and stop() releases the microphone immediately.
import { useCallback, useEffect, useRef, useState } from 'react'
import { concatFloat32, encodeWav, resample, rms, TARGET_SAMPLE_RATE } from '../lib/wav'
import { errorMessage } from '../lib/util'

const WORKLET = `
class OpenClueTap extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0]
    if (ch) this.port.postMessage(ch.slice(0))
    return true
  }
}
registerProcessor('openclue-tap', OpenClueTap)
`

/** Chunks quieter than this are treated as silence and never sent to Whisper. */
const SILENCE_RMS = 0.006

export interface RecorderState {
  recording: boolean
  startedAt: number | null
  level: number
  transcript: string
  pending: number
  error: string | null
}

export function useRecorder(chunkSeconds: number) {
  const [state, setState] = useState<RecorderState>({
    recording: false,
    startedAt: null,
    level: 0,
    transcript: '',
    pending: 0,
    error: null
  })
  const streamRef = useRef<MediaStream | null>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const nodeRef = useRef<AudioWorkletNode | null>(null)
  const bufRef = useRef<Float32Array[]>([])
  const bufLenRef = useRef(0)
  const queueRef = useRef<Promise<void>>(Promise.resolve())
  const sessionRef = useRef(0)
  const chunkRef = useRef(chunkSeconds)
  chunkRef.current = chunkSeconds

  const sendChunk = useCallback((samples: Float32Array, sampleRate: number, session: number) => {
    const pcm = resample(samples, sampleRate, TARGET_SAMPLE_RATE)
    if (pcm.length < TARGET_SAMPLE_RATE * 0.5 || rms(pcm) < SILENCE_RMS) return
    const wav = encodeWav(pcm, TARGET_SAMPLE_RATE)
    setState((s) => ({ ...s, pending: s.pending + 1 }))
    // Transcribe sequentially so text arrives in order.
    queueRef.current = queueRef.current.then(async () => {
      try {
        const { text } = await window.openclue.transcribe(wav)
        if (session !== sessionRef.current) return // discarded by stop-all / clear
        if (text) setState((s) => ({ ...s, transcript: s.transcript ? `${s.transcript} ${text}` : text, error: null }))
      } catch (err) {
        if (session === sessionRef.current) setState((s) => ({ ...s, error: errorMessage(err) }))
      } finally {
        setState((s) => ({ ...s, pending: Math.max(0, s.pending - 1) }))
      }
    })
  }, [])

  const flush = useCallback(
    (session: number) => {
      const ctx = ctxRef.current
      if (!ctx || bufLenRef.current === 0) return
      const samples = concatFloat32(bufRef.current)
      bufRef.current = []
      bufLenRef.current = 0
      sendChunk(samples, ctx.sampleRate, session)
    },
    [sendChunk]
  )

  const release = useCallback(() => {
    // Stop every track first: this turns off the OS microphone indicator immediately.
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    nodeRef.current?.port.close()
    nodeRef.current?.disconnect()
    nodeRef.current = null
    const ctx = ctxRef.current
    ctxRef.current = null
    void ctx?.close().catch(() => undefined)
  }, [])

  const start = useCallback(async () => {
    if (streamRef.current) return
    setState((s) => ({ ...s, error: null }))
    try {
      const granted = await window.openclue.requestMicrophoneAccess()
      if (!granted) {
        throw new Error('Microphone access was denied. Enable OpenClue in System Settings → Privacy & Security → Microphone.')
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false
      })
      streamRef.current = stream
      let ctx: AudioContext
      try {
        ctx = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE })
      } catch {
        ctx = new AudioContext()
      }
      ctxRef.current = ctx
      const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }))
      try {
        await ctx.audioWorklet.addModule(url)
      } finally {
        URL.revokeObjectURL(url)
      }
      const node = new AudioWorkletNode(ctx, 'openclue-tap')
      nodeRef.current = node
      const session = ++sessionRef.current
      let levelFrames = 0
      node.port.onmessage = (e: MessageEvent<Float32Array>) => {
        bufRef.current.push(e.data)
        bufLenRef.current += e.data.length
        if (++levelFrames % 8 === 0) {
          const level = Math.min(1, rms(e.data) * 8)
          setState((s) => (Math.abs(s.level - level) > 0.02 ? { ...s, level } : s))
        }
        if (bufLenRef.current >= ctx.sampleRate * chunkRef.current) flush(session)
      }
      ctx.createMediaStreamSource(stream).connect(node)
      // Some engines only pull audio through nodes connected to the destination; keep it silent.
      const mute = ctx.createGain()
      mute.gain.value = 0
      node.connect(mute).connect(ctx.destination)

      setState((s) => ({ ...s, recording: true, startedAt: Date.now(), level: 0 }))
      void window.openclue.reportActivity({ recording: true })
    } catch (err) {
      release()
      setState((s) => ({ ...s, recording: false, startedAt: null, error: errorMessage(err) }))
      void window.openclue.reportActivity({ recording: false })
    }
  }, [flush, release])

  /** Stop recording. With `discard`, buffered audio and in-flight transcriptions are dropped. */
  const stop = useCallback(
    (discard = false) => {
      const session = sessionRef.current
      if (discard) {
        sessionRef.current++
        bufRef.current = []
        bufLenRef.current = 0
      } else {
        flush(session)
      }
      release()
      setState((s) => ({ ...s, recording: false, startedAt: null, level: 0, ...(discard ? { pending: 0 } : {}) }))
      void window.openclue.reportActivity({ recording: false })
    },
    [flush, release]
  )

  const clearTranscript = useCallback(() => {
    setState((s) => ({ ...s, transcript: '', error: null }))
  }, [])

  useEffect(() => () => release(), [release])

  return { ...state, start, stop, clearTranscript }
}
