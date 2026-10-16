import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { connect, edgeLabels, newProject, nodeIds, nodes, openApp, settle, waitSaved } from './helpers'

type RawExport = {
  schemaVersion: number
  project: { scenes: Record<string, unknown>[]; transitions: Record<string, unknown>[]; logicNodes: Record<string, unknown>[]; comments: Record<string, unknown>[]; sceneTypes: Record<string, unknown>[] }
}

const menu = (page: Page) => page.getByTestId('context-menu')
const item = (page: Page, text: string | RegExp) => menu(page).getByTestId('ctx-item').filter({ hasText: text })
const branches = (page: Page) => page.getByTestId('branch-node')
const undo = (page: Page) => page.getByTestId('undo-btn')
const storage = (page: Page) => page.evaluate(() => JSON.stringify(Object.entries(localStorage).sort()))

/** Right-click the empty canvas at (x, y), choose a (sub)menu entry and return the id of the node it created. */
async function createAt(page: Page, x: number, y: number, path: (string | RegExp)[]) {
  const before = new Set(await nodeIds(page))
  await page.mouse.click(x, y, { button: 'right' })
  await expect(menu(page)).toBeVisible()
  for (const step of path) await item(page, step).first().click()
  await expect.poll(async () => (await nodeIds(page)).length).toBe(before.size + 1)
  return (await nodeIds(page)).find((i) => !before.has(i))!
}
/** New project with an empty canvas (the opening scene is deleted), so right-clicks have free space. */
async function emptyCanvas(page: Page) {
  await newProject(page)
  await nodes(page).first().click()
  await page.keyboard.press('Delete')
  await expect(nodes(page)).toHaveCount(0)
}
/** Village Square → IF → TRUE: Collapse / FALSE: Conversation continues; returns the ids. */
async function buildStory(page: Page) {
  await emptyCanvas(page)
  const sq = await createAt(page, 40, 250, ['Add Scene', 'Reality'])
  const iff = await createAt(page, 330, 250, ['Add IF / Branch'])
  const collapse = await createAt(page, 620, 210, ['Add Scene', 'Nightmare'])
  const talk = await createAt(page, 620, 430, ['Add Scene', 'Reality'])
  await connect(page, sq, iff)
  await connect(page, iff, collapse, 'true')
  await connect(page, iff, talk, 'false')
  await expect(page.locator('.react-flow__edge')).toHaveCount(3)
  return { sq, iff, collapse, talk }
}

