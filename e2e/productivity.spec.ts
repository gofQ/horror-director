import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { connect, edgeLabels, newProject, nodeIds, nodes, openApp, positions, settle, waitSaved } from './helpers'

const menu = (page: Page) => page.getByTestId('context-menu')
const item = (page: Page, text: string | RegExp) => menu(page).getByTestId('ctx-item').filter({ hasText: text })
const undo = (page: Page) => page.getByTestId('undo-btn')
const points = (page: Page) => page.getByTestId('reroute-point')
const count = (page: Page) => page.getByTestId('selection-count')
const node = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`)

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
/** Four scenes in a row (A→B, C and D unconnected) on an empty canvas. */
async function row(page: Page) {
  await emptyCanvas(page)
  const ids: string[] = []
  for (const [i, x] of [40, 330, 620, 910].entries()) ids.push(await createAt(page, x, 260, ['Add Scene', i % 2 ? 'Dream' : 'Reality']))
  await connect(page, ids[0], ids[1])
  await expect(page.locator('.react-flow__edge')).toHaveCount(1)
  return ids
}
/** A point on the pane that is free of nodes, palette and minimap (right edge, vertically centred). */
const emptySpot = async (page: Page): Promise<[number, number]> => {
  const b = (await page.locator('.react-flow__pane').boundingBox())!
  return [b.x + b.width - 6, b.y + b.height / 2]
}
const centre = async (loc: ReturnType<Page['locator']>) => {
  const b = (await loc.boundingBox())!
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}
/** Adds a point to the first wire through its context menu (right-click on the wire's label). */
async function addPoint(page: Page) {
  await edgeLabels(page).first().click({ button: 'right' })
  await item(page, 'Add Reroute Point').click()
}

test.describe('reroute points', () => {
  test('add via the connection menu, drag to reshape, persist across reload, arrow and label stay', async ({ page }) => {
    await openApp(page)
    const label = edgeLabels(page).first()
    const labelText = await label.innerText()
    await addPoint(page)
    await expect(points(page)).toHaveCount(1)
    const edgeId = (await points(page).first().getAttribute('data-edge-id'))!
    await expect(page.locator(`marker#arrow-${edgeId}`)).toHaveCount(1)
    await expect(page.locator(`[data-testid="rf__edge-${edgeId}"] path.react-flow__edge-path`)).toHaveAttribute('marker-end', `url(#arrow-${edgeId})`)
    await expect(label).toBeVisible()
    expect(await label.innerText()).toBe(labelText)
    const before = await centre(points(page).first())
    const dPath = await page.locator(`[data-testid="rf__edge-${edgeId}"] path.react-flow__edge-path`).getAttribute('d')
    await page.mouse.move(before.x, before.y)
    await page.mouse.down()
    await page.mouse.move(before.x + 20, before.y + 120, { steps: 10 })
    await page.mouse.up()
    const after = await centre(points(page).first())
    expect(after.y - before.y).toBeGreaterThan(80)
    await expect(page.locator(`[data-testid="rf__edge-${edgeId}"] path.react-flow__edge-path`)).not.toHaveAttribute('d', dPath!)
    expect(await page.evaluate(() => document.querySelectorAll('.react-flow__edge').length)).toBe(10) // no wire lost
    await undo(page).click() // the drag was ONE undo step
    const back = await centre(points(page).first())
    expect(Math.abs(back.y - before.y)).toBeLessThan(3)
    await page.getByTestId('redo-btn').click()
    await waitSaved(page)
    await page.reload()
    await expect(points(page)).toHaveCount(1)
    const reloaded = await centre(points(page).first())
    expect(Math.abs(reloaded.y - after.y)).toBeLessThan(6)
  })

  test('multiple points keep their order; remove via the point menu; undo/redo; inspector list; clear', async ({ page }) => {
    await openApp(page)
    await addPoint(page)
    await addPoint(page)
    await expect(points(page)).toHaveCount(2)
    await expect(page.getByTestId('reroute-list').locator('li')).toHaveCount(2)
    await points(page).first().click({ button: 'right' })
    await expect(menu(page)).toHaveAttribute('aria-label', 'Reroute point menu')
    await item(page, 'Remove Point').click()
    await expect(points(page)).toHaveCount(1)
    await undo(page).click()
    await expect(points(page)).toHaveCount(2)
    await page.getByTestId('redo-btn').click()
    await expect(points(page)).toHaveCount(1)
    // the wire itself is still the selected connection and offers the connection menu
    await edgeLabels(page).first().click({ button: 'right' })
    await expect(item(page, 'Clear Reroute Points')).toBeVisible()
    await item(page, 'Clear Reroute Points').click()
    await expect(points(page)).toHaveCount(0)
    await expect(page.getByTestId('reroute-none')).toBeVisible()
  })

  test('points change only the drawing: ids, endpoints, labels and the simulator are unchanged', async ({ page }) => {
    await openApp(page)
    await waitSaved(page)
    const ids = await nodeIds(page)
    const label = await edgeLabels(page).first().innerText()
    await addPoint(page)
    await expect(points(page)).toHaveCount(1)
    expect(await nodeIds(page)).toEqual(ids)
    expect(await edgeLabels(page).first().innerText()).toBe(label)
    await page.getByRole('button', { name: 'Simulator' }).click()
    await expect(page.getByTestId('sim-option').first()).toBeVisible()
    await expect(page.getByTestId('sim-status')).toBeVisible()
  })

  test('IF and Set Flag connections accept points; Inspector buttons are the touch/keyboard alternative', async ({ page }) => {
    await openApp(page)
    await emptyCanvas(page)
    const a = await createAt(page, 40, 260, ['Add Scene', 'Reality'])
    const set = await createAt(page, 330, 260, ['Add Set Flag'])
    const iff = await createAt(page, 620, 260, ['Add IF / Branch'])
    const c = await createAt(page, 910, 200, ['Add Scene', 'Dream'])
    await connect(page, a, set)
    await connect(page, set, iff)
    await connect(page, iff, c, 'true')
    await expect(page.locator('.react-flow__edge')).toHaveCount(3)
    const labels = edgeLabels(page)
    for (let i = 0; i < (await labels.count()); i++) {
      await labels.nth(i).click()
      await page.getByTestId('reroute-add-mid').click()
    }
    expect(await points(page).count()).toBeGreaterThanOrEqual(3)
    await waitSaved(page)
    await page.reload()
    expect(await points(page).count()).toBeGreaterThanOrEqual(3)
  })
})

