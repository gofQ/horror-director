import { expect, test, type Page } from '@playwright/test'
import { nodes, openApp, waitSaved } from './helpers'

const BASE = ['Enter apartment', 'Follow the lullaby', 'Open the closet', 'Close eyes & count']
const go = async (page: Page, ...labels: string[]) => {
  for (const l of labels) await page.getByTestId('sim-option').filter({ hasText: l }).click()
}
const openSim = async (page: Page) => {
  await page.getByRole('button', { name: /Simulator|Simülatör/ }).click()
  await expect(page.getByTestId('sim-current-title')).toBeVisible()
}
const panel = (page: Page) => page.getByTestId('compare-panel')
const cell = (page: Page, row: string, col: 'a' | 'b' | 'delta') => panel(page).locator(`[data-row="${row}"] [data-col="${col}"]`)
const count = (page: Page, id: string) => panel(page).getByTestId(id).getAttribute('data-count')

test.describe('route comparison', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page)
    await openSim(page)
  })

  test('pins Route A, builds Route B with a different ending and compares them', async ({ page }) => {
    await expect(panel(page)).toHaveAttribute('data-state', 'empty')
    await go(page, ...BASE, 'Accept the truth')
    await page.getByTestId('sim-pin').click()
    await expect(panel(page)).not.toHaveAttribute('data-state', 'empty')
    await expect(page.getByTestId('sim-pin')).toContainText('Replace Route A')

    await page.getByTestId('sim-restart').click()
    await go(page, ...BASE, 'Refuse the truth')

    await expect(panel(page)).toHaveAttribute('data-state', 'ok')
    await expect(cell(page, 'duration', 'a')).toHaveText('11:05')
    await expect(cell(page, 'duration', 'b')).toHaveText('10:50')
    await expect(cell(page, 'duration', 'delta')).toHaveText('−0:15')
    await expect(cell(page, 'visits', 'delta')).toHaveText('0')
    await expect(cell(page, 'status', 'a')).toContainText('Ending reached')
    await expect(page.getByTestId('compare-divergence')).toContainText('first 5 step(s)')
    await expect(page.getByTestId('compare-divergence')).toContainText('Accept the truth')
    await expect(page.getByTestId('compare-divergence')).toContainText('Refuse the truth')
    expect(await count(page, 'compare-scenes-a')).toBe('1')
    expect(await count(page, 'compare-scenes-b')).toBe('1')
    expect(await count(page, 'compare-transitions-a')).toBe('1')
    await expect(panel(page).locator('[data-testid="compare-event"][data-scope="shared"]').first()).toBeVisible()
    await expect(panel(page).getByTestId('compare-divergence-line')).toHaveCount(1)
    // no ranking or score anywhere in the panel
    await expect(panel(page)).not.toContainText(/best route|score:/i)

    // Route A stays pinned while Route B is edited
    await page.getByTestId('sim-back').click()
    await expect(cell(page, 'duration', 'a')).toHaveText('11:05')
    await expect(cell(page, 'duration', 'b')).not.toHaveText('10:50')
    await expect(panel(page)).toHaveAttribute('data-state', 'ok')

    // markers: shared = circle, exclusive = diamond; keyboard selects and shows details
    const marker = panel(page).locator('[data-testid="compare-marker"][data-scope="shared"]').first()
    await marker.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('compare-detail')).toContainText('in both routes')

    // clear
    await page.getByTestId('compare-clear').click()
    await expect(panel(page)).toHaveAttribute('data-state', 'empty')
  })

  test('equal routes are reported as identical with zero deltas', async ({ page }) => {
    await go(page, ...BASE, 'Accept the truth')
    await page.getByTestId('sim-pin').click()
    await expect(panel(page)).toHaveAttribute('data-state', 'identical')
    await expect(page.getByTestId('compare-identical')).toBeVisible()
    await expect(cell(page, 'duration', 'delta')).toHaveText('0:00')
    await expect(cell(page, 'events', 'delta')).toHaveText('0')
    expect(await count(page, 'compare-events-a')).toBe('0')
    expect(await count(page, 'compare-events-b')).toBe('0')
  })

  test('a graph edit that invalidates Route A is reported, never shown as a complete comparison', async ({ page }) => {
    await go(page, ...BASE, 'Accept the truth')
    await page.getByTestId('sim-pin').click()
    await page.getByTestId('sim-restart').click()
    await page.getByRole('button', { name: 'Scene Graph' }).click()
    await page.locator('.react-flow__node[data-id="s_end_free"]').click({ position: { x: 20, y: 20 } })
    await page.keyboard.press('Delete')
    await expect(nodes(page)).toHaveCount(7)
    await waitSaved(page)
    await openSim(page)
    await expect(panel(page)).toHaveAttribute('data-state', 'incomplete')
    await expect(page.getByTestId('compare-warn-a')).toContainText('1 step(s) of Route A are no longer valid')
    await expect(page.getByTestId('compare-warn-a')).toContainText('incomplete')
  })

  test('keeps the comparison when switching language and localizes it', async ({ page }) => {
    await go(page, ...BASE, 'Accept the truth')
    await page.getByTestId('sim-pin').click()
    await page.getByTestId('sim-restart').click()
    await go(page, ...BASE, 'Refuse the truth')
    await page.getByTestId('lang-tr').click()
    await expect(panel(page)).toContainText('Rota karşılaştırması')
    await expect(panel(page)).toContainText('Fark (B − A)')
    await expect(panel(page)).toContainText('İlk ayrışma noktası')
    await expect(cell(page, 'duration', 'delta')).toHaveText('−0:15')
    await expect(page.getByTestId('sim-pin')).toContainText('Rota A’yı mevcut rotayla değiştir')
    await page.getByTestId('lang-en').click()
    await expect(panel(page)).toContainText('Route comparison')
    await expect(cell(page, 'duration', 'delta')).toHaveText('−0:15')
  })

  test('works on a narrow screen without horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await go(page, ...BASE, 'Accept the truth')
    await page.getByTestId('sim-pin').click()
    await page.getByTestId('sim-restart').click()
    await go(page, ...BASE, 'Refuse the truth')
    await expect(panel(page)).toHaveAttribute('data-state', 'ok')
    await panel(page).scrollIntoViewIfNeeded()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(1)
    await expect(panel(page).getByTestId('compare-chart')).toBeVisible()
    await expect(cell(page, 'duration', 'delta')).toHaveText('−0:15')
  })

  test('switching projects resets the comparison', async ({ page }) => {
    await go(page, ...BASE, 'Accept the truth')
    await page.getByTestId('sim-pin').click()
    await expect(panel(page)).not.toHaveAttribute('data-state', 'empty')
    await page.getByTestId('projects-btn').click()
    await page.getByTestId('library-new').click()
    await expect(page.getByTestId('sim-current-title')).toHaveText('Opening')
    await expect(panel(page)).toHaveAttribute('data-state', 'empty')
    await page.getByTestId('projects-btn').click()
    await page.getByTestId('library-row').filter({ hasText: 'The Hollow Apartment' }).getByTestId('library-open').click()
    await expect(page.getByTestId('sim-current-title')).toHaveText('Apartment Hallway')
    await expect(panel(page)).toHaveAttribute('data-state', 'empty')
    await expect(page.getByTestId('undo-btn')).toBeDisabled()
  })
})
