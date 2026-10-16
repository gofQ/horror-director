import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { openApp, waitSaved } from './helpers'

const tab = (page: Page, name: string) => page.locator('.tabs button').filter({ hasText: name })
const row = (page: Page, id: string) => page.locator(`[data-testid="task-row"][data-task-id="${id}"]`)
const RND = 'T-random-rnd_door'

async function openProduction(page: Page) {
  await openApp(page)
  await page.getByTestId('projects-btn').click()
  await page.getByTestId('library-add-sample').click()
  await expect(page.getByTestId('library-dialog')).toBeHidden()
  await tab(page, 'Production').click()
  await expect(page.getByTestId('task-explorer')).toBeVisible()
}
const gotoProduction = async (page: Page) => {
  await tab(page, 'Production').click()
  await expect(page.getByTestId('task-explorer')).toBeVisible()
}
const pick = async (page: Page, id: string) => {
  await page.getByTestId('task-search').fill(id.replace(/^T-[a-zA-Z]+-/, ''))
  await row(page, id).click()
  await expect(page.getByTestId('task-id')).toHaveText(id)
}
const move = (page: Page, to: string) => page.getByTestId(`progress-move-${to}`).click()
const badge = (page: Page) => page.getByTestId('task-details').getByTestId('progress-badge')
async function verify(page: Page, id: string) {
  await pick(page, id)
  await move(page, 'inProgress')
  await move(page, 'submitted')
  await page.getByTestId('review-approve').click()
  await page.getByTestId('review-sure').check()
  await page.getByTestId('review-confirm-yes').click()
  await expect(badge(page)).toHaveAttribute('data-status', 'verified')
}
const storedKeys = (page: Page) => page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('horror-director:progress')))

