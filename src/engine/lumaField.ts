// Spec §4 steps 1–4: downscaled luma grid extraction, temporal smoothing,
// and the shared post-processed source canvas (grayscale, grid-quantized).

import { coverFit } from './geometry'
import { clamp01, lumaOf, processLuma, type SourceParams } from './luma'

export interface LumaFieldBuffer {
  cols: number
  rows: number
  luma: Float32Array
  solid: Uint8Array
  hasHistory: boolean
}

export function createLumaFieldBuffer(): LumaFieldBuffer {
  return {
    cols: 0,
    rows: 0,
    luma: new Float32Array(0),
    solid: new Uint8Array(0),
    hasHistory: false,
  }
}

export function ensureLumaFieldSize(buf: LumaFieldBuffer, cols: number, rows: number): void {
  const c = Math.max(1, Math.floor(cols))
  const r = Math.max(1, Math.floor(rows))
  if (buf.cols === c && buf.rows === r) return
  buf.cols = c
  buf.rows = r
  buf.luma = new Float32Array(c * r)
  buf.solid = new Uint8Array(c * r)
  buf.hasHistory = false
}

/**
 * Pure CPU update from an RGBA buffer (cols * rows * 4 bytes) into `buf.luma`,
 * applying Spec §4 step 3 (invert → contrast → offset) and step 4 (temporal smoothing).
 * When `outRgba` is given, the post-processed grayscale luma is written back into it.
 */
export function updateLumaFieldFromRgba(
  buf: LumaFieldBuffer,
  rgba: Uint8ClampedArray | Uint8Array,
  sourceParams: SourceParams,
  temporalSmooth: number,
  outRgba?: Uint8ClampedArray | Uint8Array,
): void {
  const total = buf.cols * buf.rows
  const s = buf.hasHistory ? clamp01(temporalSmooth) : 0
  const invS = 1 - s
  const out = buf.luma
  for (let i = 0; i < total; i++) {
    const idx = i * 4
    const raw = lumaOf(rgba[idx], rgba[idx + 1], rgba[idx + 2])
    const proc = processLuma(raw, sourceParams)
    const v = s > 0 ? out[i] * s + proc * invS : proc
    out[i] = v
    if (outRgba) {
      const g = Math.round(v * 255)
      outRgba[idx] = g
      outRgba[idx + 1] = g
      outRgba[idx + 2] = g
      outRgba[idx + 3] = 255
    }
  }
  buf.hasHistory = true
}

/**
 * Browser extractor using a CPU-backed 2D canvas (`willReadFrequently: true`).
 * After each extract, `canvas` holds the post-processed grayscale luma image
 * at grid resolution (cols × rows) — the same image that shapes the text.
 */
export function createLumaExtractor() {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const buf = createLumaFieldBuffer()

  function extract(
    source: CanvasImageSource,
    srcW: number,
    srcH: number,
    stageW: number,
    stageH: number,
    gridCellPx: number,
    lineHeight: number,
    sourceParams: SourceParams,
    temporalSmooth: number,
  ): LumaFieldBuffer {
    const cols = Math.max(1, Math.floor(stageW / Math.max(2, gridCellPx)))
    const rows = Math.max(1, Math.floor(stageH / Math.max(8, lineHeight)))
    ensureLumaFieldSize(buf, cols, rows)
    if (canvas.width !== cols) canvas.width = cols
    if (canvas.height !== rows) canvas.height = rows

    const crop = coverFit(srcW, srcH, stageW, stageH)
    ctx.drawImage(source, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, cols, rows)
    const img = ctx.getImageData(0, 0, cols, rows)
    updateLumaFieldFromRgba(buf, img.data, sourceParams, temporalSmooth, img.data)
    ctx.putImageData(img, 0, 0)
    return buf
  }

  function resetHistory(): void {
    buf.hasHistory = false
  }

  return { buf, canvas, extract, resetHistory }
}