test.describe('canvas context menu and node creation', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page)
  })

  test('right-click opens the graph menu at the pointer; scenes are created at that position', async ({ page }) => {
    await page.mouse.click(300, 760, { button: 'right' })
    await expect(menu(page)).toBeVisible()
    await expect(menu(page)).toHaveAttribute('aria-label', 'Graph menu')
    await expect(menu(page).getByTestId('ctx-item')).toContainText(['Add Scene', 'Add Custom Scene', 'Add IF / Branch', 'Add Set Flag', 'Add Comment / Note', 'Add node…', 'Auto Arrange', 'Fit View'])
    await item(page, 'Add Scene').click()
    await expect(item(page, 'Nightmare')).toBeVisible()
    await page.getByTestId('ctx-back').click()
    await expect(item(page, 'Add IF / Branch')).toBeVisible()
    await item(page, 'Add Scene').click()
    const before = new Set(await nodeIds(page))
    await item(page, 'Dream').click()
    await expect(menu(page)).toBeHidden()
    await expect(nodes(page)).toHaveCount(before.size + 1)
    const id = (await nodeIds(page)).find((i) => !before.has(i))!
    const box = (await page.locator(`.react-flow__node[data-id="${id}"]`).boundingBox())!
    expect(Math.abs(box.x - 300)).toBeLessThanOrEqual(2)
    expect(Math.abs(box.y - 760)).toBeLessThanOrEqual(2)
    await expect(page.locator(`.react-flow__node[data-id="${id}"]`)).toHaveAttribute('data-id', id)
  })

  test('the minimap draws every node (scenes, IF nodes and comments)', async ({ page }) => {
    await expect(page.locator('.react-flow__minimap-node')).toHaveCount(8)
    await createAt(page, 120, 700, ['Add IF / Branch'])
    await createAt(page, 500, 700, ['Add Comment / Note'])
    await expect(page.locator('.react-flow__minimap-node')).toHaveCount(10)
  })

  test('adds IF and comment nodes; comments are non-executable frames', async ({ page }) => {
    const iff = await createAt(page, 120, 700, ['Add IF / Branch'])
    await expect(branches(page)).toHaveCount(1)
    await expect(page.locator(`.react-flow__node[data-id="${iff}"]`).getByText('TRUE')).toBeVisible()
    await expect(page.locator(`.react-flow__node[data-id="${iff}"]`).getByText('FALSE')).toBeVisible()
    await createAt(page, 500, 700, ['Add Comment / Note'])
    await expect(page.getByTestId('comment-node')).toHaveCount(1)
    await page.getByLabel('Title').fill('Act 1 — Village')
    await expect(page.getByTestId('comment-node')).toContainText('Act 1 — Village')
    // comments never appear in the analysis statistics
    await page.getByText(/^Analysis$/).first().click()
    await expect(page.getByText(/Act 1/)).toHaveCount(0)
  })

  test('Escape, outside click and selection close the menu; focus returns', async ({ page }) => {
    await page.mouse.click(300, 700, { button: 'right' })
    await expect(menu(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(menu(page)).toBeHidden()
    await page.mouse.click(300, 700, { button: 'right' })
    await expect(menu(page)).toBeVisible()
    await page.mouse.click(700, 760)
    await expect(menu(page)).toBeHidden()
    await page.mouse.click(300, 700, { button: 'right' })
    await page.locator('.react-flow__node').first().click()
    await expect(menu(page)).toBeHidden()
  })

  test('keyboard: arrows move, Enter activates; the menu stays inside the viewport', async ({ page }) => {
    const vp = page.viewportSize()!
    await page.mouse.click(600, vp.height - 20, { button: 'right' })
    await expect(menu(page)).toBeVisible()
    const box = (await menu(page).boundingBox())!
    expect(box.x + box.width).toBeLessThanOrEqual(vp.width)
    expect(box.y + box.height).toBeLessThanOrEqual(vp.height)
    expect(box.y).toBeGreaterThanOrEqual(0)
    await expect(item(page, 'Add Scene')).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(item(page, /Add IF/)).toBeFocused() // "Add Custom Scene" is disabled and skipped
    await page.keyboard.press('Enter')
    await expect(menu(page)).toBeHidden()
    await expect(branches(page)).toHaveCount(1)
  })

  test('the searchable picker filters, ranks and creates', async ({ page }) => {
    await page.getByTestId('add-node').click()
    await expect(menu(page)).toHaveAttribute('aria-label', 'Add node')
    await expect(page.getByTestId('ctx-search')).toBeFocused()
    await expect(menu(page).getByTestId('ctx-item')).toHaveCount(13) // 5 kinds + IF + Set Flag + Event + Delay + Random + Sequence + Sequence Return + comment
    await page.getByTestId('ctx-search').fill('night')
    await expect(menu(page).getByTestId('ctx-item')).toHaveCount(1)
    await page.getByTestId('ctx-search').fill('zzz')
    await expect(menu(page).getByText('No matching nodes')).toBeVisible()
    await page.getByTestId('ctx-search').fill('branch')
    await page.keyboard.press('Enter')
    await expect(branches(page)).toHaveCount(1)
  })

  test('right-click on inputs is app-owned: native menu prevented, themed text menu shown', async ({ page }) => {
    await page.getByText('Apartment Hallway').first().click()
    const input = page.getByLabel('Title').first()
    await expect(input).toBeVisible()
    const prevented = await page.evaluate(() => {
      const el = document.querySelector('.inspector input') as HTMLElement
      let result: boolean | null = null
      window.addEventListener('contextmenu', (e) => (result = e.defaultPrevented), { once: true })
      el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
      return result
    })
    expect(prevented).toBe(true)
    await expect(menu(page)).toHaveCount(1)
    await expect(menu(page)).toHaveAttribute('aria-label', 'Text actions')
    await expect(menu(page).getByTestId('ctx-item')).toHaveText([/Cut/, /Copy/, /Paste/, /Select all/])
  })
})

