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

describe('Add sample (Turkish and English variants)', () => {
  it('adding the Turkish sample creates a new project and leaves every other record untouched', () => {
    const first = useStore.getState().library.activeId!
    flushNow()
    const rec = (id: string) => b.data.get(`${RECORD_PREFIX}${id}`)
    const before = rec(first)
    const en = addAndOpen(showcaseProject('en'))
    expect(en.ok).toBe(true)
    const enId = useStore.getState().library.activeId!
    const enBefore = rec(enId)
    const tr = addAndOpen(showcaseProject('tr'))
    expect(tr.ok).toBe(true)
    const s = useStore.getState()
    expect(s.library.projects).toHaveLength(3)
    expect(s.project).toEqual(showcaseProject('tr'))
    expect(s.project.name).toBe('Boş Köy (Vitrin Örneği)')
    expect(rec(first)).toBe(before)
    expect(rec(enId)).toBe(enBefore)
    expect(b.keys().filter((k) => k.startsWith(RECORD_PREFIX))).toHaveLength(3)
    expect(JSON.parse(rec(s.library.activeId!)!).v).toBe(9)
  })

  it('switching the interface language never changes a stored sample', async () => {
    const { useLang } = await import('../i18n/store')
    addAndOpen(showcaseProject('tr'))
    flushNow()
    const id = useStore.getState().library.activeId!
    const raw = b.data.get(`${RECORD_PREFIX}${id}`)
    const project = useStore.getState().project
    const past = useStore.getState().past.length
    for (const l of ['en', 'tr', 'en'] as const) {
      useLang.getState().setLang(l)
      flushNow()
    }
    expect(useStore.getState().project).toBe(project)
    expect(useStore.getState().past.length).toBe(past)
    expect(b.data.get(`${RECORD_PREFIX}${id}`)).toBe(raw)
    expect(b.data.get(`${RECORD_PREFIX}${id}`)).toContain('Kulübede Sabah')
    // the same holds for the English sample under a Turkish interface
    addAndOpen(showcaseProject('en'))
    flushNow()
    const id2 = useStore.getState().library.activeId!
    const raw2 = b.data.get(`${RECORD_PREFIX}${id2}`)
    useLang.getState().setLang('tr')
    flushNow()
    expect(b.data.get(`${RECORD_PREFIX}${id2}`)).toBe(raw2)
    expect(useStore.getState().project.scenes[0].title).toBe('Cottage Morning')
    useLang.getState().setLang('en')
  })

  it('existing production progress stays untouched and compatible when a sample is added', async () => {
    const { saveProgress, progressKey, loadProgress } = await import('../lib/progressStorage')
    addAndOpen(showcaseProject('en'))
    const id = useStore.getState().library.activeId!
    expect(saveProgress(b, id, null, { 'unreal:T-random-rnd_door': { status: 'inProgress', notes: 'n', history: [] } }, 1).ok).toBe(true)
    const stored = b.data.get(progressKey(id))
    addAndOpen(showcaseProject('tr'))
    expect(b.data.get(progressKey(id))).toBe(stored)
    // task ids of the Turkish sample match, so the same progress key shape applies to it
    const ids = (p: Project) => buildPlan(p).tasks.map((t) => t.id)
    expect(ids(showcaseProject('tr'))).toEqual(ids(showcaseProject('en')))
    const l = loadProgress(b, id)
    expect(l.state).toBe('ok')
  })

  it('the legacy sample still seeds a fresh library', () => {
    expect(useStore.getState().project.scenes.map((s) => s.id)).toEqual(sampleProject().scenes.map((s) => s.id))
  })
})
