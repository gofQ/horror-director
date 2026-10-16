import { beforeEach, describe, expect, it } from 'vitest'
import { memoryBackend, type MemoryBackend } from '../test/memoryBackend'
import { useStore } from './useStore'
import { addAndOpen, bootLibrary, deleteProject, duplicateProject, openProject } from './library'
import { dispatchProgress, previewRestore, removeEntry, restoreInto, retryProgressSave, syncProgress, useProgress } from './progress'
import { PROGRESS_PREFIX, progressKey, listOrphans } from '../lib/progressStorage'
import { LIBRARY_KEY, RECORD_PREFIX } from '../lib/library'
import { emptyProject } from '../lib/factory'
import { showcaseProject } from '../lib/showcase'
import { buildPlan } from '../lib/production/plan'
import { taskFingerprint } from '../lib/production/fingerprint'
import { entryKey } from '../lib/production/progress'

const plan = buildPlan(showcaseProject())
const task = plan.tasks.find((t) => t.id === 'T-random-rnd_door')!
const fp = taskFingerprint(plan, task)
const ctx = (now = 1) => ({ now, fingerprint: fp, stale: false })
const active = () => useStore.getState().library.activeId!
const start = (engine: 'unreal' | 'unity' = 'unreal', id = task.id) => dispatchProgress(engine, id, { type: 'move', to: 'inProgress' }, ctx())

let b: MemoryBackend
beforeEach(() => {
  b = memoryBackend()
  bootLibrary(b)
  syncProgress()
})

