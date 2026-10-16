import { expect, test, type Page } from '@playwright/test'
import { openApp } from './helpers'

const tab = (page: Page, name: string) => page.locator('.tabs button').filter({ hasText: name })
const rows = (page: Page) => page.getByTestId('library-row')
const TR_LABEL = 'Türkçe Örnek Proje — Boş Köy'
const EN_LABEL = 'English Sample Project — The Hollow Village'
const TR_NAME = 'Boş Köy (Vitrin Örneği)'

async function add(page: Page, which: 'tr' | 'en') {
  await page.getByTestId('projects-btn').click()
  await page.getByTestId(which === 'tr' ? 'library-add-sample-tr' : 'library-add-sample').click()
  await expect(page.getByTestId('library-dialog')).toBeHidden()
}
const sceneTitle = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`)

test.describe('Turkish and English showcase samples', () => {
  test('both samples are offered with fixed labels in either UI language and create separate projects', async ({ page }) => {
    await openApp(page)
    for (const ui of ['en', 'tr'] as const) {
      await page.getByTestId(`lang-${ui}`).click()
      await page.getByTestId('projects-btn').click()
      await expect(page.getByTestId('library-add-sample-tr')).toHaveText(TR_LABEL)
      await expect(page.getByTestId('library-add-sample')).toHaveText(EN_LABEL)
      await page.keyboard.press('Escape')
      await expect(page.getByTestId('library-dialog')).toBeHidden()
    }
    await page.getByTestId('lang-en').click()
    await add(page, 'tr')
    await add(page, 'en')
    await page.getByTestId('projects-btn').click()
    await expect(rows(page)).toHaveCount(3) // the original project is untouched
    await expect(rows(page).filter({ hasText: 'The Hollow Apartment' })).toHaveCount(1)
    await expect(rows(page).filter({ hasText: TR_NAME })).toHaveCount(1)
    await expect(rows(page).filter({ hasText: 'The Hollow Village (Showcase)' })).toHaveCount(1)
  })

  test('the Turkish sample is fully Turkish: graph, Inspector, guide (under an English interface)', async ({ page }) => {
    await openApp(page)
    await add(page, 'tr')
    await expect(page.locator('.project-name')).toHaveText(TR_NAME)
    for (const [id, text] of [['s_cottage', 'Kulübede Sabah'], ['s_square', 'Köy Meydanı'], ['s_cellar', 'Kilise Mahzeni'], ['s_end_escape', 'Son: Kaçış'], ['rnd_door', 'Kapı açılır mı?'], ['if_expr', 'Elena çıkış yolunu hak etti mi?'], ['seq_break', 'Gerçeklik Kırılması'], ['note_guide', 'Buradan başla']] as const)
      await expect(sceneTitle(page, id)).toContainText(text)
    await expect(sceneTitle(page, 'if_free')).toContainText('Elena gerçeği kabul eder mi?')
    // the guide follows the sample's language, not the UI language
    await expect(page.getByTestId('sample-guide')).toContainText('Örneği keşfet')
    await expect(page.getByTestId('sample-guide')).toContainText('Kulübede Sabah')
    await expect(page.getByTestId('sample-guide')).toHaveAttribute('lang', 'tr')
    await page.getByTestId('sample-guide-hide').click() // the guide overlays the left of the canvas
    // Inspector shows the Turkish authored description
    await sceneTitle(page, 's_cottage').click({ position: { x: 20, y: 15 } })
    const areas = page.locator('textarea')
    await expect.poll(async () => (await areas.evaluateAll((els) => els.map((e) => (e as HTMLTextAreaElement).value))).join('|')).toContain('Elena çocukluğunun kulübesinde uyanır')
    // no English leftovers from the English sample on the canvas
    const canvas = await page.locator('.react-flow__node').allInnerTexts()
    expect(canvas.join('\n')).not.toMatch(/Cottage Morning|Village Square|Does the door open|Reality Break|Ending:/)
  })

  test('switching the interface language never changes either sample or its guide', async ({ page }) => {
    await openApp(page)
    await add(page, 'tr')
    for (const ui of ['tr', 'en', 'tr'] as const) {
      await page.getByTestId(`lang-${ui}`).click()
      await expect(page.locator('.project-name')).toHaveText(TR_NAME)
      await expect(sceneTitle(page, 's_cottage')).toContainText('Kulübede Sabah')
      await expect(page.getByTestId('sample-guide')).toContainText('Örneği keşfet')
    }
    await add(page, 'en')
    await expect(page.getByTestId('sample-guide')).toContainText('Explore the sample') // English sample under a Turkish UI
    await expect(sceneTitle(page, 's_cottage')).toContainText('Cottage Morning')
    await page.getByTestId('lang-en').click()
    await expect(sceneTitle(page, 's_cottage')).toContainText('Cottage Morning')
    // reload keeps both projects exactly as saved
    await page.reload()
    await expect(sceneTitle(page, 's_cottage')).toContainText('Cottage Morning')
    await page.getByTestId('projects-btn').click()
    await rows(page).filter({ hasText: TR_NAME }).getByTestId('library-open').click()
    await expect(sceneTitle(page, 's_cottage')).toContainText('Kulübede Sabah')
  })

  test('a full route through the Turkish sample reaches an ending with the Sequence and flags intact', async ({ page }) => {
    await openApp(page)
    await add(page, 'tr')
    await tab(page, 'Simulator').click()
    const prefer = [/Çıkış yolu hak edildi/, /Gözlerini kapat/, /Kapı açılır/, /Gerçeği kabul et/]
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
    await expect(page.getByTestId('sim-current-title')).toHaveText('Son: Kaçış')
    const kinds = await page.getByTestId('flow-entry').evaluateAll((els) => els.map((e) => e.getAttribute('data-kind')))
    expect(kinds.filter((k) => ['sequenceStart', 'stageEnter', 'stageReturn', 'sequenceComplete'].includes(k!))).toEqual(['sequenceStart', 'stageEnter', 'stageReturn', 'stageEnter', 'stageReturn', 'sequenceComplete'])
    await expect(page.locator('[data-testid="sim-flag"][data-flag="gerçeklikParçalandı"]')).toHaveAttribute('data-value', 'true')
    await expect(page.locator('[data-testid="sim-flag"][data-flag="anahtarıBuldu"]')).toHaveAttribute('data-value', 'true')
  })

  test('analysis is clean and the Production plans are valid for the Turkish sample', async ({ page }) => {
    await openApp(page)
    await add(page, 'tr')
    await tab(page, 'Analysis').click()
    await expect(page.locator('.issue.error, .issue.warning')).toHaveCount(0)
    await tab(page, 'Production').click()
    await expect(page.locator('[data-testid="task-row"][data-task-id="T-level-s_cottage"]')).toContainText('Kulübede Sabah')
    await expect(page.getByTestId('plan-preview')).toContainText('/Game/Maps/L_Cottage')
    await page.getByTestId('engine-unity').click()
    await expect(page.getByTestId('plan-preview')).toContainText('Kulübede Sabah')
    expect(await page.getByTestId('plan-preview').innerText()).not.toContain('/Game/')
    // the same task ids exist as in the English sample
    const trIds = await page.getByTestId('task-row').evaluateAll((els) => els.map((e) => e.getAttribute('data-task-id')))
    await add(page, 'en')
    await tab(page, 'Production').click()
    const enIds = await page.getByTestId('task-row').evaluateAll((els) => els.map((e) => e.getAttribute('data-task-id')))
    expect(trIds).toEqual(enIds)
    expect(trIds.length).toBeGreaterThan(30)
  })

  test('the sample chooser fits a 390 px screen', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openApp(page)
    await page.getByTestId('projects-btn').click()
    for (const id of ['library-add-sample-tr', 'library-add-sample']) {
      const b = await page.getByTestId(id).boundingBox()
      expect(b!.x).toBeGreaterThanOrEqual(0)
      expect(b!.x + b!.width).toBeLessThanOrEqual(390)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
  })
})
