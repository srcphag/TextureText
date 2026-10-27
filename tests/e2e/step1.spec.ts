import { expect, test, type Page } from '@playwright/test'
import path from 'node:path'

const fixtures = path.join(import.meta.dirname, '..', 'fixtures')

async function pixelSum(page: Page): Promise<number> {
  return page.evaluate(() => {
    const api = (window as any).__tt
    if (!api) return -1
    let sum = 0
    for (let y = 0; y < 118; y += 17) {
      for (let x = 0; x < 118; x += 17) {
        const px = api.readPreviewPixel(x, y)
        if (px) sum += px[0] + px[1] + px[2]
      }
    }
    return sum
  })
}

test.describe('TextureMosaic studio UI + pretext luma text flow', () => {
  test('renders flowed text over background on startup while keeping control media off-stage', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(String(e)))
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text())
    })
    await page.goto('/')
    await expect(page.getByTestId('panel-inputs')).toBeVisible()
    await expect(page.getByTestId('panel-stage')).toBeVisible()
    await expect(page.getByTestId('panel-parameters')).toBeVisible()
    await expect(page.getByTestId('source-empty')).toBeVisible()
    await expect(page.locator('#stageVideo')).toBeHidden()
    await expect(page.locator('#stageImage')).toBeHidden()

    const lineCount = await page.getByTestId('flow-line').count()
    expect(lineCount).toBeGreaterThan(5)
    await expect(page.getByTestId('stage-empty')).toBeHidden()
    expect(errors).toEqual([])
  })

  test('image file loads into preview only, carves text slots on stage, and toggles outside/inside flowMode', async ({ page }) => {
    await page.goto('/')
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByTestId('source-image').click(),
    ])
    await chooser.setFiles(path.join(fixtures, 'sample.png'))
    await expect(page.getByTestId('source-empty')).toBeHidden()
    await expect(page.getByTestId('source-preview')).toHaveClass(/is-loaded/)
    await expect(page.locator('#stageImage')).toBeHidden()
    await expect(page.getByTestId('stage-processed')).toBeHidden()
    expect(await pixelSum(page)).toBeGreaterThan(0)

    const outsideLines = await page.evaluate(() => (window as any).__tt.getLines())
    expect(outsideLines.length).toBeGreaterThan(0)

    await page.getByTestId('flowMode-1').click()
    await expect(page.getByTestId('flowMode-1')).toHaveClass(/is-primary/)
    const insideLines = await page.evaluate(() => (window as any).__tt.getLines())
    expect(insideLines.length).toBeGreaterThan(0)
    expect(insideLines[0].x).not.toBe(outsideLines[0].x)
  })

  test('invert color button toggle flips the processed preview and reset restores it', async ({ page }) => {
    await page.goto('/')
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByTestId('source-image').click(),
    ])
    await chooser.setFiles(path.join(fixtures, 'sample.png'))
    await expect(page.getByTestId('source-empty')).toBeHidden()

    const before = await page.evaluate(() => (window as any).__tt.readPreviewPixel(59, 59)[0])
    await page.getByTestId('invert-toggle').click()
    await expect(page.getByTestId('invert-toggle')).toHaveClass(/is-primary/)
    const inverted = await page.evaluate(() => (window as any).__tt.readPreviewPixel(59, 59)[0])
    expect(inverted).toBe(255 - before)

    await page.getByTestId('invert-reset').click()
    const restored = await page.evaluate(() => (window as any).__tt.readPreviewPixel(59, 59)[0])
    expect(restored).toBe(before)
    await expect(page.getByTestId('invert-toggle')).not.toHaveClass(/is-primary/)
  })

  test('contrast slider drives the preview and split number input stays in sync', async ({ page }) => {
    await page.goto('/')
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByTestId('source-image').click(),
    ])
    await chooser.setFiles(path.join(fixtures, 'sample.png'))
    await expect(page.getByTestId('source-empty')).toBeHidden()

    await page.getByTestId('contrast-slider').fill('0')
    const grey = await page.evaluate(() => (window as any).__tt.readPreviewPixel(59, 59)[0])
    expect(Math.abs(grey - 128)).toBeLessThanOrEqual(1)
    await expect(page.getByTestId('contrast-number')).toHaveValue('0')

    await page.getByTestId('contrast-reset').click()
    await expect(page.getByTestId('contrast-slider')).toHaveValue('1')
  })

  test('video file loads off-stage, autoplays, and transport ▶/❚❚ button toggles playback', async ({ page }) => {
    await page.goto('/')
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByTestId('source-video').click(),
    ])
    await chooser.setFiles(path.join(fixtures, 'sample.webm'))
    await expect(page.locator('#stageVideo')).toBeHidden()
    await expect(page.getByTestId('transport-play')).toBeEnabled()
    await expect(page.getByTestId('transport-status')).toHaveText('Video Input')

    await page.waitForFunction(() => {
      const t = (window as any).__tt.getTransport()
      return t.kind === 'video' && t.playing && t.time > 0
    })
    await expect(page.getByTestId('transport-play')).toHaveText('❚❚')

    await page.getByTestId('transport-play').click()
    await page.waitForFunction(() => !(window as any).__tt.getTransport().playing)
    await expect(page.getByTestId('transport-play')).toHaveText('▶')
  })

  test('webcam shows red Live track, updates preview, and keeps video element off-stage', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('source-webcam').click()
    await expect(page.locator('#stageVideo')).toBeHidden()
    await expect(page.getByTestId('transport-label')).toHaveText('Live')
    await expect(page.getByTestId('transport-status')).toHaveText('Webcam')
    await expect(page.getByTestId('transport-track')).toHaveClass(/is-live/)
    await page.waitForFunction(() => (window as any).__tt.getTransport().playing)
    await expect.poll(() => pixelSum(page)).toBeGreaterThan(0)
  })

  test('unsupported file shows a visible danger toast and dismisses cleanly', async ({ page }) => {
    await page.goto('/')
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByTestId('source-image').click(),
    ])
    await chooser.setFiles(path.join(fixtures, 'not-media.txt'))
    await expect(page.getByTestId('error-banner')).toBeVisible()
    await expect(page.getByTestId('error-banner')).toContainText('unsupported image file')
    await page.getByTestId('error-dismiss-btn').click()
    await expect(page.getByTestId('error-banner')).toBeHidden()
  })

  test('stats overlay toggles and shows FPS, LINES, REFLOW, and RES', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('stats-overlay')).toBeHidden()
    await page.getByTestId('stats-toggle').click()
    await expect(page.getByTestId('stats-overlay')).toBeVisible()
    await expect(page.getByTestId('stats-overlay')).toContainText('FPS:')
    await expect(page.getByTestId('stats-overlay')).toContainText('LINES:')
    await expect(page.getByTestId('stats-overlay')).toContainText('REFLOW:')
    await expect(page.getByTestId('stats-overlay')).toContainText('1280×720')
    await page.getByTestId('stats-toggle').click()
    await expect(page.getByTestId('stats-overlay')).toBeHidden()
  })
})
