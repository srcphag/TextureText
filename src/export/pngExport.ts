// Spec D10: PNG snapshot export at working resolution.

import type { LineBox, TextParams } from '../engine/textFlow'
import { renderLinesToCanvas } from '../render/canvasRenderer'

export async function exportStagePng(
  lines: LineBox[],
  width: number,
  height: number,
  textParams: TextParams,
  processedCanvas?: HTMLCanvasElement | null,
  filename = 'texturetext-snapshot.png',
): Promise<Blob> {
  const canvas = document.createElement('canvas')
  renderLinesToCanvas(canvas, lines, width, height, textParams, processedCanvas)
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encode failed'))), 'image/png')
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return blob
}
