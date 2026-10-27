// Spec §4 steps 5–6: per-row hysteresis thresholding, interval dilation/merge, and slot carving.

import { clamp01 } from './luma'

export interface Interval {
  left: number
  right: number
}

export interface ShapeParams {
  /** 0 = outside (text in dark areas, bright = blocked), 1 = inside (text in bright areas) */
  flowMode: 0 | 1
  threshold: number
  thresholdSoft: number
  shapePadding: number
  temporalSmooth: number
  gridCellPx: number
  minSlotWidth: number
}

export const DEFAULT_SHAPE_PARAMS: ShapeParams = {
  flowMode: 0,
  threshold: 0.5,
  thresholdSoft: 0.05,
  shapePadding: 8,
  temporalSmooth: 0.3,
  gridCellPx: 4,
  minSlotWidth: 40,
}

/** Merge overlapping or touching intervals and clamp to [minX, maxX]. */
export function mergeIntervals(intervals: Interval[], pad = 0, minX = -Infinity, maxX = Infinity): Interval[] {
  if (intervals.length === 0) return []
  const dilated: Interval[] = []
  for (let i = 0; i < intervals.length; i++) {
    const iv = intervals[i]
    const left = Math.max(minX, iv.left - pad)
    const right = Math.min(maxX, iv.right + pad)
    if (right > left) dilated.push({ left, right })
  }
  if (dilated.length === 0) return []
  dilated.sort((a, b) => a.left - b.left)
  const merged: Interval[] = [ { ...dilated[0] } ]
  for (let i = 1; i < dilated.length; i++) {
    const cur = dilated[i]
    const last = merged[merged.length - 1]
    if (cur.left <= last.right) {
      if (cur.right > last.right) last.right = cur.right
    } else {
      merged.push({ ...cur })
    }
  }
  return merged
}

/**
 * Subtract blocked intervals from a base interval and return viable horizontal slots
 * (ported from the pretext editorial engine demo).
 */
export function carveTextLineSlots(
  base: Interval,
  blocked: Interval[],
  minSlotWidth = DEFAULT_SHAPE_PARAMS.minSlotWidth,
): Interval[] {
  let slots: Interval[] = [base]
  for (let bi = 0; bi < blocked.length; bi++) {
    const iv = blocked[bi]
    const next: Interval[] = []
    for (let si = 0; si < slots.length; si++) {
      const s = slots[si]
      if (iv.right <= s.left || iv.left >= s.right) {
        next.push(s)
        continue
      }
      if (iv.left > s.left) next.push({ left: s.left, right: iv.left })
      if (iv.right < s.right) next.push({ left: iv.right, right: s.right })
    }
    slots = next
  }
  return slots.filter((s) => s.right - s.left >= minSlotWidth)
}

/**
 * Compute solid (bright) mask for one row of the luma grid with hysteresis,
 * then extract blocked intervals and carve viable text slots for the row.
 */
export function carveRowSlotsFromLuma(
  lumaRow: Float32Array | number[],
  prevSolidRow: Uint8Array | null,
  nextSolidRow: Uint8Array | null,
  stageWidth: number,
  region: Interval,
  params: ShapeParams,
): Interval[] {
  const cols = lumaRow.length
  if (cols === 0) return [region]
  const cellW = stageWidth / cols
  const halfSoft = params.thresholdSoft * 0.5
  const lo = clamp01(params.threshold - halfSoft)
  const hi = clamp01(params.threshold + halfSoft)

  const blockedRaw: Interval[] = []
  let runStart = -1

  for (let c = 0; c < cols; c++) {
    const v = lumaRow[c]
    const wasBright = prevSolidRow ? prevSolidRow[c] === 1 : false
    const isBright = params.thresholdSoft > 0
      ? (wasBright ? v >= lo : v > hi)
      : v > params.threshold
    if (nextSolidRow) nextSolidRow[c] = isBright ? 1 : 0

    // Outside mode (0): bright cells are blocked. Inside mode (1): dark cells are blocked.
    const isBlocked = params.flowMode === 0 ? isBright : !isBright
    if (isBlocked) {
      if (runStart < 0) runStart = c
    } else if (runStart >= 0) {
      blockedRaw.push({ left: runStart * cellW, right: c * cellW })
      runStart = -1
    }
  }
  if (runStart >= 0) {
    blockedRaw.push({ left: runStart * cellW, right: cols * cellW })
  }

  const blocked = mergeIntervals(blockedRaw, params.shapePadding, 0, stageWidth)
  return carveTextLineSlots(region, blocked, params.minSlotWidth)
}