test.describe('multi-selection and batch actions', () => {
  test('Ctrl-click builds a multi-selection with clear feedback; the Inspector shows the batch panel; Esc/pane click clears', async ({ page }) => {
    await openApp(page)
    const ids = await row(page)
    await node(page, ids[0]).click({ position: { x: 30, y: 20 } })
    await expect(count(page)).toHaveCount(0)
    await node(page, ids[1]).click({ position: { x: 30, y: 20 }, modifiers: ['Control'] })
    await expect(count(page)).toContainText('2 selected')
    await expect(page.getByTestId('multi-title')).toContainText('2 items selected')
    await node(page, ids[2]).click({ position: { x: 30, y: 20 }, modifiers: ['Control'] })
    await expect(count(page)).toContainText('3 selected')
    await expect(node(page, ids[2])).toHaveClass(/selected/)
    await node(page, ids[2]).click({ position: { x: 30, y: 20 }, modifiers: ['Control'] }) // toggles off
    await expect(count(page)).toContainText('2 selected')
    await page.getByTestId('selection-clear').click()
    await expect(count(page)).toHaveCount(0)
    await node(page, ids[0]).click({ position: { x: 30, y: 20 } })
    await expect(page.locator('.inspector input').first()).toBeVisible() // single selection keeps the normal Inspector
    await expect(page.getByTestId('multi-title')).toHaveCount(0)
  })

  test('Shift+drag draws a selection box; Select mode makes a plain drag do the same; Pan mode pans', async ({ page }) => {
    await openApp(page)
    const ids = await row(page)
    const pane = page.locator('.react-flow__pane')
    const box = (await pane.boundingBox())!
    await page.keyboard.down('Shift')
    await page.mouse.move(box.x + 10, box.y + 170)
    await page.mouse.down()
    await page.mouse.move(box.x + 560, box.y + 420, { steps: 8 })
    await page.mouse.up()
    await page.keyboard.up('Shift')
    await expect(count(page)).toContainText(/[2-9] selected/)
    await page.keyboard.press('Escape')
    await expect(count(page)).toHaveCount(0)

    await page.getByTestId('select-mode').click()
    await expect(page.getByTestId('select-mode')).toHaveAttribute('aria-pressed', 'true')
    await page.mouse.move(box.x + 10, box.y + 170)
    await page.mouse.down()
    await page.mouse.move(box.x + 1250, box.y + 420, { steps: 8 })
    await page.mouse.up()
    await expect(count(page)).toContainText('4 selected')
    expect(ids).toHaveLength(4)
    await page.getByTestId('select-mode').click() // back to Pan mode
    const before = await positions(page)
    await page.mouse.move(box.x + 300, box.y + 600)
    await page.mouse.down()
    await page.mouse.move(box.x + 380, box.y + 640, { steps: 5 })
    await page.mouse.up()
    const after = await positions(page)
    // nodes are rendered at flow coordinates: panning moves the view, not the project
    expect(after).toEqual(before)
  })

  test('dragging one selected node moves all of them together in ONE undo step; Delete removes the batch in one step', async ({ page }) => {
    await openApp(page)
    const ids = await row(page)
    await node(page, ids[2]).click({ position: { x: 30, y: 20 } })
    await node(page, ids[3]).click({ position: { x: 30, y: 20 }, modifiers: ['Control'] })
    await expect(count(page)).toContainText('2 selected')
    const before = await positions(page)
    const start = await centre(node(page, ids[2]))
    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    await page.mouse.move(start.x + 60, start.y + 110, { steps: 12 })
    await page.mouse.up()
    const moved = await positions(page)
    const d2 = { x: moved[ids[2]].x - before[ids[2]].x, y: moved[ids[2]].y - before[ids[2]].y }
    const d3 = { x: moved[ids[3]].x - before[ids[3]].x, y: moved[ids[3]].y - before[ids[3]].y }
    // flow units: the screen drag (60, 110) divided by the zoom, so check direction and size rather than exact values
    expect(d2.x).toBeGreaterThan(40)
    expect(Math.abs(d2.y / d2.x - 110 / 60)).toBeLessThan(0.15)
    expect(Math.abs(d3.x - d2.x)).toBeLessThan(1.5)
    expect(Math.abs(d3.y - d2.y)).toBeLessThan(1.5)
    expect(moved[ids[0]]).toEqual(before[ids[0]])
    await undo(page).click()
    expect(await positions(page)).toEqual(before)
    await page.getByTestId('redo-btn').click()

    await expect(count(page)).toContainText('2 selected')
    await page.keyboard.press('Delete')
    await expect(nodes(page)).toHaveCount(2)
    await expect(count(page)).toHaveCount(0)
    await undo(page).click()
    await expect(nodes(page)).toHaveCount(4)
  })

  test('a connection drag or a pan never edits the project', async ({ page }) => {
    await openApp(page)
    const ids = await row(page)
    await waitSaved(page)
    const stored = () => page.evaluate(() => JSON.stringify(Object.entries(localStorage).filter(([k]) => k.includes('proj:'))))
    const snap = await stored()
    const out = await centre(page.locator(`.react-flow__handle[data-nodeid="${ids[2]}"][data-handleid="out"]`))
    await page.mouse.move(out.x, out.y)
    await page.mouse.down()
    await page.mouse.move(out.x + 5, out.y + 3, { steps: 3 }) // tiny jitter below the drag threshold
    await page.mouse.up()
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
    expect(await stored()).toBe(snap)
    await expect(undo(page)).toBeEnabled() // only the earlier setup steps
  })
})

