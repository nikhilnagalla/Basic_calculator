// macOS privacy permission helpers (TCC). On other platforms the OS does not gate these the same way.
import { shell, systemPreferences } from 'electron'
import type { MediaStatus, PermissionState } from '@shared/types'

const isMac = process.platform === 'darwin'

function status(kind: 'microphone' | 'screen'): MediaStatus {
  if (!isMac && process.platform !== 'win32') return 'unknown'
  try {
    return systemPreferences.getMediaAccessStatus(kind) as MediaStatus
  } catch {
    return 'unknown'
  }
}

export function getPermissionState(): PermissionState {
  return { platform: process.platform, microphone: status('microphone'), screen: status('screen') }
}

/** Shows the system microphone prompt the first time (macOS). Resolves to whether access is granted. */
export async function requestMicrophoneAccess(): Promise<boolean> {
  if (!isMac) return true
  const current = status('microphone')
  if (current === 'granted') return true
  if (current === 'denied' || current === 'restricted') return false
  return systemPreferences.askForMediaAccess('microphone')
}

const PANES: Record<string, string> = {
  microphone: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
  screen: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'
}

export async function openSystemSettings(kind: 'microphone' | 'screen'): Promise<void> {
  if (isMac) await shell.openExternal(PANES[kind])
  else if (process.platform === 'win32') await shell.openExternal(kind === 'microphone' ? 'ms-settings:privacy-microphone' : 'ms-settings:privacy')
}
