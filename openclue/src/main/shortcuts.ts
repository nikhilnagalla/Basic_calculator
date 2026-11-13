// Global keyboard shortcuts, re-registered whenever the hotkey settings change.
import { globalShortcut } from 'electron'
import type { HotkeySettings } from '@shared/types'

export type HotkeyHandlers = Record<keyof HotkeySettings, () => void>

/** Registers all hotkeys. Returns the names of hotkeys that could not be registered. */
export function registerHotkeys(hotkeys: HotkeySettings, handlers: HotkeyHandlers): string[] {
  globalShortcut.unregisterAll()
  const failed: string[] = []
  for (const name of Object.keys(handlers) as (keyof HotkeySettings)[]) {
    const accel = hotkeys[name]
    if (!accel) continue
    try {
      if (!globalShortcut.register(accel, handlers[name])) failed.push(name)
    } catch {
      failed.push(name)
    }
  }
  return failed
}

export function unregisterHotkeys(): void {
  globalShortcut.unregisterAll()
}