test.describe('copy, paste and duplicate', () => {
  test('Ctrl+C / Ctrl+V pastes near the cursor with fresh ids and internal connections only; Ctrl+D duplicates; both undo in one step', async ({ page }) => {
    await openApp(page)
    const ids = await row(page)
    await node(page, ids[0]).click({ position: { x: 30, y: 20 } })
    await node(page, ids[1]).click({ position: { x: 30, y: 20 }, modifiers: ['Control'] })
    await page.keyboard.press('Control+c')
    await expect(page.getByTestId('connect-notice')).toContainText('Copied 2')
    await page.mouse.move(300, 560)
    await page.keyboard.press('Control+v')
    await expect(nodes(page)).toHaveCount(6)
    await expect(count(page)).toContainText('2 selected')
    expect(await page.locator('.react-flow__edge').count()).toBe(2) // A→B plus the copy of A→B
    const pasted = (await nodeIds(page)).filter((i) => !ids.includes(i))
    expect(pasted).toHaveLength(2)
    const pos = await positions(page)
    expect(Math.min(...pasted.map((i) => pos[i].y))).toBeGreaterThan(Math.max(...ids.map((i) => pos[i].y)) - 1)
    await undo(page).click()
    await expect(nodes(page)).toHaveCount(4)
    await page.getByTestId('redo-btn').click()
    await expect(nodes(page)).toHaveCount(6)

    // undo removed the pasted nodes from the selection; select the originals again and duplicate them
    await node(page, ids[0]).click({ position: { x: 30, y: 20 } })
    await node(page, ids[1]).click({ position: { x: 30, y: 20 }, modifiers: ['Control'] })
    await page.keyboard.press('Control+d')
    await expect(nodes(page)).toHaveCount(8)
    await expect(page.locator('.react-flow__edge')).toHaveCount(3)
    await undo(page).click()
    await expect(nodes(page)).toHaveCount(6)

    // the canvas menu pastes at the pointer; the node menu offers Copy / Duplicate
    await page.mouse.click(700, 640, { button: 'right' })
    await expect(item(page, 'Paste here')).toBeVisible()
    await item(page, 'Paste here').click()
    await expect(nodes(page)).toHaveCount(8)
    await node(page, ids[2]).click({ button: 'right', position: { x: 30, y: 20 } })
    await expect(menu(page).getByTestId('ctx-item')).toContainText(['Edit / Focus', 'Copy', 'Duplicate'])
    await page.keyboard.press('Escape')
  })

  test('copying scenes keeps their content and branch ports; the project stays valid', async ({ page }) => {
    await openApp(page)
    await page.locator('.react-flow__pane').click({ position: { x: 700, y: 760 } })
    await page.keyboard.press('Control+a')
    await expect(count(page)).toContainText('8 selected')
    await page.keyboard.press('Control+c')
    await page.keyboard.press('Control+v')
    await expect(nodes(page)).toHaveCount(16)
    await waitSaved(page)
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /backup/i }).first().click()])
    const data = JSON.parse(readFileSync((await dl.path())!, 'utf8')) as { project: { scenes: { id: string; title: string; triggers: { id: string }[]; shots: { id: string }[] }[]; transitions: { id: string }[] } }
    const ids = data.project.scenes.map((s) => s.id)
    expect(new Set(ids).size).toBe(16)
    expect(new Set(data.project.scenes.flatMap((s) => s.triggers.map((t) => t.id))).size).toBe(data.project.scenes.reduce((a, s) => a + s.triggers.length, 0))
    expect(new Set(data.project.transitions.map((t) => t.id)).size).toBe(data.project.transitions.length)
    expect(data.project.transitions).toHaveLength(20)
    // re-import proves the pasted project passes the strict validation
    await page.getByTestId('projects-btn').click()
    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'Import as new project' }).click()
    await (await chooser).setFiles({ name: 'p.horror.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) })
    await page.getByRole('button', { name: 'Add project' }).click()
    await expect(nodes(page)).toHaveCount(16)
  })

  test('shortcuts never fire while typing in a field', async ({ page }) => {
    await openApp(page)
    await page.getByText('Apartment Hallway').first().click()
    const title = page.getByLabel('Title').first()
    await title.fill('')
    await title.press('Control+a')
    await title.pressSequentially('fail, Fast')
    await expect(title).toHaveValue('fail, Fast')
    await title.press('Control+d')
    await title.press('Control+v')
    await expect(nodes(page)).toHaveCount(8)
    await expect(count(page)).toHaveCount(0)
    const desc = page.locator('.inspector textarea').first()
    await desc.fill('f')
    await desc.press('Control+a')
    await desc.pressSequentially('abc')
    await expect(desc).toHaveValue('abc')
    await expect(nodes(page)).toHaveCount(8)
  })

  test('the clipboard and the selection are cleared when the project changes', async ({ page }) => {
    await openApp(page)
    await page.locator('.react-flow__pane').click({ position: { x: 700, y: 760 } })
    await page.keyboard.press('Control+a')
    await page.keyboard.press('Control+c')
    await newProject(page)
    await expect(count(page)).toHaveCount(0)
    await page.locator('.react-flow__pane').click({ position: { x: 700, y: 760 } })
    await page.keyboard.press('Control+v') // nothing to paste in another project
    await expect(nodes(page)).toHaveCount(1)
    await page.mouse.click(700, 700, { button: 'right' })
    await expect(item(page, 'Paste here')).toHaveAttribute('aria-disabled', 'true')
    await page.keyboard.press('Escape')
  })
})

