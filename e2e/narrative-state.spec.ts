import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { connect, newProject, nodeIds, nodes, openApp, waitSaved } from './helpers'

const menu = (page: Page) => page.getByTestId('context-menu')
const item = (page: Page, text: string | RegExp) => menu(page).getByTestId('ctx-item').filter({ hasText: text })
const undo = (page: Page) => page.getByTestId('undo-btn')
const setNodes = (page: Page) => page.getByTestId('setflag-node')

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
const node = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`)

/** Two flags (Insulted default FALSE, Ritual default TRUE) created through the project Inspector. */
async function createFlags(page: Page) {
  await page.locator('.react-flow__pane').click({ position: { x: 300, y: 700 } })
  await page.getByTestId('flag-add').click()
  await page.getByTestId('flag-name').first().fill('VillagerWasInsulted')
  await page.getByTestId('flag-add').click()
  await page.getByTestId('flag-name').nth(1).fill('RitualCompleted')
  await page.getByTestId('flag-card').nth(1).getByTestId('flag-default-true').click()
  await expect(page.getByTestId('flag-card')).toHaveCount(2)
}

/** Start → SET VillagerWasInsulted = TRUE → IF [VillagerWasInsulted is TRUE] → TRUE: Collapse / FALSE: Talk. */
async function buildStateStory(page: Page) {
  await emptyCanvas(page)
  await createFlags(page)
  const start = await createAt(page, 40, 250, ['Add Scene', 'Reality'])
  const set = await createAt(page, 330, 250, ['Add Set Flag'])
  const iff = await createAt(page, 620, 250, ['Add IF / Branch'])
  const collapse = await createAt(page, 900, 210, ['Add Scene', 'Nightmare'])
  const talk = await createAt(page, 900, 430, ['Add Scene', 'Reality'])
  await connect(page, start, set)
  await connect(page, set, iff)
  await connect(page, iff, collapse, 'true')
  await connect(page, iff, talk, 'false')
  await expect(page.locator('.react-flow__edge')).toHaveCount(4)
  await node(page, set).click({ position: { x: 20, y: 15 } })
  await page.getByTestId('setflag-flag').selectOption({ label: 'VillagerWasInsulted' })
  await page.getByTestId('setflag-value-true').click()
  await node(page, iff).click({ position: { x: 20, y: 15 } })
  await page.getByTestId('expr-add').click()
  await page.getByTestId('expr-flag').selectOption({ label: 'VillagerWasInsulted' })
  return { start, set, iff, collapse, talk }
}

test.describe('flags and Set Flag nodes', () => {
  test('create flags, rename safely, and a Set Flag node shows its assignment on the canvas', async ({ page }) => {
    await openApp(page)
    await emptyCanvas(page)
    await createFlags(page)
    const set = await createAt(page, 330, 250, ['Add Set Flag'])
    await expect(setNodes(page)).toHaveCount(1)
    await expect(page.getByTestId('setflag-assign')).toContainText('No flag selected')
    await node(page, set).click({ position: { x: 20, y: 15 } })
    await page.getByTestId('setflag-flag').selectOption({ label: 'RitualCompleted' })
    await page.getByTestId('setflag-value-false').click()
    await expect(page.getByTestId('setflag-assign')).toContainText('RitualCompleted = FALSE')
    // renaming a flag updates the node without breaking the reference
    await page.locator('.react-flow__pane').click({ position: { x: 300, y: 700 } })
    await page.getByTestId('flag-name').nth(1).fill('RitualDone')
    await expect(page.getByTestId('setflag-assign')).toContainText('RitualDone = FALSE')
    // duplicate / empty / duplicate-name guards
    await page.getByTestId('flag-name').nth(1).fill('villagerwasinsulted')
    await expect(page.getByTestId('flag-card').nth(1)).toContainText('Another flag already has this name')
    await page.getByTestId('flag-name').nth(1).blur()
    await expect(page.getByTestId('flag-name').nth(1)).toHaveValue('RitualDone')
  })

  test('deleting a used flag lists affected nodes, needs confirmation and is one undo step', async ({ page }) => {
    await openApp(page)
    const { set, iff } = await buildStateStory(page)
    await page.locator('.react-flow__pane').click({ position: { x: 300, y: 700 } })
    await page.getByTestId('flag-card').first().getByTestId('flag-delete').click()
    await expect(page.getByTestId('flag-confirm')).toBeVisible()
    await expect(page.getByTestId('flag-affected').locator('li')).toHaveCount(2)
    await expect(page.getByTestId('flag-card')).toHaveCount(2) // nothing deleted yet
    await page.getByTestId('flag-detach').click()
    await expect(page.getByTestId('flag-card')).toHaveCount(1)
    await expect(page.getByTestId('setflag-assign')).toContainText('No flag selected')
    await node(page, iff).click({ position: { x: 20, y: 15 } })
    await expect(page.getByTestId('expr-add')).toBeVisible() // structured condition cleared, IF is manual again
    await undo(page).click()
    await expect(page.getByTestId('setflag-assign')).toContainText('VillagerWasInsulted = TRUE')
    await node(page, set).click({ position: { x: 20, y: 15 } })
    await expect(page.getByTestId('setflag-flag')).toHaveValue(/flag_/)
  })

  test('drag-to-create a Set Flag from a scene pin, then undo in one step', async ({ page }) => {
    await openApp(page)
    const out = await page.locator('.react-flow__handle[data-nodeid="s_living"][data-handleid="out"]').boundingBox()
    const x = out!.x + out!.width / 2
    const y = out!.y + out!.height / 2
    const edges = await page.locator('.react-flow__edge').count()
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + 50, y + 240, { steps: 8 })
    await page.mouse.up()
    await expect(menu(page)).toHaveAttribute('aria-label', 'Add node')
    await page.getByTestId('ctx-search').fill('set flag')
    await page.keyboard.press('Enter')
    await expect(setNodes(page)).toHaveCount(1)
    await expect(page.locator('.react-flow__edge')).toHaveCount(edges + 1)
    await undo(page).click()
    await expect(setNodes(page)).toHaveCount(0)
    await expect(page.locator('.react-flow__edge')).toHaveCount(edges)
  })

  test('connection rules: a Set Flag output accepts one connection; the node menu offers edit, duplicate, delete', async ({ page }) => {
    await openApp(page)
    await emptyCanvas(page)
    const a = await createAt(page, 40, 250, ['Add Scene', 'Reality'])
    const set = await createAt(page, 330, 250, ['Add Set Flag'])
    const b = await createAt(page, 620, 150, ['Add Scene', 'Dream'])
    const c = await createAt(page, 620, 400, ['Add Scene', 'Reality'])
    await connect(page, a, set)
    await connect(page, set, b)
    await expect(page.locator('.react-flow__edge')).toHaveCount(2)
    await connect(page, set, c) // single output: refused with an explanation
    await expect(page.locator('.react-flow__edge')).toHaveCount(2)
    await expect(page.getByTestId('connect-notice')).toContainText('single output')
    await node(page, set).click({ button: 'right', position: { x: 30, y: 15 } })
    await expect(menu(page).getByTestId('ctx-item')).toContainText(['Edit flag assignment', 'Duplicate', 'Delete'])
    await item(page, 'Duplicate').click()
    await expect(setNodes(page)).toHaveCount(2)
    await node(page, set).click({ button: 'right', position: { x: 30, y: 15 } })
    await item(page, 'Delete').click()
    await expect(setNodes(page)).toHaveCount(1)
    await expect(page.locator('.react-flow__edge')).toHaveCount(0)
    await undo(page).click()
    await expect(page.locator('.react-flow__edge')).toHaveCount(2)
  })
})

test.describe('structured IF conditions', () => {
  test('condition builder: check, AND / OR / NOT, preview, keyboard operation and clearing', async ({ page }) => {
    await openApp(page)
    const { iff } = await buildStateStory(page)
    await expect(page.getByTestId('expr-preview')).toContainText('VillagerWasInsulted is TRUE')
    await expect(node(page, iff).getByTestId('branch-expression')).toContainText('VillagerWasInsulted is TRUE')
    await page.getByTestId('expr-wrap-and').click()
    await expect(page.getByTestId('expr-check')).toHaveCount(2)
    await page.getByTestId('expr-check').nth(1).getByTestId('expr-flag').selectOption({ label: 'RitualCompleted' })
    await page.getByTestId('expr-check').nth(1).getByTestId('expr-wrap-not').click()
    await expect(page.getByTestId('expr-preview')).toContainText('VillagerWasInsulted is TRUE AND NOT (RitualCompleted is TRUE)')
    await expect(page.getByTestId('expr-default-result')).toContainText('FALSE') // defaults: Insulted FALSE
    await page.getByTestId('expr-op').selectOption('or')
    await expect(page.getByTestId('expr-preview')).toContainText(' OR ')
    // keyboard: focus a select, change it with the keyboard
    await page.getByTestId('expr-is').first().focus()
    await page.keyboard.press('ArrowDown')
    await expect(page.getByTestId('expr-preview')).toContainText('VillagerWasInsulted is FALSE')
    await page.getByTestId('expr-add-check').click()
    await expect(page.getByTestId('expr-check')).toHaveCount(3)
    await page.getByTestId('expr-clear').click()
    await expect(page.getByTestId('expr-add')).toBeVisible()
    await expect(node(page, iff).getByTestId('branch-expression')).toHaveCount(0)
  })
})

test.describe('state-aware simulation', () => {
  test('simulate both branches, read flag values, see overrides, and keep state out of storage', async ({ page }) => {
    await openApp(page)
    await buildStateStory(page)
    await waitSaved(page)
    await page.getByRole('button', { name: 'Simulator' }).click()
    const flagRow = (name: string) => page.getByTestId('sim-flag').filter({ has: page.getByText(name, { exact: true }) })
    await expect(flagRow('VillagerWasInsulted')).toHaveAttribute('data-value', 'false')
    await expect(flagRow('RitualCompleted')).toHaveAttribute('data-value', 'true')

    await expect(page.getByTestId('sim-option')).toHaveAttribute('data-target-type', 'setFlag')
    await page.getByTestId('sim-option').click()
    await expect(page.getByTestId('sim-pending')).toHaveAttribute('data-kind', 'setFlag')
    await expect(flagRow('VillagerWasInsulted')).toHaveAttribute('data-value', 'true')
    await expect(flagRow('VillagerWasInsulted')).toHaveAttribute('data-changed', 'true')
    await expect(page.getByTestId('sim-route-step')).toHaveCount(1) // a Set Flag node is not a scene visit

    await page.getByTestId('sim-option').click() // → IF
    await expect(page.getByTestId('sim-evaluated')).toHaveAttribute('data-value', 'true')
    const opts = page.getByTestId('sim-option')
    await expect(opts.nth(0)).toHaveAttribute('data-logic', 'valid')
    await expect(opts.nth(1)).toHaveAttribute('data-logic', 'override')
    await expect(page.getByTestId('sim-overrides')).toHaveCount(0)

    await opts.nth(0).click() // logically valid TRUE
    await expect(page.getByTestId('sim-route-step')).toHaveCount(2)
    await expect(page.getByTestId('sim-route-change')).toContainText('VillagerWasInsulted = TRUE')
    await expect(page.getByTestId('sim-overrides')).toHaveCount(0)

    // back twice to the IF, then take the contradicting FALSE output explicitly
    await page.getByTestId('sim-back').click()
    await expect(page.getByTestId('sim-pending')).toBeVisible()
    await opts.nth(1).click()
    await expect(page.getByTestId('sim-route-step').nth(1)).toContainText('New Scene')
    await expect(page.getByTestId('sim-overrides')).toBeVisible()
    await expect(page.getByTestId('sim-branch-pass').getByText('override')).toBeVisible()

    // restart recomputes from the defaults
    await page.getByTestId('sim-restart').click()
    await expect(flagRow('VillagerWasInsulted')).toHaveAttribute('data-value', 'false')
    await expect(page.getByTestId('sim-overrides')).toHaveCount(0)

    // simulator state is never persisted
    const stored = await page.evaluate(() => JSON.stringify(Object.entries(localStorage)))
    expect(stored).not.toContain('sim-flag')
  })

  test('compare marks routes that contain overrides as what-if', async ({ page }) => {
    await openApp(page)
    await buildStateStory(page)
    await page.getByRole('button', { name: 'Simulator' }).click()
    for (let i = 0; i < 2; i++) await page.getByTestId('sim-option').click()
    await page.getByTestId('sim-option').nth(0).click() // valid TRUE
    await page.getByTestId('sim-pin').click()
    await page.getByTestId('sim-back').click()
    await page.getByTestId('sim-option').nth(1).click() // override FALSE
    await expect(page.getByTestId('compare-panel')).toBeVisible()
    await expect(page.getByTestId('compare-overrides-note')).toContainText('what-if')
  })
})

test.describe('persistence, backup and localization', () => {
  test('flags, Set Flag nodes and structured conditions survive a reload and export as schema 6', async ({ page }) => {
    await openApp(page)
    const { iff } = await buildStateStory(page)
    await waitSaved(page)
    await page.reload()
    await expect(nodes(page)).toHaveCount(5)
    await expect(setNodes(page)).toHaveCount(1)
    await expect(page.getByTestId('setflag-assign')).toContainText('VillagerWasInsulted = TRUE')
    await node(page, iff).click({ position: { x: 20, y: 15 } })
    await expect(page.getByTestId('expr-preview')).toContainText('VillagerWasInsulted is TRUE')
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /backup/i }).first().click()])
    const exported = JSON.parse(readFileSync((await dl.path())!, 'utf8')) as { schemaVersion: number; project: { flags: { name: string; defaultValue: boolean }[]; logicNodes: { type: string }[] } }
    expect(exported.schemaVersion).toBe(7)
    expect(exported.project.flags.map((f) => [f.name, f.defaultValue])).toEqual([['VillagerWasInsulted', false], ['RitualCompleted', true]])
    expect(exported.project.logicNodes.map((n) => n.type).sort()).toEqual(['branch', 'setFlag'])
  })

  test('a v5 backup imports unchanged with no flags', async ({ page }) => {
    await openApp(page)
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /backup/i }).first().click()])
    const data = JSON.parse(readFileSync((await dl.path())!, 'utf8')) as { schemaVersion: number; project: Record<string, unknown> }
    data.schemaVersion = 5
    delete data.project.flags
    await page.getByTestId('projects-btn').click()
    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'Import as new project' }).click()
    await (await chooser).setFiles({ name: 'v5.horror.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) })
    await page.getByRole('button', { name: 'Add project' }).click()
    await expect(nodes(page)).toHaveCount(8)
    await page.locator('.react-flow__pane').click({ position: { x: 300, y: 760 } })
    await expect(page.getByTestId('flags-empty')).toBeVisible()
    const migrated = await page.evaluate(() => Object.entries(localStorage).filter(([k]) => k.includes('proj:')).map(([, v]) => JSON.parse(v).v))
    expect(migrated).toContain(7)
  })

  test('Turkish interface and a 390 px viewport', async ({ page }) => {
    await openApp(page)
    await buildStateStory(page)
    await page.getByTestId('lang-tr').click()
    await expect(page.getByTestId('setflag-assign')).toContainText('VillagerWasInsulted = DOĞRU')
    await page.mouse.click(500, 760, { button: 'right' })
    await expect(menu(page).getByTestId('ctx-item')).toContainText(['Sahne ekle', 'Özel sahne ekle', 'EĞER / Dal ekle', 'Bayrak Ata ekle', 'Yorum / Not ekle', 'Düğüm ekle…', 'Otomatik Düzenle', 'Görünüme sığdır'])
    await page.keyboard.press('Escape')
    await page.locator('.react-flow__pane').click({ position: { x: 300, y: 760 } })
    await expect(page.getByText('Anlatı bayrakları')).toBeVisible()
    await page.getByRole('button', { name: 'Simülatör' }).click()
    await expect(page.getByTestId('sim-state')).toContainText('Durum denetçisi')
    await page.getByTestId('lang-en').click()
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole('button', { name: 'Scene Graph' }).click()
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1)
    await page.getByTestId('add-node').click()
    await expect(item(page, 'Set Flag')).toBeVisible()
    const box = (await menu(page).boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(391)
    await page.keyboard.press('Escape')
  })
})
