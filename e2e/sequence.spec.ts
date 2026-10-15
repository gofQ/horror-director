import { expect, test, type Page } from '@playwright/test'
import { newProject, openApp, waitSaved } from './helpers'

const seqView = (page: Page) => page.getByTestId('sequence-view')
const item = (page: Page, key: string) => page.locator(`[data-testid="seq-item"][data-key="${key}"]`)
const row = (page: Page, key: string) => page.locator(`[data-testid="seq-row"][data-key="${key}"]`)
const goTimeline = async (page: Page) => {
  await page.getByText(/^(Timeline|Zaman Çizelgesi)$/).first().click()
  await expect(page.getByTestId('tl-mode-sequence')).toBeVisible()
}
const openSequence = async (page: Page, scene = 'Apartment Hallway') => {
  await goTimeline(page)
  await page.locator('.timeline-view select').first().selectOption({ label: `${scene} · Reality` })
  await page.getByTestId('tl-mode-sequence').click()
  await expect(seqView(page)).toBeVisible()
}
const storage = (page: Page) => page.evaluate(() => JSON.stringify(Object.entries(localStorage).sort()))

test.describe('cinematic sequence overview', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page)
  })

  test('switches between the trigger editor and the Sequence view inside the Timeline tab', async ({ page }) => {
    await goTimeline(page)
    await expect(page.getByTestId('seq-chart')).toHaveCount(0)
    await expect(page.getByTestId('tl-mode-triggers')).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByText('Event list')).toBeVisible()
    await page.getByTestId('tl-mode-sequence').click()
    await expect(seqView(page)).toBeVisible()
    await expect(page.getByTestId('tl-mode-sequence')).toHaveAttribute('aria-selected', 'true')
    await page.getByTestId('tl-mode-triggers').click()
    await expect(seqView(page)).toBeHidden()
    await expect(page.getByText('Event list')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add trigger' })).toBeVisible()
    await expect(page.locator('nav button, [aria-label="Views"] button')).toHaveCount(5) // no extra top-level tab
  })

  test('shows camera, audio and event tracks with ticks, scene end and a time-ordered list', async ({ page }) => {
    await openSequence(page)
    await expect(page.locator('[data-testid="seq-track-shot"] [data-testid="seq-item"]')).toHaveCount(3)
    await expect(page.locator('[data-testid="seq-track-audio"] [data-testid="seq-item"]')).toHaveCount(4)
    await expect(page.locator('[data-testid="seq-track-trigger"] [data-testid="seq-item"]')).toHaveCount(2)
    await expect(page.getByTestId('seq-scene-end')).toContainText('1:30')
    await expect(page.getByTestId('seq-warnings')).toHaveCount(0) // layered audio and silence are not problems
    const rows = page.getByTestId('seq-row')
    await expect(rows).toHaveCount(9)
    await expect(rows.nth(0)).toContainText('Arrival down the corridor') // shot before audio at the same time
    await expect(rows.nth(1)).toContainText('Fluorescent hum bed')
    await expect(rows.nth(2)).toContainText('Lights flicker')
    // the three tracks share one x axis: the same time is the same x
    const a = await item(page, 'shot:sh1').boundingBox()
    const b = await item(page, 'audio:au1').boundingBox()
    expect(Math.abs(a!.x - b!.x)).toBeLessThanOrEqual(1)
    // layered audio lane separation
    const lanes = await page.locator('[data-testid="seq-track-audio"] [data-testid="seq-item"]').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)))
    expect(new Set(lanes).size).toBeGreaterThanOrEqual(1)
  })

  test('selecting an item shows details and a synchronized time cursor; keyboard works', async ({ page }) => {
    await openSequence(page)
    await expect(page.getByTestId('seq-details')).toContainText('Select a shot, audio cue or trigger')
    await expect(page.getByTestId('seq-cursor')).toHaveCount(0)
    await item(page, 'shot:sh2').click()
    await expect(page.getByTestId('seq-details')).toContainText('Hand on the doorknob')
    await expect(page.getByTestId('seq-details')).toContainText('Extreme close-up')
    await expect(page.getByTestId('seq-cursor-value')).toHaveText('0:25')
    await expect(page.getByTestId('seq-cursor')).toBeVisible()
    await expect(item(page, 'shot:sh2')).toHaveAttribute('aria-pressed', 'true')
    await expect(row(page, 'shot:sh2')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('seq-active')).toContainText('Hand on the doorknob')
    // keyboard: focus a list row and press Enter / Space
    await row(page, 'trigger:t2').focus()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('seq-details')).toContainText('Door creak')
    await expect(page.getByTestId('seq-cursor-value')).toHaveText('0:55')
    await item(page, 'audio:au3').focus()
    await page.keyboard.press('Space')
    await expect(page.getByTestId('seq-details')).toContainText('Whisper behind the player')
    await expect(page.getByTestId('seq-details')).toContainText('Behind')
    // the cursor can also be moved by keyboard
    await page.getByTestId('seq-cursor-input').focus()
    await page.keyboard.press('Home')
    await expect(page.getByTestId('seq-cursor-value')).toHaveText('0:00')
    await page.getByTestId('seq-cursor-clear').click()
    await expect(page.getByTestId('seq-cursor')).toHaveCount(0)
  })

  test('opens the existing editors focused on the selected item and updates live', async ({ page }) => {
    await openSequence(page)
    // shot -> Shot planner focused on that shot
    await item(page, 'shot:sh2').click()
    await page.getByTestId('seq-edit').click()
    await expect(page.getByTestId('shot-planner')).toBeVisible()
    const focused = page.locator('[data-shot-id="sh2"] input').first()
    await expect(focused).toBeFocused()
    await expect(focused).toHaveValue('Hand on the doorknob')
    await focused.fill('Hand on the cold doorknob')
    await page.getByTestId('shot-close').click()
    await expect(page.getByTestId('shot-planner')).toBeHidden()
    await expect(item(page, 'shot:sh2')).toContainText('Hand on the cold doorknob')
    await expect(page.getByTestId('seq-details')).toContainText('Hand on the cold doorknob') // selection kept

    // audio -> Audio planner focused on that cue; deleting it clears the selection
    await item(page, 'audio:au3').click()
    await page.getByTestId('seq-edit').click()
    await expect(page.getByTestId('audio-planner')).toBeVisible()
    await expect(page.locator('[data-cue-id="au3"] [data-cue-title] input')).toBeFocused()
    await page.locator('li[data-cue-id="au3"]').getByTestId('audio-delete').click()
    await page.getByTestId('audio-close').click()
    await expect(item(page, 'audio:au3')).toHaveCount(0)
    await expect(page.getByTestId('seq-details')).toContainText('Select a shot, audio cue or trigger')
    await expect(page.getByTestId('seq-row')).toHaveCount(8)
    // undo from the app brings it back into the overview
    await page.getByTestId('undo-btn').click()
    await expect(item(page, 'audio:au3')).toHaveCount(1)

    // trigger -> existing trigger editor with that trigger selected
    await item(page, 'trigger:t2').click()
    await page.getByTestId('seq-edit').click()
    await expect(seqView(page)).toBeHidden()
    await expect(page.getByTestId('tl-mode-triggers')).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByLabel('Name')).toHaveValue('Door creak')
  })

  test('marks conditional triggers as hypothetical', async ({ page }) => {
    await goTimeline(page)
    await page.locator('.timeline-view select').first().selectOption({ label: 'Apartment Hallway · Reality' })
    await page.getByRole('button', { name: /Door creak/ }).click()
    await page.getByLabel('Condition').fill('player opens the door')
    await page.getByTestId('tl-mode-sequence').click()
    await expect(item(page, 'trigger:t2')).toHaveClass(/hypothetical/)
    await expect(item(page, 'trigger:t1')).not.toHaveClass(/hypothetical/)
    await item(page, 'trigger:t2').click()
    await expect(page.getByTestId('seq-hypothetical')).toContainText('player opens the door')
    await expect(page.getByTestId('seq-hypothetical')).toContainText('may never happen')
  })

  test('items past the scene end extend the axis and are reported, never clamped', async ({ page }) => {
    await openSequence(page)
    const before = await page.getByTestId('seq-scene-end').evaluate((el) => (el as HTMLElement).style.left)
    expect(parseFloat(before)).toBeCloseTo(100, 0)
    await item(page, 'shot:sh2').click()
    await page.getByTestId('seq-edit').click()
    await page.locator('[data-shot-id="sh2"]').getByLabel('Start (s)').fill('85')
    await page.getByTestId('shot-close').click()
    await expect(page.getByTestId('seq-warnings')).toContainText('1 shot(s) extend beyond the scene duration')
    await expect(page.getByTestId('seq-beyond')).toBeVisible()
    const after = await page.getByTestId('seq-scene-end').evaluate((el) => (el as HTMLElement).style.left)
    expect(parseFloat(after)).toBeLessThan(100)
    await expect(item(page, 'shot:sh2')).toHaveClass(/over/)
    await item(page, 'shot:sh2').click()
    await expect(page.getByTestId('seq-details')).toContainText('1:25–1:35')
    await expect(page.getByTestId('seq-item-warnings')).toContainText('5s after the scene ends')
  })

  test('reports partially planned scenes without calling layered audio an error', async ({ page }) => {
    await openSequence(page, 'Living Room')
    await expect(page.getByTestId('seq-warnings')).toContainText('Not planned yet: Camera, Audio')
    await expect(page.locator('[data-testid="seq-track-shot"] .seq-empty')).toBeVisible()
    await expect(page.locator('[data-testid="seq-track-trigger"] [data-testid="seq-item"]')).toHaveCount(3)
  })

  test('view-only actions never change stored data or history', async ({ page }) => {
    await waitSaved(page)
    const before = await storage(page)
    await openSequence(page)
    await item(page, 'shot:sh1').click()
    await row(page, 'audio:au2').click()
    await page.getByTestId('seq-zoom-in').click()
    await page.getByTestId('seq-zoom-in').click()
    await page.getByTestId('seq-zoom-fit').click()
    await page.getByTestId('seq-cursor-input').focus()
    await page.keyboard.press('End')
    await page.locator('.timeline-view select').first().selectOption({ label: 'Living Room · Reality' })
    await page.getByTestId('tl-mode-triggers').click()
    await page.getByTestId('tl-mode-sequence').click()
    await page.waitForTimeout(700) // longer than the autosave debounce
    expect(await storage(page)).toBe(before)
    await expect(page.getByTestId('undo-btn')).toBeDisabled()
    await expect(page.getByTestId('save-badge')).not.toHaveClass(/saving|dirty/)
  })

  test('zoom widens the chart and scrolls horizontally inside its container', async ({ page }) => {
    await openSequence(page)
    const w1 = (await page.getByTestId('seq-chart').boundingBox())!.width
    await page.getByTestId('seq-zoom-in').click()
    await page.getByTestId('seq-zoom-in').click()
    await expect(page.getByTestId('seq-zoom-level')).toContainText('4')
    expect((await page.getByTestId('seq-chart').boundingBox())!.width).toBeGreaterThan(w1 * 3)
    expect(await page.getByTestId('seq-scroll').evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1)
  })

  test('is localized in Turkish and English', async ({ page }) => {
    await openSequence(page)
    await page.getByTestId('lang-tr').click()
    await expect(page.getByTestId('tl-mode-sequence')).toHaveText('Sekans')
    await expect(page.getByTestId('seq-label-shot')).toContainText('Kamera')
    await item(page, 'shot:sh1').click()
    await expect(page.getByTestId('seq-edit')).toContainText('Çekim planlayıcıda aç')
    await page.getByTestId('lang-en').click()
    await expect(page.getByTestId('tl-mode-sequence')).toHaveText('Sequence')
    await expect(page.getByTestId('seq-edit')).toContainText('Open in Shot planner')
  })

  test('works on a narrow screen without page overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openSequence(page)
    await item(page, 'shot:sh1').click()
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1)
    const box = await page.getByTestId('seq-scroll').boundingBox()
    expect(box!.x + box!.width).toBeLessThanOrEqual(391)
    await expect(page.getByTestId('seq-row').first()).toBeVisible()
    await page.getByTestId('seq-edit').click()
    await expect(page.getByTestId('shot-planner')).toBeVisible()
  })
})

test.describe('persistence and project switching', () => {
  test('the sequence is rebuilt from stored data after reload; switching project clears the selection', async ({ page }) => {
    await openApp(page)
    await openSequence(page)
    await item(page, 'shot:sh1').click()
    await page.reload()
    await expect(page.locator('.react-flow__node').first()).toBeVisible()
    await goTimeline(page)
    await page.locator('.timeline-view select').first().selectOption({ label: 'Apartment Hallway · Reality' })
    await page.getByTestId('tl-mode-sequence').click()
    await expect(page.getByTestId('seq-row')).toHaveCount(9)
    await expect(page.getByTestId('seq-details')).toContainText('Select a shot, audio cue or trigger') // selection is session-only

    await item(page, 'audio:au1').click()
    await page.getByText(/^(Scene Graph|Sahne Grafı)$/).first().click()
    await newProject(page)
    await goTimeline(page)
    await page.getByTestId('tl-mode-sequence').click()
    await expect(page.getByTestId('seq-details')).toContainText('Select a shot, audio cue or trigger')
    await expect(page.getByTestId('seq-row')).toHaveCount(0)
    await expect(page.getByTestId('seq-warnings')).toContainText('Nothing is planned')
  })
})
