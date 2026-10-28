import { coverFit } from '../engine/geometry'
import { state } from '../engine/state'
import type { SourceManager } from '../engine/sourceManager'

/**
 * Source preview thumbnail (TextureMosaic U10 pattern): shows the shared
 * post-processed luma image (invert/contrast/offset, grid-quantized) —
 * the exact same canvas that shapes the text — cover-cropped into the square.
 */
export function createPreview(
  canvas: HTMLCanvasElement,
  emptyEl: HTMLElement,
  sources: SourceManager,
  getProcessedCanvas: () => HTMLCanvasElement | null,
) {
  const ctx = canvas.getContext('2d')!
  const w = canvas.width
  const h = canvas.height
  const box = canvas.closest<HTMLElement>('.ts-source-preview')
  const badge = box?.querySelector<HTMLElement>('[data-testid="source-badge"]') ?? null
  let running = false

  function update(): void {
    const processed = getProcessedCanvas()
    const size = sources.getSourceSize()
    if (!processed || !size || processed.width === 0) {
      canvas.hidden = true
      emptyEl.hidden = false
      box?.classList.remove('is-loaded')
      if (badge) {
        badge.hidden = true
        badge.textContent = ''
      }
      ctx.clearRect(0, 0, w, h)
      return
    }
    canvas.hidden = false
    emptyEl.hidden = true
    box?.classList.add('is-loaded')
    if (badge) {
      badge.hidden = false
      badge.textContent = state.sourceName || state.sourceKind
    }
    const crop = coverFit(processed.width, processed.height, w, h)
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(processed, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, w, h)
  }

  function tick(): void {
    if (!running) return
    const t = sources.getTransport()
    if ((t.kind === 'video' || t.kind === 'webcam') && t.playing) update()
    requestAnimationFrame(tick)
  }

  // The stage reflow owns preview refreshes (`refreshPreview`), so the preview
  // always draws the luma field of the current frame instead of lagging one
  // emit behind. The rAF tick keeps live sources moving.
  return { update, start: () => { if (!running) { running = true; tick() } } }}
