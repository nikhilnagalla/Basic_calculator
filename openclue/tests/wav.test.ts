import { describe, expect, it } from 'vitest'
import { concatFloat32, encodeWav, resample, rms } from '../src/renderer/src/lib/wav'

describe('encodeWav', () => {
  it('writes a valid 16-bit mono PCM header', () => {
    const buf = encodeWav(new Float32Array([0, 0.5, -0.5, 1, -1]), 16000)
    const v = new DataView(buf)
    const str = (o: number, l: number) => String.fromCharCode(...new Uint8Array(buf, o, l))
    expect(buf.byteLength).toBe(44 + 5 * 2)
    expect(str(0, 4)).toBe('RIFF')
    expect(str(8, 4)).toBe('WAVE')
    expect(str(36, 4)).toBe('data')
    expect(v.getUint16(22, true)).toBe(1)
    expect(v.getUint32(24, true)).toBe(16000)
    expect(v.getUint16(34, true)).toBe(16)
    expect(v.getInt16(44 + 3 * 2, true)).toBe(0x7fff)
    expect(v.getInt16(44 + 4 * 2, true)).toBe(-0x8000)
  })

  it('clips out-of-range samples', () => {
    const v = new DataView(encodeWav(new Float32Array([4, -4])))
    expect(v.getInt16(44, true)).toBe(0x7fff)
    expect(v.getInt16(46, true)).toBe(-0x8000)
  })
})

describe('resample', () => {
  it('is a no-op at the same rate', () => {
    const x = new Float32Array([1, 2, 3])
    expect(resample(x, 16000, 16000)).toBe(x)
  })
  it('downsamples 48k → 16k by a factor of 3', () => {
    const out = resample(new Float32Array(48000).fill(0.25), 48000, 16000)
    expect(out.length).toBe(16000)
    expect(out[100]).toBeCloseTo(0.25)
  })
})

describe('helpers', () => {
  it('concatenates chunks', () => {
    expect(Array.from(concatFloat32([new Float32Array([1]), new Float32Array([2, 3])]))).toEqual([1, 2, 3])
  })
  it('computes RMS', () => {
    expect(rms(new Float32Array([]))).toBe(0)
    expect(rms(new Float32Array([0.5, -0.5]))).toBeCloseTo(0.5)
  })
})
