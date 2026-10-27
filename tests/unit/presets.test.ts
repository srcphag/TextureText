import { describe, expect, it } from 'vitest'
import {
  buildPresetFromState,
  dataUrlToBlob,
  validatePreset,
} from '../../src/engine/presets'
import { DEFAULT_TEXT, state } from '../../src/engine/state'

const emptySlot = { mode: 'none' as const, name: '', dataUrl: null, time: 0, playing: false }

describe('presets', () => {
  it('buildPresetFromState captures the full scene and validates', () => {
    const preset = buildPresetFromState('unit test', emptySlot)
    const validated = validatePreset(preset)
    expect(validated.app).toBe('TextureText')
    expect(validated.version).toBe(1)
    expect(validated.text).toBe(state.text)
    expect(validated.workingWidth).toBe(state.workingWidth)
    expect(validated.textParams.blendMode).toBe(state.textParams.blendMode)
    expect(validated.source.mode).toBe('none')
  })

  it('round-trips through JSON without losing fields', () => {
    const preset = buildPresetFromState('round trip', emptySlot)
    const revived = validatePreset(JSON.parse(JSON.stringify(preset)))
    expect(revived).toEqual(preset)
  })

  it('rejects non-TextureText JSON', () => {
    expect(() => validatePreset(null)).toThrow('not a valid JSON object')
    expect(() => validatePreset({ app: 'TextureMosaic' })).toThrow('not a TextureText preset')
  })

  it('rejects wrong version, bad canvas size, and missing text', () => {
    const base = JSON.parse(JSON.stringify(buildPresetFromState('x', emptySlot)))
    expect(() => validatePreset({ ...base, version: 99 })).toThrow('Unsupported preset version')
    expect(() => validatePreset({ ...base, workingWidth: 0 })).toThrow('invalid canvas size')
    expect(() => validatePreset({ ...base, text: 42 })).toThrow('missing its input text')
  })

  it('rejects invalid flowMode, blendMode, and source slots', () => {
    const base = JSON.parse(JSON.stringify(buildPresetFromState('x', emptySlot)))
    expect(() =>
      validatePreset({ ...base, shapeParams: { ...base.shapeParams, flowMode: 7 } }),
    ).toThrow('flowMode')
    expect(() =>
      validatePreset({ ...base, textParams: { ...base.textParams, blendMode: 'vivid' } }),
    ).toThrow('blendMode')
    expect(() => validatePreset({ ...base, source: { mode: 'video' } })).toThrow(
      'missing its embedded media data',
    )
    expect(() => validatePreset({ ...base, source: { mode: 'hologram' } })).toThrow(
      'invalid mode',
    )
  })

  it('dataUrlToBlob decodes mime and bytes', () => {
    const blob = dataUrlToBlob('data:text/plain;base64,aGk=')
    expect(blob.type).toBe('text/plain')
    expect(blob.size).toBe(2)
  })

  it('default text is non-empty so the default scene renders lines', () => {
    expect(DEFAULT_TEXT.length).toBeGreaterThan(100)
  })
})
