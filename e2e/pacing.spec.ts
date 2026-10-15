import { expect, test, type Page } from '@playwright/test'
import { openApp } from './helpers'

const LET_GO = ['Enter apartment', 'Follow the lullaby', 'Open the closet', 'Close eyes & count', 'Accept the truth']
const go = async (page: Page, ...labels: string[]) => {
  for (const l of labels) await page.getByTestId('sim-option').filter({ hasText: l }).click()
}
const panel = (page: Page) => page.getByTestId('pacing-panel')
const findings = (page: Page) => page.getByTestId('pacing-finding')
const stat = (page: Page, key: string) => panel(page).locator(`[data-stat="${key}"] .sim-stat-value`)

test.describe('pacing analysis', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page)
    await page.getByRole('button', { name: 'Simulator' }).click()
    await expect(page.getByTestId('sim-current-title')).toBeVisible()
  })

  test('shows the overview and neutral findings for a finished route', async ({ page }) => {
    await go(page, ...LET_GO)
    await expect(panel(page)).toContainText('not a score and not a prediction of player fear')
    await expect(stat(page, 'events')).toHaveText('12')
    await expect(stat(page, 'perMinute')).toHaveText('1.1')
    await expect(stat(page, 'high')).toHaveText('3')
    await expect(stat(page, 'hypothetical')).toHaveText('0')
    await expect(stat(page, 'longest')).toHaveText('7:23–9:14')
    await expect(page.getByTestId('pacing-kinds').locator('[data-kind]')).toHaveCount(6)
    await expect(page.getByTestId('pacing-unfinished')).toHaveCount(0)

    await expect(findings(page)).toHaveCount(4)
    expect(await findings(page).evaluateAll((els) => els.map((e) => e.getAttribute('data-category')))).toEqual(['escalation', 'escalation', 'silence', 'silence'])
    expect(await findings(page).evaluateAll((els) => els.map((e) => [e.getAttribute('data-start'), e.getAttribute('data-end')]))).toEqual([
      ['106', '186'],
      ['375', '443'],
      ['443', '554'],
      ['554', '665'],
    ])
    await expect(findings(page).first()).toContainText('1:46–3:06')
    await expect(findings(page).first()).toContainText('3 consecutive events with rising intensity (3 → 8/10)')
    await expect(findings(page).nth(3)).toContainText('last 111 s of the finished route')
    await expect(findings(page).first()).toHaveAttribute('data-severity', 'informational')
  })

  test('selecting a finding highlights its events and exact time range', async ({ page }) => {
    await go(page, ...LET_GO)
    const highlighted = page.locator('[data-testid="sim-marker"][data-highlighted="true"]')
    await expect(highlighted).toHaveCount(0)
    await expect(page.getByTestId('pacing-range')).toHaveCount(0)

    await findings(page).first().click()
    await expect(findings(page).first()).toHaveAttribute('aria-pressed', 'true')
    await expect(highlighted).toHaveCount(3)
    await expect(page.locator('[data-testid="sim-event"][data-highlighted="true"]')).toHaveCount(3)
    await expect(page.getByTestId('pacing-range')).toHaveCount(1)
    await expect(page.locator('[data-testid="sim-event"][data-highlighted="true"]').first()).toContainText('Music box starts')

    await findings(page).nth(1).click() // switches the highlight
    await expect(highlighted).toHaveCount(3)
    await expect(page.locator('[data-testid="sim-event"][data-highlighted="true"]').first()).toContainText('Footsteps behind')

    await findings(page).nth(1).click() // toggles it off
    await expect(highlighted).toHaveCount(0)
    await expect(page.getByTestId('pacing-range')).toHaveCount(0)
  })

  test('flags findings that depend on assumed transitions and on unfinished routes', async ({ page }) => {
    await go(page, ...LET_GO)
    await expect(findings(page).nth(0).locator('[data-dep="assumed"]')).toHaveCount(0) // reached without a conditional transition
    await expect(findings(page).nth(1).locator('[data-dep="assumed"]')).toHaveText('Depends on assumed transitions')
    await expect(findings(page).nth(2).locator('[data-dep="assumed"]')).toHaveCount(1)
  })

  test('updates immediately when the route changes', async ({ page }) => {
    await expect(page.getByTestId('pacing-empty')).toContainText('No pacing patterns matched') // start scene only
    await expect(stat(page, 'events')).toHaveText('2')
    await go(page, ...LET_GO)
    await expect(findings(page)).toHaveCount(4)

    await page.getByTestId('sim-back').click() // memory scene, route no longer finished
    await expect(findings(page)).toHaveCount(3)
    await expect(page.getByTestId('pacing-unfinished')).toBeVisible()
    await expect(page.getByTestId('pacing-panel').locator('[data-category="silence"]')).toHaveCount(1)

    await go(page, 'Accept the truth')
    await expect(findings(page)).toHaveCount(4)
    await page.getByTestId('sim-restart').click()
    await expect(findings(page)).toHaveCount(0)
    await expect(stat(page, 'events')).toHaveText('2')
  })

  test('thresholds are explained and the adjustable ones apply immediately', async ({ page }) => {
    await go(page, ...LET_GO)
    await page.getByText('Thresholds and assumptions', { exact: true }).click()
    const th = page.getByTestId('pacing-thresholds')
    await expect(th).toContainText('at least 4 events within 20 s')
    await expect(th).toContainText('a gap of at least 90 s')
    await expect(th).toContainText('All boundaries are inclusive')
    await page.getByTestId('pacing-silence-min').locator('input').fill('200')
    await expect(page.locator('[data-testid="pacing-finding"][data-category="silence"]')).toHaveCount(0)
    await expect(findings(page)).toHaveCount(2)
    await expect(th).toContainText('a gap of at least 200 s')
  })

  test('is localized and keeps the route when the language changes', async ({ page }) => {
    await go(page, ...LET_GO)
    await page.getByTestId('lang-tr').click()
    await expect(panel(page)).toContainText('Korku ritmi analizi')
    await expect(findings(page)).toHaveCount(4)
    await expect(findings(page).first()).toContainText('Tırmanma dizisi')
    await expect(findings(page).nth(2)).toContainText('Tetikleyicisiz aralık')
    await expect(findings(page).first()).toContainText('yoğunluğu artan 3 ardışık olay')
    await expect(panel(page)).toContainText('bir puan değildir')
    await expect(page.getByTestId('sim-route-step')).toHaveCount(6)
    await page.getByTestId('lang-en').click()
    await expect(panel(page)).toContainText('Pacing analysis')
  })

  test('is isolated per project and never touches project history or saving', async ({ page }) => {
    await go(page, ...LET_GO)
    await findings(page).first().click()
    await expect(page.getByTestId('undo-btn')).toBeDisabled()
    await expect(page.getByTestId('save-badge')).not.toContainText(/Saving/)

    await page.getByTestId('projects-btn').click()
    await page.getByTestId('library-new').click()
    await expect(page.getByTestId('pacing-empty')).toContainText('Not enough planned events (at least 2)')
    await expect(findings(page)).toHaveCount(0)

    await page.getByTestId('projects-btn').click()
    await page.getByTestId('library-row').filter({ hasText: 'The Hollow Apartment' }).getByTestId('library-open').click()
    await expect(page.getByTestId('sim-route-step')).toHaveCount(1)
    await expect(findings(page)).toHaveCount(0)
    await expect(page.locator('[data-testid="sim-marker"][data-highlighted="true"]')).toHaveCount(0)
  })
})
