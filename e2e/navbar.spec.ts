import { expect, test, type Page } from '@playwright/test'
import { openApp } from './helpers'

const WIDTHS = [1920, 1792, 1440, 1280, 1024, 900, 768, 390]
const LONG = 'A Very Long Project Name That Must Be Truncated With An Ellipsis Instead Of Pushing The Header Controls Offscreen'

interface Box { left: number; right: number; top: number; bottom: number }
const boxes = (page: Page, selector: string) =>
  page.locator(selector).evaluateAll((els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect()
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: r.width }
    }),
  )
const header = (page: Page) =>
  page.evaluate(() => {
    const vis = (e: Element) => e.getBoundingClientRect().width > 0
    const items = [...document.querySelectorAll('.topbar .actions > *:not(input)')].filter(vis)
    const r = (s: string) => document.querySelector(s)!.getBoundingClientRect()
    const rightmost = Math.max(...items.map((e) => e.getBoundingClientRect().right))
    const brand = r('.brand')
    const tabs = r('.tabs')
    const bar = r('.topbar')
    return { vw: window.innerWidth, overflow: document.documentElement.scrollWidth - window.innerWidth, rightmost, brandLeft: brand.left, brandRight: brand.right, tabsLeft: tabs.left, tabsRight: tabs.right, barHeight: bar.height, barBottom: bar.bottom, brandTop: brand.top }
  })
const overlaps = (a: Box, b: Box) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5