test.describe('node and connection menus', () => {
  test('scene menu: edit, duplicate, set start, timeline/sequence, planners, delete', async ({ page }) => {
    await openApp(page)
    const hall = page.locator('.react-flow__node[data-id="s_hall"]')
    await hall.click({ button: 'right', position: { x: 30, y: 20 } })
    await expect(menu(page)).toHaveAttribute('aria-label', 'Node menu')
    await expect(menu(page).getByTestId('ctx-item')).toContainText(['Edit / Focus', 'Duplicate', 'Set as start', 'Open Timeline', 'Open Sequence', 'Open Shot Planner', 'Open Audio Planner', 'Delete'])
    await expect(item(page, 'Set as start')).toHaveAttribute('aria-disabled', 'true') // already the start scene
    await expect(page.locator('.inspector input').first()).toHaveValue('Apartment Hallway') // right-click selected it

    await item(page, 'Duplicate').click()
    await expect(nodes(page)).toHaveCount(9)
    await page.locator('.react-flow__node[data-id="s_living"]').click({ button: 'right', position: { x: 30, y: 20 } })
    await item(page, 'Set as start').click()
    await page.locator('.react-flow__node[data-id="s_hall"]').click({ button: 'right', position: { x: 30, y: 20 } })
    await expect(item(page, 'Set as start')).not.toHaveAttribute('aria-disabled', 'true')
    await item(page, 'Open Shot Planner').click()
    await expect(page.getByTestId('shot-planner')).toBeVisible()
    await page.getByTestId('shot-close').click()
    await hall.click({ button: 'right', position: { x: 30, y: 20 } })
    await item(page, 'Open Audio Planner').click()
    await expect(page.getByTestId('audio-planner')).toBeVisible()
    await page.getByTestId('audio-close').click()

    await page.getByRole('button', { name: 'Scene Graph' }).click()
    await hall.click({ button: 'right', position: { x: 30, y: 20 } })
    await item(page, 'Open Sequence').click()
    await expect(page.getByTestId('sequence-view')).toBeVisible()
    await expect(page.locator('.timeline-view select').first()).toHaveValue('s_hall')
    await page.getByRole('button', { name: 'Scene Graph' }).click()

    await hall.click({ button: 'right', position: { x: 30, y: 20 } })
    await item(page, 'Delete').click()
    await expect(nodes(page)).toHaveCount(8)
    await undo(page).click()
    await expect(nodes(page)).toHaveCount(9)
  })

  test('IF menu: edit condition focuses the Inspector field; duplicate; delete', async ({ page }) => {
    await openApp(page)
    const iff = await createAt(page, 120, 700, ['Add IF / Branch'])
    const node = page.locator(`.react-flow__node[data-id="${iff}"]`)
    await node.click({ button: 'right', position: { x: 30, y: 15 } })
    await expect(menu(page).getByTestId('ctx-item')).toContainText(['Edit condition', 'Duplicate', 'Delete'])
    await item(page, 'Edit condition').click()
    const condition = page.locator('.inspector textarea').first()
    await expect(condition).toBeFocused()
    await condition.fill('Did the protagonist insult the villagers?')
    await expect(node.getByTestId('branch-condition')).toContainText('insult the villagers')
    await node.click({ button: 'right', position: { x: 30, y: 15 } })
    await item(page, 'Duplicate').click()
    await expect(branches(page)).toHaveCount(2)
    await node.click({ button: 'right', position: { x: 30, y: 15 } })
    await item(page, 'Delete').click()
    await expect(branches(page)).toHaveCount(1)
  })

  test('connection menu: select, insert IF (undoable, blocked for designed transitions) and delete', async ({ page }) => {
    await openApp(page)
    const label = edgeLabels(page).filter({ hasText: /^↑ Wake up$/ }).first()
    await label.click({ button: 'right' })
    await expect(menu(page)).toHaveAttribute('aria-label', 'Connection menu')
    await expect(menu(page).getByTestId('ctx-item')).toContainText(['Select / Edit connection', 'Insert IF node', 'Delete connection'])
    await item(page, 'Select / Edit').click()
    await expect(page.getByLabel('Label')).toHaveValue('Wake up')

    const before = await page.locator('.react-flow__edge').count()
    await label.click({ button: 'right' })
    await item(page, 'Insert IF node').click()
    await expect(branches(page)).toHaveCount(1)
    await expect(page.locator('.react-flow__edge')).toHaveCount(before + 1)
    await undo(page).click()
    await expect(branches(page)).toHaveCount(0)
    await expect(page.locator('.react-flow__edge')).toHaveCount(before)

    // a transition with a psychological design cannot be re-wired through an IF node
    await edgeLabels(page).filter({ hasText: 'Enter apartment' }).first().click({ button: 'right' })
    await expect(item(page, 'Insert IF node')).toHaveAttribute('aria-disabled', 'true')
    await page.keyboard.press('Escape')
    await label.click({ button: 'right' })
    await item(page, 'Delete connection').click()
    await expect(page.locator('.react-flow__edge')).toHaveCount(before - 1)
  })

  test('Shift+F10 opens the menu for the focused node and Escape returns focus', async ({ page }) => {
    await openApp(page)
    const hall = page.locator('.react-flow__node[data-id="s_hall"]')
    await hall.focus()
    await page.keyboard.press('Shift+F10')
    await expect(menu(page)).toHaveAttribute('aria-label', 'Node menu')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await expect(menu(page).locator('[role="menuitem"]:focus')).toHaveCount(1)
    await page.keyboard.press('Escape')
    await expect(menu(page)).toBeHidden()
    await expect(hall).toBeFocused()
  })
})

