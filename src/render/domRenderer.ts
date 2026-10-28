// Write-only DOM line pool renderer (zero DOM reads in the per-frame hot loop).

import { buildFontString, type LineBox, type TextParams } from '../engine/textFlow'

export function createDomRenderer(
  stageEl: HTMLElement,
  textLayerEl: HTMLElement,
  overlayEl: HTMLCanvasElement,
) {
  const overlayCtx = overlayEl.getContext('2d')!
  const container = (stageEl.parentElement ?? stageEl) as HTMLElement
  const pool: HTMLDivElement[] = []

  let containerW = container.clientWidth || 1280
  let containerH = container.clientHeight || 720
  let workingW = 1280
  let workingH = 720
  let lastLines: LineBox[] = []
  let lastParams: TextParams | null = null

  let lastFont = ''
  let lastLineHeight = -1
  let lastColor = ''
  let lastBg = '__unset__'
  let lastBlend = '__unset__'
  let lastRenderedCount = 0
  let lastProcessed: HTMLCanvasElement | null = null

  /** Fit the stage box to the working resolution inside the container (contain). */
  function fitBox(): void {
    if (containerW <= 0 || containerH <= 0 || workingW <= 0 || workingH <= 0) return
    const scale = Math.min(containerW / workingW, containerH / workingH)
    stageEl.style.width = `${Math.max(1, Math.floor(workingW * scale))}px`
    stageEl.style.height = `${Math.max(1, Math.floor(workingH * scale))}px`
    textLayerEl.style.width = `${workingW}px`
    textLayerEl.style.height = `${workingH}px`
    textLayerEl.style.transform = `scale(${scale})`
  }

  function syncPool(count: number): void {
    while (pool.length < count) {
      const el = document.createElement('div')
      el.className = 'ts-flow-line'
      el.setAttribute('data-testid', 'flow-line')
      textLayerEl.appendChild(el)
      pool.push(el)
    }
    for (let i = 0; i < pool.length; i++) {
      pool[i].style.display = i < count ? '' : 'none'
    }
  }

  function paint(): void {
    if (!lastParams) return
    const textParams = lastParams
    const lines = lastLines

    if (textParams.bgColor !== lastBg) {
      lastBg = textParams.bgColor
      stageEl.style.backgroundColor = textParams.bgColor
    }

    const blend = textParams.blendMode
    const showOverlay = blend !== 'none' && lastProcessed !== null
    const blendKey = `${blend}:${showOverlay}`
    if (blendKey !== lastBlend) {
      lastBlend = blendKey
      overlayEl.hidden = !showOverlay
      overlayEl.style.mixBlendMode = showOverlay ? blend : 'normal'
    }
    if (showOverlay && lastProcessed) {
      if (overlayEl.width !== workingW) overlayEl.width = workingW
      if (overlayEl.height !== workingH) overlayEl.height = workingH
      overlayCtx.imageSmoothingEnabled = false
      overlayCtx.drawImage(lastProcessed, 0, 0, workingW, workingH)
    }

    const font = buildFontString(textParams)
    const lh = Math.round(textParams.lineHeight)
    const styleChanged =
      font !== lastFont || lh !== lastLineHeight || textParams.textColor !== lastColor
    lastFont = font
    lastLineHeight = lh
    lastColor = textParams.textColor

    syncPool(lines.length)
    // Restyle on style change, or for lines that were hidden during the previous render
    // (hidden pool elements keep stale styles and must be refreshed when re-shown).
    const restyleFrom = styleChanged ? 0 : lastRenderedCount

    for (let i = 0; i < lines.length; i++) {
      const el = pool[i]
      const line = lines[i]
      if (el.textContent !== line.text) el.textContent = line.text
      el.style.left = `${line.x}px`
      el.style.top = `${line.y}px`
      if (i >= restyleFrom) {
        el.style.font = font
        el.style.lineHeight = `${lh}px`
        el.style.color = textParams.textColor
      }
    }
    lastRenderedCount = lines.length
  }

  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
          containerW = entry.contentRect.width
          containerH = entry.contentRect.height
        }
      }
      fitBox()
      paint()
    })
    ro.observe(container)
  }

  function render(
    lines: LineBox[],
    wWidth: number,
    wHeight: number,
    textParams: TextParams,
    processedCanvas: HTMLCanvasElement | null = null,
  ): void {
    workingW = wWidth
    workingH = wHeight
    lastLines = lines
    lastParams = textParams
    lastProcessed = processedCanvas
    fitBox()
    paint()
  }

  fitBox()
  return { render }
}
