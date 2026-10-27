import { DEFAULT_SOURCE_PARAMS, type SourceParams } from './luma'
import { DEFAULT_SHAPE_PARAMS, type ShapeParams } from './slotCarve'
import { DEFAULT_TEXT_PARAMS, type LineBox, type TextParams } from './textFlow'

export type SourceKind = 'none' | 'image' | 'video' | 'webcam'

export const DEFAULT_WORKING_WIDTH = 1280
export const DEFAULT_WORKING_HEIGHT = 720

export interface ExportSettings {
  duration: number
  fps: number
  profile: number
}

export const DEFAULT_EXPORT_SETTINGS: ExportSettings = {
  duration: 5,
  fps: 30,
  profile: 3, // ProResProfile.HQ
}

export interface AppState {
  sourceKind: SourceKind
  sourceName: string
  workingWidth: number
  workingHeight: number
  sourceParams: SourceParams
  shapeParams: ShapeParams
  textParams: TextParams
  exportSettings: ExportSettings
  text: string
  lastLines: LineBox[]
  lastReflowMs: number
}

export const DEFAULT_TEXT = `TextureText flows a fixed input text around the luminance of a live source. Load an image, a video, or a webcam feed, then shape the words with light. Every horizontal band samples the processed luminance grid, carves out blocked intervals with configurable threshold, softness, and padding, and lays out each surviving slot using pure arithmetic over cached glyph widths. Switch between outside and inside flow modes to wrap around bright subjects or fill their silhouettes directly.`

export const state: AppState = {
  sourceKind: 'none',
  sourceName: '',
  workingWidth: DEFAULT_WORKING_WIDTH,
  workingHeight: DEFAULT_WORKING_HEIGHT,
  sourceParams: { ...DEFAULT_SOURCE_PARAMS },
  shapeParams: { ...DEFAULT_SHAPE_PARAMS },
  textParams: { ...DEFAULT_TEXT_PARAMS },
  exportSettings: { ...DEFAULT_EXPORT_SETTINGS },
  text: DEFAULT_TEXT,
  lastLines: [],
  lastReflowMs: 0,
}

type Listener = () => void
const listeners = new Set<Listener>()

export function subscribe(fn: Listener): void {
  listeners.add(fn)
}

export function emit(): void {
  for (const fn of listeners) fn()
}

export function setSourceParam<K extends keyof SourceParams>(key: K, value: SourceParams[K]): void {
  state.sourceParams[key] = value
  emit()
}

export function resetSourceParam(key: keyof SourceParams): void {
  state.sourceParams[key] = DEFAULT_SOURCE_PARAMS[key] as never
  emit()
}

export function resetAllSourceParams(): void {
  state.sourceParams = { ...DEFAULT_SOURCE_PARAMS }
  emit()
}

export function setShapeParam<K extends keyof ShapeParams>(key: K, value: ShapeParams[K]): void {
  state.shapeParams[key] = value
  emit()
}

export function resetShapeParam(key: keyof ShapeParams): void {
  state.shapeParams[key] = DEFAULT_SHAPE_PARAMS[key] as never
  emit()
}

export function resetAllShapeParams(): void {
  state.shapeParams = { ...DEFAULT_SHAPE_PARAMS }
  emit()
}

export function setTextParam<K extends keyof TextParams>(key: K, value: TextParams[K]): void {
  state.textParams[key] = value
  emit()
}

export function resetTextParam(key: keyof TextParams): void {
  state.textParams[key] = DEFAULT_TEXT_PARAMS[key] as never
  emit()
}

export function resetAllTextParams(): void {
  state.textParams = { ...DEFAULT_TEXT_PARAMS }
  emit()
}

export function resetAllParams(): void {
  state.sourceParams = { ...DEFAULT_SOURCE_PARAMS }
  state.shapeParams = { ...DEFAULT_SHAPE_PARAMS }
  state.textParams = { ...DEFAULT_TEXT_PARAMS }
  state.workingWidth = DEFAULT_WORKING_WIDTH
  state.workingHeight = DEFAULT_WORKING_HEIGHT
  emit()
}

export function setWorkingResolution(width: number, height: number): void {
  state.workingWidth = Math.max(1, Math.min(4096, Math.round(width)))
  state.workingHeight = Math.max(1, Math.min(4096, Math.round(height)))
  emit()
}