test.describe('large graph navigation', () => {
  function bigProject(n: number, cols: number) {
    const scenes = Array.from({ length: n }, (_, i) => ({
      id: `g${i}`, title: `Scene ${i}`, kind: i % 5 === 0 ? 'dream' : 'reality', position: { x: (i % cols) * 330, y: Math.floor(i / cols) * 230 },
      description: '', unrealLevel: '', ambience: '', duration: 60, loop: { enabled: false, maxIterations: 0, exitCondition: '' }, triggers: [], shots: [], audioCues: [], characterStates: {},
    }))
    const transitions = Array.from({ length: n - 1 }, (_, i) => ({ id: `t${i}`, source: `g${i}`, target: `g${i + 1}`, label: '', style: 'cut', condition: '', duration: 1 }))
    return { name: 'Large', description: '', startSceneId: 'g0', scenes, transitions, characters: [] }
  }
  test('120 nodes: fit, select all, fit/center on the selection, batch delete and undo, minimap, keyboard fit', async ({ page }) => {
    await openApp(page)
    await page.getByTestId('projects-btn').click()
    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'Import as new project' }).click()
    await (await chooser).setFiles({ name: 'big.horror.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bigProject(120, 12))) })
    await page.getByRole('button', { name: 'Add project' }).click()
    await expect.poll(() => nodes(page).count()).toBeGreaterThan(20) // only visible nodes are rendered for big graphs
    await settle(page)
    await expect(page.locator('.react-flow__minimap')).toBeVisible()
    await page.mouse.click(...(await emptySpot(page)))
    await page.keyboard.press('Control+a')
    await expect(count(page)).toContainText('120 selected')
    await page.getByTestId('fit-selection').click()
    await settle(page)
    await page.getByTestId('center-selection').click()
    await settle(page)
    await page.keyboard.press('Escape')
    await expect(count(page)).toHaveCount(0)
    // select a few and fit on them with the keyboard
    await node(page, 'g30').click({ position: { x: 10, y: 10 }, force: true })
    await page.keyboard.press('f')
    await settle(page)
    await expect(node(page, 'g30')).toBeVisible()
    await page.mouse.click(...(await emptySpot(page)))
    await page.keyboard.press('Control+a')
    await page.keyboard.press('Delete')
    await expect(nodes(page)).toHaveCount(0)
    await undo(page).click()
    await expect.poll(() => nodes(page).count()).toBeGreaterThan(0) // the viewport is zoomed in, so only visible nodes are rendered
    await page.keyboard.press('Control+a')
    await expect(count(page)).toContainText('120 selected')
  })
})

