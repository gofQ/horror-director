import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { openApp } from './helpers'

const tab = (page: Page, name: string) => page.locator('.tabs button').filter({ hasText: name })

async function addSample(page: Page) {
  await page.getByTestId('projects-btn').click()
  await page.getByTestId('library-add-sample').click()
  await expect(page.getByTestId('library-dialog')).toBeHidden()
  await expect(page.locator('.project-name')).toContainText('The Hollow Village')
}
async function download(page: Page, testId: string) {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId(testId).click()])
  return { name: dl.suggestedFilename(), text: readFileSync((await dl.path())!, 'utf8') }
}

test.describe('production workspace', () => {
  test('is a sixth tab with an engine selector and a readable plan preview', async ({ page }) => {
    await openApp(page)
    await addSample(page)
    await tab(page, 'Production').click()
    await expect(page.getByTestId('production-view')).toBeVisible()
    await expect(page.getByTestId('engine-unreal')).toHaveAttribute('aria-pressed', 'true')
    const preview = page.getByTestId('plan-preview')
    await expect(preview).toContainText('Production plan — Unreal Engine 5.x')
    await expect(preview.locator('h3')).toHaveCount(14)
    await expect(preview).toContainText('GameInstance')
    await expect(preview).toContainText('T-sequence-seq_break')
    await expect(preview).toContainText('Then 0 subflow, Return 0, Then 1 subflow, Return 1, then Completed')
    await expect(preview).not.toContainText('ScriptableObject')

    await page.getByTestId('engine-unity').click()
    await expect(page.getByTestId('engine-unity')).toHaveAttribute('aria-pressed', 'true')
    await expect(preview).toContainText('Production plan — Unity 6')
    await expect(preview).toContainText('ScriptableObject')
    await expect(preview).toContainText('Cinemachine')
    await expect(preview).not.toContainText('MetaSound')
  })

  test('downloads the Markdown plan and the task CSV for both engines', async ({ page }) => {
    await openApp(page)
    await addSample(page)
    await tab(page, 'Production').click()

    const md = await download(page, 'plan-download-md')
    expect(md.name).toBe('production-plan-unreal.md')
    expect(md.text).toMatch(/^# Production plan — Unreal Engine 5\.x/)
    expect([...md.text.matchAll(/^## (\d+)\. /gm)].map((m) => Number(m[1]))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14])
    expect(md.text).toContain('performs no Unreal or Unity runtime integration')

    await page.getByTestId('engine-unity').click()
    const csv = await download(page, 'plan-download-csv')
    expect(csv.name).toBe('production-tasks-unity.csv')
    const lines = csv.text.split('\r\n').filter(Boolean)
    expect(lines[0]).toMatch(/^Task ID,Order,Phase,Kind,Title,/)
    expect(lines.length).toBeGreaterThan(20)
    expect(lines.some((l) => l.startsWith('T-sequence-seq_break,'))).toBe(true)

    const md2 = await download(page, 'plan-download-md')
    expect(md2.name).toBe('production-plan-unity.md')
    expect(md2.text).toContain('ScriptableObject')
    const csv2 = await (async () => {
      await page.getByTestId('engine-unreal').click()
      return download(page, 'plan-download-csv')
    })()
    expect(csv2.name).toBe('production-tasks-unreal.csv')
  })

  test('is read-only: no undo entry, no unsaved state and the project is unchanged', async ({ page }) => {
    await openApp(page)
    await addSample(page)
    const before = await page.evaluate(() => JSON.stringify(Object.entries(localStorage).sort()))
    await tab(page, 'Production').click()
    await page.getByTestId('engine-unity').click()
    await page.getByTestId('engine-unreal').click()
    await expect(page.getByTestId('undo-btn')).toBeDisabled()
    await expect(page.getByTestId('redo-btn')).toBeDisabled()
    await expect.poll(() => page.evaluate(() => JSON.stringify(Object.entries(localStorage).sort()))).toBe(before)
  })

  test('plans the legacy sample too and surfaces TBD / gaps instead of omitting them', async ({ page }) => {
    await openApp(page)
    await tab(page, 'Production').click()
    await expect(page.getByTestId('plan-preview')).toContainText('TBD')
    await expect(page.getByTestId('plan-preview')).toContainText('Apartment Hallway')
  })

  test('Turkish interface and the 390 px layout', async ({ page }) => {
    await openApp(page)
    await addSample(page)
    await page.getByTestId('lang-tr').click()
    await tab(page, 'Üretim').click()
    await expect(page.getByTestId('plan-preview')).toContainText('Üretim planı — Unreal Engine 5.x')
    await expect(page.getByTestId('plan-preview')).toContainText('Tasarım varsayımları')
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(page.getByTestId('plan-download-md')).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow).toBeLessThanOrEqual(0)
    const box = await page.getByTestId('plan-download-csv').boundingBox()
    expect(box!.x + box!.width).toBeLessThanOrEqual(390)
  })
})
