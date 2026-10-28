// Spec D12: Canvas 2D renderer consuming the exact same LineBox[] as the DOM renderer.
// Composition matches the stage: bgColor → text (source-over) → post-processed
// source image with the active blend mode (only when blendMode !== 'none').

import { buildFontString, type LineBox, type TextParams } from '../engine/textFlow'

export function renderLinesToCanvas(
  canvas: HTMLCanvasElement,
  lines: LineBox[],
  width: number,
  height: number,
  textParams: TextParams,
  processedCanvas?: HTMLCanvasElement | null,
): void {
  if (canvas.width !== width) canvas.width = width
  if (canvas.height !== height) canvas.height = height
  const ctx = canvas.getContext('2d')!

  ctx.save()
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = textParams.bgColor
  ctx.fillRect(0, 0, width, height)

  ctx.font = buildFontString(textParams)
  ctx.fillStyle = textParams.textColor
  ctx.textBaseline = 'top'

  const yOffset = Math.max(0, (textParams.lineHeight - textParams.fontSize) * 0.5)
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    ctx.fillText(l.text, l.x, l.y + yOffset)
  }

  if (textParams.blendMode !== 'none' && processedCanvas && processedCanvas.width > 0) {
    ctx.globalCompositeOperation = textParams.blendMode as GlobalCompositeOperation
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(processedCanvas, 0, 0, width, height)
  }
  ctx.restore()
}
