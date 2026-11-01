import { expect, test, type Page } from '@playwright/test'
import { openApp } from './helpers'

const menu = (page: Page) => page.getByTestId('context-menu')
const tab = (page: Page, name: string) => page.locator('.tabs button').filter({ hasText: name })
const node = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`)
const sceneCount = (page: Page) => page.locator('.react-flow__node').count()

async function addShowcase(page: Page) {
  await page.getByTestId('projects-btn').click()
  await page.getByTestId('library-add-sample').click()
  await expect(page.getByTestId('library-dialog')).toBeHidden()
  await page.getByTestId('sample-guide-hide').click()
}

test.describe('audit fixes', () => {
  test('Delete / Backspace inside a context menu never deletes the graph selection', async ({ page }) => {
    await openApp(page)
    const before = await sceneCount(page)
    const first = page.locator('.react-flow__node').first()
    await first.click({ button: 'right', position: { x: 20, y: 15 } })
    await expect(menu(page)).toBeVisible()
    await page.keyboard.press('Backspace')
    await page.keyboard.press('Delete')
    await expect.poll(() => sceneCount(page)).toBe(before)
    await page.keyboard.press('Escape')
    await expect(menu(page)).toHaveCount(0)
    // on the canvas the key still deletes the selection, as one undoable step
    await first.click({ position: { x: 20, y: 15 } })
    await page.keyboard.press('Delete')
    await expect.poll(() => sceneCount(page)).toBe(before - 1)
    await page.getByTestId('undo-btn').click()
    await expect.poll(() => sceneCount(page)).toBe(before)
  })

  test('Delete inside a dialog (Shot planner) does not delete the scene behind it', async ({ page }) => {
    await openApp(page)
    await addShowcase(page)
    const before = await sceneCount(page)
    await node(page, 's_cottage').click({ button: 'right', position: { x: 20, y: 15 } })
    await menu(page).getByTestId('ctx-item').filter({ hasText: /Shot/ }).first().click()
    await expect(page.locator('.modal')).toBeVisible()
    await page.locator('.modal button').first().focus()
    await page.keyboard.press('Delete')
    await page.keyboard.press('Backspace')
    await expect.poll(() => sceneCount(page)).toBe(before)
    await expect(node(page, 's_cottage')).toBeAttached()
  })

  test('context menu keyboard focus starts on the first enabled item when the first one is disabled', async ({ page }) => {
    await openApp(page)
    // the global menu: its first item ("Copy text") is disabled when nothing is selected
    const box = await page.locator('.topbar .brand').boundingBox()
    await page.mouse.click(box!.x + 4, box!.y + box!.height / 2, { button: 'right' })
    await expect(menu(page)).toBeVisible()
    const items = menu(page).getByTestId('ctx-item')
    await expect(items.first()).toHaveAttribute('aria-disabled', 'true')
    const enabledIds = await items.evaluateAll((els) => els.filter((e) => e.getAttribute('aria-disabled') !== 'true').map((e) => e.getAttribute('data-id')))
    expect(enabledIds.length).toBeGreaterThan(2)
    const focused = () => page.evaluate(() => document.activeElement?.getAttribute('data-id'))
    await expect.poll(focused).toBe(enabledIds[0])
    await page.keyboard.press('ArrowDown')
    await expect.poll(focused).toBe(enabledIds[1]) // used to stay on the first item
    await page.keyboard.press('ArrowUp')
    await expect.poll(focused).toBe(enabledIds[0])
    // only the focused row is in the tab order; the disabled row is not
    await expect(items.first()).toHaveAttribute('tabindex', '-1')
  })

  test('Insert IF is disabled on connections inside a Sequence stage', async ({ page }) => {
    await openApp(page)
    await addShowcase(page)
    const edge = page.locator('.react-flow__edge[data-id="e18"]')
    await expect(edge).toBeAttached()
    await edge.dispatchEvent('contextmenu', { bubbles: true, clientX: 600, clientY: 400, button: 2 })
    await expect(menu(page)).toBeVisible()
    const insert = menu(page).locator('[data-testid="ctx-item"][data-id="insert"]')
    await expect(insert).toHaveAttribute('aria-disabled', 'true')
    await expect(insert).toContainText('Not inside a Sequence stage')
  })

  test('lazy-loaded views open in both languages without page errors', async ({ page }) => {
    const errors = await openApp(page)
    for (const lang of ['tr', 'en'] as const) {
      await page.getByTestId(`lang-${lang}`).click()
      for (const i of [1, 2, 3, 4, 5]) {
        await page.locator('.tabs button').nth(i).click()
        await expect(page.getByTestId('view-loading')).toHaveCount(0)
        await expect(page.locator('.main')).not.toBeEmpty()
      }
      await page.locator('.tabs button').nth(0).click()
    }
    await tab(page, 'Production').click()
    await expect(page.getByTestId('production-view')).toBeVisible()
    await page.getByTestId('projects-btn').click()
    await expect(page.getByTestId('library-dialog')).toBeVisible()
    expect(errors).toEqual([])
  })
})
