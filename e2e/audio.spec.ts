import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { newProject, nodes, openApp, waitSaved } from './helpers'

type RawExport = { schemaVersion: number; project: { scenes: { id: string; audioCues: Record<string, unknown>[] }[] } }

const planner = (page: Page) => page.getByTestId('audio-planner')
const cue = (page: Page, i: number) => page.getByTestId('audio-cue').nth(i)
const selectScene = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`).click({ position: { x: 20, y: 20 } })
const openAudio = async (page: Page) => {
  await page.getByTestId('open-audio').click()
  await expect(planner(page)).toBeVisible()
}
const closeAudio = async (page: Page) => {
  await page.getByTestId('audio-close').click()
  await expect(planner(page)).toBeHidden()
}
const titles = (page: Page) => page.getByTestId('audio-cue').locator('[data-cue-title] input').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value))
const backup = async (page: Page) => {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /backup/i }).first().click()])
  return JSON.parse(readFileSync((await dl.path())!, 'utf8')) as RawExport
}
const importAsNew = async (page: Page, data: unknown) => {
  await page.getByTestId('projects-btn').click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Import as new project' }).click()
  await (await chooser).setFiles({ name: 'in.horror.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) })
}

test.describe('audio planner', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page)
  })

  test('adds, edits, duplicates, reorders and deletes cues with undo and redo', async ({ page }) => {
    await selectScene(page, 's_living')
    await openAudio(page)
    await expect(page.getByTestId('audio-empty')).toBeVisible()
    await page.getByTestId('audio-add').click()
    await page.getByTestId('audio-add').click()
    await expect(page.getByTestId('audio-cue')).toHaveCount(2)
    await expect(cue(page, 1).getByTestId('audio-timing')).toContainText('0:05–0:10')

    await cue(page, 0).getByLabel('Title').fill('Whisper behind')
    await cue(page, 0).getByLabel('Type').selectOption('whisper')
    await cue(page, 0).getByLabel('Spatial direction').selectOption('behind')
    await cue(page, 0).getByLabel('Origin').selectOption('ambiguous')
    await cue(page, 0).getByLabel('Sound direction notes').fill('Too close to be real')
    await cue(page, 0).getByLabel('Text-to-audio brief (optional)').fill('a child whispering')
    await expect(cue(page, 0).getByTestId('audio-type-badge')).toHaveText('Whisper')

    await cue(page, 0).getByTestId('audio-duplicate').click()
    await expect(page.getByTestId('audio-cue')).toHaveCount(3)
    expect((await titles(page))[1]).toContain('(copy)')
    await cue(page, 2).getByTestId('audio-up').click()
    expect((await titles(page))[1]).toBe('New audio cue')
    await cue(page, 1).getByTestId('audio-delete').click()
    await expect(page.getByTestId('audio-cue')).toHaveCount(2)

    await page.getByTestId('audio-undo').click() // delete
    await expect(page.getByTestId('audio-cue')).toHaveCount(3)
    await page.getByTestId('audio-redo').click()
    await expect(page.getByTestId('audio-cue')).toHaveCount(2)
    await closeAudio(page)
    await expect(page.getByTestId('open-audio')).toContainText('(2)')
  })

  test('overlaps are layers (no error); silence is distinct; overruns and long fades warn', async ({ page }) => {
    await selectScene(page, 's_living')
    await openAudio(page)
    await page.getByTestId('audio-add').click()
    await page.getByTestId('audio-add').click()
    await cue(page, 1).getByLabel('Start (s)').fill('2')
    await cue(page, 1).getByLabel('Type').selectOption('silence')
    await expect(page.getByTestId('audio-warnings')).toHaveCount(0) // overlapping is normal
    const lanes = await page.getByTestId('audio-bar').evaluateAll((els) => els.map((e) => e.getAttribute('data-lane')))
    expect(lanes).toEqual(['0', '1'])
    await expect(page.getByTestId('audio-bar').nth(1)).toHaveClass(/type-silence/)
    await expect(cue(page, 1)).toContainText('does not mute other cues')

    await cue(page, 0).getByLabel('Start (s)').fill('118')
    await expect(cue(page, 0).locator('[data-warn="exceeds"]')).toContainText('3')
    await cue(page, 1).getByLabel('Fade-in (s)').fill('4')
    await cue(page, 1).getByLabel('Fade-out (s)').fill('4')
    await expect(cue(page, 1).locator('[data-warn="fade"]')).toBeVisible()
    await expect(page.getByTestId('audio-warnings')).toBeVisible()
    // authored timing is never changed automatically
    await expect(cue(page, 0).getByLabel('Start (s)')).toHaveValue('118')
    await expect(cue(page, 0).getByLabel('Duration (s)')).toHaveValue('5')
  })

  test('timeline bars are keyboard operable and jump to their cue', async ({ page }) => {
    await selectScene(page, 's_hall')
    await openAudio(page)
    await expect(page.getByTestId('audio-bar')).toHaveCount(4)
    expect((await page.getByTestId('audio-timeline').boundingBox())!.height).toBeGreaterThan(40) // never collapsed by the flex dialog
    expect((await page.getByTestId('audio-bar').nth(0).boundingBox())!.width).toBeGreaterThan(50)
    await page.getByTestId('audio-bar').nth(2).focus()
    await page.keyboard.press('Enter')
    await expect(cue(page, 2).getByLabel('Title')).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(planner(page)).toBeHidden()
  })

  test('switches between English and Turkish', async ({ page }) => {
    await selectScene(page, 's_hall')
    await expect(page.getByTestId('open-audio')).toContainText('Audio planner')
    await page.getByTestId('lang-tr').click()
    await expect(page.getByTestId('open-audio')).toContainText('Ses planlayıcı')
    await openAudio(page)
    await expect(cue(page, 0).getByLabel('Uzamsal yön')).toBeVisible()
    await expect(cue(page, 0).getByTestId('audio-type-badge')).toHaveText('Ambiyans')
    await closeAudio(page)
    await page.getByTestId('lang-en').click()
    await expect(page.getByTestId('open-audio')).toContainText('Audio planner')
  })

  test('is usable on a narrow screen without page overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await selectScene(page, 's_hall')
    await openAudio(page)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1)
    const box = await planner(page).boundingBox()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(391)
    expect(await planner(page).evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1)
    await expect(page.getByTestId('audio-add')).toBeVisible()
  })
})

test.describe('persistence, backups and file compatibility', () => {
  test('cues survive reload, project switching and are part of the backup', async ({ page }) => {
    await openApp(page)
    await selectScene(page, 's_living')
    await openAudio(page)
    await page.getByTestId('audio-add').click()
    await cue(page, 0).getByLabel('Title').fill('Persisted cue')
    await cue(page, 0).getByLabel('Loop').check()
    await closeAudio(page)
    await waitSaved(page)

    const exported = await backup(page)
    expect(exported.schemaVersion).toBe(8)
    expect(exported.project.scenes.find((s) => s.id === 's_living')!.audioCues[0]).toMatchObject({ title: 'Persisted cue', loop: true, type: 'sfx' })

    await newProject(page)
    await page.getByTestId('projects-btn').click()
    await page.getByTestId('library-row').filter({ hasText: 'The Hollow Apartment' }).first().getByTestId('library-open').click()
    await expect(nodes(page)).toHaveCount(8)

    await page.reload()
    await expect(nodes(page).first()).toBeVisible()
    await selectScene(page, 's_living')
    await openAudio(page)
    expect(await titles(page)).toEqual(['Persisted cue'])
  })

  test('imports a schema-3 file and backs it up as schema 5 without losing fields', async ({ page }) => {
    await openApp(page)
    const original = await backup(page)
    const v3 = structuredClone(original)
    v3.schemaVersion = 3
    for (const s of v3.project.scenes) delete (s as { audioCues?: unknown }).audioCues
    await importAsNew(page, v3)
    await page.getByRole('button', { name: 'Add project' }).click()
    await expect(nodes(page)).toHaveCount(8)
    const migrated = await backup(page)
    expect(migrated.schemaVersion).toBe(8)
    expect(migrated.project.scenes.every((s) => s.audioCues.length === 0)).toBe(true)
    const strip = (scenes: RawExport['project']['scenes']) => scenes.map(({ audioCues, ...rest }) => (void audioCues, rest))
    expect(strip(migrated.project.scenes)).toEqual(strip(original.project.scenes))
  })

  test('a complete schema-5 backup round-trips through import', async ({ page }) => {
    await openApp(page)
    const before = await backup(page)
    expect(before.project.scenes.find((s) => s.id === 's_hall')!.audioCues).toHaveLength(4)
    await importAsNew(page, before)
    await page.getByRole('button', { name: 'Add project' }).click()
    const after = await backup(page)
    expect(after.project).toEqual(before.project)
  })

  test('malformed imports (duplicate cue ids, unknown field) are rejected and the project is unchanged', async ({ page }) => {
    await openApp(page)
    const bad = await backup(page)
    const cues = bad.project.scenes.find((s) => s.id === 's_hall')!.audioCues
    cues[1].id = cues[0].id
    cues[2].volumeDb = -6
    await importAsNew(page, bad)
    const alert = page.getByRole('alert').first()
    await expect(alert).toContainText('Duplicate audio cue id')
    await expect(alert).toContainText('volumeDb')
    await page.getByRole('button', { name: 'Close' }).last().click()
    await expect(nodes(page)).toHaveCount(8)
    await page.getByTestId('projects-btn').click()
    await expect(page.getByTestId('library-row')).toHaveCount(1)
  })
})
