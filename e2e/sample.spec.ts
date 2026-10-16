import { expect, test, type Page } from '@playwright/test'
import { openApp } from './helpers'

const tab = (page: Page, name: string) => page.locator('.tabs button').filter({ hasText: name })
const rows = (page: Page) => page.getByTestId('library-row')

async function addSample(page: Page) {
  await page.getByTestId('projects-btn').click()
  await page.getByTestId('library-add-sample').click()
  await expect(page.getByTestId('library-dialog')).toBeHidden()
}

test.describe('complete sample project', () => {
  test('Add sample creates a NEW project and keeps the existing one', async ({ page }) => {
    await openApp(page)
    await page.getByTestId('projects-btn').click()
    await expect(rows(page)).toHaveCount(1)
    await page.getByTestId('library-add-sample').click()
    await page.getByTestId('projects-btn').click()
    await expect(rows(page)).toHaveCount(2)
    await expect(rows(page).filter({ hasText: 'The Hollow Apartment' })).toHaveCount(1)
    await expect(rows(page).filter({ hasText: 'The Hollow Village' })).toHaveCount(1)
    await page.getByTestId('library-add-sample').click()
    await page.getByTestId('projects-btn').click()
    await expect(rows(page)).toHaveCount(3)
  })

  test('shows every node family on the graph and the Explore guide', async ({ page }) => {
    await openApp(page)
    await addSample(page)
    for (const id of ['s_cottage', 's_cellar', 's_end_escape', 'evt_bell', 'dly_wait', 'rnd_door', 'if_expr', 'set_key', 'seq_break', 'ret_0', 'ret_1', 'note_guide']) {
      await expect(page.locator(`.react-flow__node[data-id="${id}"]`)).toBeAttached()
    }
    await expect(page.getByTestId('sample-guide')).toBeVisible()
    await expect(page.getByTestId('sample-guide')).toContainText('Undo / redo')
    await page.getByTestId('sample-guide-hide').click()
    await expect(page.getByTestId('sample-guide')).toBeHidden()
  })

  test('the guide is not shown for other projects', async ({ page }) => {
    await openApp(page)
    await expect(page.getByTestId('sample-guide')).toHaveCount(0)
  })

  test('has no analysis errors or warnings', async ({ page }) => {
    await openApp(page)
    await addSample(page)
    await tab(page, 'Analysis').click()
    await expect(page.locator('.issue.error, .issue.warning')).toHaveCount(0)
  })

  test('simulates a full route through the Sequence to an ending with a readable Flow Trace', async ({ page }) => {
    await openApp(page)
    await addSample(page)
    await tab(page, 'Simulator').click()
    const prefer = [/Way out earned/, /Close eyes/, /Door opens/, /Accept the truth/]
    for (let i = 0; i < 60; i++) {
      if ((await page.getByTestId('sim-status').getAttribute('data-status')) === 'ending') break
      const opts = page.getByTestId('sim-option')
      let target = opts.first()
      for (const p of prefer) {
        const hit = opts.filter({ hasText: p })
        if (await hit.count()) {
          target = hit.first()
          break
        }
      }
      await target.click()
    }
    await expect(page.getByTestId('sim-status')).toHaveAttribute('data-status', 'ending')
    await expect(page.getByTestId('sim-current-title')).toHaveText('Ending: Escape')
    const kinds = await page.getByTestId('flow-entry').evaluateAll((els) => els.map((e) => e.getAttribute('data-kind')))
    expect(kinds.filter((k) => ['sequenceStart', 'stageEnter', 'stageReturn', 'sequenceComplete'].includes(k!))).toEqual([
      'sequenceStart', 'stageEnter', 'stageReturn', 'stageEnter', 'stageReturn', 'sequenceComplete',
    ])
    expect(kinds).toContain('event')
    expect(kinds).toContain('delayStart')
    expect(kinds).toContain('delayEnd')
    await expect(page.locator('[data-testid="sim-flag"][data-flag="realityBroken"]')).toHaveAttribute('data-value', 'true')
    await expect(page.locator('[data-testid="sim-flag"][data-flag="foundKey"]')).toHaveAttribute('data-value', 'true')
  })

  test('flag changes visibly affect the IF: the shut door fails the condition', async ({ page }) => {
    await openApp(page)
    await addSample(page)
    await tab(page, 'Simulator').click()
    const pick = async (text: RegExp) => page.getByTestId('sim-option').filter({ hasText: text }).first().click()
    for (let i = 0; i < 12; i++) {
      if ((await page.getByTestId('sim-pending').count()) && (await page.getByTestId('sim-pending').getAttribute('data-kind')) === 'branch') break
      const shut = page.getByTestId('sim-option').filter({ hasText: /Door stays shut/ })
      if (await shut.count()) await shut.first().click()
      else await page.getByTestId('sim-option').first().click()
    }
    await expect(page.getByTestId('sim-pending')).toHaveAttribute('data-kind', 'branch')
    await expect(page.getByTestId('sim-evaluated')).toHaveAttribute('data-value', 'false')
    await expect(page.locator('[data-testid="sim-option"][data-logic="valid"]')).toContainText(/No key, no trust/)
    await pick(/No key, no trust/)
    await expect(page.getByTestId('sim-status')).toHaveAttribute('data-status', 'ending')
  })
})
