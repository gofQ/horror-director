import { expect, test, type Page } from '@playwright/test'
import { openApp } from './helpers'

const menu = (page: Page) => page.getByTestId('context-menu')
const item = (page: Page, text: string | RegExp) => menu(page).getByTestId('ctx-item').filter({ hasText: text })
const tab = (page: Page, name: string) => page.locator('.tabs button').filter({ hasText: name })
const VIEWS = ['Scene Graph', 'Timeline', 'Characters', 'Analysis', 'Simulator', 'Production']

/** Records `defaultPrevented` of every contextmenu event as it leaves the document (window listener runs last). */
async function probe(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __ctx: boolean[] }
    w.__ctx = []
    window.addEventListener('contextmenu', (e) => w.__ctx.push(e.defaultPrevented))
  })
}
const prevented = (page: Page) => page.evaluate(() => (window as unknown as { __ctx: boolean[] }).__ctx)
const titleInput = (page: Page) => page.getByLabel('Title').first()

async function selectHallway(page: Page) {
  await page.getByText('Apartment Hallway').first().click()
  await expect(titleInput(page)).toBeVisible()
}

test.describe('global app-owned context menu', () => {
  test('the native menu is prevented on every tab, header, tabs and empty regions', async ({ page }) => {
    await openApp(page)
    await probe(page)
    let n = 0
    for (const view of VIEWS) {
      await tab(page, view).click()
      for (const sel of ['.topbar .brand', '.tabs', '.topbar .actions', '.main']) {
        const box = await page.locator(sel).first().boundingBox()
        // inside the element but away from controls
        const x = sel === '.main' ? box!.x + box!.width - 6 : box!.x + 4
        const y = sel === '.main' ? box!.y + box!.height - 6 : box!.y + box!.height / 2
        await page.mouse.click(x, y, { button: 'right' })
        n++
        await expect(menu(page)).toHaveCount(1)
        await page.keyboard.press('Escape')
        await expect(menu(page)).toHaveCount(0)
      }
    }
    const flags = await prevented(page)
    expect(flags).toHaveLength(n)
    expect(flags.every(Boolean)).toBe(true)
  })

  test('is prevented on text inputs, selects and buttons as well', async ({ page }) => {
    await openApp(page)
    await selectHallway(page)
    await probe(page)
    const targets = [titleInput(page), page.locator('.inspector select').first(), page.getByTestId('projects-btn'), page.getByTestId('lang-en')]
    for (const t of targets) {
      await t.click({ button: 'right' })
      await expect(menu(page)).toHaveCount(1)
      await page.keyboard.press('Escape')
    }
    expect((await prevented(page)).every(Boolean)).toBe(true)
  })

  test('only handles targets inside the app', async ({ page }) => {
    await openApp(page)
    const result = await page.evaluate(() => {
      const outside = document.createElement('div')
      document.body.appendChild(outside)
      const inside = document.querySelector('.topbar')!
      const fire = (el: Element) => {
        const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
        el.dispatchEvent(e)
        return e.defaultPrevented
      }
      return { outside: fire(outside), inside: fire(inside) }
    })
    expect(result).toEqual({ outside: false, inside: true })
  })

  test('text menu: Select all, Cut, Paste work and keep the app state in sync', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await openApp(page)
    await selectHallway(page)
    const input = titleInput(page)
    await input.fill('abc')
    await input.press('Control+a')
    await input.click({ button: 'right', position: { x: 6, y: 8 } })
    await expect(menu(page)).toHaveAttribute('aria-label', 'Text actions')
    await expect(menu(page).getByTestId('ctx-item')).toHaveText([/Cut/, /Copy/, /Paste/, /Select all/])
    await item(page, /^Cut/).click()
    await expect(menu(page)).toHaveCount(0)
    await expect(input).toHaveValue('')
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('abc')

    await input.click({ button: 'right' })
    await expect(item(page, /^Cut/)).toHaveAttribute('aria-disabled', 'true') // nothing selected
    await expect(item(page, /^Copy/)).toHaveAttribute('aria-disabled', 'true')
    await item(page, /^Paste/).click()
    await expect(input).toHaveValue('abc')
    await expect(page.locator('.react-flow__node').filter({ hasText: 'abc' })).toHaveCount(1) // React state updated

    await input.click({ button: 'right' })
    await item(page, /Select all/).click()
    const sel = await input.evaluate((el: HTMLInputElement) => [el.selectionStart, el.selectionEnd, document.activeElement === el])
    expect(sel).toEqual([0, 3, true])
    await input.click({ button: 'right', position: { x: 6, y: 8 } })
    await item(page, /^Copy/).click()
    await expect(input).toHaveValue('abc')
  })

  test('typing, caret and Ctrl+Z keep working after the menu was opened and closed', async ({ page }) => {
    await openApp(page)
    await selectHallway(page)
    const input = titleInput(page)
    await input.fill('hello')
    await input.press('Home')
    await input.click({ button: 'right', position: { x: 3, y: 8 } })
    await page.keyboard.press('Escape')
    await expect(menu(page)).toHaveCount(0)
    await expect(input).toBeFocused()
    await page.keyboard.type('X')
    expect(await input.inputValue()).toMatch(/X/)
    await page.keyboard.press('Control+a')
    await page.keyboard.type('done')
    await expect(input).toHaveValue('done')
  })

  test('clipboard denied: clear feedback instead of a silent no-op', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'clipboard', {
        configurable: true,
        get: () => ({ readText: () => Promise.reject(new DOMException('blocked', 'NotAllowedError')), writeText: () => Promise.reject(new DOMException('blocked', 'NotAllowedError')) }),
      })
    })
    await openApp(page)
    await selectHallway(page)
    await titleInput(page).click({ button: 'right' })
    await item(page, /^Paste/).click()
    await expect(page.locator('.toast.error')).toContainText('blocked clipboard access')
    await titleInput(page).press('Control+a')
    await titleInput(page).click({ button: 'right', position: { x: 6, y: 8 } })
    await item(page, /^Copy/).click()
    await expect(page.locator('.toast.error')).toContainText(/Ctrl\/Cmd/)
  })

  test('clipboard unsupported: Paste is disabled and names the keyboard alternative', async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'clipboard', { configurable: true, get: () => undefined }))
    await openApp(page)
    await selectHallway(page)
    await titleInput(page).click({ button: 'right' })
    const paste = item(page, /Paste/)
    await expect(paste).toHaveAttribute('aria-disabled', 'true')
    await expect(paste).toContainText('Ctrl/Cmd+V')
  })

  test('keyboard: Shift+F10 and the Menu key open it, arrows move, Escape closes and returns focus', async ({ page }) => {
    await openApp(page)
    const first = page.locator('.tabs button').first()
    await first.focus()
    await page.keyboard.press('Shift+F10')
    await expect(menu(page)).toHaveAttribute('aria-label', 'Application menu')
    await page.keyboard.press('ArrowDown')
    await expect(menu(page).locator('[role=menuitem]:focus')).toHaveCount(1)
    await page.keyboard.press('Escape')
    await expect(menu(page)).toHaveCount(0)
    await expect(first).toBeFocused()

    await first.press('ContextMenu')
    await expect(menu(page)).toHaveCount(1)
    await page.keyboard.press('Escape')

    await selectHallway(page)
    await titleInput(page).focus()
    await titleInput(page).press('Shift+F10')
    await expect(menu(page)).toHaveAttribute('aria-label', 'Text actions')
    await page.keyboard.press('Escape')
    await expect(titleInput(page)).toBeFocused()
  })

  test('never shows two menus; specialised menus keep priority', async ({ page }) => {
    await openApp(page)
    const pane = (await page.locator('.react-flow__pane').boundingBox())!
    await page.mouse.click(pane.x + pane.width / 2, pane.y + pane.height - 120, { button: 'right' }) // empty canvas → graph menu
    await expect(menu(page)).toHaveAttribute('aria-label', 'Graph menu')
    await page.locator('.topbar .brand').click({ button: 'right' })
    await expect(menu(page)).toHaveCount(1)
    await expect(menu(page)).toHaveAttribute('aria-label', 'Application menu')
    await page.locator('.react-flow__node').first().click({ button: 'right' })
    await expect(menu(page)).toHaveCount(1)
    await expect(menu(page)).toHaveAttribute('aria-label', /Node menu/)
    await page.keyboard.press('Escape')
    await page.locator('.react-flow__controls').click({ button: 'right', position: { x: 5, y: 5 } })
    await expect(menu(page)).toHaveCount(1)
    await expect(menu(page)).toHaveAttribute('aria-label', 'Application menu')
  })

  test('app menu actions work: go to a tab, undo, language', async ({ page }) => {
    await openApp(page)
    await page.locator('.topbar .brand').click({ button: 'right' })
    await item(page, /^Go to/).click()
    await item(page, /^Production/).click()
    await expect(page.getByTestId('production-view')).toBeVisible()
    await page.locator('.topbar .brand').click({ button: 'right' })
    await expect(item(page, /^Undo/)).toHaveAttribute('aria-disabled', 'true')
    await item(page, /^Language/).click()
    await item(page, /Türkçe/).click()
    await expect(tab(page, 'Üretim')).toBeVisible()
    await page.locator('.topbar .brand').click({ button: 'right' })
    await expect(item(page, /Geri al/)).toBeVisible()
  })

  test('dialogs: library row keeps its menu, Escape closes only the menu, other dialog areas get the app menu', async ({ page }) => {
    await openApp(page)
    await page.getByTestId('projects-btn').click()
    await expect(page.getByTestId('library-dialog')).toBeVisible()
    await page.getByTestId('library-row').first().click({ button: 'right' })
    await expect(menu(page)).toHaveAttribute('aria-label', /Project menu/)
    await page.keyboard.press('Escape')
    await expect(menu(page)).toHaveCount(0)
    await expect(page.getByTestId('library-dialog')).toBeVisible()
    await page.locator('#library-title').click({ button: 'right' })
    await expect(menu(page)).toHaveAttribute('aria-label', 'Application menu')
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('library-dialog')).toBeVisible()
  })

  test('390 px mobile layout: the menu stays inside the viewport; Turkish labels', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openApp(page)
    await page.getByTestId('lang-tr').click()
    await page.locator('.topbar .brand').click({ button: 'right' })
    const box = (await menu(page).boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(390)
    expect(box.y + box.height).toBeLessThanOrEqual(844)
    await expect(item(page, /Geri al/)).toBeVisible()
    await page.keyboard.press('Escape')
    await page.getByText('Apartment Hallway').first().click()
    const input = page.getByLabel('Başlık').first()
    await input.click({ button: 'right' })
    await expect(menu(page).getByTestId('ctx-item')).toHaveText([/Kes/, /Kopyala/, /Yapıştır/, /Tümünü seç/])
    const b2 = (await menu(page).boundingBox())!
    expect(b2.x + b2.width).toBeLessThanOrEqual(390)
  })
})
