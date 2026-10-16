import { beforeEach, describe, expect, it } from 'vitest'
import { memoryBackend, type MemoryBackend } from '../test/memoryBackend'
import { useStore } from './useStore'
import { addAndOpen, bootLibrary, flushNow } from './library'
import { readRecord, RECORD_PREFIX } from '../lib/library'
import { sampleProject } from '../lib/sample'
import { showcaseProject } from '../lib/showcase'
import { buildPlan } from '../lib/production/plan'
import type { Project } from '../lib/schema'

let b: MemoryBackend
beforeEach(() => {
  b = memoryBackend()
  bootLibrary(b)
})

describe('Add sample (showcase)', () => {
  it('creates a NEW library project and never overwrites existing work', () => {
    const first = useStore.getState().library.activeId!
    useStore.getState().updateProject({ description: 'my own work' })
    flushNow()
    const before = JSON.stringify((readRecord(b, first) as { project: Project }).project)
    const r = addAndOpen(showcaseProject())
    expect(r.ok).toBe(true)
    const s = useStore.getState()
    expect(s.library.projects).toHaveLength(2)
    expect(s.library.activeId).not.toBe(first)
    expect(s.project).toEqual(showcaseProject())
    expect(JSON.stringify((readRecord(b, first) as { project: Project }).project)).toBe(before)
    expect(b.keys().filter((k) => k.startsWith(RECORD_PREFIX))).toHaveLength(2)
  })

  it('adding it twice yields two independent projects', () => {
    addAndOpen(showcaseProject())
    addAndOpen(showcaseProject())
    expect(useStore.getState().library.projects.filter((p) => p.name === showcaseProject().name)).toHaveLength(2)
  })

  it('building a production plan is read-only: no project, history or storage change', () => {
    addAndOpen(showcaseProject())
    flushNow()
    const s0 = useStore.getState()
    const snapshot = { project: s0.project, past: s0.past.length, future: s0.future.length, keys: [...b.data.entries()] }
    buildPlan(s0.project)
    flushNow()
    const s1 = useStore.getState()
    expect(s1.project).toBe(snapshot.project)
    expect(s1.past.length).toBe(snapshot.past)
    expect(s1.future.length).toBe(snapshot.future)
    expect([...b.data.entries()]).toEqual(snapshot.keys)
  })

  it('keeps the legacy sample unchanged for compatibility', () => {
    const s = sampleProject()
    expect(s.scenes).toHaveLength(8)
    expect(s.logicNodes).toEqual([])
  })
})
