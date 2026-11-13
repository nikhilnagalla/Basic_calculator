import { describe, expect, it } from 'vitest'
import { cleanTranscript } from '../src/main/transcription/clean'

describe('cleanTranscript', () => {
  it('removes whisper non-speech markers and timestamps', () => {
    expect(cleanTranscript('[BLANK_AUDIO]')).toBe('')
    expect(cleanTranscript(' (music) Hello there [00:00:00.000 --> 00:00:02.000] ')).toBe('Hello there')
  })
  it('drops common silence hallucinations only when they are the whole chunk', () => {
    expect(cleanTranscript('Thank you.')).toBe('')
    expect(cleanTranscript('Thank you. That was helpful.')).toBe('Thank you. That was helpful.')
  })
  it('collapses whitespace', () => {
    expect(cleanTranscript('  so   the\nanswer  is ')).toBe('so the answer is')
  })
})
