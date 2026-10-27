import type { LumaFieldBuffer } from '../engine/lumaField'
import type { SourceParams } from '../engine/luma'
import type { ShapeParams } from '../engine/slotCarve'
import {
  DEFAULT_TEXT,
  DEFAULT_WORKING_HEIGHT,
  DEFAULT_WORKING_WIDTH,
  emit,
  resetAllParams,
  resetAllShapeParams,
  resetAllSourceParams,
  resetAllTextParams,
  resetShapeParam,
  resetSourceParam,
  resetTextParam,
  setShapeParam,
  setSourceParam,
  setTextParam,
  setWorkingResolution,
  state,
  subscribe,
} from '../engine/state'
import {
  applyPreset,
  buildPresetFromState,
  collectSourceSlot,
  downloadPresetJson,
  fetchPresetJson,
  listRepoPresets,
  type TextureTextPresetV1,
} from '../engine/presets'
import type { SourceManager } from '../engine/sourceManager'
import {
  FONT_PRESETS,
  layoutTextAroundLuma,
  type BlendMode,
  type TextParams,
} from '../engine/textFlow'
import { exportStagePng } from '../export/pngExport'
import { encodeDeterministicProRes } from '../export/proResExport'
import { createDomRenderer } from '../render/domRenderer'

function el<T extends HTMLElement>(testid: string): T {
  const node = document.querySelector<T>(`[data-testid="${testid}"]`)
  if (!node) throw new Error(`missing element: ${testid}`)
  return node
}

function fmtTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '00:00'
  const totalSec = Math.floor(sec)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function createAppUi(
  sources: SourceManager,
  lumaExtractor: {
    buf: LumaFieldBuffer
    canvas: HTMLCanvasElement
    extract: (
      source: CanvasImageSource,
      srcW: number,
      srcH: number,
      stageW: number,
      stageH: number,
      gridCellPx: number,
      lineHeight: number,
      sourceParams: SourceParams,
      temporalSmooth: number,
    ) => LumaFieldBuffer
    resetHistory: () => void
  },
  onError: (message: string) => void,
) {
  const fileInput = el<HTMLInputElement>('file-input')
  const webcamBtn = el<HTMLButtonElement>('source-webcam')
  const videoBtn = el<HTMLButtonElement>('source-video')
  const imageBtn = el<HTMLButtonElement>('source-image')
  const previewBox = el<HTMLDivElement>('source-preview')
  const clearSourceBtn = el<HTMLButtonElement>('source-clear-btn')

  const playBtn = el<HTMLButtonElement>('transport-play')
  const track = el<HTMLDivElement>('transport-track')
  const fill = el<HTMLDivElement>('transport-fill')
  const statusLabel = el<HTMLElement>('transport-status')
  const timeBox = el<HTMLElement>('transport-time')
  const timeCur = el<HTMLElement>('transport-time-current')
  const timeDur = el<HTMLElement>('transport-time-duration')
  const liveLabel = el<HTMLElement>('transport-label')

  const stageEl = el<HTMLDivElement>('stage')
  const textLayerEl = el<HTMLDivElement>('text-layer')
  const overlayEl = el<HTMLCanvasElement>('stage-processed')
  const stageEmpty = el<HTMLElement>('stage-empty')
  const statsToggle = el<HTMLButtonElement>('stats-toggle')
  const statsOverlay = el<HTMLElement>('stats-overlay')
  const resetAllBtn = el<HTMLButtonElement>('reset-all-btn')
  const snapshotBtn = el<HTMLButtonElement>('snapshot-btn')

  const textArea = el<HTMLTextAreaElement>('input-text')
  const textContainer = el<HTMLDivElement>('text-container')
  const textCountLabel = el<HTMLElement>('text-count-label')
  const textResetBtn = el<HTMLButtonElement>('text-reset-btn')
  const textClearBtn = el<HTMLButtonElement>('text-clear-btn')

  const resLabel = el<HTMLElement>('resolution-label')
  const resWInput = el<HTMLInputElement>('resolution-width-input')
  const resHInput = el<HTMLInputElement>('resolution-height-input')
  const resResetBtn = el<HTMLButtonElement>('reset-resolution-btn')

  const domRenderer = createDomRenderer(stageEl, textLayerEl, overlayEl)

  let pendingPick: 'image' | 'video' = 'image'
  let lastWorkingWidth = state.workingWidth
  let lastWorkingHeight = state.workingHeight

  function runReflow(): void {
    const src = sources.getFrameSource()
    const size = sources.getSourceSize()
    let lumaBuf: LumaFieldBuffer | null = null
    if (src && size) {
      lumaBuf = lumaExtractor.extract(
        src,
        size.width,
        size.height,
        state.workingWidth,
        state.workingHeight,
        state.shapeParams.gridCellPx,
        state.textParams.lineHeight,
        state.sourceParams,
        state.shapeParams.temporalSmooth,
      )
    }
    const res = layoutTextAroundLuma(
      state.text,
      state.workingWidth,
      state.workingHeight,
      state.textParams,
      state.shapeParams,
      lumaBuf,
    )
    state.lastLines = res.lines
    state.lastReflowMs = res.reflowMs
    domRenderer.render(
      res.lines,
      state.workingWidth,
      state.workingHeight,
      state.textParams,
      src ? lumaExtractor.canvas : null,
    )
    stageEmpty.hidden = res.lines.length > 0
  }

  imageBtn.addEventListener('click', () => {
    pendingPick = 'image'
    fileInput.accept = 'image/*'
    fileInput.click()
  })
  videoBtn.addEventListener('click', () => {
    pendingPick = 'video'
    fileInput.accept = 'video/*,.mov,.mp4,.webm'
    fileInput.click()
  })
  webcamBtn.addEventListener('click', () => {
    lumaExtractor.resetHistory()
    void sources.useWebcam()
  })
  previewBox.addEventListener('click', () => {
    pendingPick = state.sourceKind === 'video' ? 'video' : 'image'
    fileInput.accept = pendingPick === 'video' ? 'video/*,.mov,.mp4,.webm' : 'image/*'
    fileInput.click()
  })
  clearSourceBtn.addEventListener('click', () => {
    lumaExtractor.resetHistory()
    sources.clearSource()
  })

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0]
    fileInput.value = ''
    if (!file) return
    lumaExtractor.resetHistory()
    if (pendingPick === 'image') void sources.useImage(file)
    else void sources.useVideo(file)
  })

  playBtn.addEventListener('click', () => sources.togglePlay())
  track.addEventListener('click', (e) => {
    const rect = track.getBoundingClientRect()
    if (rect.width > 0) {
      sources.seekNormalized((e.clientX - rect.left) / rect.width)
    }
  })

  // --- working resolution (TextureMosaic U7 focused-input guard) -----------

  const applyResolution = () => {
    const w = parseInt(resWInput.value, 10)
    const h = parseInt(resHInput.value, 10)
    setWorkingResolution(
      Number.isFinite(w) ? w : state.workingWidth,
      Number.isFinite(h) ? h : state.workingHeight,
    )
  }
  resWInput.addEventListener('change', applyResolution)
  resHInput.addEventListener('change', applyResolution)
  resWInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      applyResolution()
      resWInput.blur()
    }
  })
  resHInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      applyResolution()
      resHInput.blur()
    }
  })
  resResetBtn.addEventListener('click', () => {
    setWorkingResolution(DEFAULT_WORKING_WIDTH, DEFAULT_WORKING_HEIGHT)
  })

  // --- source parameter controls -------------------------------------------

  const invertToggle = el<HTMLButtonElement>('invert-toggle')
  invertToggle.addEventListener('click', () => setSourceParam('invert', !state.sourceParams.invert))
  el<HTMLButtonElement>('invert-reset').addEventListener('click', () => resetSourceParam('invert'))
  el<HTMLButtonElement>('reset-group-source-btn').addEventListener('click', () => resetAllSourceParams())

  function bindSourceNumber(key: 'contrast' | 'offset'): void {
    const slider = el<HTMLInputElement>(`${key}-slider`)
    const number = el<HTMLInputElement>(`${key}-number`)
    slider.addEventListener('input', () => setSourceParam(key, Number(slider.value)))
    const onNum = () => {
      const v = Number(number.value)
      if (!Number.isNaN(v)) {
        const clamped = Math.min(Number(number.max), Math.max(Number(number.min), v))
        setSourceParam(key, clamped)
      }
    }
    number.addEventListener('input', onNum)
    number.addEventListener('change', onNum)
    el<HTMLButtonElement>(`${key}-reset`).addEventListener('click', () => resetSourceParam(key))
  }
  bindSourceNumber('contrast')
  bindSourceNumber('offset')

  // --- shape parameter controls --------------------------------------------

  el<HTMLButtonElement>('flowMode-0').addEventListener('click', () => setShapeParam('flowMode', 0))
  el<HTMLButtonElement>('flowMode-1').addEventListener('click', () => setShapeParam('flowMode', 1))
  el<HTMLButtonElement>('flowMode-reset').addEventListener('click', () => resetShapeParam('flowMode'))
  el<HTMLButtonElement>('reset-group-shape-btn').addEventListener('click', () => resetAllShapeParams())

  function bindShapeNumber(
    key: 'threshold' | 'thresholdSoft' | 'shapePadding' | 'temporalSmooth' | 'gridCellPx',
  ): void {
    const slider = el<HTMLInputElement>(`${key}-slider`)
    const number = el<HTMLInputElement>(`${key}-number`)
    slider.addEventListener('input', () => setShapeParam(key, Number(slider.value)))
    const onNum = () => {
      const v = Number(number.value)
      if (!Number.isNaN(v)) {
        const clamped = Math.min(Number(number.max), Math.max(Number(number.min), v))
        setShapeParam(key, clamped)
      }
    }
    number.addEventListener('input', onNum)
    number.addEventListener('change', onNum)
    el<HTMLButtonElement>(`${key}-reset`).addEventListener('click', () => resetShapeParam(key))
  }
  bindShapeNumber('threshold')
  bindShapeNumber('thresholdSoft')
  bindShapeNumber('shapePadding')
  bindShapeNumber('temporalSmooth')
  bindShapeNumber('gridCellPx')

  // --- text parameter controls ---------------------------------------------

  const fontSelect = el<HTMLSelectElement>('fontFamily-select')
  fontSelect.addEventListener('change', () => {
    const preset = FONT_PRESETS.find((f) => f.id === fontSelect.value) ?? FONT_PRESETS[0]
    setTextParam('fontFamily', preset.stack)
  })

  function bindTextNumber(key: 'fontSize' | 'lineHeight'): void {
    const slider = el<HTMLInputElement>(`${key}-slider`)
    const number = el<HTMLInputElement>(`${key}-number`)
    slider.addEventListener('input', () => setTextParam(key, Number(slider.value)))
    const onNum = () => {
      const v = Number(number.value)
      if (!Number.isNaN(v)) {
        const clamped = Math.min(Number(number.max), Math.max(Number(number.min), v))
        setTextParam(key, clamped)
      }
    }
    number.addEventListener('input', onNum)
    number.addEventListener('change', onNum)
    el<HTMLButtonElement>(`${key}-reset`).addEventListener('click', () => resetTextParam(key))
  }
  bindTextNumber('fontSize')
  bindTextNumber('lineHeight')

  const textColorInput = el<HTMLInputElement>('textColor-input')
  const bgColorInput = el<HTMLInputElement>('bgColor-input')
  textColorInput.addEventListener('input', () => setTextParam('textColor', textColorInput.value))
  bgColorInput.addEventListener('input', () => setTextParam('bgColor', bgColorInput.value))

  const blendSelect = el<HTMLSelectElement>('blendMode-select')
  blendSelect.addEventListener('change', () => {
    setTextParam('blendMode', blendSelect.value as BlendMode)
  })

  const repeatToggle = el<HTMLButtonElement>('repeatText-toggle')
  repeatToggle.addEventListener('click', () => setTextParam('repeatText', !state.textParams.repeatText))
  el<HTMLButtonElement>('repeatText-reset').addEventListener('click', () => resetTextParam('repeatText'))
  el<HTMLButtonElement>('reset-group-text-btn').addEventListener('click', () => resetAllTextParams())

  resetAllBtn.addEventListener('click', () => {
    resetAllParams()
  })

  // --- presets (full-scene JSON save / export / import + repo dropdown) ----

  const presetSelect = el<HTMLSelectElement>('preset-select')
  const presetNameInput = el<HTMLInputElement>('preset-name-input')
  const presetFileInput = el<HTMLInputElement>('preset-file-input')
  const repoPresets = listRepoPresets()
  const sessionPresets = new Map<string, TextureTextPresetV1>()
  let sessionPresetCounter = 1

  async function serializeScene(name: string): Promise<TextureTextPresetV1> {
    const videoEl = document.getElementById('stageVideo') as HTMLVideoElement
    const slot = await collectSourceSlot(sources, videoEl)
    return buildPresetFromState(name, slot)
  }

  const populatePresetSelect = (selectedValue?: string) => {
    presetSelect.innerHTML = ''
    if (repoPresets.length === 0 && sessionPresets.size === 0) {
      const empty = document.createElement('option')
      empty.value = ''
      empty.textContent = 'no presets available'
      presetSelect.appendChild(empty)
      presetSelect.disabled = true
      return
    }
    presetSelect.disabled = false
    const placeholder = document.createElement('option')
    placeholder.value = ''
    placeholder.textContent = '— select preset —'
    presetSelect.appendChild(placeholder)
    for (const entry of repoPresets) {
      const opt = document.createElement('option')
      opt.value = `repo:${entry.id}`
      opt.textContent = entry.name
      presetSelect.appendChild(opt)
    }
    for (const [id, preset] of sessionPresets) {
      const opt = document.createElement('option')
      opt.value = `session:${id}`
      opt.textContent = preset.name
      presetSelect.appendChild(opt)
    }
    presetSelect.value = selectedValue ?? ''
  }
  populatePresetSelect()

  presetSelect.addEventListener('change', async () => {
    const value = presetSelect.value
    if (!value) return
    try {
      if (value.startsWith('repo:')) {
        const entry = repoPresets.find((e) => e.id === value.slice(5))
        if (!entry) return
        const json = await fetchPresetJson(entry.url)
        const preset = await applyPreset(json, sources)
        presetNameInput.value = preset.name
      } else if (value.startsWith('session:')) {
        const preset = sessionPresets.get(value.slice(8))
        if (!preset) return
        await applyPreset(preset, sources)
        presetNameInput.value = preset.name
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to load preset.')
    }
  })

  el<HTMLButtonElement>('preset-save-btn').addEventListener('click', async () => {
    try {
      const name = presetNameInput.value.trim() || `preset_${sessionPresetCounter}`
      const preset = await serializeScene(name)
      const id = `p${sessionPresetCounter++}`
      sessionPresets.set(id, preset)
      populatePresetSelect(`session:${id}`)
      downloadPresetJson(preset)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to save preset.')
    }
  })
  el<HTMLButtonElement>('preset-export-btn').addEventListener('click', async () => {
    try {
      const preset = await serializeScene(presetNameInput.value.trim() || 'preset_01')
      downloadPresetJson(preset)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to export preset.')
    }
  })
  el<HTMLButtonElement>('preset-import-btn').addEventListener('click', () => {
    presetFileInput.click()
  })
  presetFileInput.addEventListener('change', async () => {
    const file = presetFileInput.files?.[0]
    presetFileInput.value = ''
    if (!file) return
    try {
      const json = JSON.parse(await file.text()) as unknown
      const preset = await applyPreset(json, sources)
      presetNameInput.value = preset.name
      const id = `p${sessionPresetCounter++}`
      sessionPresets.set(id, preset)
      populatePresetSelect(`session:${id}`)
    } catch (err) {
      onError(err instanceof Error ? err.message : `"${file.name}" is not valid JSON.`)
    }
  })

  // --- snapshot & ProRes export --------------------------------------------

  function currentProcessed(): HTMLCanvasElement | null {
    return sources.getFrameSource() && lumaExtractor.canvas.width > 0
      ? lumaExtractor.canvas
      : null
  }

  snapshotBtn.addEventListener('click', () => {
    void exportStagePng(
      state.lastLines,
      state.workingWidth,
      state.workingHeight,
      state.textParams,
      currentProcessed(),
    ).catch((err) => onError(err instanceof Error ? err.message : String(err)))
  })

  const proresProfileSelect = el<HTMLSelectElement>('prores-profile-select')
  const exportDurationInput = el<HTMLInputElement>('export-duration-input')
  const exportFpsInput = el<HTMLInputElement>('export-fps-input')
  const proresExportBtn = el<HTMLButtonElement>('prores-export-btn')

  proresProfileSelect.addEventListener('change', () => {
    state.exportSettings.profile = Number(proresProfileSelect.value)
  })
  exportDurationInput.addEventListener('change', () => {
    const v = Number(exportDurationInput.value)
    if (Number.isFinite(v) && v >= 1) state.exportSettings.duration = Math.min(60, v)
  })
  exportFpsInput.addEventListener('change', () => {
    const v = Number(exportFpsInput.value)
    if (Number.isFinite(v) && v >= 1) state.exportSettings.fps = Math.min(60, v)
  })

  proresExportBtn.addEventListener('click', async () => {
    proresExportBtn.disabled = true
    const origText = proresExportBtn.textContent
    try {
      await encodeDeterministicProRes(
        state.workingWidth,
        state.workingHeight,
        {
          duration: state.exportSettings.duration,
          fps: state.exportSettings.fps,
          profile: state.exportSettings.profile,
        },
        state.textParams,
        async (frameIdx) => {
          if (state.sourceKind === 'video') {
            await sources.seekToTime(frameIdx / state.exportSettings.fps)
          }
          runReflow()
          return state.lastLines
        },
        currentProcessed,
        (done, total) => {
          proresExportBtn.textContent = `encoding ${done}/${total}`
        },
      )
    } catch (err) {
      onError(`ProRes export failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      proresExportBtn.disabled = false
      proresExportBtn.textContent = origText
    }
  })

  // --- UI state sync -------------------------------------------------------

  function syncTextUi(): void {
    textCountLabel.textContent = `${state.text.length} ${state.text.length === 1 ? 'char' : 'chars'}`
    textContainer.classList.toggle('is-loaded', state.text.length > 0)
  }

  function syncControls(): void {
    const sp: SourceParams = state.sourceParams
    const shp: ShapeParams = state.shapeParams
    const tp: TextParams = state.textParams

    invertToggle.classList.toggle('is-primary', sp.invert)
    invertToggle.setAttribute('aria-pressed', String(sp.invert))

    for (const key of ['contrast', 'offset'] as const) {
      const slider = el<HTMLInputElement>(`${key}-slider`)
      const number = el<HTMLInputElement>(`${key}-number`)
      if (document.activeElement !== slider) slider.value = String(sp[key])
      if (document.activeElement !== number) number.value = String(sp[key])
    }

    el<HTMLButtonElement>('flowMode-0').classList.toggle('is-primary', shp.flowMode === 0)
    el<HTMLButtonElement>('flowMode-1').classList.toggle('is-primary', shp.flowMode === 1)

    for (const key of ['threshold', 'thresholdSoft', 'shapePadding', 'temporalSmooth', 'gridCellPx'] as const) {
      const slider = el<HTMLInputElement>(`${key}-slider`)
      const number = el<HTMLInputElement>(`${key}-number`)
      if (document.activeElement !== slider) slider.value = String(shp[key])
      if (document.activeElement !== number) number.value = String(shp[key])
    }

    for (const key of ['fontSize', 'lineHeight'] as const) {
      const slider = el<HTMLInputElement>(`${key}-slider`)
      const number = el<HTMLInputElement>(`${key}-number`)
      if (document.activeElement !== slider) slider.value = String(tp[key])
      if (document.activeElement !== number) number.value = String(tp[key])
    }

    const activePreset = FONT_PRESETS.find((f) => f.stack === tp.fontFamily) ?? FONT_PRESETS[0]
    if (document.activeElement !== fontSelect) fontSelect.value = activePreset.id
    if (document.activeElement !== textColorInput) textColorInput.value = tp.textColor
    if (document.activeElement !== bgColorInput) bgColorInput.value = tp.bgColor
    if (document.activeElement !== blendSelect) blendSelect.value = tp.blendMode

    repeatToggle.classList.toggle('is-primary', tp.repeatText)
    repeatToggle.setAttribute('aria-pressed', String(tp.repeatText))

    if (document.activeElement !== textArea && textArea.value !== state.text) {
      textArea.value = state.text
    }
    if (document.activeElement !== exportDurationInput) {
      exportDurationInput.value = String(state.exportSettings.duration)
    }
    if (document.activeElement !== exportFpsInput) {
      exportFpsInput.value = String(state.exportSettings.fps)
    }
    if (document.activeElement !== proresProfileSelect) {
      proresProfileSelect.value = String(state.exportSettings.profile)
    }

    webcamBtn.classList.toggle('is-primary', state.sourceKind === 'webcam')
    videoBtn.classList.toggle('is-primary', state.sourceKind === 'video')
    imageBtn.classList.toggle('is-primary', state.sourceKind === 'image')

    resLabel.textContent = `${state.workingWidth} X ${state.workingHeight} PX`
    const resChanged =
      state.workingWidth !== lastWorkingWidth || state.workingHeight !== lastWorkingHeight
    lastWorkingWidth = state.workingWidth
    lastWorkingHeight = state.workingHeight
    if (resChanged || document.activeElement !== resWInput) {
      resWInput.value = String(state.workingWidth)
    }
    if (resChanged || document.activeElement !== resHInput) {
      resHInput.value = String(state.workingHeight)
    }

    syncTextUi()
    runReflow()
  }
  subscribe(syncControls)

  textArea.value = state.text
  textArea.addEventListener('input', () => {
    state.text = textArea.value
    syncTextUi()
    runReflow()
  })
  textResetBtn.addEventListener('click', () => {
    state.text = DEFAULT_TEXT
    textArea.value = state.text
    emit()
  })
  textClearBtn.addEventListener('click', () => {
    state.text = ''
    textArea.value = ''
    emit()
  })

  syncControls()

  // --- transport + stats ----------------------------------------------------

  statsToggle.addEventListener('click', () => {
    statsOverlay.hidden = !statsOverlay.hidden
    statsToggle.classList.toggle('is-primary', !statsOverlay.hidden)
  })

  let frames = 0
  let fps = 0
  let fpsWindowStart = performance.now()
  let lastTick = performance.now()
  let frameTimeMs = '0.0'

  function tick(now: number): void {
    frames++
    frameTimeMs = (now - lastTick).toFixed(1)
    lastTick = now
    if (now - fpsWindowStart >= 1000) {
      fps = frames
      frames = 0
      fpsWindowStart = now
    }
    const t = sources.getTransport()
    if ((t.kind === 'video' || t.kind === 'webcam') && t.playing) {
      runReflow()
    }

    track.classList.remove('is-static', 'is-live')
    fill.style.width = '0%'

    if (t.kind === 'video') {
      statusLabel.textContent = 'Video Input'
      playBtn.disabled = false
      playBtn.textContent = t.playing ? '❚❚' : '▶'
      timeBox.hidden = false
      liveLabel.hidden = true
      timeCur.textContent = fmtTime(t.time)
      timeDur.textContent = fmtTime(t.duration)
      const pct = t.duration > 0 ? Math.min(100, (t.time / t.duration) * 100) : 0
      fill.style.width = `${pct.toFixed(1)}%`
    } else if (t.kind === 'webcam') {
      track.classList.add('is-live')
      statusLabel.textContent = 'Webcam'
      playBtn.disabled = true
      playBtn.textContent = '▶'
      timeBox.hidden = true
      liveLabel.hidden = false
      liveLabel.textContent = 'Live'
    } else {
      track.classList.add('is-static')
      statusLabel.textContent = t.kind === 'image' ? 'Image' : 'None'
      playBtn.disabled = true
      playBtn.textContent = '▶'
      timeBox.hidden = true
      liveLabel.hidden = true
    }

    if (!statsOverlay.hidden) {
      statsOverlay.innerHTML = `
        <div><strong>FPS:</strong> ${fps}</div>
        <div><strong>FRAME:</strong> ${frameTimeMs} ms</div>
        <div><strong>LINES:</strong> ${state.lastLines.length}</div>
        <div><strong>REFLOW:</strong> ${state.lastReflowMs.toFixed(2)} ms</div>
        <div><strong>SOURCE:</strong> ${t.kind}</div>
        <div><strong>RES:</strong> ${state.workingWidth}×${state.workingHeight}</div>
      `
    }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)

  return { onError, runReflow }
}
