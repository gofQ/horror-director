import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { newProject, nodes, openApp, waitSaved } from './helpers'

const SCENE = '.react-flow__node[data-id="s_living"]'
const dialog = (page: Page) => page.getByTestId('shot-planner')
const cards = (page: Page) => page.getByTestId('shot')
const selectScene = async (page: Page, sel = SCENE) => {
  await page.locator(sel).click({ position: { x: 20, y: 20 } })
}
const openPlanner = async (page: Page) => {
  await page.getByTestId('open-shots').click()
  await expect(dialog(page)).toBeVisible()
}
const closePlanner = async (page: Page) => {
  await page.getByTestId('shot-close').click()
  await expect(dialog(page)).toBeHidden()
}
const titles = (page: Page) => cards(page).evaluateAll((els) => els.map((e) => (e.querySelector('[data-shot-title] input') as HTMLInputElement).value))
const timing = (page: Page, i: number) => cards(page).nth(i).getByTestId('shot-timing')
const field = (page: Page, i: number, label: string | RegExp) => cards(page).nth(i).getByLabel(label)
const backup = async (page: Page) => {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /backup/i }).first().click()])
  return JSON.parse(readFileSync((await dl.path())!, 'utf8')) as { schemaVersion: number; project: { scenes: Record<string, unknown>[] } }
}
const importAsNew = async (page: Page, data: unknown) => {
  await page.getByTestId('projects-btn').click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Import as new project' }).click()
  await (await chooser).setFiles({ name: 'in.horror.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) })
}

test.describe('shot planner', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page)
    await selectScene(page)
    await openPlanner(page)
  })

  test('adds, edits, duplicates, reorders, sorts and deletes shots', async ({ page }) => {
    await expect(page.getByTestId('shot-empty')).toBeVisible()
    await page.getByTestId('shot-add').click()
    await page.getByTestId('shot-add').click()
    await expect(cards(page)).toHaveCount(2)
    await expect(timing(page, 0)).toHaveText('0:00–0:05 of 2:00')
    await expect(timing(page, 1)).toHaveText('0:05–0:10 of 2:00')

    await field(page, 0, 'Title').fill('Hallway')
    await field(page, 1, 'Title').fill('Mirror')
    await field(page, 1, 'Framing').selectOption('extreme-close-up')
    await field(page, 1, 'Camera movement').selectOption('handheld')
    await field(page, 1, 'Psychological technique').selectOption('identity-discontinuity')
    await field(page, 1, 'Sound cue notes').fill('Breath, out of sync')
    await field(page, 1, 'Visual / action notes').fill('Reflection lags')
    expect(await titles(page)).toEqual(['Hallway', 'Mirror'])

    await cards(page).nth(0).getByTestId('shot-duplicate').click()
    expect(await titles(page)).toEqual(['Hallway', 'Hallway (copy)', 'Mirror'])
    await expect(timing(page, 1)).toHaveText('0:05–0:10 of 2:00')

    await cards(page).nth(2).getByTestId('shot-up').click()
    expect(await titles(page)).toEqual(['Hallway', 'Mirror', 'Hallway (copy)'])
    await expect(cards(page).nth(0).getByTestId('shot-up')).toBeDisabled()
    await expect(cards(page).nth(2).getByTestId('shot-down')).toBeDisabled()
    // reordering never changes authored timing
    await expect(timing(page, 1)).toHaveText('0:05–0:10 of 2:00')

    await cards(page).nth(1).getByTestId('shot-delete').click()
    expect(await titles(page)).toEqual(['Hallway', 'Hallway (copy)'])

    // the inspector shows the count; selections persist
    await closePlanner(page)
    await expect(page.getByTestId('open-shots')).toContainText('(2)')
  })

  test('warns about overlaps, scene overruns and time order without changing authored timing', async ({ page }) => {
    await page.getByTestId('shot-add').click()
    await page.getByTestId('shot-add').click()
    await page.getByTestId('shot-add').click()
    await expect(page.getByTestId('shot-warnings')).toHaveCount(0)

    await field(page, 1, 'Start (s)').fill('3')
    await expect(cards(page).nth(0).locator('[data-warn="overlap"]')).toBeVisible()
    await expect(cards(page).nth(1).locator('[data-warn="overlap"]')).toBeVisible()
    await expect(page.getByTestId('shot-warnings')).toContainText('overlapping pair')

    await field(page, 2, 'Duration (s)').fill('200')
    await expect(cards(page).nth(2).locator('[data-warn="exceeds"]')).toContainText('Ends 90s after the scene ends')
    await expect(field(page, 2, 'Duration (s)')).toHaveValue('200') // never clamped silently
    await expect(timing(page, 2)).toHaveText('0:10–3:30 of 2:00')

    await field(page, 2, 'Start (s)').fill('0')
    await expect(cards(page).nth(2).locator('[data-warn="order"]')).toBeVisible()
    await expect(page.getByTestId('shot-sort')).toBeEnabled()
    await page.getByTestId('shot-sort').click()
    await expect(page.getByTestId('shot-sort')).toBeDisabled()
    expect(await cards(page).evaluateAll((els) => els.map((e) => (e.querySelectorAll('input[type=number]')[0] as HTMLInputElement).value))).toEqual(['0', '3', '0'].sort((a, b) => Number(a) - Number(b)))
  })

  test('undo and redo work from the planner buttons and the keyboard', async ({ page }) => {
    await expect(page.getByTestId('shot-undo')).toBeDisabled()
    await page.getByTestId('shot-add').click()
    await page.getByTestId('shot-add').click()
    await expect(cards(page)).toHaveCount(2)
    await page.getByTestId('shot-undo').click()
    await expect(cards(page)).toHaveCount(1)
    await page.getByTestId('shot-redo').click()
    await expect(cards(page)).toHaveCount(2)
    // keyboard shortcut outside text fields
    await page.getByTestId('shot-add').focus()
    await page.keyboard.press('Control+z')
    await expect(cards(page)).toHaveCount(1)
    await page.keyboard.press('Control+Shift+z')
    await expect(cards(page)).toHaveCount(2)
    // typing coalesces into one step
    await field(page, 0, 'Title').fill('One')
    await field(page, 0, 'Title').pressSequentially('!!')
    await page.getByTestId('shot-undo').click()
    expect(await titles(page)).toEqual(['New shot', 'New shot'])
    // Escape closes the planner
    await page.keyboard.press('Escape')
    await expect(dialog(page)).toBeHidden()
  })

  test('is localized in Turkish and English', async ({ page }) => {
    await page.getByTestId('shot-add').click()
    await closePlanner(page)
    await page.getByTestId('lang-tr').click()
    await expect(page.getByTestId('open-shots')).toContainText('Çekim planlayıcı (1)')
    await openPlanner(page)
    await expect(dialog(page)).toContainText('Çekim planlayıcı — Living Room')
    await expect(dialog(page)).toContainText('Kadraj')
    await expect(dialog(page)).toContainText('Psikolojik teknik')
    await expect(cards(page).first().getByLabel('Kadraj')).toContainText('Orta')
    await expect(timing(page, 0)).toHaveText('0:00–0:05 / 2:00')
    await dialog(page).getByTestId('shot-close').click()
    await page.getByTestId('lang-en').click()
    await expect(page.getByTestId('open-shots')).toContainText('Shot planner (1)')
  })

  test('is usable on a narrow screen without horizontal overflow', async ({ page }) => {
    await closePlanner(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await selectScene(page)
    const open = page.getByTestId('open-shots')
    await open.scrollIntoViewIfNeeded()
    await open.click()
    await expect(dialog(page)).toBeVisible()
    await page.getByTestId('shot-add').click()
    await page.getByTestId('shot-add').click()
    await field(page, 0, 'Title').fill('A very long shot title that must wrap inside a narrow dialog without causing scrolling')
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(1)
    const box = await dialog(page).boundingBox()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(391)
    expect(await dialog(page).evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1)
    await expect(cards(page).nth(1).getByTestId('shot-delete')).toBeVisible()
    await cards(page).nth(1).getByTestId('shot-delete').click()
    await expect(cards(page)).toHaveCount(1)
  })
})

