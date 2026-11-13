import { describe, expect, it } from 'vitest'
import { formatAccelerator, isValidAccelerator, keyEventToAccelerator, type KeyLike } from '@shared/accelerator'

const key = (code: string, mods: Partial<KeyLike> = {}): KeyLike => ({
  key: '',
  code,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...mods
})

describe('isValidAccelerator', () => {
  it.each(['CommandOrControl+Shift+Space', 'Alt+K', 'Control+Shift+Backspace', 'CmdOrCtrl+.', 'F5', 'Shift+F12', 'Command+Plus'])(
    'accepts %s',
    (a) => expect(isValidAccelerator(a)).toBe(true)
  )

  it.each(['', 'K', 'Space', 'Shift', 'CommandOrControl+Shift', 'Ctrl++', 'Hyper+K', 'Ctrl+Ctrl+K', 'Ctrl+Foo', 'Ctrl+K+J'])(
    'rejects %s',
    (a) => expect(isValidAccelerator(a)).toBe(false)
  )
})

describe('keyEventToAccelerator', () => {
  it('maps Cmd on macOS to CommandOrControl', () => {
    expect(keyEventToAccelerator(key('KeyK', { metaKey: true, shiftKey: true }), true)).toBe('CommandOrControl+Shift+K')
  })
  it('maps Ctrl on other platforms to CommandOrControl', () => {
    expect(keyEventToAccelerator(key('Space', { ctrlKey: true }), false)).toBe('CommandOrControl+Space')
  })
  it('uses physical key codes so Option-modified characters still map', () => {
    expect(keyEventToAccelerator({ ...key('KeyM', { altKey: true }), key: 'µ' }, true)).toBe('Alt+M')
  })
  it('maps arrows, digits and punctuation', () => {
    expect(keyEventToAccelerator(key('ArrowUp', { ctrlKey: true }), true)).toBe('Control+Up')
    expect(keyEventToAccelerator(key('Digit3', { metaKey: true }), true)).toBe('CommandOrControl+3')
    expect(keyEventToAccelerator(key('Period', { metaKey: true }), true)).toBe('CommandOrControl+.')
  })
  it('returns null while only modifiers are held', () => {
    expect(keyEventToAccelerator(key('ShiftLeft', { shiftKey: true }), true)).toBeNull()
  })
})

describe('formatAccelerator', () => {
  it('uses symbols on macOS', () => {
    expect(formatAccelerator('CommandOrControl+Shift+Space', true)).toBe('⌘⇧Space')
    expect(formatAccelerator('CommandOrControl+Shift+Backspace', true)).toBe('⌘⇧⌫')
  })
  it('uses Ctrl elsewhere', () => {
    expect(formatAccelerator('CommandOrControl+Shift+M', false)).toBe('Ctrl+Shift+M')
  })
  it('shows a dash for unset shortcuts', () => {
    expect(formatAccelerator('', true)).toBe('—')
  })
})
