import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { edgeLabels, newProject, nodes, openApp, waitSaved } from './helpers'

type RawProject = { transitions: { id: string; direction?: Record<string, unknown> }[]; scenes: Record<string, unknown>[] }
type RawExport = { schemaVersion: number; project: RawProject }

const designer = (page: Page) => page.getByTestId('direction-designer')
const planner = (page: Page) => page.getByTestId('shot-planner')
const selectEdge = async (page: Page, label: string) => {
  await edgeLabels(page).filter({ hasText: label }).first().click()
  await expect(page.getByTestId('open-direction')).toBeVisible()
}
const openDesigner = async (page: Page) => {
  await page.getByTestId('open-direction').click()
  await expect(designer(page)).toBeVisible()
}
const closeDesigner = async (page: Page) => {
  await page.getByTestId('direction-close').click()
  await expect(designer(page)).toBeHidden()
}
const selectScene = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`).click({ position: { x: 20, y: 20 } })
const openShots = async (page: Page) => {
  await page.getByTestId('open-shots').click()
  await expect(planner(page)).toBeVisible()
}
const closeShots = async (page: Page) => {
  await page.getByTestId('shot-close').click()
  await expect(planner(page)).toBeHidden()
}
const card = (page: Page, i: number) => page.getByTestId('shot').nth(i)
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
const label = (page: Page, text: string | RegExp) => designer(page).getByLabel(text)

test.describe('transition designer', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page)
  })

  test('designs a transition; every edit supports undo and redo', async ({ page }) => {
    await selectEdge(page, 'Follow the lullaby')
    await expect(page.getByTestId('direction-summary')).toHaveText('Not designed yet.')
    await openDesigner(page)
    await expect(page.getByTestId('direction-empty')).toBeVisible()
    await page.getByTestId('direction-start').click()
    await expect(page.getByTestId('direction-preview')).toBeVisible()
    await expect(page.getByTestId('direction-illusion')).toContainText('Not written yet.')

    await label(page, 'What the player believes is happening').fill('She is following a real music box.')
    await label(page, 'What is actually happening').fill('The sound leads her into the dream.')
    await label(page, 'Reveal moment / contradiction').fill('The box plays backwards.')
    await label(page, 'Psychological technique').selectOption('reality-reveal')
    await label(page, 'Visual continuity / match-cut notes').fill('Keep the lid angle.')
    await label(page, 'Audio continuity notes').fill('Same melody, lower pitch.')
    await label(page, 'Unreal implementation notes').fill('Sequencer cut at 0:12')
    await expect(page.getByTestId('direction-illusion')).toContainText('She is following a real music box.')
    await expect(page.getByTestId('direction-reality')).toContainText('The sound leads her into the dream.')
    await expect(page.getByTestId('direction-reveal')).toContainText('The box plays backwards.')
    await expect(page.getByTestId('direction-technique')).toHaveText('Reality reveal')
    // style / duration of the transition are shown but not part of the design
    await expect(page.locator('[data-col="transition"]')).toContainText('Follow the lullaby')
    await expect(page.locator('[data-col="transition"]')).toContainText('Condition (assumption, never evaluated): Music box inspected')

    await page.getByTestId('direction-undo').click() // Unreal notes
    await expect(label(page, 'Unreal implementation notes')).toHaveValue('')
    await page.getByTestId('direction-redo').click()
    await expect(label(page, 'Unreal implementation notes')).toHaveValue('Sequencer cut at 0:12')
    await page.getByTestId('direction-undo').focus()
    await page.keyboard.press('Control+z')
    await expect(label(page, 'Unreal implementation notes')).toHaveValue('')
    await page.keyboard.press('Control+Shift+z')
    await expect(label(page, 'Unreal implementation notes')).toHaveValue('Sequencer cut at 0:12')

    await closeDesigner(page)
    await expect(page.getByTestId('direction-summary')).toContainText('Designed — Reality reveal')

    await openDesigner(page)
    await page.getByTestId('direction-clear').click()
    await expect(page.getByTestId('direction-empty')).toBeVisible()
    await page.getByTestId('direction-undo').click()
    await expect(page.getByTestId('direction-preview')).toBeVisible()
    await expect(label(page, 'Audio continuity notes')).toHaveValue('Same melody, lower pitch.')
    await page.keyboard.press('Escape')
    await expect(designer(page)).toBeHidden()
  })

  test('links shots of the source and destination scenes and previews them', async ({ page }) => {
    await selectEdge(page, 'Enter apartment')
    await expect(page.getByTestId('direction-summary')).toContainText('Linked shots: 1')
    await openDesigner(page)
    await expect(page.locator('[data-col="before"]')).toContainText('Apartment Hallway')
    await expect(page.locator('[data-col="before"] [data-testid="direction-shot"]')).toContainText('Hand on the doorknob')
    await expect(page.locator('[data-col="before"]')).toContainText('Extreme close-up · Static')
    await expect(page.locator('[data-col="after"]')).toContainText('Living Room')
    await expect(page.locator('[data-col="after"] [data-testid="direction-noshot"]')).toBeVisible()
    await expect(page.getByTestId('direction-illusion')).toContainText('steps through her own front door')

    const source = label(page, 'Source shot (before)')
    expect(await source.locator('option').allInnerTexts()).toEqual([
      'No shot linked',
      '1. Arrival down the corridor · 0:00–0:25',
      '2. Hand on the doorknob · 0:25–0:35',
      '3. Reflection that is not hers · 1:00–1:12',
    ])
    await source.selectOption({ label: '1. Arrival down the corridor · 0:00–0:25' })
    await expect(page.locator('[data-col="before"] [data-testid="direction-shot"]')).toContainText('Arrival down the corridor')
    await source.selectOption('')
    await expect(page.locator('[data-col="before"] [data-testid="direction-noshot"]')).toBeVisible()
    // the destination scene has no shots: nothing to link
    expect(await label(page, 'Destination shot (after)').locator('option').allInnerTexts()).toEqual(['No shot linked'])
  })

  test('deleting a linked shot needs explicit confirmation, clears the link and is one undo step', async ({ page }) => {
    await closeShotsIfOpen(page)
    await selectScene(page, 's_hall')
    await openShots(page)
    await expect(card(page, 1).getByTestId('shot-refs-chip')).toHaveText('Used by 1 transition(s)')
    await card(page, 1).getByTestId('shot-delete').click()
    await expect(page.getByTestId('shot-refs-confirm')).toContainText('“Apartment Hallway → Living Room (Enter apartment)” — source shot')
    await page.getByTestId('shot-refs-cancel').click()
    await expect(page.getByTestId('shot')).toHaveCount(3)

    await card(page, 1).getByTestId('shot-delete').click()
    await page.getByTestId('shot-refs-delete').click()
    await expect(page.getByTestId('shot')).toHaveCount(2)
    await closeShots(page)
    await selectEdge(page, 'Enter apartment')
    await expect(page.getByTestId('direction-summary')).toHaveText('Designed — Match cut') // direction kept, link cleared
    await openDesigner(page)
    await expect(page.locator('[data-col="before"] [data-testid="direction-noshot"]')).toBeVisible()
    await closeDesigner(page)

    // undo restores the shot and the link together
    await selectScene(page, 's_hall')
    await openShots(page)
    await page.getByTestId('shot-undo').click()
    await expect(page.getByTestId('shot')).toHaveCount(3)
    await closeShots(page)
    await selectEdge(page, 'Enter apartment')
    await expect(page.getByTestId('direction-summary')).toContainText('Linked shots: 1')
  })

  test('supports self-loop transitions (both ends choose from the same scene)', async ({ page }) => {
    await selectScene(page, 's_loop')
    await openShots(page)
    await page.getByTestId('shot-add').click()
    await page.getByTestId('shot-add').click()
    await card(page, 0).getByLabel('Title').fill('Door A')
    await card(page, 1).getByLabel('Title').fill('Door B')
    await closeShots(page)

    await selectEdge(page, 'Wrong door')
    await openDesigner(page)
    await expect(page.getByTestId('direction-selfloop')).toBeVisible()
    await page.getByTestId('direction-start').click()
    const opts = ['No shot linked', '1. Door A · 0:00–0:05', '2. Door B · 0:05–0:10']
    expect(await label(page, 'Source shot (before)').locator('option').allInnerTexts()).toEqual(opts)
    expect(await label(page, 'Destination shot (after)').locator('option').allInnerTexts()).toEqual(opts)
    await label(page, 'Source shot (before)').selectOption({ label: opts[1] })
    await label(page, 'Destination shot (after)').selectOption({ label: opts[1] })
    await expect(page.locator('[data-col="before"]')).toContainText('Door A')
    await expect(page.locator('[data-col="after"]')).toContainText('Door A')
    await closeDesigner(page)

    await selectScene(page, 's_loop')
    await openShots(page)
    await expect(card(page, 0).getByTestId('shot-refs-chip')).toHaveText('Used by 1 transition(s)')
    await card(page, 0).getByTestId('shot-delete').click()
    await expect(page.getByTestId('shot-refs-confirm').locator('li')).toHaveCount(2) // source and destination roles
    await page.getByTestId('shot-refs-delete').click()
    await expect(page.getByTestId('shot')).toHaveCount(1)
  })

  test('is localized in Turkish and English', async ({ page }) => {
    await selectEdge(page, 'Enter apartment')
    await page.getByTestId('lang-tr').click()
    await expect(page.getByTestId('open-direction')).toContainText('Geçişi tasarla')
    await openDesigner(page)
    await expect(designer(page)).toContainText('Geçişi tasarla — Apartment Hallway → Living Room')
    await expect(designer(page)).toContainText('İllüzyon — oyuncunun inandığı')
    await expect(designer(page)).toContainText('Önizleme: önce → geçiş → sonra')
    await expect(label(page, 'Psikolojik teknik')).toBeVisible()
    await expect(label(page, 'Kaynak plan (önce)')).toContainText('Hand on the doorknob')
    await expect(page.getByTestId('direction-technique')).toHaveText('Eşleşen kesme (match cut)')
    await page.getByTestId('direction-close').click()
    await page.getByTestId('lang-en').click()
    await expect(page.getByTestId('open-direction')).toContainText('Design transition')
  })

  test('is usable on a narrow screen without horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await selectEdge(page, 'Enter apartment')
    await openDesigner(page)
    await label(page, 'What the player believes is happening').fill('A very long sentence that has to wrap inside the narrow dialog without ever causing the page to scroll sideways.')
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1)
    const box = await designer(page).boundingBox()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(391)
    expect(await designer(page).evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1)
    // the preview stacks vertically
    const before = await page.locator('[data-col="before"]').boundingBox()
    const after = await page.locator('[data-col="after"]').boundingBox()
    expect(after!.y).toBeGreaterThan(before!.y)
    await expect(page.getByTestId('direction-clear')).toBeVisible()
  })
})

async function closeShotsIfOpen(page: Page) {
  if (await planner(page).isVisible()) await closeShots(page)
}

test.describe('persistence, backups and file compatibility', () => {
  test('directions survive reload, project switching, duplication and are part of the backup', async ({ page }) => {
    await openApp(page)
    await selectEdge(page, 'Follow the lullaby')
    await openDesigner(page)
    await page.getByTestId('direction-start').click()
    await label(page, 'Reveal moment / contradiction').fill('Persisted reveal')
    await closeDesigner(page)
    await waitSaved(page)

    const exported = await backup(page)
    expect(exported.schemaVersion).toBe(6)
    expect(exported.project.transitions.find((t) => t.id === 'e2')!.direction).toMatchObject({ reveal: 'Persisted reveal', technique: 'none', sourceShotId: null })
    expect('direction' in exported.project.transitions.find((t) => t.id === 'e3')!).toBe(false)

    await newProject(page)
    expect(await edgeLabels(page).count()).toBe(0) // isolated: the new project has no transitions

    await page.getByTestId('projects-btn').click()
    await page.getByTestId('library-row').filter({ hasText: 'The Hollow Apartment' }).getByRole('button', { name: /Duplicate/ }).click()
    await page.getByTestId('library-row').filter({ hasText: 'The Hollow Apartment' }).first().getByTestId('library-open').click()
    await expect(nodes(page)).toHaveCount(8)
    await selectEdge(page, 'Follow the lullaby')
    await expect(page.getByTestId('direction-summary')).toContainText('Designed')

    await page.reload()
    await expect(nodes(page).first()).toBeVisible()
    await selectEdge(page, 'Follow the lullaby')
    await openDesigner(page)
    await expect(label(page, 'Reveal moment / contradiction')).toHaveValue('Persisted reveal')
  })

  test('imports a schema-2 file and backs it up as schema 5 without losing fields', async ({ page }) => {
    await openApp(page)
    const original = await backup(page)
    const v2 = structuredClone(original)
    v2.schemaVersion = 2
    for (const t of v2.project.transitions) delete t.direction
    for (const sc of v2.project.scenes) delete sc.audioCues

    await importAsNew(page, v2)
    await expect(page.getByRole('button', { name: 'Add project' })).toBeVisible()
    await expect(page.getByText('no cinematic shots or transition directions')).toHaveCount(0) // v2 needs no migration notice
    await page.getByRole('button', { name: 'Add project' }).click()
    await expect(nodes(page)).toHaveCount(8)

    const migrated = await backup(page)
    expect(migrated.schemaVersion).toBe(6)
    const noAudio = (scenes: Record<string, unknown>[]) => scenes.map(({ audioCues, ...rest }) => (void audioCues, rest))
    expect(noAudio(migrated.project.scenes)).toEqual(noAudio(original.project.scenes)) // shots intact
    expect(migrated.project.scenes.every((sc) => Array.isArray(sc.audioCues) && (sc.audioCues as unknown[]).length === 0)).toBe(true)
    expect(migrated.project.transitions.every((t) => !('direction' in t))).toBe(true)
    expect(migrated.project.transitions.map((t) => t.id)).toEqual(original.project.transitions.map((t) => t.id))
  })

  test('a complete schema-3 backup round-trips through import', async ({ page }) => {
    await openApp(page)
    const before = await backup(page)
    await importAsNew(page, before)
    await page.getByRole('button', { name: 'Add project' }).click()
    const after = await backup(page)
    expect(after.project).toEqual(before.project)
    expect(after.project.transitions.find((t) => t.id === 'e1')!.direction).toMatchObject({ technique: 'match-cut', sourceShotId: 'sh2' })
  })

  test('a malformed schema-3 import (dangling shot link) is rejected and the project is unchanged', async ({ page }) => {
    await openApp(page)
    const bad = await backup(page)
    bad.project.transitions.find((t) => t.id === 'e1')!.direction!.sourceShotId = 'ghost'
    bad.project.transitions.find((t) => t.id === 'e5')!.direction!.targetShotId = 'sh1' // exists, but in another scene
    await importAsNew(page, bad)
    const alert = page.getByRole('alert').first()
    await expect(alert).toContainText('source shot "ghost" does not exist')
    await expect(alert).toContainText('destination shot "sh1" belongs to a different scene')
    await page.getByRole('button', { name: 'Close' }).last().click()
    await expect(nodes(page)).toHaveCount(8)
    await page.getByTestId('projects-btn').click()
    await expect(page.getByTestId('library-row')).toHaveCount(1)
  })

  test('a stored record with a malformed direction is listed as damaged and its raw data is preserved', async ({ page }) => {
    await openApp(page)
    await waitSaved(page)
    const raw = await page.evaluate(() => {
      const idx = JSON.parse(localStorage.getItem('horror-director:library:v1')!)
      const rec = JSON.parse(localStorage.getItem(`horror-director:proj:${idx.activeId}`)!)
      rec.project.transitions[0].direction.technique = 'jump-cut'
      idx.projects.push({ id: 'broken1', name: 'Broken direction', createdAt: 1, updatedAt: 1 })
      const text = JSON.stringify(rec)
      localStorage.setItem('horror-director:proj:broken1', text)
      localStorage.setItem('horror-director:library:v1', JSON.stringify(idx))
      return text
    })
    await page.reload()
    await expect(nodes(page).first()).toBeVisible()
    await page.getByTestId('projects-btn').click()
    await expect(page.getByTestId('library-row').filter({ hasText: 'Broken direction' })).toContainText('could not be read')
    expect(await page.evaluate(() => localStorage.getItem('horror-director:proj:broken1'))).toBe(raw)
    await page.keyboard.press('Escape')
    await selectEdge(page, 'Follow the lullaby')
    await openDesigner(page)
    await page.getByTestId('direction-start').click()
    await closeDesigner(page)
    await waitSaved(page)
    expect(await page.evaluate(() => localStorage.getItem('horror-director:proj:broken1'))).toBe(raw)
  })
})
