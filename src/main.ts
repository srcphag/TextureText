import './ui/terminal.css'
import './ui/styles.css'
import { attachDebugApi } from './engine/debugApi'
import { createLumaExtractor } from './engine/lumaField'
import { createSourceManager } from './engine/sourceManager'
import { createPreview } from './render/preview'
import { createAppUi } from './ui/appUi'

const errors: string[] = []
const errorBanner = document.querySelector<HTMLElement>('[data-testid="error-banner"]')!
const errorMessage = document.querySelector<HTMLElement>('[data-testid="error-message"]')!
const errorDismiss = document.querySelector<HTMLButtonElement>('[data-testid="error-dismiss-btn"]')!

function showError(message: string): void {
  errors.push(message)
  errorMessage.textContent = message
  errorBanner.hidden = false
}

errorDismiss.addEventListener('click', () => {
  errorBanner.hidden = true
})

const videoEl = document.getElementById('stageVideo') as HTMLVideoElement
const imageEl = document.getElementById('stageImage') as HTMLImageElement
const previewCanvas = document.getElementById('previewCanvas') as HTMLCanvasElement
const previewEmpty = document.querySelector<HTMLElement>('[data-testid="source-empty"]')!

const lumaExtractor = createLumaExtractor()
let uiReflow: (() => void) | null = null

const sources = createSourceManager(videoEl, imageEl, {
  onError: showError,
  onChange: () => {
    uiReflow?.()
    preview.update()
  },
})

const preview = createPreview(
  previewCanvas,
  previewEmpty,
  sources,
  () => (sources.getFrameSource() ? lumaExtractor.canvas : null),
)
preview.start()
const ui = createAppUi(sources, lumaExtractor, showError)
uiReflow = ui.runReflow

if (document.fonts?.ready) {
  void document.fonts.ready.then(() => ui.runReflow())
}

let frameCount = 0
function countFrames(): void {
  frameCount++
  requestAnimationFrame(countFrames)
}
requestAnimationFrame(countFrames)

attachDebugApi(sources, previewCanvas, lumaExtractor.buf, errors, () => frameCount)
