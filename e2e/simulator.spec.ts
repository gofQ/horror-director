import { expect, test, type Page } from '@playwright/test'
import { nodes, openApp, waitSaved } from './helpers'

const openSim = async (page: Page) => {
  await page.getByRole('button', { name: 'Simulator' }).click()
  await expect(page.getByTestId('sim-current-title')).toBeVisible()
}
const option = (page: Page, text: string) => page.getByTestId('sim-option').filter({ hasText: text })
const go = async (page: Page, ...labels: string[]) => {
  for (const l of labels) await option(page, l).click()
}
const stat = (page: Page, key: string) => page.locator(`[data-stat="${key}"] .sim-stat-value`)
const status = (page: Page) => page.getByTestId('sim-status')
const steps = (page: Page) => page.getByTestId('sim-route-step')

test.describe('story path simulator', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page)
    await openSim(page)
  })

  test('starts at the start scene with its outgoing transitions and an incomplete status', async ({ page }) => {
    await expect(page.getByTestId('sim-current-title')).toHaveText('Apartment Hallway')
    await expect(status(page)).toHaveAttribute('data-status', 'active')
    await expect(page.getByTestId('sim-option')).toHaveCount(1)
    await expect(option(page, 'Enter apartment')).toContainText('Hard cut')
    await expect(steps(page)).toHaveCount(1)
    await expect(page.getByTestId('sim-back')).toBeDisabled()
  })

  test('shows conditions as assumptions and plans branching to the "Let Go" ending', async ({ page }) => {
    await go(page, 'Enter apartment')
    await expect(page.getByTestId('sim-option')).toHaveCount(2) // branch: lullaby / blackout
    await expect(option(page, 'Follow the lullaby')).toContainText('Assumption: Music box inspected')
    await expect(option(page, 'Follow the lullaby')).toContainText('Reality → Dream')
    await go(page, 'Follow the lullaby', 'Open the closet', 'Close eyes & count', 'Accept the truth')
    await expect(status(page)).toHaveAttribute('data-status', 'ending')
    await expect(page.getByTestId('sim-current-title')).toHaveText('Ending: Let Go')
    await expect(steps(page)).toHaveCount(6)
    await expect(stat(page, 'duration')).toHaveText('11:05')
    await expect(stat(page, 'visits')).toHaveText('6')
    await expect(page.getByTestId('sim-option')).toHaveCount(0)
    await expect(page.locator('.sim-route')).toContainText('Assumption: Hold hand with Mara')
  })

  test('reaches the other ending through a different branch', async ({ page }) => {
    await go(page, 'Enter apartment', 'Follow the lullaby', 'Open the closet', 'Close eyes & count', 'Refuse the truth')
    await expect(status(page)).toHaveAttribute('data-status', 'ending')
    await expect(page.getByTestId('sim-current-title')).toHaveText('Ending: Forever Asleep')
    await expect(stat(page, 'duration')).toHaveText('10:50')
  })

  test('handles repeated scenes: the corridor self-loop stops at its limit while other options stay open', async ({ page }) => {
    await go(page, 'Enter apartment', 'Follow the lullaby', 'Open the closet')
    for (let i = 0; i < 4; i++) await go(page, 'Wrong door')
    await expect(steps(page)).toHaveCount(8)
    await expect(stat(page, 'repeats')).toHaveText('4')
    await expect(page.locator('.sim-route')).toContainText('Visit 5')
    await expect(option(page, 'Wrong door')).toBeDisabled()
    await expect(option(page, 'Wrong door')).toHaveAttribute('data-blocked', 'loopLimit')
    await expect(page.getByTestId('sim-warnings')).toContainText('reached its loop limit (4 repeat visits)')
    await expect(option(page, 'Close eyes & count')).toBeEnabled()
    await expect(status(page)).toHaveAttribute('data-status', 'active')

    // Back removes the last visit and re-enables the loop; Restart returns to the start
    await page.getByTestId('sim-back').click()
    await expect(steps(page)).toHaveCount(7)
    await expect(option(page, 'Wrong door')).toBeEnabled()
    await page.getByTestId('sim-restart').click()
    await expect(steps(page)).toHaveCount(1)
    await expect(page.getByTestId('sim-current-title')).toHaveText('Apartment Hallway')
  })

  test('stops at the configurable step cap with a clear warning', async ({ page }) => {
    await page.getByText('Limits', { exact: true }).click()
    await page.getByTestId('sim-step-cap').locator('input').fill('3')
    await go(page, 'Enter apartment', 'Follow the lullaby', 'Open the closet')
    await expect(status(page)).toHaveAttribute('data-status', 'stepLimit')
    await expect(page.getByTestId('sim-warnings')).toContainText('step limit of 3')
    for (const o of await page.getByTestId('sim-option').all()) await expect(o).toBeDisabled()
  })

  test('shows trigger markers across the route with clickable event details', async ({ page }) => {
    await go(page, 'Enter apartment')
    await expect(page.getByTestId('sim-band')).toHaveCount(2)
    await expect(page.getByTestId('sim-marker')).toHaveCount(5) // 2 in the hallway + 3 in the living room
    await expect(page.getByTestId('sim-event-detail')).toContainText('Select a marker')
    await page.getByTestId('sim-event').filter({ hasText: 'Music box starts' }).click()
    const detail = page.getByTestId('sim-event-detail')
    await expect(detail).toContainText('Music box starts')
    await expect(detail).toContainText('Living Room')
    await expect(detail).toContainText('1:46') // 90 s hallway + 1 s transition + 15 s
    await page.getByTestId('sim-marker').first().focus()
    await page.keyboard.press('Enter')
    await expect(detail).toContainText('Lights flicker')
    await expect(page.locator('.sim-disclaimer')).toContainText('not a measured fear or tension score')
  })

  test('keeps the route when switching language and localizes everything', async ({ page }) => {
    await go(page, 'Enter apartment')
    await page.getByTestId('lang-tr').click()
    await expect(page.getByRole('button', { name: 'Simülatör' })).toBeVisible()
    await expect(steps(page)).toHaveCount(2)
    await expect(page.getByTestId('sim-current-title')).toHaveText('Living Room') // project content is never translated
    await expect(status(page)).toContainText('Tamamlanmamış rota')
    await expect(option(page, 'Follow the lullaby')).toContainText('Varsayım: Music box inspected')
    await expect(page.getByTestId('sim-back')).toContainText('Geri')
    await page.getByTestId('lang-en').click()
    await expect(status(page)).toContainText('Incomplete route')
  })

  test('is isolated from the project: no history or save activity, and each project starts fresh', async ({ page }) => {
    await go(page, 'Enter apartment', 'Follow the lullaby')
    await expect(page.getByTestId('undo-btn')).toBeDisabled() // simulating never creates undo steps
    await expect(page.getByTestId('save-badge')).not.toContainText(/Saving/)

    await page.getByTestId('projects-btn').click()
    await page.getByTestId('library-new').click()
    await expect(page.getByTestId('sim-current-title')).toHaveText('Opening')
    await expect(steps(page)).toHaveCount(1)

    await page.getByTestId('projects-btn').click()
    await page.getByTestId('library-row').filter({ hasText: 'The Hollow Apartment' }).getByTestId('library-open').click()
    await expect(page.getByTestId('sim-current-title')).toHaveText('Apartment Hallway') // route reset on switch
    await expect(steps(page)).toHaveCount(1)
  })

  test('revalidates the route when the graph changes', async ({ page }) => {
    await go(page, 'Enter apartment')
    await expect(steps(page)).toHaveCount(2)
    await page.getByRole('button', { name: 'Scene Graph' }).click()
    await page.locator('.react-flow__node[data-id="s_living"]').click({ position: { x: 20, y: 20 } })
    await page.keyboard.press('Delete')
    await expect(nodes(page)).toHaveCount(7)
    await waitSaved(page)
    await openSim(page)
    await expect(steps(page)).toHaveCount(1)
    await expect(page.getByTestId('sim-invalidated')).toBeVisible()
    await expect(page.getByTestId('sim-current-title')).toHaveText('Apartment Hallway')
  })
})
