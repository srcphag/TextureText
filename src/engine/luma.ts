// Spec §4 step 3: luma extraction and processing (invert → contrast → offset).

export const LUMA_R = 0.2126
export const LUMA_G = 0.7152
export const LUMA_B = 0.0722

export interface SourceParams {
  invert: boolean
  contrast: number
  offset: number
}

export const DEFAULT_SOURCE_PARAMS: SourceParams = { invert: false, contrast: 1, offset: 0 }

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

/** Rec.709 luma of an RGB pixel (0..255) normalized to 0..1. */
export function lumaOf(r: number, g: number, b: number): number {
  return (LUMA_R * r + LUMA_G * g + LUMA_B * b) / 255
}

/** Spec §4 step 3 processing order: invert → contrast around 0.5 → additive offset, clamped. */
export function processLuma(luma: number, p: SourceParams): number {
  let l = p.invert ? 1 - luma : luma
  l = clamp01((l - 0.5) * p.contrast + 0.5)
  return clamp01(l + p.offset)
}