test.describe('library integrity', () => {
  test('an inconsistent stored record is reported, can be downloaded byte-exact, and is only opened after explicit confirmation', async ({ page }) => {
    await openApp(page)
    await waitSaved(page)
    const raw = await page.evaluate(() => {
      const idx = JSON.parse(localStorage.getItem('horror-director:library:v1')!)
      const src = JSON.parse(localStorage.getItem('horror-director:proj:' + idx.activeId)!)
      const bad = structuredClone(src)
      bad.project.name = 'Broken Project'
      bad.project.transitions.push({ ...bad.project.transitions[0], id: 'ghost_link', target: 'ghost_scene' })
      const text = JSON.stringify(bad)
      idx.projects.push({ id: 'bad1', name: 'Broken Project', createdAt: 1, updatedAt: 1 })
      localStorage.setItem('horror-director:library:v1', JSON.stringify(idx))
      localStorage.setItem('horror-director:proj:bad1', text)
      return text
    })
    await page.reload()
    await expect(nodes(page).first()).toBeVisible()
    await page.getByTestId('projects-btn').click()
    const row = page.getByTestId('library-row').filter({ hasText: 'Broken Project' })
    await expect(row.getByTestId('library-inconsistent')).toContainText('inconsistent')
    await expect(row.getByTestId('library-inconsistent').locator('li').first()).toBeVisible()
    const [dl] = await Promise.all([page.waitForEvent('download'), row.getByTestId('library-download-raw').click()])
    expect(readFileSync((await dl.path())!, 'utf8')).toBe(raw)
    // nothing was rewritten by looking at it
    expect(await page.evaluate(() => localStorage.getItem('horror-director:proj:bad1'))).toBe(raw)
    await row.getByTestId('library-open-anyway').click()
    await expect(page.getByTestId('library-open-anyway-confirm')).toBeVisible()
    expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('horror-director:unreadable:')).length)).toBe(0)
    await page.getByTestId('library-open-anyway-yes').click()
    await expect(page.getByTestId('library-dialog')).toBeHidden()
    const copies = await page.evaluate(() => Object.entries(localStorage).filter(([k]) => k.startsWith('horror-director:unreadable:')))
    expect(copies).toHaveLength(1)
    expect(copies[0][1]).toBe(raw)
    expect(await page.evaluate(() => localStorage.getItem('horror-director:proj:bad1'))).toBe(raw)
  })
})