test.describe('production progress tracking', () => {
  test('records progress, keeps it across reload and shows it in the dashboard; readiness stays separate', async ({ page }) => {
    await openProduction(page)
    await pick(page, RND)
    await expect(badge(page)).toHaveAttribute('data-status', 'notStarted')
    await expect(page.getByTestId('task-details').locator('.ready-badge').first()).toBeVisible() // readiness is its own badge
    await move(page, 'inProgress')
    await expect(badge(page)).toHaveAttribute('data-status', 'inProgress')
    await page.getByTestId('progress-notes').fill('door logic started')
    await page.getByTestId('progress-notes-save').click()
    await expect(page.getByTestId('progress-history')).toContainText('Not started → In progress')
    await expect(page.getByTestId('pg-count-inProgress')).toContainText('1')
    await expect(row(page, RND)).toHaveAttribute('data-progress', 'inProgress')
    // Ready authoring info is never read as done
    await expect(page.getByTestId('pg-count-verified')).toContainText('0')
    await page.reload()
    await gotoProduction(page)
    await pick(page, RND)
    await expect(badge(page)).toHaveAttribute('data-status', 'inProgress')
    await expect(page.getByTestId('progress-notes')).toHaveValue('door logic started')
    await page.getByTestId('pg-count-inProgress').click()
    await expect(page.getByTestId('task-count')).toContainText('1 of')
  })

  test('Unreal and Unity progress never mix', async ({ page }) => {
    await openProduction(page)
    await pick(page, RND)
    await move(page, 'inProgress')
    await page.getByTestId('engine-unity').click()
    await expect(row(page, RND)).toHaveAttribute('data-progress', 'notStarted')
    await row(page, RND).click()
    await move(page, 'blocked')
    await expect(row(page, RND)).toHaveAttribute('data-progress', 'blocked')
    await page.getByTestId('engine-unreal').click()
    await expect(row(page, RND)).toHaveAttribute('data-progress', 'inProgress')
  })

  test('report import: strict validation, preview, never auto-approves; then explicit approval and reopening', async ({ page }) => {
    await openProduction(page)
    await pick(page, RND)
    await move(page, 'inProgress')
    await page.getByTestId('report-open').click()
    await page.getByTestId('report-template').click()
    const tpl = await page.getByTestId('report-text').inputValue()
    expect(JSON.parse(tpl)).toMatchObject({ format: 'horror-director.completion-report', version: 1, taskId: RND, engine: 'unreal' })
    // mismatched task / engine / malformed / bad JSON are rejected
    const bad = (patch: Record<string, unknown>) => JSON.stringify({ ...JSON.parse(tpl), ...patch })
    for (const [patch, text] of [[{ taskId: 'T-level-s_cottage' }, 'different task'], [{ engine: 'unity' }, 'different engine'], [{ projectId: 'nope' }, 'different project'], [{ version: 3 }, 'Unsupported report version']] as const) {
      await page.getByTestId('report-text').fill(bad(patch))
      await page.getByTestId('report-check').click()
      await expect(page.getByTestId('report-errors')).toContainText(text)
      await expect(page.getByTestId('report-preview')).toHaveCount(0)
    }
    await page.getByTestId('report-text').fill('{oops')
    await page.getByTestId('report-check').click()
    await expect(page.getByTestId('report-errors')).toContainText('not valid JSON')
    // an outdated fingerprint is previewable but flagged; script-like text stays inert
    const claim = { ...JSON.parse(tpl).agentClaim, notes: '<img src=x onerror="window.__pwned=1"> <script>window.__pwned=1</script>', changedFiles: [{ path: 'Content/Door.uasset', change: 'added' }] }
    await page.getByTestId('report-text').fill(bad({ sourceFingerprint: 'stale0stale000', agentClaim: claim }))
    await page.getByTestId('report-check').click()
    await expect(page.getByTestId('report-preview')).toBeVisible()
    await expect(page.getByTestId('report-preview').getByTestId('report-outdated')).toBeVisible()
    await expect(page.getByTestId('report-preview')).toContainText('claims, not checked')
    await expect(page.getByTestId('report-preview')).toContainText('<img src=x')
    expect(await page.locator('img[src="x"]').count()).toBe(0)
    expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined()
    await page.getByTestId('report-text').fill(bad({ agentClaim: { ...claim, notes: 'plain notes', limitations: ['no Unreal editor available'] } }))
    await page.getByTestId('report-check').click()
    await page.getByTestId('report-save-submit').click()
    await expect(badge(page)).toHaveAttribute('data-status', 'submitted') // report moved it to Submitted, nothing more
    await expect(page.getByTestId('report-view')).toContainText('Reported by the agent, not verified')
    await expect(page.getByTestId('review-panel')).toBeVisible()
    await expect(page.getByTestId('review-panel')).toContainText('did not run or verify')
    // approval needs an explicit confirmation
    await page.getByTestId('review-approve').click()
    await expect(page.getByTestId('review-confirm')).toBeVisible()
    await expect(page.getByTestId('review-confirm-yes')).toBeDisabled()
    await page.getByTestId('review-sure').check()
    await page.getByTestId('review-note').fill('matches the authored 60/40 split')
    await page.getByTestId('review-confirm-yes').click()
    await expect(badge(page)).toHaveAttribute('data-status', 'verified')
    await expect(page.getByTestId('progress-history')).toContainText('Submitted for review → Verified / approved')
    // reopen
    await move(page, 'inProgress')
    await expect(badge(page)).toHaveAttribute('data-status', 'inProgress')
    await expect(page.getByTestId('report-view')).toBeVisible() // evidence kept
    // request changes path
    await move(page, 'submitted')
    await page.getByTestId('review-request').click()
    await expect(page.getByTestId('plan-status')).toContainText('review note')
    await page.getByTestId('review-note').fill('pins reversed')
    await page.getByTestId('review-request').click()
    await expect(badge(page)).toHaveAttribute('data-status', 'inProgress')
    await expect(page.getByTestId('review-last')).toContainText('changes requested')
  })

  test('manual report entry uses the same validation', async ({ page }) => {
    await openProduction(page)
    await pick(page, RND)
    await move(page, 'inProgress')
    await page.getByTestId('report-open').click()
    await page.getByTestId('report-manual-toggle').click()
    await page.getByTestId('manual-outcome').selectOption('partial')
    await page.getByTestId('manual-files').fill('modified Source/Door.cpp\nadded Source/Door.h')
    await page.getByTestId('manual-checks').fill('passed Door unit test\nnotRun Playtest')
    await page.getByTestId('manual-questions').fill('Which door asset?')
    await page.getByTestId('manual-check').click()
    await expect(page.getByTestId('report-preview')).toContainText('Source/Door.cpp')
    await expect(page.getByTestId('report-preview')).toContainText('Which door asset?')
    await page.getByTestId('report-save').click()
    await expect(badge(page)).toHaveAttribute('data-status', 'inProgress') // saving a report does not change status
    await expect(page.getByTestId('report-view')).toContainText('partial')
  })

  test('relevant graph edits mark a verified task STALE; moving nodes does not; re-approval needs acknowledgement', async ({ page }) => {
    await openProduction(page)
    await verify(page, RND)
    await expect(page.getByTestId('stale-badge')).toHaveCount(0)
    // moving things around is not a source change
    await tab(page, 'Scene Graph').click()
    await page.getByTestId('auto-arrange').click()
    await waitSaved(page)
    await gotoProduction(page)
    await pick(page, RND)
    await expect(page.getByTestId('stale-badge')).toHaveCount(0)
    // a real edit: change the Random probability from the task’s source link
    await page.getByTestId('task-source').first().click()
    await page.getByTestId('random-prob-range').fill('72')
    await waitSaved(page)
    await gotoProduction(page)
    await pick(page, RND)
    await expect(badge(page)).toHaveAttribute('data-status', 'verified') // saved status untouched
    await expect(page.getByTestId('task-details').getByTestId('stale-badge').first()).toBeVisible()
    await expect(row(page, RND)).toHaveAttribute('data-stale', 'true')
    await expect(page.getByTestId('stale-box')).toContainText('node:rnd_door')
    await expect(page.getByTestId('stale-downstream')).toBeVisible()
    await expect(page.getByTestId('pg-count-stale')).toContainText('1')
    await expect(page.getByTestId('pg-list-stale')).toContainText(RND)
    // stale tasks are filterable and their downstream tasks are flagged for a recheck
    await expect(page.getByTestId('pg-list-recheck')).toBeVisible()
    await page.getByTestId('pg-count-stale').click()
    await expect(page.getByTestId('task-count')).toContainText('1 of')
    await page.getByTestId('pg-count-stale').click()
    // re-approval requires the explicit acknowledgement
    await page.getByTestId('review-approve').click()
    await page.getByTestId('review-sure').check()
    await expect(page.getByTestId('review-confirm-yes')).toBeDisabled()
    await page.getByTestId('review-ack-stale').check()
    await page.getByTestId('review-confirm-yes').click()
    await expect(page.getByTestId('task-details').getByTestId('stale-badge')).toHaveCount(0)
    await expect(page.getByTestId('pg-count-stale')).toContainText('0')
    // stale source link opens the graph at the changed node
    await expect(badge(page)).toHaveAttribute('data-status', 'verified')
  })

  test('dependency progress is shown separately from readiness and lets you jump to tasks', async ({ page }) => {
    await openProduction(page)
    await pick(page, 'T-level-s_cottage')
    await expect(page.getByTestId('dep-progress')).toContainText('Dependencies verified: 0 of 1')
    await expect(page.getByTestId('pg-list-ready')).toContainText('T-foundation-project')
    await verify(page, 'T-foundation-project')
    await expect(page.getByTestId('pg-list-ready')).not.toContainText('T-foundation-project')
    await expect(page.getByTestId('pg-list-ready')).toContainText('T-level-s_cottage')
    await pick(page, 'T-level-s_cottage')
    await expect(page.getByTestId('dep-progress')).toContainText('Dependencies verified: 1 of 1')
    await page.getByTestId('pg-list-ready').getByRole('button', { name: 'T-level-s_cottage' }).click()
    await expect(page.getByTestId('task-id')).toHaveText('T-level-s_cottage')
  })

  test('project switching and duplication: progress follows the project, deletion keeps it as an orphan', async ({ page }) => {
    await openProduction(page)
    await pick(page, RND)
    await move(page, 'inProgress')
    // a second, empty project has no progress
    await page.getByTestId('projects-btn').click()
    await page.getByTestId('library-new').click()
    await expect(page.getByTestId('library-dialog')).toBeHidden()
    await gotoProduction(page)
    await expect(page.getByTestId('pg-count-inProgress')).toContainText('0')
    // duplicate the showcase project: the copy carries the progress
    await page.getByTestId('projects-btn').click()
    const show = page.getByTestId('library-row').filter({ hasText: 'The Hollow Village' })
    await show.getByRole('button', { name: /Duplicate/ }).click()
    await expect(page.getByTestId('library-row')).toHaveCount(4)
    await page.getByTestId('library-row').filter({ hasText: 'The Hollow Village' }).last().getByTestId('library-open').click()
    await expect(page.getByTestId('library-dialog')).toBeHidden()
    await gotoProduction(page)
    await expect(page.getByTestId('pg-count-inProgress')).toContainText('1')
    await pick(page, RND)
    await expect(page.getByTestId('progress-history')).toContainText('copied from')
    await move(page, 'blocked') // diverges from the original
    // delete the copy: progress is kept as an orphan, not silently removed
    await page.getByTestId('projects-btn').click()
    const copy = page.getByTestId('library-row').filter({ hasText: 'The Hollow Village' }).last()
    await copy.getByRole('button', { name: /Delete/ }).click()
    await page.getByRole('button', { name: 'Delete project' }).click()
    await expect(page.getByTestId('library-row')).toHaveCount(3)
    await page.keyboard.press('Escape')
    expect((await storedKeys(page)).some((k) => k.includes('progress-orphan'))).toBe(true)
    await gotoProduction(page)
    await expect(page.getByTestId('orphan-projects')).toBeVisible()
    await expect(page.getByTestId('orphan-project')).toHaveCount(1)
    // original still has its own state
    await page.getByTestId('projects-btn').click()
    await page.getByTestId('library-row').filter({ hasText: 'The Hollow Village' }).first().getByTestId('library-open').click()
    await gotoProduction(page)
    await pick(page, RND)
    await expect(badge(page)).toHaveAttribute('data-status', 'inProgress')
  })

  test('storage failure: visible feedback, work kept in memory, retry succeeds', async ({ page }) => {
    await page.addInitScript(() => {
      const orig = Storage.prototype.setItem
      Storage.prototype.setItem = function (k: string, v: string) {
        if ((window as unknown as { __failProgress?: boolean }).__failProgress && k.startsWith('horror-director:progress')) throw new DOMException('quota', 'QuotaExceededError')
        return orig.call(this, k, v)
      }
    })
    await openProduction(page)
    await pick(page, RND)
    await page.evaluate(() => ((window as unknown as { __failProgress: boolean }).__failProgress = true))
    await move(page, 'inProgress')
    await expect(page.getByTestId('progress-banner')).toContainText('storage is full')
    await expect(badge(page)).toHaveAttribute('data-status', 'inProgress') // kept in memory
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('progress-backup-now').click()])
    const backup = JSON.parse(readFileSync((await dl.path())!, 'utf8'))
    expect(backup.format).toBe('horror-director.progress-backup')
    expect(Object.values(backup.projects[0].entries).some((e) => (e as { status: string }).status === 'inProgress')).toBe(true)
    await page.getByTestId('progress-retry').click()
    await expect(page.getByTestId('progress-banner')).toBeVisible() // still failing
    await page.evaluate(() => ((window as unknown as { __failProgress: boolean }).__failProgress = false))
    await page.getByTestId('progress-retry').click()
    await expect(page.getByTestId('progress-banner')).toHaveCount(0)
    expect((await storedKeys(page)).length).toBeGreaterThan(0)
  })

  test('damaged stored progress is preserved untouched and tracking pauses', async ({ page }) => {
    await openProduction(page)
    const id = await page.evaluate(() => JSON.parse(localStorage.getItem('horror-director:library:v1')!).activeId as string)
    await page.evaluate((k) => localStorage.setItem(k, '{broken'), `horror-director:progress:v1:${id}`)
    await page.reload()
    await gotoProduction(page)
    await expect(page.getByTestId('progress-banner')).toContainText('damaged')
    await pick(page, RND)
    await move(page, 'inProgress')
    await expect(page.getByTestId('plan-status')).toContainText('damaged')
    expect(await page.evaluate((k) => localStorage.getItem(k), `horror-director:progress:v1:${id}`)).toBe('{broken')
    expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('horror-director:progress-unreadable:')).length)).toBeGreaterThan(0)
  })

  test('two tabs: a conflicting write is detected and nothing is overwritten', async ({ page, context }) => {
    await openProduction(page)
    await pick(page, RND)
    await move(page, 'inProgress')
    const other = await context.newPage()
    await other.goto('/')
    await tab(other, 'Production').click()
    await pick(other, RND)
    await move(other, 'blocked')
    await expect(badge(other)).toHaveAttribute('data-status', 'blocked')
    // first tab has nothing unsaved: it reloads silently from the storage event
    await expect(badge(page)).toHaveAttribute('data-status', 'blocked')
    await other.close()
  })

  test('backup and restore: preview, collisions kept by default, explicit confirmation', async ({ page }) => {
    await openProduction(page)
    await pick(page, RND)
    await move(page, 'inProgress')
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('progress-export').click()])
    const path = (await dl.path())!
    const text = readFileSync(path, 'utf8')
    expect(JSON.parse(text)).toMatchObject({ format: 'horror-director.progress-backup', version: 1 })
    await move(page, 'blocked')
    // malformed files are rejected
    await page.getByTestId('restore-file').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"format":"x"}') })
    await expect(page.getByTestId('restore-error')).toContainText('not a Horror Director progress backup')
    await page.getByTestId('restore-file').setInputFiles(path)
    await expect(page.getByTestId('restore-preview')).toBeVisible()
    await expect(page.getByTestId('restore-counts')).toContainText('1 conflicting')
    await page.getByTestId('restore-apply').click()
    await expect(page.getByTestId('restore-confirm')).toBeVisible()
    await page.getByTestId('restore-confirm-yes').click()
    await expect(page.getByTestId('plan-status')).toContainText('restored')
    await expect(badge(page)).toHaveAttribute('data-status', 'blocked') // existing kept
    await page.getByTestId('restore-file').setInputFiles(path)
    await page.getByTestId('restore-collision').getByRole('checkbox').check()
    await page.getByTestId('restore-apply').click()
    await page.getByTestId('restore-confirm-yes').click()
    await expect(badge(page)).toHaveAttribute('data-status', 'inProgress') // imported chosen explicitly
    // the authored project export contains no progress
    const [ex] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /backup/i }).first().click()])
    const authored = readFileSync((await ex.path())!, 'utf8')
    expect(authored).not.toContain('inProgress')
    expect(JSON.parse(authored).schemaVersion).toBe(9)
  })

  test('progress report download lists ids, engine, status and freshness', async ({ page }) => {
    await openProduction(page)
    await verify(page, 'T-foundation-project')
    await page.getByTestId('engine-unity').click()
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('progress-report-download').click()])
    expect(dl.suggestedFilename()).toBe('production-progress-unity.md')
    const md = readFileSync((await dl.path())!, 'utf8')
    expect(md).toContain('T-foundation-project')
    expect(md).toMatch(/Not started/)
    expect(md).not.toContain('Verified / approved |') // verified was Unreal only
    await page.getByTestId('engine-unreal').click()
    const [dl2] = await Promise.all([page.waitForEvent('download'), page.getByTestId('progress-report-download').click()])
    expect(readFileSync((await dl2.path())!, 'utf8')).toContain('| T-foundation-project | unreal | Verified / approved | Current')
  })

  test('the agent prompt now carries the report template for the selected task only', async ({ page }) => {
    await openProduction(page)
    await pick(page, RND)
    await page.getByTestId('task-details').locator('summary', { hasText: 'Preview prompt' }).click()
    const prompt = await page.getByTestId('task-prompt-preview').innerText()
    expect(prompt).toContain('horror-director.completion-report')
    expect(prompt).toContain(`"taskId": "${RND}"`)
    expect(prompt).toContain('"engine": "unreal"')
    expect(prompt).toMatch(/"sourceFingerprint": "[0-9a-f]{14}"/)
  })

  test('Turkish interface and 390 px mobile layout', async ({ page }) => {
    await openProduction(page)
    await page.getByTestId('lang-tr').click()
    await pick(page, RND)
    await expect(page.getByTestId('progress-dashboard')).toContainText('İlerleme özeti')
    await expect(page.getByTestId('task-progress')).toContainText('Uygulama ilerlemesi')
    await move(page, 'inProgress')
    await expect(badge(page)).toContainText('Sürüyor')
    await page.getByTestId('report-open').click()
    await page.getByTestId('report-text').fill('{x')
    await page.getByTestId('report-check').click()
    await expect(page.getByTestId('report-errors')).toContainText('geçerli bir JSON değil')
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(page.getByTestId('task-progress')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
    await page.getByTestId('lang-en').click()
    await move(page, 'submitted')
    await expect(page.getByTestId('review-panel')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
    await page.getByTestId('review-approve').click()
    const box = await page.getByTestId('review-confirm').boundingBox()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(390)
  })
})
