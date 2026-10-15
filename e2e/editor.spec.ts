import { expect, test } from '@playwright/test'
import { addScene, autoArrange, connect, edgeLabels, newProject, nodeIds, nodes, openApp, overlap, positions, settle, sizes, waitSaved } from './helpers'

test.describe('startup', () => {
  test('renders the sample project graph without errors', async ({ page }) => {
    const errors = await openApp(page)
    await expect(page.getByRole('button', { name: 'Scene Graph' })).toBeVisible()
    await expect(nodes(page)).toHaveCount(8)
    await expect(page.locator('.react-flow__edge')).toHaveCount(10)
    await expect(edgeLabels(page)).toHaveCount(10)
    await expect(page.getByTestId('auto-arrange')).toBeEnabled()
    expect(errors).toEqual([])
  })
})

test.describe('adding and connecting scenes', () => {
  test('adds scenes and connects them by dragging handles; duplicate pairs are rejected', async ({ page }) => {
    await openApp(page)
    await newProject(page)
    const [first] = await nodeIds(page)
    const second = await addScene(page, 'dream')
    await autoArrange(page) // separates the two nodes so the handles are reachable
    await connect(page, first, second)
    await expect(edgeLabels(page)).toHaveCount(1)
    await expect(edgeLabels(page).first()).toContainText('Hard cut') // prefixed with ↓ for reality → dream
    await expect(page.getByRole('heading', { name: 'Transition' })).toBeVisible()
    await connect(page, first, second) // same ordered pair again
    await expect(edgeLabels(page)).toHaveCount(1)
  })
})

test.describe('Auto Arrange', () => {
  test('arranges left to right, undoes/redoes in one step, and never re-arranges on reload or project switch', async ({ page }) => {
    await openApp(page)
    const original = await positions(page)

    await autoArrange(page)
    const arranged = await positions(page)
    expect(arranged).not.toEqual(original)
    expect(Object.keys(arranged).sort()).toEqual(Object.keys(original).sort())
    // left to right along the story flow, endings share the last column
    expect(arranged.s_hall.x).toBeLessThan(arranged.s_living.x)
    expect(arranged.s_living.x).toBeLessThan(arranged.s_bed.x)
    expect(arranged.s_bed.x).toBeLessThan(arranged.s_memory.x)
    expect(arranged.s_memory.x).toBeLessThan(arranged.s_end_free.x)
    expect(arranged.s_end_free.x).toBe(arranged.s_end_trapped.x)
    // no overlapping nodes
    const dims = await sizes(page)
    const ids = Object.keys(arranged)
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++)
        expect(overlap({ ...arranged[ids[i]], ...dims[ids[i]] }, { ...arranged[ids[j]], ...dims[ids[j]] }), `${ids[i]} vs ${ids[j]}`).toBe(false)

    // one undo restores the exact original layout; redo restores the arranged one
    await page.getByTestId('undo-btn').click()
    await settle(page)
    expect(await positions(page)).toEqual(original)
    await expect(page.getByTestId('undo-btn')).toBeDisabled()
    await page.getByTestId('redo-btn').click()
    expect(await positions(page)).toEqual(arranged)

    // arranging again is a no-op (idempotent) and adds no undo step
    await autoArrange(page)
    expect(await positions(page)).toEqual(arranged)

    // reload keeps the arranged positions exactly (no automatic re-arrangement)
    await waitSaved(page)
    await page.reload()
    await expect(nodes(page)).toHaveCount(8)
    expect(await positions(page)).toEqual(arranged)

    // manual drag still works, survives reload and a project switch round trip
    const node = page.locator('.react-flow__node[data-id="s_end_free"] .scene-node-title')
    const box = (await node.boundingBox())!
    await page.mouse.move(box.x + 10, box.y + 6)
    await page.mouse.down()
    await page.mouse.move(box.x + 130, box.y + 90, { steps: 8 })
    await page.mouse.up()
    const dragged = await positions(page)
    expect(dragged.s_end_free).not.toEqual(arranged.s_end_free)
    await waitSaved(page)

    await page.getByTestId('projects-btn').click()
    await page.getByTestId('library-new').click()
    await expect(nodes(page)).toHaveCount(1)
    await page.getByTestId('projects-btn').click()
    await page.getByTestId('library-row').filter({ hasText: 'The Hollow Apartment' }).getByTestId('library-open').click()
    await expect(nodes(page)).toHaveCount(8)
    await settle(page)
    expect(await positions(page)).toEqual(dragged)

    await waitSaved(page)
    await page.reload()
    await expect(nodes(page)).toHaveCount(8)
    expect(await positions(page)).toEqual(dragged)
  })
})

