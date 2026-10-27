import { describe, expect, it } from 'vitest'
import { LUMA_B, LUMA_G, LUMA_R, clamp01, lumaOf, processLuma } from '../../src/engine/luma'

describe('lumaOf (spec §4 step 2, Rec.709 weights)', () => {
  it('weights pure red', () => {
    expect(lumaOf(255, 0, 0)).toBeCloseTo(LUMA_R, 5)
  })
  it('weights pure green', () => {
    expect(lumaOf(0, 255, 0)).toBeCloseTo(LUMA_G, 5)
  })
  it('weights pure blue', () => {
    expect(lumaOf(0, 0, 255)).toBeCloseTo(LUMA_B, 5)
  })
  it('white is 1, black is 0', () => {
    expect(lumaOf(255, 255, 255)).toBeCloseTo(1, 5)
    expect(lumaOf(0, 0, 0)).toBe(0)
  })
})

describe('processLuma (spec §4 step 3: invert → contrast → offset)', () => {
  const base = { invert: false, contrast: 1, offset: 0 }

  it('identity with defaults', () => {
    expect(processLuma(0.37, base)).toBeCloseTo(0.37, 10)
  })
  it('inverts', () => {
    expect(processLuma(0.25, { ...base, invert: true })).toBeCloseTo(0.75, 10)
  })
  it('contrast 0 flattens to 0.5', () => {
    expect(processLuma(0.1, { ...base, contrast: 0 })).toBeCloseTo(0.5, 10)
    expect(processLuma(0.9, { ...base, contrast: 0 })).toBeCloseTo(0.5, 10)
  })
  it('contrast > 1 clamps', () => {
    expect(processLuma(0.9, { ...base, contrast: 4 })).toBe(1)
    expect(processLuma(0.1, { ...base, contrast: 4 })).toBe(0)
  })
  it('offset adds and clamps', () => {
    expect(processLuma(0.5, { ...base, offset: 0.3 })).toBeCloseTo(0.8, 10)
    expect(processLuma(0.5, { ...base, offset: 0.7 })).toBe(1)
    expect(processLuma(0.5, { ...base, offset: -0.7 })).toBe(0)
  })
  it('applies in order: invert before contrast before offset', () => {
    // invert(0.8) = 0.2 → contrast 2: (0.2-0.5)*2+0.5 = -0.1 → clamp 0 → offset 0.1 → 0.1
    expect(processLuma(0.8, { invert: true, contrast: 2, offset: 0.1 })).toBeCloseTo(0.1, 10)
  })
})

describe('clamp01', () => {
  it('clamps below and above', () => {
    expect(clamp01(-0.2)).toBe(0)
    expect(clamp01(1.2)).toBe(1)
    expect(clamp01(0.5)).toBe(0.5)
  })
})
