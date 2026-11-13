// Persistent settings + encrypted API key storage.
import { app, safeStorage } from 'electron'
import { EventEmitter } from 'node:events'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_SETTINGS, sanitizeSettings } from '@shared/settings'
import type { ApiKeyId, PublicSettings, Settings } from '@shared/types'
import { readJson, writeFileAtomic } from './fsutil'

const KEY_IDS: ApiKeyId[] = ['openai', 'anthropic', 'transcription']

class SettingsStore extends EventEmitter {
  private settings: Settings = structuredClone(DEFAULT_SETTINGS)
  /** Decrypted keys, kept in memory only. */
  private keys = new Map<ApiKeyId, string>()
  private settingsPath = ''
  private keysPath = ''
  private writeQueue: Promise<void> = Promise.resolve()

  async load(): Promise<void> {
    const dir = app.getPath('userData')
    this.settingsPath = join(dir, 'settings.json')
    this.keysPath = join(dir, 'keys.bin')
    this.settings = sanitizeSettings(await readJson(this.settingsPath))
    await this.loadKeys()
  }

  get(): Settings {
    return this.settings
  }

  getPublic(): PublicSettings {
    const apiKeys = Object.fromEntries(KEY_IDS.map((id) => [id, this.keys.has(id)])) as Record<ApiKeyId, boolean>
    return { ...structuredClone(this.settings), apiKeys }
  }

  /** Apply an untrusted partial update and persist it. */
  update(patch: unknown): Settings {
    const prev = this.settings
    this.settings = sanitizeSettings(patch, prev)
    this.persist()
    this.emit('change', this.settings, prev)
    return this.settings
  }

  reset(): Settings {
    const prev = this.settings
    // Keep consent switches off and onboarding done; everything else back to defaults.
    this.settings = sanitizeSettings({ onboardingComplete: true })
    this.persist()
    this.emit('change', this.settings, prev)
    return this.settings
  }

  getApiKey(id: ApiKeyId): string | undefined {
    return this.keys.get(id)
  }

  /** True when keys are encrypted at rest (macOS Keychain / Windows DPAPI / libsecret). */
  canPersistKeys(): boolean {
    return safeStorage.isEncryptionAvailable()
  }

  async setApiKey(id: ApiKeyId, value: string | null): Promise<void> {
    if (!KEY_IDS.includes(id)) throw new Error(`Unknown key id: ${id}`)
    const trimmed = value?.trim()
    if (trimmed) this.keys.set(id, trimmed)
    else this.keys.delete(id)
    await this.saveKeys()
    this.emit('change', this.settings, this.settings)
  }

  private persist(): void {
    const data = JSON.stringify(this.settings, null, 2)
    this.writeQueue = this.writeQueue
      .then(() => writeFileAtomic(this.settingsPath, data))
      .catch((err) => console.error('[settings] write failed', err))
  }

  private async loadKeys(): Promise<void> {
    if (!safeStorage.isEncryptionAvailable()) return
    try {
      const buf = await fs.readFile(this.keysPath)
      const parsed = JSON.parse(safeStorage.decryptString(buf)) as Record<string, string>
      for (const id of KEY_IDS) if (typeof parsed[id] === 'string') this.keys.set(id, parsed[id])
    } catch {
      /* no keys yet */
    }
  }

  private async saveKeys(): Promise<void> {
    // Without OS-level encryption we never write keys to disk; they live for this session only.
    if (!safeStorage.isEncryptionAvailable()) return
    if (this.keys.size === 0) {
      await fs.rm(this.keysPath, { force: true })
      return
    }
    const enc = safeStorage.encryptString(JSON.stringify(Object.fromEntries(this.keys)))
    await writeFileAtomic(this.keysPath, enc)
  }
}

export const store = new SettingsStore()
