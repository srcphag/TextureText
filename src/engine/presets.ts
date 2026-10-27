// Full-scene JSON presets (TextureMosaic U11 pattern, ported to TextureText).

import type { SourceParams } from './luma'
import type { ShapeParams } from './slotCarve'
import { emit, state, type ExportSettings, type SourceKind } from './state'
import type { SourceManager } from './sourceManager'
import { BLEND_MODES, type BlendMode, type TextParams } from './textFlow'

export const PRESET_VERSION = 1

/* ---------------------------------------------------------------------------
 * Repository preset discovery (Vite import.meta.glob)
 *
 * Every `.json` file inside the repository `presets/` folder is automatically
 * indexed at dev/build time (no manual manifest). The JSON payload itself is
 * fetched lazily via its `?url` only when the preset is selected, so large
 * Base64-embedded media does not slow down the initial page load.
 * ------------------------------------------------------------------------- */

const repoPresetUrls = import.meta.glob('../../presets/*.json', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>

export interface RepoPresetEntry {
  /** Stable id derived from the file path (e.g. `defaultScene`). */
  id: string
  /** Display name (file name without extension). */
  name: string
  /** Servable URL of the raw JSON asset. */
  url: string
}

export function listRepoPresets(): RepoPresetEntry[] {
  return Object.entries(repoPresetUrls)
    .map(([path, url]) => {
      const file = path.split('/').pop() ?? path
      const id = file.replace(/\.json$/i, '')
      return { id, name: id, url }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function fetchPresetJson(url: string): Promise<unknown> {
  const resp = await fetch(url)
  if (!resp.ok) {
    throw new Error(`Failed to fetch preset file (${resp.status}).`)
  }
  return resp.json()
}

/* ---------------------------------------------------------------------------
 * Types & validation
 * ------------------------------------------------------------------------- */

export interface SerializedSourceSlot {
  mode: SourceKind
  name: string
  dataUrl: string | null
  time: number
  playing: boolean
}

export interface TextureTextPresetV1 {
  app: 'TextureText'
  version: number
  name: string
  workingWidth: number
  workingHeight: number
  text: string
  sourceParams: SourceParams
  shapeParams: ShapeParams
  textParams: TextParams
  exportSettings: ExportSettings
  source: SerializedSourceSlot
}

const VALID_MODES: SourceKind[] = ['none', 'image', 'video', 'webcam']

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function isBoolean(v: unknown): v is boolean {
  return typeof v === 'boolean'
}

function isString(v: unknown): v is string {
  return typeof v === 'string'
}

function requireNumbers(obj: unknown, keys: string[], label: string): void {
  if (typeof obj !== 'object' || obj === null) {
    throw new Error(`Preset is missing its ${label}.`)
  }
  const o = obj as Record<string, unknown>
  for (const key of keys) {
    if (!isFiniteNumber(o[key])) {
      throw new Error(`Preset ${label} has an invalid "${key}".`)
    }
  }
}

/**
 * Validate a parsed JSON value as a `TextureTextPresetV1`.
 * Throws `Error` with a human-readable message when invalid.
 */
export function validatePreset(json: unknown): TextureTextPresetV1 {
  if (typeof json !== 'object' || json === null) {
    throw new Error('Preset file is not a valid JSON object.')
  }
  const p = json as Record<string, unknown>
  if (p.app !== 'TextureText') {
    throw new Error('This JSON file is not a TextureText preset.')
  }
  if (p.version !== PRESET_VERSION) {
    throw new Error(`Unsupported preset version "${String(p.version)}" (expected ${PRESET_VERSION}).`)
  }
  if (
    !isFiniteNumber(p.workingWidth) ||
    !isFiniteNumber(p.workingHeight) ||
    p.workingWidth < 1 ||
    p.workingHeight < 1 ||
    p.workingWidth > 4096 ||
    p.workingHeight > 4096
  ) {
    throw new Error('Preset has an invalid canvas size.')
  }
  if (!isString(p.text)) {
    throw new Error('Preset is missing its input text.')
  }

  requireNumbers(p.sourceParams, ['contrast', 'offset'], 'control parameters')
  if (!isBoolean((p.sourceParams as Record<string, unknown>).invert)) {
    throw new Error('Preset control parameters have an invalid "invert".')
  }

  requireNumbers(
    p.shapeParams,
    ['flowMode', 'threshold', 'thresholdSoft', 'shapePadding', 'temporalSmooth', 'gridCellPx', 'minSlotWidth'],
    'shape parameters',
  )
  const flowMode = (p.shapeParams as Record<string, unknown>).flowMode
  if (flowMode !== 0 && flowMode !== 1) {
    throw new Error('Preset shape parameters have an invalid "flowMode".')
  }

  requireNumbers(p.textParams, ['fontSize', 'lineHeight'], 'text parameters')
  const tp = p.textParams as Record<string, unknown>
  if (!isString(tp.fontFamily) || !isString(tp.textColor) || !isString(tp.bgColor)) {
    throw new Error('Preset text parameters have an invalid font or color.')
  }
  if (!isString(tp.blendMode) || !BLEND_MODES.includes(tp.blendMode as BlendMode)) {
    throw new Error('Preset text parameters have an invalid "blendMode".')
  }
  if (!isBoolean(tp.repeatText)) {
    throw new Error('Preset text parameters have an invalid "repeatText".')
  }

  requireNumbers(p.exportSettings, ['duration', 'fps', 'profile'], 'export settings')

  if (typeof p.source !== 'object' || p.source === null) {
    throw new Error('Preset is missing its source slot.')
  }
  const s = p.source as Record<string, unknown>
  if (!isString(s.mode) || !VALID_MODES.includes(s.mode as SourceKind)) {
    throw new Error('Preset source slot has an invalid mode.')
  }
  if ((s.mode === 'image' || s.mode === 'video') && !isString(s.dataUrl)) {
    throw new Error(`Preset source slot (${s.mode}) is missing its embedded media data.`)
  }
  if (!isString(p.name)) {
    throw new Error('Preset is missing its name.')
  }
  return p as unknown as TextureTextPresetV1
}

/* ---------------------------------------------------------------------------
 * Media (de)serialization helpers
 * ------------------------------------------------------------------------- */

/** Draw an image/canvas/video element to an offscreen canvas and encode as PNG data URL. */
export function elementToPngDataUrl(
  el: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement,
  width: number,
  height: number,
): string {
  const w = Math.max(1, Math.round(width))
  const h = Math.max(1, Math.round(height))
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('2D canvas context unavailable for preset export.')
  ctx.drawImage(el, 0, 0, w, h)
  return c.toDataURL('image/png')
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Failed to read media blob.'))
    reader.readAsDataURL(blob)
  })
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(',')
  if (comma < 0) throw new Error('Malformed data URL in preset.')
  const header = dataUrl.slice(0, comma)
  const body = dataUrl.slice(comma + 1)
  const mimeMatch = /^data:([^;,]+)/.exec(header)
  const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream'
  const bin = atob(body)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i)
  }
  return new Blob([bytes], { type: mime })
}

