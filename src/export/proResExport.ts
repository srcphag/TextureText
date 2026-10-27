// Spec D11: ProRes .mov export via prores-wasm-encoder.

import { createProResEncoder, downloadMov, ProResProfile } from 'prores-wasm-encoder'
import type { LineBox, TextParams } from '../engine/textFlow'
import { renderLinesToCanvas } from '../render/canvasRenderer'

export type ProResProfileValue = (typeof ProResProfile)[keyof typeof ProResProfile]

export interface ExportParams {
  duration: number
  fps: number
  profile: ProResProfileValue | number
}

export const DEFAULT_EXPORT_PARAMS: ExportParams = {
  duration: 5,
  fps: 30,
  profile: ProResProfile.HQ,
}

export async function encodeDeterministicProRes(
  width: number,
  height: number,
  exportParams: ExportParams,
  textParams: TextParams,
  stepFrame: (frameIndex: number, totalFrames: number) => Promise<LineBox[]> | LineBox[],
  getProcessed?: () => HTMLCanvasElement | null,
  onProgress?: (frameIndex: number, totalFrames: number) => void,
  triggerDownload = true,
): Promise<Uint8Array> {
  const encoder = await createProResEncoder()
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const totalFrames = Math.max(1, Math.round(exportParams.duration * exportParams.fps))

  try {
    encoder.initialize({
      width,
      height,
      frameRate: exportParams.fps,
      profile: exportParams.profile as ProResProfileValue,
    })

    for (let f = 0; f < totalFrames; f++) {
      const lines = await stepFrame(f, totalFrames)
      renderLinesToCanvas(canvas, lines, width, height, textParams, getProcessed?.() ?? null)
      encoder.addFrameFromCanvas(canvas)
      onProgress?.(f + 1, totalFrames)
      if (f % 4 === 3) {
        await new Promise((r) => setTimeout(r, 0))
      }
    }

    const mov = encoder.finalize()
    if (triggerDownload) {
      downloadMov(mov, 'texturetext-output.mov')
    }
    return mov
  } finally {
    encoder.destroy()
  }
}
