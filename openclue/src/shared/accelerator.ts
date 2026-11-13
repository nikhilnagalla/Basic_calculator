// Helpers for Electron accelerator strings (https://www.electronjs.org/docs/latest/api/accelerator).
// Pure functions so they can be used in the main process, renderer and tests.

const MODIFIERS = new Set([
  'command', 'cmd', 'control', 'ctrl', 'commandorcontrol', 'cmdorctrl',
  'alt', 'option', 'altgr', 'shift', 'super', 'meta'
])

const NAMED_KEYS = new Set([
  'plus', 'space', 'tab', 'capslock', 'numlock', 'scrolllock', 'backspace', 'delete', 'insert',
  'return', 'enter', 'up', 'down', 'left', 'right', 'home', 'end', 'pageup', 'pagedown',
  'escape', 'esc', 'volumeup', 'volumedown', 'volumemute', 'medianexttrack', 'mediaprevioustrack',
  'mediastop', 'mediaplaypause', 'printscreen',
  'num0', 'num1', 'num2', 'num3', 'num4', 'num5', 'num6', 'num7', 'num8', 'num9',
  'numdec', 'numadd', 'numsub', 'nummult', 'numdiv'
])

const PUNCTUATION = new Set([...")!@#$%^&*(:;:+=<,_->.?/~`{]|[\\}\"'"])

function isKeyToken(token: string): boolean {
  const t = token.toLowerCase()
  if (/^[a-z0-9]$/.test(t)) return true
  if (/^f([1-9]|1[0-9]|2[0-4])$/.test(t)) return true
  if (NAMED_KEYS.has(t)) return true
  return token.length === 1 && PUNCTUATION.has(token)
}

/**
 * Validate an accelerator for use as a *global* shortcut.
 * Requires exactly one non-modifier key and at least one modifier (function keys excepted),
 * so OpenClue never steals plain typing from other apps.
 */
export function isValidAccelerator(accel: string): boolean {
  if (typeof accel !== 'string' || accel.length === 0 || accel.length > 64) return false
  // "+" itself is spelled "Plus", so splitting on "+" is safe.
  const parts = accel.split('+')
  if (parts.some((p) => p.length === 0)) return false
  const key = parts[parts.length - 1]
  const mods = parts.slice(0, -1).map((m) => m.toLowerCase())
  if (!isKeyToken(key) || MODIFIERS.has(key.toLowerCase())) return false
  if (mods.some((m) => !MODIFIERS.has(m))) return false
  if (new Set(mods).size !== mods.length) return false
  const isFunctionKey = /^f([1-9]|1[0-9]|2[0-4])$/i.test(key)
  return mods.length > 0 || isFunctionKey
}

export interface KeyLike {
  key: string
  code: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
}

const CODE_MAP: Record<string, string> = {
  Space: 'Space', Enter: 'Enter', NumpadEnter: 'Enter', Tab: 'Tab', Backspace: 'Backspace',
  Delete: 'Delete', Insert: 'Insert', Escape: 'Escape', Home: 'Home', End: 'End',
  PageUp: 'PageUp', PageDown: 'PageDown', ArrowUp: 'Up', ArrowDown: 'Down',
  ArrowLeft: 'Left', ArrowRight: 'Right', Minus: '-', Equal: '=', BracketLeft: '[',
  BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.',
  Slash: '/', Backquote: '`'
}

/** Convert a keydown event into a portable accelerator, or null while only modifiers are held. */
export function keyEventToAccelerator(e: KeyLike, isMac: boolean): string | null {
  let key: string | undefined
  if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3)
  else if (/^Digit[0-9]$/.test(e.code)) key = e.code.slice(5)
  else if (/^Numpad[0-9]$/.test(e.code)) key = `num${e.code.slice(6)}`
  else if (/^F([1-9]|1[0-9]|2[0-4])$/.test(e.code)) key = e.code
  else key = CODE_MAP[e.code]
  if (!key) return null

  const mods: string[] = []
  if (isMac) {
    if (e.metaKey) mods.push('CommandOrControl')
    if (e.ctrlKey) mods.push('Control')
  } else {
    if (e.ctrlKey) mods.push('CommandOrControl')
    if (e.metaKey) mods.push('Super')
  }
  if (e.altKey) mods.push('Alt')
  if (e.shiftKey) mods.push('Shift')
  return [...mods, key].join('+')
}

const MAC_SYMBOLS: Record<string, string> = {
  commandorcontrol: '⌘', cmdorctrl: '⌘', command: '⌘', cmd: '⌘', control: '⌃', ctrl: '⌃',
  alt: '⌥', option: '⌥', shift: '⇧', super: '⌘', meta: '⌘',
  enter: '↩', return: '↩', backspace: '⌫', delete: '⌦', escape: 'Esc', esc: 'Esc',
  space: 'Space', up: '↑', down: '↓', left: '←', right: '→', tab: '⇥'
}

/** Human-readable label, e.g. "⌘⇧Space" on macOS or "Ctrl+Shift+Space" elsewhere. */
export function formatAccelerator(accel: string, isMac: boolean): string {
  if (!accel) return '—'
  const parts = accel.split('+')
  if (isMac) return parts.map((p) => MAC_SYMBOLS[p.toLowerCase()] ?? p).join('')
  return parts
    .map((p) => (/^(commandorcontrol|cmdorctrl|control)$/i.test(p) ? 'Ctrl' : p))
    .join('+')
}