test.describe('drag-to-create and connection feedback', () => {
  test('dragging an output pin onto empty canvas opens the picker; choosing connects in one undoable step', async ({ page }) => {
    await openApp(page)
    const start = await page.locator('.react-flow__handle[data-nodeid="s_living"][data-handleid="out"]').boundingBox()
    const x = start!.x + start!.width / 2
    const y = start!.y + start!.height / 2
    const edgesBefore = await page.locator('.react-flow__edge').count()
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + 60, y + 260, { steps: 10 })
    await expect(page.getByTestId('connection-line')).toBeVisible()
    await page.mouse.up()
    await expect(menu(page)).toHaveAttribute('aria-label', 'Add node')
    await expect(menu(page).getByTestId('ctx-item')).toHaveCount(11) // compatible targets only: no comment, no unassigned Return
    await page.getByTestId('ctx-search').fill('IF')
    await page.keyboard.press('Enter')
    await expect(branches(page)).toHaveCount(1)
    await expect(page.locator('.react-flow__edge')).toHaveCount(edgesBefore + 1)
    await undo(page).click() // one step removes the node and its wire
    await expect(branches(page)).toHaveCount(0)
    await expect(page.locator('.react-flow__edge')).toHaveCount(edgesBefore)
  })

  test('cancelling the picker changes nothing', async ({ page }) => {
    await openApp(page)
    await waitSaved(page)
    const snapshot = await storage(page)
    const start = await page.locator('.react-flow__handle[data-nodeid="s_living"][data-handleid="out"]').boundingBox()
    const x = start!.x + start!.width / 2
    const y = start!.y + start!.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + 50, y + 240, { steps: 8 })
    await page.mouse.up()
    await expect(menu(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(menu(page)).toBeHidden()
    await expect(branches(page)).toHaveCount(0)
    await expect(nodes(page)).toHaveCount(8)
    await expect(undo(page)).toBeDisabled()
    await page.waitForTimeout(600)
    expect(await storage(page)).toBe(snapshot)
  })

  test('a scene can be created from a scene output pin; the new scene is connected', async ({ page }) => {
    await openApp(page)
    const start = await page.locator('.react-flow__handle[data-nodeid="s_living"][data-handleid="out"]').boundingBox()
    const x = start!.x + start!.width / 2
    const y = start!.y + start!.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + 20, y + 280, { steps: 8 })
    await page.mouse.up()
    await item(page, 'Memory').click()
    await expect(nodes(page)).toHaveCount(9)
    expect(await page.locator('.react-flow__edge').count()).toBe(11)
  })

  test('invalid connections are rejected with an explanation and do not change the project', async ({ page }) => {
    await openApp(page)
    await emptyCanvas(page)
    const a = await createAt(page, 40, 250, ['Add Scene', 'Reality'])
    const b = await createAt(page, 400, 250, ['Add Scene', 'Dream'])
    await connect(page, a, b)
    await expect(page.locator('.react-flow__edge')).toHaveCount(1)
    await connect(page, a, b) // same ordered pair again
    await expect(page.locator('.react-flow__edge')).toHaveCount(1)
    await expect(page.getByTestId('connect-notice')).toContainText('already connected in this direction')
    // an IF node cannot connect to itself
    const iff = await createAt(page, 40, 480, ['Add IF / Branch'])
    await connect(page, iff, iff, 'true')
    await expect(page.locator('.react-flow__edge')).toHaveCount(1)
    await expect(page.getByTestId('connect-notice')).toContainText('cannot connect to itself')
    // each output pin takes one connection
    await connect(page, iff, b, 'true')
    await expect(page.locator('.react-flow__edge')).toHaveCount(2)
    await connect(page, iff, a, 'true')
    await expect(page.locator('.react-flow__edge')).toHaveCount(2)
    await expect(page.getByTestId('connect-notice')).toContainText('already connected')
  })

  test('the connection preview shows valid and invalid targets before committing', async ({ page }) => {
    await openApp(page)
    await emptyCanvas(page)
    const a = await createAt(page, 40, 250, ['Add Scene', 'Reality'])
    const b = await createAt(page, 400, 250, ['Add Scene', 'Dream'])
    await connect(page, a, b)
    const src = (await page.locator(`.react-flow__handle[data-nodeid="${a}"][data-handleid="out"]`).boundingBox())!
    const ok = (await page.locator(`.react-flow__handle[data-nodeid="${b}"][data-handleid="in"]`).boundingBox())!
    await page.mouse.move(src.x + src.width / 2, src.y + src.height / 2)
    await page.mouse.down()
    await page.mouse.move(ok.x + ok.width / 2, ok.y + ok.height / 2, { steps: 8 })
    await expect(page.getByTestId('connection-line')).toHaveAttribute('data-status', 'invalid') // the pair already exists
    await page.mouse.up()
  })
})

