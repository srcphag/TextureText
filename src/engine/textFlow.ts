// Spec §4 step 7: @chenglou/pretext prepared-text cache and per-band variable-width line layout.

import {
  layoutNextLine,
  prepareWithSegments,
  type LayoutCursor,
  type PreparedTextWithSegments,
} from '@chenglou/pretext'
import type { LumaFieldBuffer } from './lumaField'
import { carveRowSlotsFromLuma, type Interval, type ShapeParams } from './slotCarve'

// Provide a deterministic OffscreenCanvas fallback when running in Node (Vitest unit tests).
if (typeof document === 'undefined' && typeof (globalThis as any).OffscreenCanvas === 'undefined') {
  class FallbackOffscreenCanvas {
    getContext() {
      let currentFont = '18px serif'
      return {
        get font() {
          return currentFont
        },
        set font(v: string) {
          currentFont = v
        },
        measureText(text: string) {
          const match = /(\d+(?:\.\d+)?)px/.exec(currentFont)
          const size = match ? parseFloat(match[1]) : 16
          return { width: Array.from(text).length * size * 0.55 }
        },
      }
    }
  }
  ;(globalThis as any).OffscreenCanvas = FallbackOffscreenCanvas
}

export interface FontPreset {
  id: string
  label: string
  stack: string
}

export const FONT_PRESETS: FontPreset[] = [
  {
    id: 'serif',
    label: 'editorial serif',
    stack: '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif',
  },
  {
    id: 'mono',
    label: 'jetbrains mono',
    stack: '"JetBrains Mono", "Courier New", Consolas, monospace',
  },
  {
    id: 'sans',
    label: 'helvetica sans',
    stack: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  },
]

export type BlendMode =
  | 'none'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'exclusion'

export const BLEND_MODES: BlendMode[] = [
  'none',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'hard-light',
  'soft-light',
  'difference',
  'exclusion',
]

export interface TextParams {
  fontFamily: string
  fontSize: number
  lineHeight: number
  textColor: string
  bgColor: string
  blendMode: BlendMode
  repeatText: boolean
}

export const DEFAULT_TEXT_PARAMS: TextParams = {
  fontFamily: FONT_PRESETS[0].stack,
  fontSize: 18,
  lineHeight: 26,
  textColor: '#e8e4dc',
  bgColor: '#050505',
  blendMode: 'none',
  repeatText: true,
}

export interface LineBox {
  x: number
  y: number
  width: number
  text: string
}

export interface FlowLayoutResult {
  lines: LineBox[]
  reflowMs: number
}

let cachedKey = ''
let cachedPrepared: PreparedTextWithSegments | null = null

export function buildFontString(textParams: Pick<TextParams, 'fontSize' | 'fontFamily'>): string {
  return `${Math.round(textParams.fontSize)}px ${textParams.fontFamily}`
}

export function getPreparedText(text: string, fontString: string): PreparedTextWithSegments {
  const normalized = text.replace(/\r\n?/g, '\n')
  const key = `${fontString}:::${normalized}`
  if (key === cachedKey && cachedPrepared) {
    return cachedPrepared
  }
  cachedKey = key
  cachedPrepared = prepareWithSegments(normalized, fontString)
  return cachedPrepared
}

export function layoutTextAroundLuma(
  text: string,
  stageW: number,
  stageH: number,
  textParams: TextParams,
  shapeParams: ShapeParams,
  lumaBuf: LumaFieldBuffer | null,
): FlowLayoutResult {
  const t0 = performance.now()
  if (!text || text.trim().length === 0 || stageW <= 0 || stageH <= 0) {
    return { lines: [], reflowMs: performance.now() - t0 }
  }

  const fontString = buildFontString(textParams)
  const prepared = getPreparedText(text, fontString)
  const lh = Math.max(8, Math.round(textParams.lineHeight))
  const gutterX = 24
  const gutterY = 16
  const baseRegion: Interval = {
    left: gutterX,
    right: Math.max(gutterX, stageW - gutterX),
  }

  if (baseRegion.right - baseRegion.left < shapeParams.minSlotWidth) {
    return { lines: [], reflowMs: performance.now() - t0 }
  }

  const lines: LineBox[] = []
  let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 }
  let textExhausted = false
  let y = gutterY

  const hasLuma = lumaBuf !== null && lumaBuf.cols > 0 && lumaBuf.rows > 0

  while (y + lh <= stageH - gutterY && !textExhausted) {
    let slots: Interval[]
    if (hasLuma && lumaBuf) {
      const bandCenterY = y + lh * 0.5
      const gridRow = Math.min(
        lumaBuf.rows - 1,
        Math.max(0, Math.floor((bandCenterY / stageH) * lumaBuf.rows)),
      )
      const rowOffset = gridRow * lumaBuf.cols
      const lumaRow = lumaBuf.luma.subarray(rowOffset, rowOffset + lumaBuf.cols)
      const solidRow = lumaBuf.solid.subarray(rowOffset, rowOffset + lumaBuf.cols)
      slots = carveRowSlotsFromLuma(lumaRow, solidRow, solidRow, stageW, baseRegion, shapeParams)
    } else {
      slots = [baseRegion]
    }

    for (let si = 0; si < slots.length; si++) {
      const slot = slots[si]
      const slotWidth = slot.right - slot.left
      let line = layoutNextLine(prepared, slotWidth, cursor)
      if (line === null && textParams.repeatText) {
        cursor = { segmentIndex: 0, graphemeIndex: 0 }
        line = layoutNextLine(prepared, slotWidth, cursor)
      }
      if (line === null) {
        textExhausted = true
        break
      }
      if (
        line.end.segmentIndex === cursor.segmentIndex &&
        line.end.graphemeIndex === cursor.graphemeIndex
      ) {
        textExhausted = true
        break
      }
      lines.push({
        x: Math.round(slot.left),
        y: Math.round(y),
        width: line.width,
        text: line.text,
      })
      cursor = line.end
    }

    y += lh
  }

  return { lines, reflowMs: performance.now() - t0 }
}
