import { expect, test } from '@playwright/test'
import path from 'node:path'

const fixtures = path.join(import.meta.dirname, '..', 'fixtures')

test.describe('bugfixes: resolution, style consistency, source composition', () => {
  test('resolution inputs reshape the stage box and reflow text', async ({ page }) => {
    await page.goto('/?preset=none')
    await expect.poll(async () => (await page.getByTestId('flow-line').count())).toBeGreaterThan(5)

    await page.getByTestId('resolution-width-input').fill('640')
    await page.getByTestId('resolution-width-input').press('Enter')
    await expect(page.getByTestId('resolution-label')).toHaveText('640 X 720 PX')

    const box = await page.getByTestId('stage').boundingBox()
    expect(box).not.toBeNull()
    const ratio = box!.width / box!.height
    expect(Math.abs(ratio - 640 / 720)).toBeLessThan(0.02)
  })

  test('all visible lines always share the current style after shrink-then-regrow', async ({ page }) => {
    await page.goto('/?preset=none')
    await expect.poll(async () => (await page.getByTestId('flow-line').count())).toBeGreaterThan(5)

    // Few lines: repeat off + short text.
    const visibleLines = page.locator('[data-testid="flow-line"]:visible')
    await page.getByTestId('repeatText-toggle').click()
    await page.getByTestId('text-clear-btn').click()
    await page.getByTestId('input-text').fill('hello world')
    await expect.poll(async () => visibleLines.count()).toBeLessThanOrEqual(3)

    // Enlarge the font: only the visible lines get restyled, pool keeps stale styles.
    await page.getByTestId('fontSize-slider').fill('48')

    // Regrow line count without a style change: newly revealed pool lines must match.
    await page
      .getByTestId('input-text')
      .fill(
        'hello world this paragraph is intentionally much longer so the layout produces more lines than before at the very same font settings and it keeps going with even more words so that several extra wrapped lines appear on the stage',
      )
    await expect.poll(async () => visibleLines.count()).toBeGreaterThan(3)

    const fontSizes = await visibleLines.evaluateAll((els) =>
      els.map((e) => getComputedStyle(e).fontSize),
    )
    expect(fontSizes.length).toBeGreaterThan(3)
    for (const fs of fontSizes) expect(fs).toBe('48px')
  })

  test('post-processed source composes over the text only when a blend mode is active', async ({ page }) => {
    await page.goto('/?preset=none')
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByTestId('source-image').click(),
    ])
    await chooser.setFiles(path.join(fixtures, 'sample.png'))

    // Raw media stays hidden; with blend 'none' the overlay is hidden too:
    // only bgColor + text are on stage.
    await expect(page.locator('#stageImage')).toBeHidden()
    await expect(page.getByTestId('stage-processed')).toBeHidden()
    await expect.poll(async () => (await page.locator('[data-testid="flow-line"]:visible').count())).toBeGreaterThan(5)

    // Activating a blend mode shows the post-processed image over the text with that blend.
    await page.getByTestId('blendMode-select').selectOption('difference')
    const overlay = page.getByTestId('stage-processed')
    await expect(overlay).toBeVisible()
    const blend = await overlay.evaluate((el) => getComputedStyle(el).mixBlendMode)
    expect(blend).toBe('difference')

    // The overlay holds the post-processed image: non-uniform grid pixels.
    const stats = await overlay.evaluate((el) => {
      const c = el as HTMLCanvasElement
      const ctx = c.getContext('2d')!
      const d = ctx.getImageData(0, 0, c.width, c.height).data
      let min = 255
      let max = 0
      for (let i = 0; i < d.length; i += 4) {
        if (d[i] < min) min = d[i]
        if (d[i] > max) max = d[i]
      }
      return { min, max, w: c.width, h: c.height }
    })
    expect(stats.w).toBe(1280)
    expect(stats.h).toBe(720)
    expect(stats.max).toBeGreaterThan(stats.min)

    // Back to 'none': overlay hidden, background color visible again.
    await page.getByTestId('blendMode-select').selectOption('none')
    await expect(page.getByTestId('stage-processed')).toBeHidden()
  })
})
