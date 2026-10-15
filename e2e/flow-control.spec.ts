import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { connect, newProject, nodeIds, nodes, openApp, waitSaved } from './helpers'

const menu = (page: Page) => page.getByTestId('context-menu')
const item = (page: Page, text: string | RegExp) => menu(page).getByTestId('ctx-item').filter({ hasText: text })
const undo = (page: Page) => page.getByTestId('undo-btn')
const node = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`)
const edges = (page: Page) => page.locator('.react-flow__edge')

async function createAt(page: Page, x: number, y: number, path: (string | RegExp)[]) {
  const before = new Set(await nodeIds(page))
  await page.mouse.click(x, y, { button: 'right' })
  await expect(menu(page)).toBeVisible()
  for (const step of path) await item(page, step).first().click()
  await expect.poll(async () => (await nodeIds(page)).length).toBe(before.size + 1)
  return (await nodeIds(page)).find((i) => !before.has(i))!
}
async function emptyCanvas(page: Page) {
  await newProject(page)
  await nodes(page).first().click()
  await page.keyboard.press('Delete')
  await expect(nodes(page)).toHaveCount(0)
}
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`

/** Start → Delay (20 s) → Event "Church bell" → Random (A 30 % "Door opens" / B "Silence") → Door (nightmare) / Quiet (reality). */
async function buildFlowStory(page: Page) {
  await emptyCanvas(page)
  const start = await createAt(page, 20, 300, ['Add Scene', 'Reality'])
  const delay = await createAt(page, 330, 300, ['Add Delay'])
  const event = await createAt(page, 570, 300, ['Add Event'])
  const random = await createAt(page, 330, 480, ['Add Random Branch'])
  const door = await createAt(page, 720, 360, ['Add Scene', 'Nightmare'])
  const quiet = await createAt(page, 720, 640, ['Add Scene', 'Reality'])
  await connect(page, start, delay)
  await connect(page, delay, event)
  await connect(page, event, random)
  await connect(page, random, door, 'a')
  await connect(page, random, quiet, 'b')
  await expect(edges(page)).toHaveCount(5)
  await node(page, delay).click({ position: { x: 20, y: 15 } })
  await page.getByTestId('delay-seconds').locator('input').fill('20')
  await node(page, event).click({ position: { x: 20, y: 15 } })
  await page.getByTestId('event-title').fill('Church bell')
  await page.getByTestId('event-category-select').selectOption('reveal')
  await node(page, random).click({ position: { x: 20, y: 15 } })
  await page.getByTestId('random-prob-a').locator('input').fill('30')
  await page.getByTestId('random-label-a').fill('Door opens')
  await page.getByTestId('random-label-b').fill('Silence')
  return { start, delay, event, random, door, quiet }
}

