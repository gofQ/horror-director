import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { openApp } from './helpers'

const tab = (page: Page, name: string) => page.locator('.tabs button').filter({ hasText: name })
const rows = (page: Page) => page.getByTestId('task-row')
const row = (page: Page, id: string) => page.locator(`[data-testid="task-row"][data-task-id="${id}"]`)
const menu = (page: Page) => page.getByTestId('context-menu')

async function openProduction(page: Page, sample = true) {
  await openApp(page)
  if (sample) {
    await page.getByTestId('projects-btn').click()
    await page.getByTestId('library-add-sample').click()
    await expect(page.getByTestId('library-dialog')).toBeHidden()
  }
  await tab(page, 'Production').click()
  await expect(page.getByTestId('task-explorer')).toBeVisible()
}

test.describe('production task explorer', () => {
  test('lists every task in schedule order and searches by id, title and source', async ({ page }) => {
    await openProduction(page)
    const total = await rows(page).count()
    expect(total).toBeGreaterThan(30)
    await expect(page.getByTestId('task-count')).toHaveText(`${total} of ${total} tasks`)
    const ids = await rows(page).evaluateAll((els) => els.map((e) => e.getAttribute('data-task-id')))
    expect(ids[0]).toBe('T-foundation-project')
    expect(ids.at(-1)).toBe('T-verify-project')
    await page.getByTestId('task-search').fill('door')
    await expect(row(page, 'T-random-rnd_door')).toBeVisible()
    await expect(page.getByTestId('task-count')).not.toHaveText(`${total} of ${total} tasks`)
    await page.getByTestId('task-search').fill('s_cellar') // by source id
    await expect(row(page, 'T-level-s_cellar')).toBeVisible()
    await page.getByTestId('task-search').fill('zzzz-nothing')
    await expect(page.getByTestId('task-empty')).toBeVisible()
    await page.getByTestId('task-search').fill('')
    await expect(rows(page)).toHaveCount(total)
  })

  test('filters by phase, source type and readiness', async ({ page }) => {
    await openProduction(page)
    await page.getByTestId('task-filter-phase').selectOption('3') // asset readiness
    const kinds = await rows(page).evaluateAll((els) => els.map((e) => e.getAttribute('data-task-id')!.split('-')[1]))
    expect(kinds.length).toBeGreaterThan(0)
    expect(kinds.every((k) => k === 'assetAudio' || k === 'assetCharacter')).toBe(true)
    await page.getByTestId('task-filter-phase').selectOption('all')

    await page.getByTestId('task-filter-source').selectOption('character')
    const chars = await rows(page).evaluateAll((els) => els.map((e) => e.getAttribute('data-task-id')!))
    expect(chars.length).toBeGreaterThan(0)
    expect(chars.every((id) => /^T-(character|assetCharacter)-/.test(id))).toBe(true)
    await page.getByTestId('task-filter-source').selectOption('all')

    await page.getByTestId('task-filter-readiness').selectOption('needsInfo')
    const needs = await rows(page).evaluateAll((els) => els.map((e) => e.getAttribute('data-readiness')))
    expect(needs.length).toBeGreaterThan(0)
    expect(needs.every((r) => r === 'needsInfo')).toBe(true)
    await page.getByTestId('task-filter-readiness').selectOption('blocked')
    await expect(row(page, 'T-audio-s_cottage')).toBeVisible()
    await page.getByTestId('task-filter-readiness').selectOption('ready')
    await expect(row(page, 'T-level-s_cottage')).toBeVisible()
    await expect(row(page, 'T-audio-s_cottage')).toHaveCount(0)
    // combine with search
    await page.getByTestId('task-search').fill('cottage')
    await expect(rows(page).first()).toBeVisible()
  })

  test('selecting a task shows readiness, missing requirements and navigates dependencies in both directions', async ({ page }) => {
    await openProduction(page)
    await row(page, 'T-audio-s_cottage').click()
    await expect(page.getByTestId('task-id')).toHaveText('T-audio-s_cottage')
    await expect(page.getByTestId('task-details').locator('[data-readiness="blocked"]').first()).toBeVisible()
    await expect(page.getByTestId('task-impl')).toContainText('Implementation status: unknown')
    await expect(page.getByTestId('task-blockedby')).toContainText('T-assetAudio-s_cottage')
    await page.getByTestId('task-dep').filter({ hasText: 'T-assetAudio-s_cottage' }).click()
    await expect(page.getByTestId('task-id')).toHaveText('T-assetAudio-s_cottage')
    await expect(page.getByTestId('task-details').locator('[data-readiness="needsInfo"]').first()).toBeVisible()
    await expect(page.getByTestId('task-missing')).toContainText('TBD — audio asset reference')
    await expect(page.getByTestId('task-dependents')).toContainText('T-audio-s_cottage')
    await page.getByTestId('task-dependent').filter({ hasText: 'T-audio-s_cottage' }).click()
    await expect(page.getByTestId('task-id')).toHaveText('T-audio-s_cottage')
    await expect(row(page, 'T-audio-s_cottage')).toHaveAttribute('aria-pressed', 'true')
  })

  test('source links open the graph content (scene, logic node, transition)', async ({ page }) => {
    await openProduction(page)
    await row(page, 'T-level-s_fog').click()
    await page.getByTestId('task-source').filter({ hasText: 's_fog' }).click()
    await expect(page.locator('.react-flow__node[data-id="s_fog"]')).toHaveClass(/selected/)
    await expect(page.getByLabel('Title').first()).toHaveValue('Fog Road')

    await tab(page, 'Production').click()
    await row(page, 'T-random-rnd_door').click()
    await page.locator('[data-testid="task-source"][data-source-id="rnd_door"]').click()
    await expect(page.locator('.react-flow__node[data-id="rnd_door"]')).toHaveClass(/selected/)

    await tab(page, 'Production').click()
    await row(page, 'T-transition-s_cottage-e1').click()
    await page.locator('[data-testid="task-source"][data-source-kind="transition"]').click()
    await expect(page.locator('.react-flow__node').first()).toBeVisible()
    await expect(page.locator('.inspector')).toContainText(/Step outside|Connection|Transition/i)
  })

  test('Unreal and Unity details differ: authored reference versus proposal', async ({ page }) => {
    await openProduction(page)
    await row(page, 'T-level-s_cottage').click()
    await page.getByTestId('task-details').locator('summary', { hasText: 'Preview brief' }).click()
    const brief = page.getByTestId('task-brief-preview')
    await expect(brief).toContainText('/Game/Maps/L_Cottage (authored reference, existence unverified)')
    await expect(brief).not.toContainText('Assets/Scenes')
    await page.getByTestId('engine-unity').click()
    await expect(page.getByTestId('task-id')).toHaveText('T-level-s_cottage') // ids do not change with the engine
    await expect(brief).toContainText('TBD — proposal: Assets/Scenes/SCottage.unity')
    await expect(brief).not.toContainText('/Game/')
    await expect(page.getByTestId('task-confirm')).toContainText('Unity scene path is a proposal')
  })

  test('downloads the implementation brief for the selected task', async ({ page }) => {
    await openProduction(page)
    await row(page, 'T-sequence-seq_break').click()
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('task-brief-download').click()])
    expect(dl.suggestedFilename()).toBe('brief-unreal-T-sequence-seq_break.md')
    const text = readFileSync((await dl.path())!, 'utf8')
    expect(text).toMatch(/^# Implementation brief — T-sequence-seq_break/)
    for (const h of ['Project, engine and task', 'Goal and scope', 'Authored facts (authoritative)', 'Ordered implementation steps', 'Acceptance tests / Definition of Done', 'Explicit exclusions']) expect(text).toContain(`## ${h}`)
    expect(text.indexOf('Then 0:')).toBeLessThan(text.indexOf('Then 1:'))
    expect(text).toContain('Delay "Held breath" (dly_beat) 3 s')
    await page.getByTestId('engine-unity').click()
    await row(page, 'T-random-rnd_door').click()
    const [dl2] = await Promise.all([page.waitForEvent('download'), page.getByTestId('task-brief-download').click()])
    expect(dl2.suggestedFilename()).toBe('brief-unity-T-random-rnd_door.md')
    expect(readFileSync((await dl2.path())!, 'utf8')).toContain('A 60% (Door opens) / B 40% (Door stays shut)')
  })

  test('copies the coding agent prompt (clipboard granted) and shows it in the preview', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await openProduction(page)
    await row(page, 'T-assetAudio-s_fog').click()
    await page.getByTestId('task-prompt-copy').click()
    await expect(page.getByTestId('plan-status')).toContainText('Coding agent prompt copied')
    const text = await page.evaluate(() => navigator.clipboard.readText())
    expect(text).toContain('inside the TARGET Unreal Engine 5.x')
    expect(text).toContain('Implement ONLY this task')
    expect(text).toContain('T-assetAudio-s_fog')
    expect(text).toContain('Missing essential inputs (do NOT fabricate them')
    expect(text).not.toContain('T-assetAudio-s_cottage')
    await page.getByTestId('task-details').locator('summary', { hasText: 'Preview prompt' }).click()
    await expect(page.getByTestId('task-prompt-preview')).toContainText('Implement ONLY this task')
  })

  test('clipboard denied: clear feedback and the prompt stays available in the preview', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'clipboard', { configurable: true, get: () => ({ writeText: () => Promise.reject(new DOMException('blocked', 'NotAllowedError')) }) })
    })
    await openProduction(page)
    await row(page, 'T-level-s_cottage').click()
    await page.getByTestId('task-prompt-copy').click()
    await expect(page.getByTestId('plan-status')).toContainText('blocked clipboard access')
    await page.getByTestId('task-details').locator('summary', { hasText: 'Preview prompt' }).click()
    await expect(page.getByTestId('task-prompt-preview')).toContainText('T-level-s_cottage')
  })

  test('selection and filters are session-only: no project change, no undo entry, no storage write', async ({ page }) => {
    await openProduction(page)
    const before = await page.evaluate(() => JSON.stringify(Object.entries(localStorage).sort()))
    await page.getByTestId('task-filter-readiness').selectOption('needsInfo')
    await row(page, 'T-assetAudio-s_cottage').click()
    await page.getByTestId('task-search').fill('cottage')
    await expect(page.getByTestId('undo-btn')).toBeDisabled()
    await expect.poll(() => page.evaluate(() => JSON.stringify(Object.entries(localStorage).sort()))).toBe(before)
  })

  test('app-owned context menu on explorer rows and inputs', async ({ page }) => {
    await openProduction(page)
    await page.evaluate(() => {
      const w = window as unknown as { __ctx: boolean[] }
      w.__ctx = []
      window.addEventListener('contextmenu', (e) => w.__ctx.push(e.defaultPrevented))
    })
    await row(page, 'T-level-s_cottage').click({ button: 'right' })
    await expect(menu(page)).toHaveAttribute('aria-label', 'Application menu')
    await page.keyboard.press('Escape')
    await page.getByTestId('task-search').click({ button: 'right' })
    await expect(menu(page)).toHaveAttribute('aria-label', 'Text actions')
    await page.keyboard.press('Escape')
    await page.getByTestId('task-details').click({ button: 'right', position: { x: 5, y: 5 } })
    await expect(menu(page)).toHaveCount(1)
    expect((await page.evaluate(() => (window as unknown as { __ctx: boolean[] }).__ctx)).every(Boolean)).toBe(true)
  })

  test('Turkish interface', async ({ page }) => {
    await openProduction(page)
    await page.getByTestId('lang-tr').click()
    await expect(page.getByTestId('task-explorer')).toContainText('Görev gezgini')
    await row(page, 'T-assetAudio-s_cottage').click()
    await expect(page.getByTestId('task-impl')).toContainText('Uygulama durumu: bilinmiyor')
    await expect(page.getByTestId('task-missing')).toContainText('TBD — ses varlığı referansı')
    await expect(page.getByTestId('task-brief-download')).toContainText('Uygulama özetini indir')
    await page.getByTestId('task-filter-readiness').selectOption('blocked')
    await expect(row(page, 'T-audio-s_cottage')).toBeVisible()
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('task-brief-download').click()])
    expect(readFileSync((await dl.path())!, 'utf8')).toContain('## Yazılmış gerçekler (esas alınır)')
  })

  test('390 px layout: no horizontal overflow, filters and actions reachable', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openProduction(page)
    await page.getByTestId('task-search').scrollIntoViewIfNeeded()
    await row(page, 'T-level-s_cottage').click()
    await expect(page.getByTestId('task-brief-download')).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow).toBeLessThanOrEqual(0)
    for (const id of ['task-brief-download', 'task-prompt-copy', 'task-filter-readiness']) {
      const box = (await page.getByTestId(id).boundingBox())!
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(390)
    }
  })

  test('legacy sample and incomplete data are planned, never hidden', async ({ page }) => {
    await openProduction(page, false)
    const total = await rows(page).count()
    expect(total).toBeGreaterThan(10)
    await page.getByTestId('task-filter-source').selectOption('scene')
    await expect(row(page, 'T-verifyEnding-s_end_free')).toBeVisible()
    await expect(row(page, 'T-verifyEnding-s_end_trapped')).toBeVisible()
  })
})
