import { describe, expect, it } from 'vitest'
import { coverFit } from '../../src/engine/geometry'

describe('coverFit', () => {
  it('crops left/right when the source is wider', () => {
    const r = coverFit(400, 100, 100, 100)
    expect(r.sy).toBe(0)
    expect(r.sh).toBe(100)
    expect(r.sw).toBeCloseTo(100, 5)
    expect(r.sx).toBeCloseTo(150, 5)
  })
  it('crops top/bottom when the source is taller', () => {
    const r = coverFit(100, 400, 100, 100)
    expect(r.sx).toBe(0)
    expect(r.sw).toBe(100)
    expect(r.sh).toBeCloseTo(100, 5)
    expect(r.sy).toBeCloseTo(150, 5)
  })
  it('keeps the full frame on equal aspect', () => {
    expect(coverFit(320, 240, 118, 118)).toEqual({ sx: 40, sy: 0, sw: 240, sh: 240 })
  })
  it('16:9 source into 16:9 stage is a no-op crop', () => {
    expect(coverFit(1920, 1080, 1280, 720)).toEqual({ sx: 0, sy: 0, sw: 1920, sh: 1080 })
  })
})
