import { expect, type Locator, type Page } from '@playwright/test'

export type Pos = { x: number; y: number }

/** Fresh app with the sample project; fails the test on uncaught page errors. */
export async function openApp(page: Page): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await expect(page.locator('.react-flow__node').first()).toBeVisible()
  await settle(page)
  return errors
}

export const nodes = (page: Page): Locator => page.locator('.react-flow__node')
export const edgeLabels = (page: Page): Locator => page.getByTestId('edge-label')

export const nodeIds = (page: Page) =>
  nodes(page).evaluateAll((els) => els.map((e) => e.getAttribute('data-id') as string))

/** Scene positions straight from the DOM (React Flow applies them as a translate transform). */
export const positions = (page: Page): Promise<Record<string, Pos>> =>
  nodes(page).evaluateAll((els) =>
    Object.fromEntries(
      els.map((e) => {
        const m = new DOMMatrix(getComputedStyle(e).transform)
        return [e.getAttribute('data-id') as string, { x: m.m41, y: m.m42 }]
      }),
    ),
  )

export const sizes = (page: Page): Promise<Record<string, { w: number; h: number }>> =>
  nodes(page).evaluateAll((els) =>
    Object.fromEntries(els.map((e) => [e.getAttribute('data-id') as string, { w: (e as HTMLElement).offsetWidth, h: (e as HTMLElement).offsetHeight }])),
  )

/** Waits until node geometry stops changing (fit-view animation finished). */
export async function settle(page: Page) {
  let last = ''
  for (let i = 0; i < 40; i++) {
    const now = JSON.stringify(await nodes(page).evaluateAll((els) => els.map((e) => (e as HTMLElement).getBoundingClientRect().toJSON())))
    if (now === last) return
    last = now
    await page.waitForTimeout(120)
  }
}

export async function waitSaved(page: Page) {
  await expect(page.getByTestId('save-badge')).not.toContainText(/Saving|Kaydediliyor/)
}

export async function newProject(page: Page) {
  await page.getByTestId('projects-btn').click()
  await page.getByTestId('library-new').click()
  await expect(page.getByTestId('library-dialog')).toBeHidden()
  await expect(nodes(page)).toHaveCount(1)
  await settle(page)
}

/** Adds a scene via the palette and returns its id. */
export async function addScene(page: Page, kind: 'reality' | 'dream' | 'nightmare' | 'memory' | 'ending' = 'dream'): Promise<string> {
  const before = new Set(await nodeIds(page))
  await page.getByTestId(`add-${kind}`).click()
  await expect(nodes(page)).toHaveCount(before.size + 1)
  const id = (await nodeIds(page)).find((i) => !before.has(i))
  if (!id) throw new Error('new node not found')
  return id
}

export async function autoArrange(page: Page) {
  await page.getByTestId('auto-arrange').click()
  await settle(page)
}

/** Drags from the source handle of one scene to the target handle of another (real pointer events). */
export async function connect(page: Page, from: string, to: string) {
  const src = page.locator(`.react-flow__node[data-id="${from}"] .react-flow__handle.source`)
  const dst = page.locator(`.react-flow__node[data-id="${to}"] .react-flow__handle.target`)
  const a = await src.boundingBox()
  const b = await dst.boundingBox()
  if (!a || !b) throw new Error('handles not visible')
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
  await page.mouse.down()
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 })
  await page.mouse.up()
}

export const overlap = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