test.describe('IF node in the story path simulator', () => {
  test('build Village Square → IF → TRUE / FALSE and simulate both choices explicitly', async ({ page }) => {
    await openApp(page)
    const { sq, iff } = await buildStory(page)
    await page.locator(`.react-flow__node[data-id="${sq}"]`).click({ position: { x: 20, y: 20 } })
    await page.getByLabel('Title').first().fill('Village Square')
    await page.locator(`.react-flow__node[data-id="${iff}"]`).click({ position: { x: 20, y: 15 } })
    await page.locator('.inspector textarea').first().fill('Did the protagonist insult the villagers?')
    await waitSaved(page)

    await page.getByRole('button', { name: 'Simulator' }).click()
    await expect(page.getByTestId('sim-current-title')).toHaveText('Village Square')
    await expect(page.getByTestId('sim-option')).toHaveCount(1)
    await expect(page.getByTestId('sim-option')).toHaveAttribute('data-target-type', 'branch')
    await page.getByTestId('sim-option').click()
    await expect(page.getByTestId('sim-pending')).toContainText('Did the protagonist insult the villagers?')
    await expect(page.getByTestId('sim-pending')).toContainText('never evaluated')
    await expect(page.getByTestId('sim-route-step')).toHaveCount(1) // no extra scene visit for the IF node
    const opts = page.getByTestId('sim-option')
    await expect(opts).toHaveCount(2)
    await expect(opts.nth(0)).toHaveAttribute('data-port', 'true')
    await expect(opts.nth(1)).toHaveAttribute('data-port', 'false')
    await expect(opts.nth(0).getByTestId('sim-branch-assumption')).toContainText('IF “Did the protagonist insult the villagers?” is TRUE')

    await opts.nth(0).click()
    await expect(page.getByTestId('sim-pending')).toHaveCount(0)
    await expect(page.getByTestId('sim-route-step')).toHaveCount(2)
    await expect(page.getByTestId('sim-route-step').nth(1)).toContainText('New Scene')
    await expect(page.getByTestId('sim-branch-pass')).toContainText('is TRUE')
    await expect(page.getByTestId('sim-stats')).toContainText('2')

    // step back to the branch and choose FALSE: a different route
    await page.getByTestId('sim-back').click()
    await expect(page.getByTestId('sim-pending')).toBeVisible()
    await page.getByTestId('sim-option').nth(1).click()
    await expect(page.getByTestId('sim-branch-pass')).toContainText('is FALSE')
    await expect(page.getByTestId('sim-route-step')).toHaveCount(2)
  })

  test('route comparison understands TRUE vs FALSE paths', async ({ page }) => {
    await openApp(page)
    await buildStory(page)
    await page.getByRole('button', { name: 'Simulator' }).click()
    await page.getByTestId('sim-option').click()
    await page.getByTestId('sim-option').nth(0).click() // TRUE
    await page.getByTestId('sim-pin').click()
    await page.getByTestId('sim-back').click()
    await page.getByTestId('sim-option').nth(1).click() // FALSE
    await expect(page.getByTestId('compare-panel')).toBeVisible()
    await expect(page.getByTestId('compare-panel')).not.toContainText('identical')
  })
})