/* ---------------------------------------------------------------------------
 * Serialize / apply
 * ------------------------------------------------------------------------- */

/** Pure: snapshot the current scene state into a preset object (media slot provided by caller). */
export function buildPresetFromState(name: string, source: SerializedSourceSlot): TextureTextPresetV1 {
  return {
    app: 'TextureText',
    version: PRESET_VERSION,
    name,
    workingWidth: state.workingWidth,
    workingHeight: state.workingHeight,
    text: state.text,
    sourceParams: { ...state.sourceParams },
    shapeParams: { ...state.shapeParams },
    textParams: { ...state.textParams },
    exportSettings: { ...state.exportSettings },
    source,
  }
}

/** Browser-only: gather the current source slot, embedding media as data URLs. */
export async function collectSourceSlot(
  sources: SourceManager,
  videoEl: HTMLVideoElement,
): Promise<SerializedSourceSlot> {
  const t = sources.getTransport()
  const file = sources.getCurrentFile()
  if (state.sourceKind === 'image' && file) {
    return { mode: 'image', name: file.name, dataUrl: await blobToDataUrl(file), time: 0, playing: false }
  }
  if (state.sourceKind === 'video' && file) {
    return {
      mode: 'video',
      name: file.name,
      dataUrl: await blobToDataUrl(file),
      time: t.time,
      playing: t.playing,
    }
  }
  if (state.sourceKind === 'webcam') {
    // PNG frame fallback (TextureMosaic U11): webcam streams can't be embedded.
    const size = sources.getSourceSize()
    const frame = size ? elementToPngDataUrl(videoEl, size.width, size.height) : null
    return { mode: 'image', name: 'webcam-frame.png', dataUrl: frame, time: 0, playing: false }
  }
  return { mode: 'none', name: '', dataUrl: null, time: 0, playing: false }
}

/** Validate and apply a preset: restores all params, text, canvas size, and source media. */
export async function applyPreset(json: unknown, sources: SourceManager): Promise<TextureTextPresetV1> {
  const preset = validatePreset(json)

  state.workingWidth = Math.max(1, Math.min(4096, Math.round(preset.workingWidth)))
  state.workingHeight = Math.max(1, Math.min(4096, Math.round(preset.workingHeight)))
  state.sourceParams = { ...preset.sourceParams }
  state.shapeParams = { ...preset.shapeParams }
  state.textParams = { ...preset.textParams }
  state.exportSettings = { ...preset.exportSettings }
  state.text = preset.text

  const slot = preset.source
  if ((slot.mode === 'image' || slot.mode === 'video') && slot.dataUrl) {
    const blob = dataUrlToBlob(slot.dataUrl)
    const file = new File([blob], slot.name || `preset-media.${slot.mode === 'image' ? 'png' : 'mp4'}`, {
      type: blob.type,
    })
    if (slot.mode === 'image') {
      await sources.useImage(file)
    } else {
      await sources.useVideo(file)
      if (slot.time > 0) await sources.seekToTime(slot.time)
      if (!slot.playing) sources.togglePlay()
    }
  } else {
    sources.clearSource()
  }

  emit()
  return preset
}

/** Trigger a browser download of the preset as a .json file. */
export function downloadPresetJson(preset: TextureTextPresetV1): void {
  const blob = new Blob([JSON.stringify(preset, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${preset.name.replace(/[^\w-]+/g, '_') || 'preset'}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