test.describe('localization and small screens', () => {
  test('Turkish menus for reroute points, selection and clipboard', async ({ page }) => {
    await openApp(page)
    await page.getByTestId('lang-tr').click()
    await edgeLabels(page).first().click({ button: 'right' })
    await expect(menu(page).getByTestId('ctx-item')).toContainText(['Bağlantıyı seç / düzenle', 'Yönlendirme Noktası Ekle'])
    await item(page, 'Yönlendirme Noktası Ekle').click()
    await expect(points(page)).toHaveCount(1)
    await points(page).first().click({ button: 'right' })
    await expect(menu(page)).toHaveAttribute('aria-label', 'Yönlendirme noktası menüsü')
    await expect(item(page, 'Noktayı Kaldır')).toBeVisible()
    await page.keyboard.press('Escape')
    await page.locator('.react-flow__pane').click({ position: { x: 700, y: 760 } })
    await page.keyboard.press('Control+a')
    await expect(count(page)).toContainText('8 seçili')
    await nodes(page).first().click({ button: 'right', position: { x: 30, y: 20 } })
    await expect(menu(page)).toHaveAttribute('aria-label', 'Seçim menüsü')
    await expect(menu(page).getByTestId('ctx-item')).toContainText(['8 öğeyi kopyala', '8 öğeyi çoğalt', 'Seçime Sığdır', 'Seçime Ortala', '8 öğeyi sil'])
    await page.keyboard.press('Escape')
  })

  test('390 px: no page overflow and the Select/Pan toggle (touch alternative to Shift+drag) is available', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openApp(page)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1)
    await expect(page.getByTestId('select-mode')).toBeVisible()
    await page.getByTestId('select-mode').click()
    await expect(page.getByTestId('select-mode')).toHaveAttribute('aria-pressed', 'true')
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1)
  })
})