test.describe('custom scene types', () => {
  test('create, reuse from the menu and Inspector, persist across reload, safe delete', async ({ page }) => {
    await openApp(page)
    await page.locator('.react-flow__pane').click({ position: { x: 300, y: 700 } }) // nothing selected: project Inspector
    await page.getByTestId('scene-type-add').click()
    const card = page.getByTestId('scene-type').first()
    await card.getByLabel('Name').fill('Reality Breakdown')
    await card.getByTestId('scene-type-base').selectOption('nightmare')
    await card.locator('[data-color="#7dcfff"]').click()
    await card.getByLabel('Icon').selectOption('Ghost')
    await card.getByLabel('Default description').fill('The room stops making sense.')
    await expect(card).toContainText('Used by 0 scene(s)')

    // reuse from the context menu: base kind is applied, defaults are used
    const before = new Set(await nodeIds(page))
    await page.mouse.click(120, 700, { button: 'right' })
    await item(page, 'Add Custom Scene').click()
    await item(page, 'Reality Breakdown').click()
    await expect(nodes(page)).toHaveCount(before.size + 1)
    const id = (await nodeIds(page)).find((i) => !before.has(i))!
    const node = page.locator(`.react-flow__node[data-id="${id}"]`)
    await expect(node.getByTestId('scene-type-pill')).toHaveText('Reality Breakdown')
    await expect(node).toContainText('Nightmare')
    await expect(page.locator('.inspector textarea').first()).toHaveValue('The room stops making sense.')
    await waitSaved(page)

    // reload: type and scene persist
    await page.reload()
    await expect(nodes(page).first()).toBeVisible()
    await expect(page.locator(`.react-flow__node[data-id="${id}"]`).getByTestId('scene-type-pill')).toBeVisible()

    // reuse from the Inspector on another scene (kind follows the base kind)
    await page.locator('.react-flow__node[data-id="s_living"]').click({ position: { x: 20, y: 20 } })
    await page.locator('.inspector select').first().selectOption({ label: 'Reality Breakdown (Nightmare)' })
    await expect(page.locator('.react-flow__node[data-id="s_living"]').getByTestId('scene-type-pill')).toBeVisible()
    await expect(page.locator('.react-flow__node[data-id="s_living"]')).toContainText('Nightmare')

    // the base kind is locked while scenes use the type, deletion needs an explicit confirmation
    await page.locator('.react-flow__pane').click({ position: { x: 300, y: 760 } })
    await expect(page.getByTestId('scene-type-base')).toBeDisabled()
    await page.getByTestId('scene-type-delete').click()
    await expect(page.getByTestId('scene-type-confirm')).toContainText('2 scene(s) use it')
    await page.getByTestId('scene-type-detach').click()
    await expect(page.getByTestId('scene-type')).toHaveCount(0)
    await expect(page.getByTestId('scene-type-pill')).toHaveCount(0)
    await expect(page.locator('.react-flow__node[data-id="s_living"]')).toContainText('Nightmare') // scenes keep their kind
    await undo(page).click()
    await expect(page.getByTestId('scene-type')).toHaveCount(1)
    await expect(page.getByTestId('scene-type-pill')).toHaveCount(2)
  })

  test('the picker lists custom types under their own category', async ({ page }) => {
    await openApp(page)
    await page.locator('.react-flow__pane').click({ position: { x: 300, y: 700 } })
    await page.getByTestId('scene-type-add').click()
    await page.getByTestId('scene-type').first().getByLabel('Name').fill('Chase Sequence')
    await page.getByTestId('add-node').click()
    await expect(menu(page).getByTestId('ctx-item')).toHaveCount(14)
    await page.getByTestId('ctx-search').fill('chase')
    await expect(menu(page).getByTestId('ctx-item')).toHaveCount(1)
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('scene-type-pill')).toHaveText('Chase Sequence')
  })
})

