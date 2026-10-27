import type { LumaFieldBuffer } from './lumaField'
import type { SourceParams } from './luma'
import { applyPreset, buildPresetFromState, collectSourceSlot, validatePreset } from './presets'
import type { ShapeParams } from './slotCarve'
import {
  resetShapeParam,
  resetSourceParam,
  resetTextParam,
  setShapeParam,
  setSourceParam,
  setTextParam,
  state,
} from './state'
import type { SourceManager } from './sourceManager'
import type { LineBox, TextParams } from './textFlow'

export interface DebugApi {
  getState: () => typeof state
  setParam: <K extends keyof SourceParams>(key: K, value: SourceParams[K]) => void
  resetParam: (key: keyof SourceParams) => void
  setShapeParam: <K extends keyof ShapeParams>(key: K, value: ShapeParams[K]) => void
  resetShapeParam: (key: keyof ShapeParams) => void
  setTextParam: <K extends keyof TextParams>(key: K, value: TextParams[K]) => void
  resetTextParam: (key: keyof TextParams) => void
  getTransport: () => ReturnType<SourceManager['getTransport']>
  readPreviewPixel: (x: number, y: number) => [number, number, number, number] | null
  getLines: () => LineBox[]
  getLumaBuffer: () => LumaFieldBuffer
  exportPreset: () => Promise<string>
  importPreset: (json: unknown) => Promise<boolean>
  getFrameCount: () => number
  getErrors: () => string[]
}

declare global {
  interface Window {
    __tt?: DebugApi
  }
}

/** Test-only hooks (spec §8.2): enabled in dev builds or with ?test=1. */
export function attachDebugApi(
  sources: SourceManager,
  previewCanvas: HTMLCanvasElement,
  lumaBuf: LumaFieldBuffer,
  errors: string[],
  getFrameCount: () => number,
): void {
  const enabled = import.meta.env.DEV || new URLSearchParams(location.search).has('test')
  if (!enabled) return
  const ctx = previewCanvas.getContext('2d', { willReadFrequently: true })!
  window.__tt = {
    getState: () => state,
    setParam: setSourceParam,
    resetParam: resetSourceParam,
    setShapeParam,
    resetShapeParam,
    setTextParam,
    resetTextParam,
    getTransport: () => sources.getTransport(),
    readPreviewPixel: (x, y) => {
      if (previewCanvas.hidden) return null
      const d = ctx.getImageData(x, y, 1, 1).data
      return [d[0], d[1], d[2], d[3]]
    },
    getLines: () => state.lastLines,
    getLumaBuffer: () => lumaBuf,
    exportPreset: async () => {
      const videoEl = document.getElementById('stageVideo') as HTMLVideoElement
      const slot = await collectSourceSlot(sources, videoEl)
      return JSON.stringify(buildPresetFromState('debug', slot))
    },
    importPreset: async (json: unknown) => {
      validatePreset(json)
      await applyPreset(json, sources)
      return true
    },
    getFrameCount,
    getErrors: () => [...errors],
  }
}
