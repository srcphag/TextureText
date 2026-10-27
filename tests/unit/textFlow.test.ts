import { describe, expect, it } from 'vitest'
import { createLumaFieldBuffer, ensureLumaFieldSize, updateLumaFieldFromRgba } from '../../src/engine/lumaField'
import { DEFAULT_SOURCE_PARAMS } from '../../src/engine/luma'
import {
  carveRowSlotsFromLuma,
  carveTextLineSlots,
  DEFAULT_SHAPE_PARAMS,
  mergeIntervals,
} from '../../src/engine/slotCarve'
import { DEFAULT_TEXT_PARAMS, layoutTextAroundLuma } from '../../src/engine/textFlow'

describe('slotCarve & lumaField', () => {
  it('merges overlapping and padded intervals', () => {
    const merged = mergeIntervals(
      [
        { left: 100, right: 200 },
        { left: 190, right: 300 },
      ],
      10,
      0,
      1000,
    )
    expect(merged).toEqual([{ left: 90, right: 310 }])
  })

  it('carves text slots around a blocked center obstacle', () => {
    const slots = carveTextLineSlots(
      { left: 0, right: 1000 },
      [{ left: 400, right: 600 }],
      40,
    )
    expect(slots).toEqual([
      { left: 0, right: 400 },
      { left: 600, right: 1000 },
    ])
  })

  it('outside vs inside flowMode carves complementary slots', () => {
    // 10 columns across 1000px: center 4 columns (300..700) are bright (1.0), sides are dark (0.0)
    const row = new Float32Array([0, 0, 0, 1, 1, 1, 1, 0, 0, 0])
    const region = { left: 0, right: 1000 }
    const outsideSlots = carveRowSlotsFromLuma(row, null, null, 1000, region, {
      ...DEFAULT_SHAPE_PARAMS,
      flowMode: 0,
      shapePadding: 0,
      thresholdSoft: 0,
    })
    expect(outsideSlots).toEqual([
      { left: 0, right: 300 },
      { left: 700, right: 1000 },
    ])

    const insideSlots = carveRowSlotsFromLuma(row, null, null, 1000, region, {
      ...DEFAULT_SHAPE_PARAMS,
      flowMode: 1,
      shapePadding: 0,
      thresholdSoft: 0,
    })
    expect(insideSlots).toEqual([{ left: 300, right: 700 }])
  })

  it('updates luma field with temporal smoothing', () => {
    const buf = createLumaFieldBuffer()
    ensureLumaFieldSize(buf, 2, 1)
    const white = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255])
    updateLumaFieldFromRgba(buf, white, DEFAULT_SOURCE_PARAMS, 0.5)
    expect(buf.luma[0]).toBeCloseTo(1, 4)
    expect(buf.luma[1]).toBeCloseTo(0, 4)

    const black = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255])
    updateLumaFieldFromRgba(buf, black, DEFAULT_SOURCE_PARAMS, 0.5)
    expect(buf.luma[0]).toBeCloseTo(0.5, 4)
    expect(buf.luma[1]).toBeCloseTo(0.5, 4)
  })
})

describe('layoutTextAroundLuma (@chenglou/pretext)', () => {
  it('lays out full-width lines when no luma buffer is active', () => {
    const res = layoutTextAroundLuma(
      'TextureText flows words around luminance shapes at sixty frames per second.',
      800,
      300,
      DEFAULT_TEXT_PARAMS,
      DEFAULT_SHAPE_PARAMS,
      null,
    )
    expect(res.lines.length).toBeGreaterThan(0)
    expect(res.lines[0].x).toBe(24)
  })

  it('splits lines on both sides of a bright center obstacle in outside mode', () => {
    const buf = createLumaFieldBuffer()
    ensureLumaFieldSize(buf, 10, 4)
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 10; c++) {
        buf.luma[r * 10 + c] = c >= 4 && c <= 5 ? 1.0 : 0.0
      }
    }
    const res = layoutTextAroundLuma(
      'Words flow on the left side and then continue seamlessly on the right side of the obstacle.',
      1000,
      200,
      DEFAULT_TEXT_PARAMS,
      { ...DEFAULT_SHAPE_PARAMS, flowMode: 0, shapePadding: 0 },
      buf,
    )
    const firstBandY = res.lines[0].y
    const firstBandLines = res.lines.filter((l) => l.y === firstBandY)
    expect(firstBandLines.length).toBe(2)
    expect(firstBandLines[0].x).toBe(24)
    expect(firstBandLines[1].x).toBe(600)
  })
})