test.describe('context menus outside the graph', () => {
  test('Timeline trigger rows and Sequence items expose only existing actions', async ({ page }) => {
    await openApp(page)
    await page.getByText(/^Timeline$/).first().click()
    await page.locator('.timeline-view select').first().selectOption({ label: 'Apartment Hallway · Reality' })
    const row = page.locator('.trigger-row').first()
    await row.click({ button: 'right' })
    await expect(menu(page).getByTestId('ctx-item')).toHaveText([/Select/, /Delete/])
    await item(page, 'Select').click()
    await expect(page.locator('.trigger-row.selected')).toHaveCount(1)
    await row.click({ button: 'right' })
    await item(page, 'Delete').click()
    await expect(page.locator('.trigger-row')).toHaveCount(1)
    await undo(page).click()
    await expect(page.locator('.trigger-row')).toHaveCount(2)

    await page.getByTestId('tl-mode-sequence').click()
    await page.getByTestId('seq-row').nth(0).click({ button: 'right' })
    await expect(menu(page).getByTestId('ctx-item')).toHaveText([/Select/, /Open in Shot planner/])
    await item(page, 'Open in Shot planner').click()
    await expect(page.getByTestId('shot-planner')).toBeVisible()
    await page.getByTestId('shot-close').click()
    await page.locator('[data-testid="seq-item"][data-kind="trigger"]').first().click({ button: 'right' })
    await item(page, 'Edit in trigger editor').click()
    await expect(page.getByTestId('tl-mode-triggers')).toHaveAttribute('aria-selected', 'true')
  })

  test('library project rows get a context menu with the existing actions', async ({ page }) => {
    await openApp(page)
    await page.getByTestId('projects-btn').click()
    await page.getByTestId('library-new').click()
    await page.getByTestId('projects-btn').click()
    const rows = page.getByTestId('library-row')
    await expect(rows).toHaveCount(2)
    const inactive = rows.filter({ hasNot: page.locator('.badge.start') }).first()
    await inactive.click({ button: 'right' })
    await expect(menu(page).getByTestId('ctx-item')).toHaveText([/Open/, /Rename/, /Duplicate/, /Delete/])
    await item(page, 'Duplicate').click()
    await expect(rows).toHaveCount(3)
    await rows.last().click({ button: 'right' })
    await item(page, 'Delete').click()
    await expect(page.getByRole('alert').filter({ hasText: /delete/i }).first()).toBeVisible()
    await page.keyboard.press('Escape')
  })
})