test.describe('Event, Delay and Random Branch nodes', () => {
  test('create from the graph menu and the palette, edit in the Inspector, distinct appearance', async ({ page }) => {
    await openApp(page)
    await emptyCanvas(page)
    await page.mouse.click(300, 250, { button: 'right' })
    await expect(menu(page).getByTestId('ctx-item')).toContainText(['Add Scene', 'Add IF / Branch', 'Add Set Flag', 'Add Event', 'Add Delay', 'Add Random Branch', 'Add Comment / Note'])
    await page.keyboard.press('Escape')
    const e = await createAt(page, 60, 280, ['Add Event'])
    await createAt(page, 340, 280, ['Add Delay'])
    await createAt(page, 600, 280, ['Add Random Branch'])
    await expect(page.getByTestId('event-node')).toHaveCount(1)
    await expect(page.getByTestId('delay-node')).toHaveCount(1)
    await expect(page.getByTestId('random-node')).toHaveCount(1)
    await expect(page.getByTestId('random-node').getByTestId('random-pin-a')).toContainText('Outcome A · 50%')
    await expect(page.getByTestId('random-node').getByTestId('random-pin-b')).toContainText('Outcome B · 50%')
    await expect(page.getByTestId('delay-duration')).toContainText('5 s')
    // Inspector editing
    await node(page, e).click({ position: { x: 20, y: 15 } })
    await page.getByTestId('event-title').fill('Door slams')
    await page.getByTestId('event-category-select').selectOption('threat')
    await expect(node(page, e)).toContainText('Door slams')
    await expect(page.getByTestId('event-category')).toContainText('Threat')
    await page.getByTestId('delay-node').click({ position: { x: 20, y: 15 } })
    await page.getByTestId('delay-seconds').locator('input').fill('90')
    await expect(page.getByTestId('delay-duration')).toContainText('90 s')
    await expect(page.getByTestId('delay-clock')).toContainText('1:30')
    await page.getByTestId('delay-seconds').locator('input').fill('99999')
    await expect(page.getByTestId('delay-duration')).toContainText('3,600 s') // clamped to the upper bound
    await page.getByTestId('random-node').click({ position: { x: 20, y: 15 } })
    await page.getByTestId('random-prob-a').locator('input').fill('0')
    await expect(page.getByTestId('random-prob-b')).toContainText('A 0% · B 100%')
    await expect(page.getByTestId('random-boundary')).toBeVisible()
    await page.getByTestId('random-prob-range').fill('100')
    await expect(page.getByTestId('random-node').getByTestId('random-pin-a')).toContainText('100%')
    // the three node types have different colors
    const colors = await page.evaluate(() => ['event', 'delay', 'random'].map((k) => getComputedStyle(document.querySelector(`.bp-${k}`)!).getPropertyValue('--kind').trim()))
    expect(new Set(colors).size).toBe(3)
    // the palette creates the same node types
    await page.getByTestId('add-event').click()
    await page.getByTestId('add-delay').click()
    await page.getByTestId('add-random').click()
    await expect(page.getByTestId('event-node')).toHaveCount(2)
    await expect(page.getByTestId('delay-node')).toHaveCount(2)
    await expect(page.getByTestId('random-node')).toHaveCount(2)
  })

  test('typed connections: Random A/B pins, single-output Event and Delay, no logic-only cycle', async ({ page }) => {
    await openApp(page)
    const { delay, event, random, door, quiet, start } = await buildFlowStory(page)
    // single outputs
    await connect(page, delay, quiet)
    await expect(edges(page)).toHaveCount(5)
    await expect(page.getByTestId('connect-notice')).toContainText('single output')
    await connect(page, event, door)
    await expect(edges(page)).toHaveCount(5)
    // a taken Random pin refuses a second connection
    await connect(page, random, quiet, 'a')
    await expect(edges(page)).toHaveCount(5)
    // logic-only cycle: Random B → Delay would loop without a scene
    await node(page, quiet).click({ button: 'right', position: { x: 30, y: 15 } })
    await page.keyboard.press('Escape')
    await connect(page, start, random)
    await expect(edges(page)).toHaveCount(6)
    // the pin handles exist with the right ids
    await expect(page.locator(`.react-flow__handle[data-nodeid="${random}"][data-handleid="a"]`)).toHaveCount(1)
    await expect(page.locator(`.react-flow__handle[data-nodeid="${random}"][data-handleid="b"]`)).toHaveCount(1)
    await expect(page.locator(`.react-flow__handle[data-nodeid="${random}"][data-handleid="true"]`)).toHaveCount(0)
  })

  test('drag-to-create from an output pin, including a Random pin, in one undo step', async ({ page }) => {
    await openApp(page)
    await emptyCanvas(page)
    const s = await createAt(page, 30, 250, ['Add Scene', 'Reality'])
    const r = await createAt(page, 400, 250, ['Add Random Branch'])
    await connect(page, s, r)
    for (const [pin, kind, testId] of [
      ['a', 'event', 'event-node'],
      ['b', 'delay', 'delay-node'],
    ] as const) {
      const before = await edges(page).count()
      const handle = page.locator(`.react-flow__handle[data-nodeid="${r}"][data-handleid="${pin}"]`)
      const box = (await handle.boundingBox())!
      const x = box.x + box.width / 2
      const y = box.y + box.height / 2
      await page.mouse.move(x, y)
      await page.mouse.down()
      await page.mouse.move(x + 120, y + (pin === 'a' ? -120 : 150), { steps: 8 })
      await page.mouse.up()
      await expect(menu(page)).toHaveAttribute('aria-label', 'Add node')
      await page.getByTestId('ctx-search').fill(kind)
      await page.keyboard.press('Enter')
      await expect(page.getByTestId(testId)).toHaveCount(1)
      await expect(edges(page)).toHaveCount(before + 1)
    }
    await undo(page).click()
    await expect(page.getByTestId('delay-node')).toHaveCount(0)
    await expect(page.getByTestId('event-node')).toHaveCount(1)
    await expect(edges(page)).toHaveCount(2)
  })

  test('Delay → Event → Random simulation: route clock, flow trace, seeded roll, replay and provenance', async ({ page }) => {
    await openApp(page)
    const { door } = await buildFlowStory(page)
    await page.getByRole('button', { name: 'Simulator' }).click()
    await expect(page.getByTestId('sim-current-title')).toBeVisible()
    await expect(page.getByTestId('flow-trace')).toContainText('No events, delays or decisions')
    // into the Delay: pending, clock advanced, no scene visit
    await page.getByTestId('sim-option').first().click()
    await expect(page.getByTestId('sim-pending')).toHaveAttribute('data-kind', 'delay')
    await expect(page.getByTestId('sim-route-step')).toHaveCount(1)
    await page.getByTestId('sim-option').first().click()
    await expect(page.getByTestId('sim-pending')).toHaveAttribute('data-kind', 'event')
    await expect(page.getByTestId('flow-entry').filter({ hasText: 'Church bell' })).toHaveCount(1)
    const dStart = Number(await page.locator('[data-testid="flow-entry"][data-kind="delayStart"]').getAttribute('data-time'))
    const dEnd = Number(await page.locator('[data-testid="flow-entry"][data-kind="delayEnd"]').getAttribute('data-time'))
    expect(dEnd - dStart).toBe(20)
    expect(Number(await page.locator('[data-testid="flow-entry"][data-kind="event"]').getAttribute('data-time'))).toBe(dEnd)
    await page.getByTestId('sim-option').first().click()
    await expect(page.getByTestId('sim-pending')).toHaveAttribute('data-kind', 'random')
    await expect(page.getByTestId('sim-option')).toHaveCount(2)
    await expect(page.getByTestId('sim-option').first()).toContainText('Door opens · 30%')
    await expect(page.getByTestId('sim-option').first().getByTestId('sim-random-whatif')).toBeVisible()
    await expect(page.getByTestId('sim-random')).toContainText('does not verify')
    // explicit seeded roll: previews only, stable for the same seed and decision
    await page.getByTestId('sim-seed').fill('alpha')
    await page.getByTestId('sim-roll').click()
    const result = page.getByTestId('sim-roll-result')
    await expect(result).toBeVisible()
    const outcome = await result.getAttribute('data-outcome')
    await expect(page.getByTestId('sim-route-step')).toHaveCount(1) // not followed yet
    await page.getByTestId('sim-roll').click()
    await expect(result).toHaveAttribute('data-outcome', outcome!)
    await page.getByTestId('sim-roll-commit').click()
    await expect(page.getByTestId('sim-route-step')).toHaveCount(2)
    await expect(page.getByTestId('flow-provenance')).toHaveAttribute('data-mode', 'rolled')
    await expect(page.getByTestId('flow-provenance')).toContainText('alpha')
    // the next scene starts when the delay ended (links through logic nodes take no time)
    await expect(page.getByTestId('sim-route-step').nth(1)).toContainText(clock(dEnd))
    await expect(page.getByTestId('sim-via-delay')).toContainText('20')
    // Back and roll again: the same seed and decision give the same outcome (no silent reroll)
    await page.getByTestId('sim-back').click()
    await page.getByTestId('sim-roll').click()
    await expect(page.getByTestId('sim-roll-result')).toHaveAttribute('data-outcome', outcome!)
    await page.getByTestId('sim-roll-dismiss').click()
    // manual what-if for the other outcome
    const other = outcome === 'a' ? 'b' : 'a'
    await page.locator(`[data-testid="sim-option"][data-port="${other}"]`).click()
    await expect(page.getByTestId('flow-provenance')).toHaveAttribute('data-mode', 'manual')
    await expect(page.getByTestId('flow-provenance')).toContainText('manual what-if')
    // restart drops provenance and keeps the project untouched
    await page.getByTestId('sim-restart').click()
    await expect(page.getByTestId('flow-trace')).toContainText('No events, delays or decisions')
    await page.getByRole('button', { name: 'Scene Graph' }).click()
    await expect(node(page, door)).toBeVisible()
  })

  test('route comparison shows the delay shift and labels manual and rolled outcomes', async ({ page }) => {
    await openApp(page)
    await buildFlowStory(page)
    await page.getByRole('button', { name: 'Simulator' }).click()
    for (let i = 0; i < 3; i++) await page.getByTestId('sim-option').first().click()
    await page.locator('[data-testid="sim-option"][data-port="a"]').click() // manual A
    await page.getByTestId('sim-pin').click()
    await page.getByTestId('sim-back').click()
    await page.getByTestId('sim-seed').fill('beta')
    await page.getByTestId('sim-roll').click()
    await page.getByTestId('sim-roll-commit').click()
    const panel = page.getByTestId('compare-panel')
    await expect(panel).toContainText('Delay (s)')
    await expect(panel).toContainText('Random decisions')
    await expect(page.getByTestId('compare-random-note')).toContainText('1 chosen by hand')
    await expect(page.getByTestId('compare-random-note')).toContainText('1 rolled')
    await expect(page.getByTestId('compare-random-note')).toContainText('does not verify')
  })

  test('copy, paste, duplicate, delete and Auto Arrange work with the new nodes; reload and backup keep them', async ({ page }) => {
    await openApp(page)
    const { delay, event, random, start } = await buildFlowStory(page)
    await waitSaved(page)
    // select Delay, Event and Random, copy and paste
    await node(page, delay).click({ position: { x: 20, y: 15 } })
    await node(page, event).click({ position: { x: 20, y: 15 }, modifiers: ['Control'] })
    await node(page, random).click({ position: { x: 20, y: 15 }, modifiers: ['Control'] })
    await page.keyboard.press('Control+c')
    await page.keyboard.press('Control+v')
    await expect(page.getByTestId('delay-node')).toHaveCount(2)
    await expect(page.getByTestId('event-node')).toHaveCount(2)
    await expect(page.getByTestId('random-node')).toHaveCount(2)
    await expect(edges(page)).toHaveCount(7) // 5 + the 2 internal connections
    await undo(page).click()
    await expect(page.getByTestId('random-node')).toHaveCount(1)
    await expect(edges(page)).toHaveCount(5)
    await page.getByTestId('redo-btn').click()
    await expect(page.getByTestId('random-node')).toHaveCount(2)
    // pasted Random node keeps its values
    await expect(page.getByTestId('random-pin-a').last()).toContainText('Door opens · 30%')
    await expect(page.getByTestId('delay-duration').last()).toContainText('20 s')
    // Auto Arrange keeps everything and reload restores it
    await page.getByTestId('auto-arrange').click()
    await expect(nodes(page)).toHaveCount(9)
    await waitSaved(page)
    await page.reload()
    await expect(nodes(page)).toHaveCount(9)
    await expect(page.getByTestId('delay-node')).toHaveCount(2)
    await expect(edges(page)).toHaveCount(7)
    // deleting the start scene's neighbour removes its connections in one undo step
    await node(page, start).click({ position: { x: 20, y: 15 } })
    await page.keyboard.press('Delete')
    await undo(page).click()
    await expect(nodes(page)).toHaveCount(9)
    // backup is schema 8 with the new node types
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /backup/i }).first().click()])
    const exported = JSON.parse(readFileSync((await dl.path())!, 'utf8')) as { schemaVersion: number; project: { logicNodes: { type: string; seconds?: number; probabilityA?: number }[]; transitions: { sourcePort?: string }[] } }
    expect(exported.schemaVersion).toBe(9)
    expect(exported.project.logicNodes.map((n) => n.type).sort()).toEqual(['delay', 'delay', 'event', 'event', 'random', 'random'])
    expect(exported.project.logicNodes.find((n) => n.type === 'delay')!.seconds).toBe(20)
    expect(exported.project.logicNodes.find((n) => n.type === 'random')!.probabilityA).toBe(30)
    expect(exported.project.transitions.filter((t) => t.sourcePort === 'a' || t.sourcePort === 'b')).toHaveLength(2)
    // re-import as a new project
    await page.getByTestId('projects-btn').click()
    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'Import as new project' }).click()
    await (await chooser).setFiles({ name: 'flow.horror.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exported)) })
    await page.getByRole('button', { name: 'Add project' }).click()
    await expect(page.getByTestId('random-node')).toHaveCount(2)
  })

  test('an older backup (schema 7) still imports', async ({ page }) => {
    await openApp(page)
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /backup/i }).first().click()])
    const data = JSON.parse(readFileSync((await dl.path())!, 'utf8')) as { schemaVersion: number }
    data.schemaVersion = 7
    await page.getByTestId('projects-btn').click()
    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'Import as new project' }).click()
    await (await chooser).setFiles({ name: 'v7.horror.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) })
    await page.getByRole('button', { name: 'Add project' }).click()
    await expect(nodes(page)).toHaveCount(8)
    const versions = await page.evaluate(() => Object.entries(localStorage).filter(([k]) => k.includes('proj:')).map(([, v]) => JSON.parse(v).v))
    expect(versions).toContain(9)
  })

  test('keyboard: nodes are reachable, the node menu opens from the keyboard and shortcuts do not fire while typing', async ({ page }) => {
    await openApp(page)
    const { delay } = await buildFlowStory(page)
    await node(page, delay).click({ position: { x: 20, y: 15 } })
    await page.getByTestId('delay-seconds').locator('input').focus()
    await page.keyboard.press('Control+a')
    await page.keyboard.type('45')
    await page.keyboard.press('Control+c')
    await page.keyboard.press('Control+v') // inside an input: never a graph paste
    await expect(page.getByTestId('delay-node')).toHaveCount(1)
    await expect(page.getByTestId('delay-duration')).toContainText('45 s')
    // the minimum-size accessible names of the pins
    const pinA = page.locator('.react-flow__handle[data-handleid="a"]').first()
    await expect(pinA).toHaveAttribute('aria-label', /A .*30%/)
    await page.getByTestId('add-random').focus()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('random-node')).toHaveCount(2)
  })

  test('Turkish interface and a 390 px viewport', async ({ page }) => {
    await openApp(page)
    await buildFlowStory(page)
    await page.getByTestId('lang-tr').click()
    await expect(page.getByTestId('event-node')).toContainText('OLAY')
    await expect(page.getByTestId('delay-node')).toContainText('20 sn')
    await expect(page.getByTestId('random-node').getByTestId('random-pin-b')).toContainText('Silence · 70%')
    await page.mouse.click(500, 760, { button: 'right' })
    await expect(menu(page).getByTestId('ctx-item')).toContainText(['Olay ekle', 'Bekleme ekle', 'Rastgele Dal ekle'])
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Simülatör' }).click()
    for (let i = 0; i < 3; i++) await page.getByTestId('sim-option').first().click()
    await expect(page.getByTestId('sim-random')).toContainText('Sonuç çek')
    await expect(page.getByTestId('flow-trace')).toContainText('Akış izi')
    await page.getByTestId('lang-en').click()
    await page.setViewportSize({ width: 390, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1)
    await expect(page.getByTestId('sim-roll')).toBeVisible()
    await page.getByRole('button', { name: 'Scene Graph' }).click()
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1)
    await page.getByTestId('add-node').click()
    await expect(item(page, 'Random Branch')).toBeVisible()
    const box = (await menu(page).boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(391)
    await page.keyboard.press('Escape')
  })
})