describe('progress store', () => {
  it('does nothing when only loading: no progress key is written', () => {
    expect(b.keys().some((k) => k.startsWith(PROGRESS_PREFIX))).toBe(false)
    expect(useProgress.getState().load).toBe('empty')
  })

  it('persists across reload and keeps Unreal and Unity apart', () => {
    expect(start('unreal').ok).toBe(true)
    expect(dispatchProgress('unity', task.id, { type: 'move', to: 'blocked' }, ctx()).ok).toBe(true)
    bootLibrary(b) // simulated reload
    syncProgress()
    const e = useProgress.getState().entries
    expect(e[entryKey('unreal', task.id)].status).toBe('inProgress')
    expect(e[entryKey('unity', task.id)].status).toBe('blocked')
  })

  it('different library projects never share progress, even with identical task ids', () => {
    const first = active()
    start('unreal')
    expect(addAndOpen(emptyProject()).ok).toBe(true)
    syncProgress()
    expect(useProgress.getState().entries).toEqual({})
    dispatchProgress('unreal', task.id, { type: 'move', to: 'blocked' }, ctx())
    expect(openProject(first).ok).toBe(true)
    syncProgress()
    expect(useProgress.getState().entries[entryKey('unreal', task.id)].status).toBe('inProgress')
  })

  it('never writes progress into project records, the index or authored data', () => {
    const before = b.data.get(`${RECORD_PREFIX}${active()}`)
    const index = b.data.get(LIBRARY_KEY)
    start('unreal')
    expect(b.data.get(`${RECORD_PREFIX}${active()}`)).toBe(before)
    expect(b.data.get(LIBRARY_KEY)).toBe(index)
    expect(b.keys().filter((k) => k.startsWith(RECORD_PREFIX)).every((k) => !b.data.get(k)!.includes('inProgress'))).toBe(true)
    expect(useStore.getState().project.name).toBeDefined()
  })

  it('keeps the working copy when storage is full and saves later; reports the error', () => {
    b.failWhen = (k) => k.startsWith(PROGRESS_PREFIX)
    const r = start('unreal')
    expect(r.ok).toBe(false)
    expect(r.error).toEqual({ code: 'storageFull' })
    const s = useProgress.getState()
    expect(s.dirty).toBe(true)
    expect(s.entries[entryKey('unreal', task.id)].status).toBe('inProgress')
    expect(retryProgressSave()).toBe(false)
    b.failWhen = null
    expect(retryProgressSave()).toBe(true)
    expect(useProgress.getState().dirty).toBe(false)
    expect(b.data.has(progressKey(active()))).toBe(true)
  })

  it('works in memory when storage is unavailable', () => {
    bootLibrary(null)
    syncProgress()
    expect(useProgress.getState().load).toBe('unavailable')
  })

  it('blocks on damaged data, preserves the raw text and never overwrites it', () => {
    b.data.set(progressKey(active()), '{broken')
    syncProgress()
    expect(useProgress.getState().load).toBe('damaged')
    expect(start().ok).toBe(false)
    expect(b.data.get(progressKey(active()))).toBe('{broken')
    expect(b.keys().some((k) => k.includes('progress-unreadable') && b.data.get(k) === '{broken')).toBe(true)
  })

  it('detects another tab’s write: the conflict blocks writes and nothing is overwritten', () => {
    start('unreal')
    const mine = b.data.get(progressKey(active()))!
    const theirs = JSON.parse(mine)
    theirs.rev += 1
    theirs.entries[entryKey('unreal', task.id)].notes = 'other tab'
    b.data.set(progressKey(active()), JSON.stringify(theirs))
    const r = dispatchProgress('unreal', task.id, { type: 'setNotes', notes: 'mine' }, ctx())
    expect(r.ok).toBe(false)
    expect(useProgress.getState().conflict).toBe(true)
    expect(JSON.parse(b.data.get(progressKey(active()))!).entries[entryKey('unreal', task.id)].notes).toBe('other tab')
    expect(dispatchProgress('unreal', task.id, { type: 'setNotes', notes: 'again' }, ctx()).ok).toBe(false)
    syncProgress() // reload from storage resolves it
    expect(useProgress.getState().conflict).toBe(false)
    expect(useProgress.getState().entries[entryKey('unreal', task.id)].notes).toBe('other tab')
  })

  it('duplicating a project copies its progress; deleting keeps it as an orphan', () => {
    start('unreal')
    const src = active()
    const d = duplicateProject(src, 'Copy')
    expect(d.ok).toBe(true)
    if (!d.ok) return
    expect(JSON.parse(b.data.get(progressKey(d.id))!).entries[entryKey('unreal', task.id)].status).toBe('inProgress')
    // the copy is independent
    expect(openProject(d.id).ok).toBe(true)
    syncProgress()
    dispatchProgress('unreal', task.id, { type: 'move', to: 'blocked' }, ctx())
    expect(JSON.parse(b.data.get(progressKey(src))!).entries[entryKey('unreal', task.id)].status).toBe('inProgress')
    // delete the copy: progress is kept, nothing is silently removed
    expect(deleteProject(d.id, emptyProject).ok).toBe(true)
    expect(b.data.has(progressKey(d.id))).toBe(false)
    const orphans = listOrphans(b, useStore.getState().library.projects.map((m) => m.id))
    expect(orphans.map((o) => o.projectId)).toEqual([d.id])
    expect(orphans[0].entries).toBe(1)
  })

  it('restores with collision handling and removes only the chosen orphan record', () => {
    start('unreal')
    const incoming = { [entryKey('unreal', task.id)]: { status: 'verified' as const, notes: '', history: [] }, [entryKey('unity', task.id)]: { status: 'blocked' as const, notes: '', history: [] } }
    expect(previewRestore(active(), incoming).map((i) => i.kind)).toEqual(['new', 'collision'])
    expect(restoreInto(active(), incoming, new Set()).ok).toBe(true)
    expect(useProgress.getState().entries[entryKey('unreal', task.id)].status).toBe('inProgress')
    expect(useProgress.getState().entries[entryKey('unity', task.id)].status).toBe('blocked')
    expect(restoreInto(active(), incoming, new Set([entryKey('unreal', task.id)])).ok).toBe(true)
    expect(useProgress.getState().entries[entryKey('unreal', task.id)].status).toBe('verified')
    expect(removeEntry(entryKey('unity', task.id))).toBe(true)
    expect(Object.keys(useProgress.getState().entries)).toEqual([entryKey('unreal', task.id)])
  })

  it('restoring into another library project does not touch the active one', () => {
    start('unreal')
    const first = active()
    addAndOpen(emptyProject())
    const other = active()
    syncProgress()
    const r = restoreInto(first, { [entryKey('unity', 'T-x')]: { status: 'blocked', notes: '', history: [] } }, new Set())
    expect(r.ok).toBe(true)
    expect(useProgress.getState().entries).toEqual({})
    expect(JSON.parse(b.data.get(progressKey(first))!).entries[entryKey('unity', 'T-x')].status).toBe('blocked')
    expect(other).not.toBe(first)
  })
})
