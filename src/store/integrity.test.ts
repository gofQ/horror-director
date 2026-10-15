import { beforeEach, describe, expect, it } from 'vitest'
import { memoryBackend, type MemoryBackend } from '../test/memoryBackend'
import { useStore } from './useStore'
import { bootLibrary, flushNow, openInconsistent, openProject } from './library'
import { LIBRARY_KEY, parseIndex, readRecord, recordKey } from '../lib/library'
import { CORRUPT_PREFIX } from '../lib/persist'
import { sampleProject } from '../lib/sample'
import { stateProject, check } from '../test/stateProject'
import type { Project } from '../lib/schema'

const st = () => useStore.getState()
let b: MemoryBackend
beforeEach(() => {
  b = memoryBackend()
  bootLibrary(b)
  flushNow() // make sure the first-run index is in storage before tests edit it
})
/** Lists a project record in the index without making it active. */
function addRecord(id: string, project: unknown, v = 7) {
  const index = parseIndex(b.data.get(LIBRARY_KEY)!)!
  index.projects.push({ id, name: id, createdAt: 1, updatedAt: 1 })
  b.data.set(LIBRARY_KEY, JSON.stringify(index))
  const raw = JSON.stringify({ v, project })
  b.data.set(recordKey(id), raw)
  return raw
}
const corrupt = () => [...b.data.keys()].filter((k) => k.startsWith(CORRUPT_PREFIX))

const broken: Record<string, (p: Project) => Project> = {
  'a transition to a missing scene': (p) => ({ ...p, transitions: [...p.transitions, { ...p.transitions[0], id: 'ghost', target: 'nope' }] }),
  'a missing flag in a structured condition': () => stateProject(check('ghost')),
  'an invalid branch port': (p) => ({ ...p, transitions: p.transitions.map((t) => (t.id === 'yes' ? { ...t, sourcePort: undefined } : t)) }),
  'a dangling shot link': (p) => ({
    ...p,
    transitions: p.transitions.map((t, i) => (i === 0 ? { ...t, direction: { ...(t.direction ?? { technique: 'none', playerBelief: '', reality: '', visualContinuity: '', audioContinuity: '', reveal: '', unrealNotes: '' }), sourceShotId: 'ghost_shot', targetShotId: null } } : t)),
  }),
}

describe('library integrity on load', () => {
  it.each(Object.keys(broken))('detects %s: listed as damaged with problems, raw preserved byte-exact, never rewritten', (name) => {
    const base = name.includes('port') || name.includes('flag') ? stateProject() : sampleProject()
    const raw = addRecord('bad1', broken[name](base))
    const rec = readRecord(b, 'bad1')
    expect(rec).toMatchObject({ ok: false, reason: 'inconsistent', raw })
    bootLibrary(b)
    expect(st().damaged.bad1.raw).toBe(raw)
    expect(st().damaged.bad1.problems!.length).toBeGreaterThan(0)
    expect(openProject('bad1')).toEqual({ ok: false, error: { code: 'damaged' } })
    st().updateProject({ description: 'edit' })
    flushNow()
    expect(b.data.get(recordKey('bad1'))).toBe(raw)
    expect(corrupt()).toEqual([])
  })
  it('warnings never block a record (only blocking errors do)', () => {
    const p = stateProject()
    p.logicNodes = p.logicNodes.map((n) => (n.id === 'set1' ? { ...n, flagId: null } : n)) // unassigned Set Flag: warning only
    addRecord('warn1', p)
    expect(readRecord(b, 'warn1').ok).toBe(true)
    bootLibrary(b)
    expect(st().damaged.warn1).toBeUndefined()
  })
  it('records v1–v6 stay readable when consistent', () => {
    for (const v of [1, 2, 3, 4, 5, 6, 7]) {
      const { flags, ...rest } = sampleProject()
      void flags
      addRecord(`r${v}`, v < 6 ? rest : sampleProject(), v)
      expect(readRecord(b, `r${v}`).ok).toBe(true)
    }
  })
  it('an inconsistent ACTIVE record is not opened: a fresh project is added beside it and the raw record stays untouched', () => {
    const index = parseIndex(b.data.get(LIBRARY_KEY)!)!
    const activeId = index.activeId!
    const bad = broken['a transition to a missing scene'](sampleProject())
    const raw = JSON.stringify({ v: 9, project: bad })
    b.data.set(recordKey(activeId), raw)
    bootLibrary(b)
    expect(st().notices.some((n) => n.kind === 'activeDamaged')).toBe(true)
    expect(st().library.activeId).not.toBe(activeId)
    expect(st().damaged[activeId].problems).toBeTruthy()
    flushNow()
    expect(b.data.get(recordKey(activeId))).toBe(raw)
  })
})

describe('Open anyway recovery', () => {
  const setup = () => {
    const first = st().library.activeId!
    const raw = addRecord('bad1', broken['a transition to a missing scene'](sampleProject()))
    bootLibrary(b)
    expect(st().library.activeId).toBe(first)
    return { first, raw }
  }
  it('preserves the raw record first, opens it in memory, and rewrites nothing until the user edits', () => {
    const { raw } = setup()
    expect(openInconsistent('bad1')).toEqual({ ok: true })
    expect(st().library.activeId).toBe('bad1')
    expect(st().damaged.bad1).toBeUndefined()
    const copies = corrupt()
    expect(copies).toHaveLength(1)
    expect(b.data.get(copies[0])).toBe(raw)
    expect(b.data.get(recordKey('bad1'))).toBe(raw) // untouched until an edit
    expect(st().project.transitions.some((t) => t.id === 'ghost')).toBe(true) // nothing silently repaired
    flushNow()
    expect(b.data.get(recordKey('bad1'))).toBe(raw)
    st().updateProject({ description: 'edited' })
    flushNow()
    expect(JSON.parse(b.data.get(recordKey('bad1'))!).v).toBe(9)
    expect(b.data.get(copies[0])).toBe(raw) // the raw copy stays
  })
  it('refuses (and opens nothing) when the raw copy cannot be stored', () => {
    const { first } = setup()
    b.failWhen = (k) => k.startsWith(CORRUPT_PREFIX)
    expect(openInconsistent('bad1')).toMatchObject({ ok: false })
    expect(st().library.activeId).toBe(first)
    expect(st().damaged.bad1).toBeTruthy()
  })
  it('only applies to inconsistent entries', () => {
    setup()
    expect(openInconsistent(st().library.activeId!)).toEqual({ ok: false, error: { code: 'damaged' } })
  })
})