test.describe('edge routing', () => {
  test('reciprocal edges stay distinguishable and selectable; self-loops are visible, selectable and deletable', async ({ page }) => {
    await openApp(page)
    await newProject(page)
    const [a] = await nodeIds(page)
    const b = await addScene(page, 'dream')
    await autoArrange(page)

    await connect(page, a, b)
    await connect(page, b, a)
    await connect(page, a, a)
    await expect(edgeLabels(page)).toHaveCount(3)

    // every edge has a drawn path
    const paths = page.locator('.react-flow__edge-path')
    await expect(paths).toHaveCount(3)
    for (let i = 0; i < 3; i++) {
      const box = await paths.nth(i).boundingBox()
      expect(box && box.width > 0 && box.height > 0).toBe(true)
    }

    // labels never overlap each other
    const boxes = await edgeLabels(page).evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()))
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++)
        expect(overlap(boxes[i], boxes[j]), `labels ${i}/${j}`).toBe(false)

    // each edge is selectable and shows the right direction in the inspector
    const info = page.locator('.inspector .muted').first()
    const names = await page.locator('.scene-node-title').allInnerTexts()
    const [nameA, nameB] = [names[0], names[1]]
    await edgeLabels(page).nth(0).click()
    await expect(info).toContainText(`${nameA} → ${nameB}`)
    await edgeLabels(page).nth(1).click()
    await expect(info).toContainText(`${nameB} → ${nameA}`)
    await edgeLabels(page).nth(2).click()
    await expect(info).toContainText(`${nameA} → ${nameA}`)
    await expect(info).toContainText('Self loop')

    // the self-loop can be deleted with the keyboard; the other two remain
    await page.keyboard.press('Delete')
    await expect(edgeLabels(page)).toHaveCount(2)
  })
})

test.describe('projects and persistence', () => {
  test('switching projects loses no data, and the active project and edits survive a reload', async ({ page }) => {
    await openApp(page)
    const premise = page.getByLabel('Premise / notes')
    await premise.fill('Alpha notes')
    await newProject(page)
    await page.getByLabel('Premise / notes').fill('Beta notes')
    await waitSaved(page)

    await page.getByTestId('projects-btn').click()
    await page.getByTestId('library-row').filter({ hasText: 'The Hollow Apartment' }).getByTestId('library-open').click()
    await expect(nodes(page)).toHaveCount(8)
    await expect(page.getByLabel('Premise / notes')).toHaveValue('Alpha notes')

    await page.getByTestId('projects-btn').click()
    await page.getByTestId('library-row').filter({ hasText: 'Untitled Nightmare' }).getByTestId('library-open').click()
    await expect(page.getByLabel('Premise / notes')).toHaveValue('Beta notes')

    await page.getByTestId('projects-btn').click()
    await page.getByTestId('library-row').filter({ hasText: 'The Hollow Apartment' }).getByTestId('library-open').click()
    await waitSaved(page)
    await page.reload()
    await expect(nodes(page)).toHaveCount(8) // remembered the active project
    await expect(page.getByLabel('Premise / notes')).toHaveValue('Alpha notes')
  })

  test('added scenes persist after reload', async ({ page }) => {
    await openApp(page)
    await addScene(page, 'nightmare')
    await expect(nodes(page)).toHaveCount(9)
    await waitSaved(page)
    await page.reload()
    await expect(nodes(page)).toHaveCount(9)
  })
})

test.describe('language', () => {
  test('switches TR/EN instantly without reload or losing edits, and remembers the choice', async ({ page }) => {
    await openApp(page)
    await addScene(page, 'dream')
    await page.evaluate(() => ((window as unknown as { __marker: number }).__marker = 1))

    await page.getByTestId('lang-tr').click()
    await expect(page.locator('html')).toHaveAttribute('lang', 'tr')
    await expect(page.getByRole('button', { name: 'Sahne Grafı' })).toBeVisible()
    await expect(page.getByTestId('auto-arrange')).toHaveText('Otomatik Düzenle')
    await expect(nodes(page)).toHaveCount(9) // edits kept
    expect(await page.evaluate(() => (window as unknown as { __marker: number }).__marker)).toBe(1) // no reload

    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('lang', 'tr')
    await expect(page.getByTestId('auto-arrange')).toHaveText('Otomatik Düzenle')

    await page.getByTestId('lang-en').click()
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(page.getByTestId('auto-arrange')).toHaveText('Auto Arrange')
  })
})

test.describe('language detection', () => {
  test.use({ locale: 'tr-TR' })
  test('first visit in a Turkish browser starts in Turkish', async ({ page }) => {
    await openApp(page)
    await expect(page.locator('html')).toHaveAttribute('lang', 'tr')
    await expect(page.getByRole('button', { name: 'Sahne Grafı' })).toBeVisible()
  })
})