test.describe('persistence, isolation and file compatibility', () => {
  test('shots survive reload, project switching and project duplication', async ({ page }) => {
    await openApp(page)
    await selectScene(page)
    await openPlanner(page)
    await page.getByTestId('shot-add').click()
    await field(page, 0, 'Title').fill('Persisted shot')
    await closePlanner(page)
    await waitSaved(page)

    await newProject(page)
    await page.locator('.react-flow__node').first().click({ position: { x: 20, y: 20 } })
    await expect(page.getByTestId('open-shots')).toContainText('(0)') // isolated from the sample

    await page.getByTestId('projects-btn').click()
    await page.getByTestId('library-row').filter({ hasText: 'The Hollow Apartment' }).getByRole('button', { name: /Duplicate/ }).click()
    await expect(page.getByTestId('library-row')).toHaveCount(3)
    await page.getByTestId('library-row').filter({ hasText: 'The Hollow Apartment' }).first().getByTestId('library-open').click()
    await expect(nodes(page)).toHaveCount(8)
    await selectScene(page)
    await expect(page.getByTestId('open-shots')).toContainText('(1)')

    await page.reload()
    await expect(nodes(page).first()).toBeVisible()
    await selectScene(page)
    await openPlanner(page)
    expect(await titles(page)).toEqual(['Persisted shot'])
  })

  test('imports a schema-1 file and backs it up as schema 2 without losing fields', async ({ page }) => {
    await openApp(page)
    const original = await backup(page)
    expect(original.schemaVersion).toBe(2)
    const v1 = structuredClone(original)
    v1.schemaVersion = 1
    for (const s of v1.project.scenes) delete s.shots

    await importAsNew(page, v1)
    await expect(page.getByTestId('library-dialog')).toBeHidden()
    await expect(page.getByText('This file has no cinematic shots')).toBeVisible()
    await page.getByRole('button', { name: 'Add project' }).click()
    await expect(nodes(page)).toHaveCount(8)

    const migrated = await backup(page)
    expect(migrated.schemaVersion).toBe(2)
    expect(migrated.project.scenes.every((s) => Array.isArray(s.shots) && (s.shots as unknown[]).length === 0)).toBe(true)
    const strip = (scenes: Record<string, unknown>[]) => scenes.map(({ shots, ...rest }) => (void shots, rest))
    expect(strip(migrated.project.scenes)).toEqual(strip(original.project.scenes))
    expect({ ...migrated.project, scenes: [] }).toEqual({ ...original.project, scenes: [] })
  })

  test('a complete schema-2 backup round-trips through import', async ({ page }) => {
    await openApp(page)
    await selectScene(page, '.react-flow__node[data-id="s_hall"]')
    const before = await backup(page)
    await importAsNew(page, before)
    await page.getByRole('button', { name: 'Add project' }).click()
    const after = await backup(page)
    expect(after.project).toEqual(before.project)
    const hall = after.project.scenes.find((s) => s.id === 's_hall')!
    expect((hall.shots as unknown[]).length).toBe(3)
  })

  test('a malformed schema-2 import is rejected and the project is unchanged', async ({ page }) => {
    await openApp(page)
    const good = await backup(page)
    const bad = structuredClone(good)
    ;(bad.project.scenes[0].shots as Record<string, unknown>[])[0].framing = 'dutch-angle'
    await importAsNew(page, bad)
    await expect(page.getByRole('alert').first()).toContainText('framing')
    await page.getByRole('button', { name: 'Close' }).last().click()
    await expect(nodes(page)).toHaveCount(8)
    await page.getByTestId('projects-btn').click()
    await expect(page.getByTestId('library-row')).toHaveCount(1)
  })

  test('a stored record with malformed shots is listed as damaged and its raw data is preserved', async ({ page }) => {
    await openApp(page)
    await waitSaved(page)
    const raw = await page.evaluate(() => {
      const idx = JSON.parse(localStorage.getItem('horror-director:library:v1')!)
      const activeKey = `horror-director:proj:${idx.activeId}`
      const rec = JSON.parse(localStorage.getItem(activeKey)!)
      rec.project.scenes[0].shots[0].framing = 'dutch-angle'
      idx.projects.push({ id: 'broken1', name: 'Broken shots', createdAt: 1, updatedAt: 1 })
      const text = JSON.stringify(rec)
      localStorage.setItem('horror-director:proj:broken1', text)
      localStorage.setItem('horror-director:library:v1', JSON.stringify(idx))
      return text
    })
    await page.reload()
    await expect(nodes(page).first()).toBeVisible()
    await page.getByTestId('projects-btn').click()
    const row = page.getByTestId('library-row').filter({ hasText: 'Broken shots' })
    await expect(row).toContainText('could not be read')
    expect(await page.evaluate(() => localStorage.getItem('horror-director:proj:broken1'))).toBe(raw)
    // editing the active project and saving never touches the damaged record
    await page.keyboard.press('Escape')
    await selectScene(page)
    await openPlanner(page)
    await page.getByTestId('shot-add').click()
    await closePlanner(page)
    await waitSaved(page)
    expect(await page.evaluate(() => localStorage.getItem('horror-director:proj:broken1'))).toBe(raw)
  })
})