test.describe('localization and small screens', () => {
  test('menus, pins and node labels switch between Turkish and English', async ({ page }) => {
    await openApp(page)
    await createAt(page, 120, 700, ['Add IF / Branch'])
    await page.getByTestId('lang-tr').click()
    await expect(branches(page).first().getByText('DOĞRU')).toBeVisible()
    await expect(branches(page).first().getByText('YANLIŞ')).toBeVisible()
    await page.mouse.click(500, 700, { button: 'right' })
    await expect(menu(page)).toHaveAttribute('aria-label', 'Grafik menüsü')
    await expect(menu(page).getByTestId('ctx-item')).toContainText(['Sahne ekle', 'Özel sahne ekle', 'EĞER / Dal ekle', 'Bayrak Ata ekle', 'Yorum / Not ekle', 'Düğüm ekle…', 'Görünüme sığdır'])
    await page.keyboard.press('Escape')
    await page.getByTestId('lang-en').click()
    await expect(branches(page).first().getByText('TRUE')).toBeVisible()
  })

  test('390 px: no page overflow, the picker stays on screen and long-press opens the menu', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openApp(page)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1)
    await page.getByTestId('add-node').click()
    const box = (await menu(page).boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(391)
    expect(box.y + box.height).toBeLessThanOrEqual(845)
    await page.keyboard.press('Escape')
    // touch alternative: long-press on the canvas
    await page.locator('.react-flow__pane').dispatchEvent('pointerdown', { pointerType: 'touch', clientX: 180, clientY: 620, isPrimary: true, bubbles: true })
    await page.waitForTimeout(800)
    await expect(menu(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(menu(page)).toBeHidden()
  })
})

test.describe('backup, import and storage', () => {
  async function backup(page: Page) {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /backup/i }).first().click()])
    return JSON.parse(readFileSync((await dl.path())!, 'utf8')) as RawExport
  }
  async function importAsNew(page: Page, data: unknown) {
    await page.getByTestId('projects-btn').click()
    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'Import as new project' }).click()
    await (await chooser).setFiles({ name: 'in.horror.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) })
  }

  test('a schema-5 backup contains the logic data and round-trips through import', async ({ page }) => {
    await openApp(page)
    await buildStory(page)
    await page.getByTestId('add-comment').click()
    await waitSaved(page)
    const exported = await backup(page)
    expect(exported.schemaVersion).toBe(9)
    expect(exported.project.logicNodes).toHaveLength(1)
    expect(exported.project.comments).toHaveLength(1)
    expect(exported.project.transitions.filter((t) => t.sourcePort)).toHaveLength(2)
    await importAsNew(page, exported)
    await page.getByRole('button', { name: 'Add project' }).click()
    await expect(branches(page)).toHaveCount(1)
    const again = await backup(page)
    expect(again.project).toEqual(exported.project)
  })

  test('a schema-4 file imports unchanged and is backed up as schema 5 with empty logic data', async ({ page }) => {
    await openApp(page)
    const original = await backup(page)
    const v4 = structuredClone(original)
    v4.schemaVersion = 4
    const proj = v4.project as unknown as Record<string, unknown>
    delete proj.logicNodes
    delete proj.comments
    delete proj.sceneTypes
    await importAsNew(page, v4)
    await page.getByRole('button', { name: 'Add project' }).click()
    await expect(nodes(page)).toHaveCount(8)
    const migrated = await backup(page)
    expect(migrated.schemaVersion).toBe(9)
    expect(migrated.project.logicNodes).toEqual([])
    expect(migrated.project.scenes).toEqual(original.project.scenes)
    expect(migrated.project.transitions).toEqual(original.project.transitions)
  })

  test('malformed logic data (two links on one pin) is rejected and the project is unchanged', async ({ page }) => {
    await openApp(page)
    await buildStory(page)
    await waitSaved(page)
    const bad = await backup(page)
    const outs = bad.project.transitions.filter((t) => t.sourcePort)
    outs[1].sourcePort = outs[0].sourcePort
    await importAsNew(page, bad)
    await expect(page.getByRole('alert').first()).toContainText('already connected')
    await page.getByRole('button', { name: 'Close' }).last().click()
    await expect(branches(page)).toHaveCount(1)
  })

  test('opening and viewing never rewrites stored data', async ({ page }) => {
    await openApp(page)
    await settle(page)
    const snapshot = await storage(page)
    await page.mouse.click(300, 700, { button: 'right' })
    await page.keyboard.press('Escape')
    await page.getByTestId('add-node').click()
    await page.keyboard.press('Escape')
    await page.waitForTimeout(600)
    expect(await storage(page)).toBe(snapshot)
  })
})
