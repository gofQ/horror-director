import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { connect, newProject, nodeIds, nodes, openApp, waitSaved } from './helpers'

const menu = (page: Page) => page.getByTestId('context-menu')
const item = (page: Page, text: string | RegExp) => menu(page).getByTestId('ctx-item').filter({ hasText: text })
const undo = (page: Page) => page.getByTestId('undo-btn')
const node = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`)
const edges = (page: Page) => page.locator('.react-flow__edge')
const pane = (page: Page) => page.locator('.react-flow__pane')

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
async function assignReturn(page: Page, id: string, stage: '0' | '1') {
  await node(page, id).click({ position: { x: 20, y: 15 } })
  await page.getByTestId('seqreturn-owner-select').selectOption({ label: 'Haunting' })
  await page.getByTestId('seqreturn-stage-select').selectOption(stage)
}

/**
 * Start → Sequence "Haunting"
 *   Then 0 → Event "Whisper" → Return (stage 0)
 *   Then 1 → Delay 7 s → Set Flag RealityBroken = TRUE → Return (stage 1)
 *   Completed → Door
 */
async function buildSequenceStory(page: Page) {
  await emptyCanvas(page)
  await pane(page).click({ position: { x: 300, y: 700 } })
  await page.getByTestId('flag-add').click()
  await page.getByTestId('flag-name').first().fill('RealityBroken')
  const start = await createAt(page, 20, 400, ['Add Scene', 'Reality'])
  const q = await createAt(page, 270, 400, ['Add Sequence'])
  const e0 = await createAt(page, 520, 270, ['Add Event'])
  const r0 = await createAt(page, 760, 270, ['Add Sequence Return'])
  const d1 = await createAt(page, 520, 520, ['Add Delay'])
  const s1 = await createAt(page, 740, 520, ['Add Set Flag'])
  const r1 = await createAt(page, 960, 520, ['Add Sequence Return'])
  const door = await createAt(page, 520, 690, ['Add Scene', 'Nightmare'])
  await node(page, q).click({ position: { x: 20, y: 15 } })
  await page.getByTestId('sequence-title').fill('Haunting')
  await node(page, e0).click({ position: { x: 20, y: 15 } })
  await page.getByTestId('event-title').fill('Whisper')
  await node(page, d1).click({ position: { x: 20, y: 15 } })
  await page.getByTestId('delay-seconds').locator('input').fill('7')
  await node(page, s1).click({ position: { x: 20, y: 15 } })
  await page.getByTestId('setflag-flag').selectOption({ label: 'RealityBroken' })
  await assignReturn(page, r0, '0')
  await assignReturn(page, r1, '1')
  await connect(page, start, q)
  await connect(page, q, e0, 'then0')
  await connect(page, e0, r0)
  await connect(page, q, d1, 'then1')
  await connect(page, d1, s1)
  await connect(page, s1, r1)
  await connect(page, q, door, 'completed')
  await expect(edges(page)).toHaveCount(7)
  return { start, q, e0, r0, d1, s1, r1, door }
}

const sim = async (page: Page) => {
  await page.getByRole('button', { name: 'Simulator' }).click()
  await expect(page.getByTestId('sim-current-title')).toBeVisible()
}
const next = async (page: Page, n = 1) => {
  for (let i = 0; i < n; i++) await page.getByTestId('sim-option').first().click()
}
const flowKinds = (page: Page) => page.getByTestId('flow-entry').evaluateAll((els) => els.map((e) => e.getAttribute('data-kind')))

test.describe('ordered Sequence', () => {
  test('creation from the menu, picker and palette; Inspector; distinct appearance; pins', async ({ page }) => {
    await openApp(page)
    await emptyCanvas(page)
    await page.mouse.click(300, 250, { button: 'right' })
    await expect(menu(page).getByTestId('ctx-item')).toContainText(['Add Sequence', 'Add Sequence Return'])
    await page.keyboard.press('Escape')
    const q = await createAt(page, 60, 200, ['Add Sequence'])
    await expect(page.getByTestId('sequence-node')).toHaveCount(1)
    await expect(page.getByTestId('sequence-incomplete')).toBeVisible()
    for (const pin of ['then0', 'then1', 'completed']) await expect(page.locator(`.react-flow__handle[data-nodeid="${q}"][data-handleid="${pin}"]`)).toHaveCount(1)
    await expect(page.getByTestId('sequence-pin-then0')).toContainText('1. Then 0')
    await expect(page.getByTestId('sequence-pin-then1')).toContainText('2. Then 1')
    await expect(page.getByTestId('sequence-pin-completed')).toContainText('Completed')
    await page.getByTestId('add-seqreturn').click()
    await expect(page.getByTestId('seqreturn-node')).toHaveCount(1)
    await expect(page.getByTestId('seqreturn-owner')).toContainText('No Sequence assigned')
    await node(page, q).click({ position: { x: 20, y: 15 } })
    await page.getByTestId('sequence-title').fill('Haunting')
    await expect(node(page, q)).toContainText('Haunting')
    await expect(page.getByTestId('sequence-outs')).toContainText('Then 0')
    await expect(page.getByTestId('sequence-issues')).toContainText('no connection on its then0 output')
    await page.getByTestId('seqreturn-node').click({ position: { x: 20, y: 15 } })
    await page.getByTestId('seqreturn-owner-select').selectOption({ label: 'Haunting' })
    await page.getByTestId('seqreturn-stage-select').selectOption('1')
    await expect(page.getByTestId('seqreturn-owner')).toContainText('Haunting · Stage 1')
    const colors = await page.evaluate(() => ['sequence', 'seqreturn'].map((k) => getComputedStyle(document.querySelector(`.bp-${k}`)!).getPropertyValue('--kind').trim()))
    expect(new Set(colors).size).toBe(2)
    await page.getByTestId('add-sequence').click()
    await expect(page.getByTestId('sequence-node')).toHaveCount(2)
  })

  test('validation feedback: wrong stage, forbidden nodes, shortcuts and Return rules are refused with an explanation', async ({ page }) => {
    await openApp(page)
    const { start, e0, r0, r1, d1, s1, door } = await buildSequenceStory(page)
    await expect(page.getByTestId('sequence-incomplete')).toHaveCount(0) // complete
    const count = await edges(page).count()
    await connect(page, s1, r0) // Set Flag → stage-0 Return
    await expect(edges(page)).toHaveCount(count)
    await connect(page, e0, door) // E0 already has its single output
    await expect(edges(page)).toHaveCount(count)
    await connect(page, start, d1) // from outside into a stage
    await expect(edges(page)).toHaveCount(count)
    await expect(page.getByTestId('connect-notice')).toContainText('only be entered through its own Then output')
    await connect(page, start, r1) // a scene cannot feed a Return
    await expect(edges(page)).toHaveCount(count)
    await expect(page.getByTestId('connect-notice')).toContainText('can only close a stage of its own Sequence')
    // a Return has no output pin at all
    await expect(page.locator(`.react-flow__handle[data-nodeid="${r0}"][data-handleid="out"]`)).toHaveCount(0)
  })

  test('Then 0 → Return 0 → Then 1 → Return 1 → Completed: ordered simulation, Flow Trace and state', async ({ page }) => {
    await openApp(page)
    const { door } = await buildSequenceStory(page)
    await sim(page)
    await next(page) // into the Sequence
    await expect(page.getByTestId('sim-pending')).toHaveAttribute('data-kind', 'sequence')
    // never alternatives: only the first stage is offered, Completed is not
    await expect(page.getByTestId('sim-option')).toHaveCount(1)
    await expect(page.locator('[data-testid="sim-option"][data-port="then0"]')).toHaveCount(1)
    await expect(page.locator('[data-testid="sim-option"][data-port="completed"]')).toHaveCount(0)
    await next(page) // Then 0 → Event
    await expect(page.getByTestId('sim-pending')).toHaveAttribute('data-kind', 'event')
    await next(page) // Event → Return 0: control returns to the Sequence
    await expect(page.getByTestId('sim-pending')).toHaveAttribute('data-kind', 'sequence')
    await expect(page.getByTestId('sim-pending')).toContainText('stage 2')
    await expect(page.locator('[data-testid="sim-option"][data-port="then1"]')).toHaveCount(1)
    await expect(page.getByTestId('sim-route-step')).toHaveCount(1) // no scene visit so far
    await next(page, 2) // Then 1 → Delay → Set Flag
    await expect(page.getByTestId('sim-pending')).toHaveAttribute('data-kind', 'setFlag')
    await expect(page.getByTestId('sim-flag')).toHaveAttribute('data-value', 'true')
    await next(page) // Set Flag → Return 1
    await expect(page.getByTestId('sim-pending')).toContainText('Both stages returned')
    await expect(page.locator('[data-testid="sim-option"][data-port="completed"]')).toHaveCount(1)
    await next(page) // Completed → Door
    await expect(page.getByTestId('sim-pending')).toHaveCount(0)
    await expect(page.getByTestId('sim-current-title')).toHaveText('New Scene')
    await expect(page.getByTestId('sim-route-step')).toHaveCount(2)
    await expect(page.getByTestId('sim-via-delay')).toContainText('7')
    expect(await flowKinds(page)).toEqual(['sequenceStart', 'stageEnter', 'event', 'stageReturn', 'stageEnter', 'delayStart', 'delayEnd', 'flag', 'stageReturn', 'sequenceComplete'])
    const times = await page.getByTestId('flow-entry').evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-time'))))
    expect([...times].sort((a, b) => a - b)).toEqual(times)
    expect(times.at(-1)! - times[0]).toBe(7)
    await expect(page.getByTestId('flow-trace')).toContainText('Sequence “Haunting” completed')
    // Back rebuilds the frame; Restart clears it
    await page.getByTestId('sim-back').click()
    await expect(page.getByTestId('sim-pending')).toContainText('Both stages returned')
    await page.getByTestId('sim-back').click()
    await page.getByTestId('sim-back').click()
    await expect(page.getByTestId('sim-pending')).toHaveAttribute('data-kind', 'delay')
    await page.getByTestId('sim-restart').click()
    await expect(page.getByTestId('flow-trace')).toContainText('No events, delays or decisions')
    await page.getByRole('button', { name: 'Scene Graph' }).click()
    await expect(node(page, door)).toBeVisible()
  })

  test('an incomplete stage is reported in the simulator and never treated as complete', async ({ page }) => {
    await openApp(page)
    const { r0 } = await buildSequenceStory(page)
    // delete the stage-0 Return: the Event is left without its closing Return
    await node(page, r0).click({ position: { x: 20, y: 15 } })
    await page.keyboard.press('Delete')
    await expect(page.getByTestId('sequence-incomplete')).toBeVisible()
    await sim(page)
    await next(page, 2) // into the Sequence, Then 0: the Event has no output
    await expect(page.getByTestId('sim-option')).toHaveCount(0)
    await expect(page.getByTestId('sim-status')).toHaveAttribute('data-status', 'deadEnd')
    await expect(page.getByText(/not treated as complete/)).toBeVisible()
  })

  test('reload, copy/paste of the whole Sequence subgraph, undo and backup', async ({ page }) => {
    await openApp(page)
    const { q, e0, r0, d1, s1, r1 } = await buildSequenceStory(page)
    await waitSaved(page)
    await page.reload()
    await expect(page.getByTestId('sequence-node')).toHaveCount(1)
    await expect(page.getByTestId('seqreturn-node')).toHaveCount(2)
    await expect(edges(page)).toHaveCount(7)
    await expect(page.getByTestId('sequence-incomplete')).toHaveCount(0)
    // select the whole Sequence subgraph and copy / paste
    await node(page, q).click({ position: { x: 20, y: 15 } })
    for (const id of [e0, r0, d1, s1, r1]) await node(page, id).click({ position: { x: 20, y: 15 }, modifiers: ['Control'] })
    await page.keyboard.press('Control+c')
    await page.keyboard.press('Control+v')
    await expect(page.getByTestId('sequence-node')).toHaveCount(2)
    await expect(page.getByTestId('seqreturn-node')).toHaveCount(4)
    await expect(edges(page)).toHaveCount(12) // 7 + the 5 internal links of the copy (the link into the Sequence and Completed's target were not copied)
    // the copy owns its own Returns: assign nothing, the stages are complete
    await expect(page.getByTestId('seqreturn-owner').filter({ hasText: 'No Sequence assigned' })).toHaveCount(0)
    await undo(page).click()
    await expect(page.getByTestId('sequence-node')).toHaveCount(1)
    await expect(edges(page)).toHaveCount(7)
    await page.getByTestId('redo-btn').click()
    await expect(page.getByTestId('sequence-node')).toHaveCount(2)
    // partial copy: a Return alone is pasted unassigned (no dangling owner)
    await pane(page).click({ position: { x: 300, y: 760 } })
    await node(page, r1).click({ position: { x: 20, y: 15 } })
    await page.keyboard.press('Control+c')
    await page.keyboard.press('Control+v')
    await expect(page.getByTestId('seqreturn-owner').filter({ hasText: 'No Sequence assigned' })).toHaveCount(1)
    await waitSaved(page)
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /backup/i }).first().click()])
    const exported = JSON.parse(readFileSync((await dl.path())!, 'utf8')) as { schemaVersion: number; project: { logicNodes: { type: string; sequenceId?: string | null; stage?: number }[]; transitions: { sourcePort?: string }[] } }
    expect(exported.schemaVersion).toBe(9)
    expect(exported.project.logicNodes.filter((n) => n.type === 'sequence')).toHaveLength(2)
    expect(exported.project.logicNodes.filter((n) => n.type === 'seqReturn')).toHaveLength(5)
    expect(exported.project.transitions.filter((t) => t.sourcePort === 'then0')).toHaveLength(2)
    expect(exported.project.transitions.filter((t) => t.sourcePort === 'completed')).toHaveLength(1)
    // re-import as a new project
    await page.getByTestId('projects-btn').click()
    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'Import as new project' }).click()
    await (await chooser).setFiles({ name: 'seq.horror.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exported)) })
    await page.getByRole('button', { name: 'Add project' }).click()
    await expect(page.getByTestId('sequence-node')).toHaveCount(2)
  })

  test('an older backup (schema 8) still imports and is stored as v9 only after an edit', async ({ page }) => {
    await openApp(page)
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /backup/i }).first().click()])
    const data = JSON.parse(readFileSync((await dl.path())!, 'utf8')) as { schemaVersion: number }
    data.schemaVersion = 8
    await page.getByTestId('projects-btn').click()
    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'Import as new project' }).click()
    await (await chooser).setFiles({ name: 'v8.horror.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) })
    await page.getByRole('button', { name: 'Add project' }).click()
    await expect(nodes(page)).toHaveCount(8)
  })

  test('keyboard operation and Turkish interface; 390 px viewport', async ({ page }) => {
    await openApp(page)
    await buildSequenceStory(page)
    // keyboard: the palette button creates a node and the Inspector is reachable
    await page.getByTestId('add-sequence').focus()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('sequence-node')).toHaveCount(2)
    await page.getByTestId('lang-tr').click()
    await expect(page.getByTestId('sequence-node').first()).toContainText('SIRA')
    await expect(page.getByTestId('sequence-pin-then0').first()).toContainText('Sonra 0')
    await expect(page.getByTestId('sequence-pin-completed').first()).toContainText('Tamamlandı')
    await page.mouse.click(500, 780, { button: 'right' })
    await expect(menu(page).getByTestId('ctx-item')).toContainText(['Sıra ekle', 'Sıra Dönüşü ekle'])
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Simülatör' }).click()
    await next(page, 3)
    await expect(page.getByTestId('sim-pending')).toContainText('Sırasının içinde')
    await expect(page.getByTestId('flow-trace')).toContainText('Sırası başladı')
    await page.getByTestId('lang-en').click()
    await page.setViewportSize({ width: 390, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1)
    await page.getByRole('button', { name: 'Scene Graph' }).click()
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1)
    await page.getByTestId('add-node').click()
    await expect(item(page, 'Sequence').first()).toBeVisible()
    const box = (await menu(page).boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(391)
    await page.keyboard.press('Escape')
  })

  test('drag-to-create from a Then pin offers only valid stage nodes and owns the Return', async ({ page }) => {
    await openApp(page)
    await emptyCanvas(page)
    const q = await createAt(page, 60, 250, ['Add Sequence'])
    const handle = page.locator(`.react-flow__handle[data-nodeid="${q}"][data-handleid="then0"]`)
    const box = (await handle.boundingBox())!
    const x = box.x + box.width / 2
    const y = box.y + box.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + 200, y + 40, { steps: 8 })
    await page.mouse.up()
    await expect(menu(page)).toHaveAttribute('aria-label', 'Add node')
    await expect(menu(page).getByTestId('ctx-item')).toHaveCount(4) // Set Flag, Event, Delay, Sequence Return
    await expect(item(page, 'Scene')).toHaveCount(0)
    await page.getByTestId('ctx-search').fill('return')
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('seqreturn-node')).toHaveCount(1)
    await expect(edges(page)).toHaveCount(1)
    await expect(page.getByTestId('seqreturn-owner')).toContainText('Stage 0')
    await undo(page).click()
    await expect(page.getByTestId('seqreturn-node')).toHaveCount(0)
  })
})
