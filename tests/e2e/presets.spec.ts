import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const fixtures = path.join(import.meta.dirname, '..', 'fixtures')

const craftedPreset = {
  app: 'TextureText',
  version: 1,
  name: 'crafted import',
  workingWidth: 1280,
  workingHeight: 720,
  text: 'PRESET_IMPORT_TEST',
  sourceParams: { invert: true, contrast: 2, offset: 0.1 },
  shapeParams: {
    flowMode: 1,
    threshold: 0.9,
    thresholdSoft: 0.05,
    shapePadding: 8,
    temporalSmooth: 0.3,
    gridCellPx: 4,
    minSlotWidth: 40,
  },
  textParams: {
    fontFamily: '"JetBrains Mono", "Courier New", Consolas, monospace',
    fontSize: 22,
    lineHeight: 30,
    textColor: '#ff0000',
    bgColor: '#001122',
    blendMode: 'difference',
    repeatText: false,
  },
  exportSettings: { duration: 3, fps: 24, profile: 1 },
  source: { mode: 'none', name: '', dataUrl: null, time: 0, playing: false },
}

test.describe('presets: full-scene JSON save / export / import', () => {
  test('boots with the pyramid1 repo preset as the default scene', async ({ page }) => {
    await page.goto('/')

    // The default preset fetch + media decode is async; wait for it to land.
    await expect(page.getByTestId('preset-name-input')).toHaveValue('pyramid1', { timeout: 25_000 })
    await expect(page.getByTestId('preset-select')).toHaveValue('repo:pyramid1')
    await expect(page.getByTestId('resolution-label')).toHaveText('1280 X 1280 PX')
    await expect(page.getByTestId('blendMode-select')).toHaveValue('color-dodge')
    await expect(page.getByTestId('invert-toggle')).toHaveClass(/is-primary/)
    await expect(page.getByTestId('contrast-number')).toHaveValue('3.88')
    await expect(page.getByTestId('transport-status')).toHaveText('Video Input')
    await expect(page.getByTestId('source-preview')).toHaveClass(/is-loaded/)

    // Text flows around the embedded video's luminance.
    await expect
      .poll(async () => page.locator('[data-testid="flow-line"]:visible').count(), { timeout: 25_000 })
      .toBeGreaterThan(50)
  })

  test('?preset=none keeps the built-in default scene', async ({ page }) => {
    await page.goto('/?preset=none')
    await expect(page.getByTestId('preset-select')).toHaveValue('')
    await expect(page.getByTestId('resolution-label')).toHaveText('1280 X 720 PX')
    await expect(page.getByTestId('blendMode-select')).toHaveValue('none')
    await expect(page.getByTestId('transport-status')).toHaveText('None')
    await expect(page.getByTestId('source-empty')).toBeVisible()
  })

  test('?preset=<id> deep-links a different repo preset', async ({ page }) => {
    await page.goto('/?preset=defaultScene')
    await expect(page.getByTestId('preset-name-input')).toHaveValue('default scene', { timeout: 25_000 })
    await expect(page.getByTestId('preset-select')).toHaveValue('repo:defaultScene')
    await expect(page.getByTestId('resolution-label')).toHaveText('1280 X 720 PX')
  })

  test('repo preset appears in the dropdown and applies on select', async ({ page }) => {
    await page.goto('/?preset=none')
    const select = page.getByTestId('preset-select')
    await expect(select.locator('option', { hasText: 'defaultScene' })).toHaveCount(1)

    // Dirty the scene, then apply the repo preset to restore defaults.
    await page.getByTestId('invert-toggle').click()
    await page.getByTestId('text-clear-btn').click()
    await select.selectOption('repo:defaultScene')
    await expect(page.getByTestId('invert-toggle')).not.toHaveClass(/is-primary/)
    await expect(page.getByTestId('input-text')).not.toHaveValue('')
    await expect(page.getByTestId('preset-name-input')).toHaveValue('default scene')
  })

  test('save creates a session preset and re-selecting it restores the scene', async ({ page }) => {
    await page.goto('/?preset=none')
    await page.getByTestId('invert-toggle').click()
    await page.getByTestId('blendMode-select').selectOption('multiply')
    await page.getByTestId('preset-name-input').fill('my scene')
    await page.getByTestId('preset-save-btn').click()

    const select = page.getByTestId('preset-select')
    await expect(select.locator('option', { hasText: 'my scene' })).toHaveCount(1)

    // Drift away, then re-apply the session preset.
    await page.getByTestId('invert-toggle').click()
    await page.getByTestId('blendMode-select').selectOption('none')
    await select.selectOption('')
    await select.selectOption('session:p1')
    await expect(page.getByTestId('invert-toggle')).toHaveClass(/is-primary/)
    await expect(page.getByTestId('blendMode-select')).toHaveValue('multiply')
  })

  test('export downloads a valid TextureText preset .json', async ({ page }) => {
    await page.goto('/?preset=none')
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('preset-export-btn').click(),
    ])
    expect(download.suggestedFilename()).toMatch(/\.json$/)
    const filePath = await download.path()
    const json = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    expect(json.app).toBe('TextureText')
    expect(json.version).toBe(1)
    expect(typeof json.text).toBe('string')
  })

  test('import applies params, text, and embedded image media', async ({ page }) => {
    await page.goto('/?preset=none')

    // Export a scene with an image loaded so the preset embeds it.
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByTestId('source-image').click(),
    ])
    await chooser.setFiles(path.join(fixtures, 'sample.png'))
    await expect(page.getByTestId('source-preview')).toHaveClass(/is-loaded/)
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('preset-export-btn').click(),
    ])
    const exportedPath = await download.path()

    // Clear the source, then import the exported preset: image comes back.
    await page.getByTestId('source-clear-btn').click()
    await expect(page.getByTestId('transport-status')).toHaveText('None')
    const [importChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByTestId('preset-import-btn').click(),
    ])
    await importChooser.setFiles(exportedPath)
    await expect(page.getByTestId('transport-status')).toHaveText('Image')
    const kind = await page.evaluate(() => (window as any).__tt.getState().sourceKind)
    expect(kind).toBe('image')
  })

  test('import applies a crafted preset file to every control', async ({ page }) => {
    await page.goto('/?preset=none')
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByTestId('preset-import-btn').click(),
    ])
    await chooser.setFiles({
      name: 'crafted.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(craftedPreset)),
    })
    await expect(page.getByTestId('input-text')).toHaveValue('PRESET_IMPORT_TEST')
    await expect(page.getByTestId('invert-toggle')).toHaveClass(/is-primary/)
    await expect(page.getByTestId('threshold-slider')).toHaveValue('0.9')
    await expect(page.getByTestId('blendMode-select')).toHaveValue('difference')
    await expect(page.getByTestId('flowMode-1')).toHaveClass(/is-primary/)
    await expect(page.getByTestId('export-duration-input')).toHaveValue('3')
    await expect(page.getByTestId('export-fps-input')).toHaveValue('24')
    await expect(page.getByTestId('prores-profile-select')).toHaveValue('1')
  })

  test('invalid JSON import shows a visible error toast', async ({ page }) => {
    await page.goto('/?preset=none')
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByTestId('preset-import-btn').click(),
    ])
    await chooser.setFiles(path.join(fixtures, 'not-media.txt'))
    await expect(page.getByTestId('error-banner')).toBeVisible()
    await page.getByTestId('error-dismiss-btn').click()
    await expect(page.getByTestId('error-banner')).toBeHidden()
  })
})
