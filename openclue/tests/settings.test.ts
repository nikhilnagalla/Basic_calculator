import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, deepMerge, findHotkeyConflicts, sanitizeSettings } from '@shared/settings'

describe('sanitizeSettings', () => {
  it('returns defaults for garbage input', () => {
    expect(sanitizeSettings(undefined)).toEqual(DEFAULT_SETTINGS)
    expect(sanitizeSettings('nope')).toEqual(DEFAULT_SETTINGS)
    expect(sanitizeSettings([1, 2])).toEqual(DEFAULT_SETTINGS)
  })

  it('keeps privacy switches off by default', () => {
    const s = sanitizeSettings({})
    expect(s.privacy.screenAccessEnabled).toBe(false)
    expect(s.privacy.microphoneEnabled).toBe(false)
    expect(s.privacy.saveScreenshots).toBe(false)
  })

  it('merges partial updates over a base without touching other fields', () => {
    const base = sanitizeSettings({ provider: 'anthropic' })
    const next = sanitizeSettings({ privacy: { screenAccessEnabled: true } }, base)
    expect(next.provider).toBe('anthropic')
    expect(next.privacy.screenAccessEnabled).toBe(true)
    expect(next.privacy.saveHistory).toBe(true)
  })

  it('ignores unknown keys and wrong types', () => {
    const s = sanitizeSettings({ evil: true, temperature: 'hot', privacy: { saveHistory: 'yes' }, __proto__: { x: 1 } })
    expect((s as unknown as Record<string, unknown>).evil).toBeUndefined()
    expect(s.temperature).toBe(DEFAULT_SETTINGS.temperature)
    expect(s.privacy.saveHistory).toBe(true)
  })

  it('rejects unknown providers and backends', () => {
    const s = sanitizeSettings({ provider: 'skynet', transcription: { backend: 'magic' } })
    expect(s.provider).toBe('ollama')
    expect(s.transcription.backend).toBe(DEFAULT_SETTINGS.transcription.backend)
  })

  it('clamps numbers into range', () => {
    const s = sanitizeSettings({ temperature: 9, appearance: { opacity: 0 }, transcription: { chunkSeconds: 999 }, privacy: { historyRetentionDays: -5 } })
    expect(s.temperature).toBe(2)
    expect(s.appearance.opacity).toBe(0.4)
    expect(s.transcription.chunkSeconds).toBe(30)
    expect(s.privacy.historyRetentionDays).toBe(0)
  })

  it('validates URLs and strips trailing slashes', () => {
    const s = sanitizeSettings({ ollama: { baseUrl: 'http://localhost:11434///' }, openai: { baseUrl: 'javascript:alert(1)' } })
    expect(s.ollama.baseUrl).toBe('http://localhost:11434')
    expect(s.openai.baseUrl).toBe(DEFAULT_SETTINGS.openai.baseUrl)
  })

  it('falls back to default hotkeys when invalid, but allows clearing', () => {
    const s = sanitizeSettings({ hotkeys: { toggleOverlay: 'K', stopAll: '' } })
    expect(s.hotkeys.toggleOverlay).toBe(DEFAULT_SETTINGS.hotkeys.toggleOverlay)
    expect(s.hotkeys.stopAll).toBe('')
  })

  it('never saves screenshots when history is off', () => {
    const s = sanitizeSettings({ privacy: { saveHistory: false, saveScreenshots: true } })
    expect(s.privacy.saveScreenshots).toBe(false)
  })

  it('does not mutate the defaults', () => {
    sanitizeSettings({ privacy: { screenAccessEnabled: true } })
    expect(DEFAULT_SETTINGS.privacy.screenAccessEnabled).toBe(false)
  })
})

describe('deepMerge', () => {
  it('only merges keys present in the base', () => {
    expect(deepMerge({ a: 1, b: { c: 2 } }, { a: 3, b: { c: 4, d: 5 }, e: 6 })).toEqual({ a: 3, b: { c: 4 } })
  })
})

describe('findHotkeyConflicts', () => {
  it('detects duplicates, case-insensitively', () => {
    const conflicts = findHotkeyConflicts({
      toggleOverlay: 'CommandOrControl+K',
      askAboutScreen: 'cmdorctrl+k',
      toggleRecording: 'Alt+R',
      stopAll: ''
    })
    expect(conflicts).toEqual([['toggleOverlay', 'askAboutScreen']])
  })
})