test.describe('top navbar layout', () => {
  for (const w of WIDTHS) {
    test(`${w}px: no overflow, all six tabs and every control reachable, nothing overlaps`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 900 })
      await openApp(page)
      const h = await header(page)
      expect(h.overflow).toBeLessThanOrEqual(0)
      const tabs = page.locator('.tabs .tab')
      await expect(tabs).toHaveCount(6)
      for (const t of await tabs.all()) await expect(t).toBeVisible()
      for (const id of ['undo-btn', 'redo-btn', 'projects-btn', 'lang-tr', 'lang-en']) await expect(page.getByTestId(id)).toBeVisible()
      await expect(page.getByTestId('save-badge')).toBeVisible()
      await expect(page.getByRole('button', { name: /backup/i }).first()).toBeVisible()
      // the controls stay inside the viewport horizontally
      // (at tablet/mobile widths the tabs live in their own horizontally scrollable row, so only the other controls are checked)
      for (const b of await boxes(page, w > 900 ? '.topbar .tab, .topbar .actions .btn, .topbar .brand' : '.topbar .actions .btn, .topbar .brand')) {
        expect(b.left).toBeGreaterThanOrEqual(-0.5)
        expect(b.right).toBeLessThanOrEqual(w + 0.5)
      }
      // no overlaps between the tabs, nor between header controls
      for (const sel of ['.topbar .tab', '.topbar .actions .btn']) {
        const bs = await boxes(page, sel)
        for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) expect(overlaps(bs[i], bs[j]), `${sel} ${i}/${j}`).toBe(false)
      }
      // tabs and actions never overlap each other either (the tab row may wrap under the brand, never under the actions)
      const tb = await boxes(page, '.topbar .tab')
      const ab = await boxes(page, '.topbar .actions .btn, .topbar .actions .lang-switch, .topbar .actions .save-badge')
      if (w > 900) for (const t of tb) for (const a of ab) expect(overlaps(t, a), 'tab vs action').toBe(false)
      // every tab still switches the view
      await tabs.nth(5).click()
      await expect(page.getByTestId('production-view')).toBeVisible()
    })
  }

  for (const w of [1920, 1792, 1440, 1280]) {
    test(`${w}px desktop: single row, brand left, tabs spread through the centre, actions at the far right edge`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 900 })
      await openApp(page)
      const h = await header(page)
      expect(h.brandLeft).toBeLessThan(24)
      expect(h.vw - h.rightmost).toBeLessThanOrEqual(24) // right padding only: no empty right-hand region
      expect(h.vw - h.rightmost).toBeGreaterThanOrEqual(0)
      expect(h.barHeight).toBeLessThan(70) // one row
      expect(h.tabsLeft).toBeGreaterThanOrEqual(h.brandRight)
      const tabs = await boxes(page, '.tabs .tab')
      // tabs fill the central region: from just after the brand up to the action group
      const actionsLeft = (await boxes(page, '.topbar .actions'))[0].left
      expect(actionsLeft - h.tabsRight).toBeLessThanOrEqual(24)
      expect(h.tabsLeft - h.brandRight).toBeLessThanOrEqual(24)
      expect(Math.abs(tabs[0].left - h.tabsLeft)).toBeLessThanOrEqual(1)
      expect(Math.abs(tabs[5].right - h.tabsRight)).toBeLessThanOrEqual(1)
      // comfortable click areas
      for (const t of tabs) expect(t.w).toBeGreaterThanOrEqual(90)
      // everything on the same row
      for (const b of await boxes(page, '.topbar .tab, .topbar .actions .btn')) expect(Math.abs(b.top - tabs[0].top)).toBeLessThan(20)
    })
  }

  test('1792px: wide screens give the tabs far more room than the content width', async ({ page }) => {
    await page.setViewportSize({ width: 1792, height: 900 })
    await openApp(page)
    const h = await header(page)
    expect(h.tabsRight - h.tabsLeft).toBeGreaterThan(850)
  })

  test('a long project name is truncated with an ellipsis and never pushes the controls away', async ({ page }) => {
    for (const w of [1792, 1536]) {
      await page.setViewportSize({ width: w, height: 900 })
      await openApp(page)
      const before = await header(page)
      await page.getByTestId('projects-btn').click()
      await page.getByTestId('library-new').click()
      await expect(page.getByTestId('library-dialog')).toBeHidden()
      await page.getByRole('textbox', { name: 'Name', exact: true }).first().fill(LONG)
      const name = page.locator('.project-name')
      await expect(name).toHaveText(LONG)
      const m = await name.evaluate((e) => ({ clipped: e.scrollWidth > e.clientWidth, overflow: getComputedStyle(e).textOverflow, w: e.getBoundingClientRect().width }))
      expect(m.clipped).toBe(true)
      expect(m.overflow).toBe('ellipsis')
      expect(m.w).toBeLessThanOrEqual(281)
      const after = await header(page)
      expect(after.overflow).toBeLessThanOrEqual(0)
      expect(Math.abs(after.rightmost - before.rightmost)).toBeLessThanOrEqual(1)
      expect(after.barHeight).toBeLessThan(70)
    }
  })

  for (const w of [1792, 1366])
    test(`${w}px: Turkish and English labels fit without clipping or overlap`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 900 })
      await openApp(page)
      for (const lang of ['tr', 'en'] as const) {
        await page.getByTestId(`lang-${lang}`).click()
        await expect(page.locator('html')).toHaveAttribute('lang', lang)
        const h = await header(page)
        expect(h.overflow).toBeLessThanOrEqual(0)
        expect(h.vw - h.rightmost).toBeLessThanOrEqual(24)
        expect(h.barHeight).toBeLessThan(70)
        const clipped = await page.locator('.tabs .tab, .actions .btn').evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1).length)
        expect(clipped).toBe(0)
        const tabs = await boxes(page, '.tabs .tab')
        for (let i = 1; i < tabs.length; i++) expect(tabs[i].left).toBeGreaterThanOrEqual(tabs[i - 1].right - 0.5)
        const tr = ['Sahne Grafı', 'Zaman Çizelgesi', 'Karakterler', 'Analiz', 'Simülatör', 'Üretim']
        if (lang === 'tr') for (const label of tr.slice(0, 1)) await expect(page.locator('.tabs')).toContainText(label)
      }
    })

  test('1280px Turkish: stays free of clipping and overlap even if the header has to wrap', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await openApp(page)
    await page.getByTestId('lang-tr').click()
    const h = await header(page)
    expect(h.overflow).toBeLessThanOrEqual(0)
    expect(h.vw - h.rightmost).toBeLessThanOrEqual(24)
    const tb = await boxes(page, '.topbar .tab')
    const ab = await boxes(page, '.topbar .actions .btn, .topbar .actions .lang-switch, .topbar .actions .save-badge')
    for (const t of tb) for (const a of ab) expect(overlaps(t, a)).toBe(false)
    await page.getByTestId('lang-en').click() // the language switch is fully clickable
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  })

  test('tablet and mobile: tabs sit in their own scrollable row and the page never scrolls sideways', async ({ page }) => {
    for (const w of [900, 768, 390]) {
      await page.setViewportSize({ width: w, height: 900 })
      await openApp(page)
      const h = await header(page)
      expect(h.overflow).toBeLessThanOrEqual(0)
      const nav = await page.locator('.tabs').evaluate((e) => ({ ox: getComputedStyle(e).overflowX, w: e.getBoundingClientRect().width, top: e.getBoundingClientRect().top }))
      expect(nav.ox).toBe('auto')
      expect(nav.w).toBeLessThanOrEqual(w)
      expect(nav.top).toBeGreaterThan(h.brandTop + 10) // tabs are on a row below the brand/actions
      // the last tab can be scrolled into view and clicked
      await page.locator('.tabs .tab').last().scrollIntoViewIfNeeded()
      await page.locator('.tabs .tab').last().click()
      await expect(page.getByTestId('production-view')).toBeVisible()
      expect((await header(page)).overflow).toBeLessThanOrEqual(0)
    }
  })
})
