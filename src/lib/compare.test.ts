import { describe, expect, it } from 'vitest'
import { compareRoutes } from './compare'
import { sampleProject } from './sample'
import { newScene, newTransition, newTrigger } from './factory'
import type { Project, Scene, Transition, Trigger } from './schema'

const sc = (id: string, o: Partial<Scene> = {}): Scene => ({ ...newScene('reality'), id, title: id.toUpperCase(), duration: 10, ...o })
const tr = (id: string, source: string, target: string, o: Partial<Transition> = {}): Transition => ({ ...newTransition(source, target), id, duration: 1, ...o })
const trg = (id: string, time: number, intensity: number, o: Partial<Trigger> = {}): Trigger => ({ ...newTrigger(), id, name: id, time, intensity, ...o })
const proj = (scenes: Scene[], transitions: Transition[], start: string | null = scenes[0]?.id ?? null): Project => ({
  name: 'p',
  description: '',
  startSceneId: start,
  scenes,
  transitions,
  logicNodes: [], comments: [], sceneTypes: [], characters: [],
})

// s ─e1→ x ─e3→ z(ending)      x is reached in 1 s,  y in 5 s
// s ─e2→ y ─e4→ z
const diamond = proj(
  [
    sc('s', { triggers: [trg('t_s', 2, 3)] }),
    sc('x', { triggers: [trg('t_x', 1, 6, { kind: 'audio' })] }),
    sc('y', { triggers: [trg('t_y', 1, 8, { kind: 'visual' })] }),
    sc('z', { kind: 'ending', triggers: [trg('t_z', 3, 9)] }),
  ],
  [tr('e1', 's', 'x'), tr('e2', 's', 'y', { duration: 5 }), tr('e3', 'x', 'z'), tr('e4', 'y', 'z')],
)

describe('sample project routes', () => {
  const base = ['e1', 'e2', 'e5', 'e7']
  const a = compareRoutes(sampleProject(), [...base, 'e8'], [...base, 'e9'])
  it('diverges at the memory scene with the two endings', () => {
    expect(a.a.status).toBe('ending')
    expect(a.b.status).toBe('ending')
    expect(a.divergence.kind).toBe('diverges')
    if (a.divergence.kind !== 'diverges') return
    expect(a.divergence.sharedSteps).toBe(5)
    expect(a.divergence.next.a?.label).toBe('Accept the truth')
    expect(a.divergence.next.b?.label).toBe('Refuse the truth')
    expect(a.divergenceTime).toBe(a.divergence.time)
  })
  it('reports durations, deltas and exclusive items', () => {
    expect(a.a.duration).toBe(665)
    expect(a.b.duration).toBe(650)
    expect(a.deltas.duration).toBe(-15)
    expect(a.deltas.visits).toBe(0)
    expect(a.scenes.onlyA.map((s) => s.id)).toEqual(['s_end_free'])
    expect(a.scenes.onlyB.map((s) => s.id)).toEqual(['s_end_trapped'])
    expect(a.transitions.onlyA.map((t) => t.id)).toEqual(['e8'])
    expect(a.transitions.onlyB.map((t) => t.id)).toEqual(['e9'])
    expect(a.incomplete).toBe(false)
    expect(a.identical).toBe(false)
  })
  it('shares the events of the common prefix with unchanged timing', () => {
    expect(a.events.shared.length).toBeGreaterThan(0)
    expect(a.events.shared.every((e) => e.shift === 0)).toBe(true)
    expect(a.events.a.length - a.events.shared.length).toBe(a.events.onlyA.length)
    expect(a.events.onlyA.every((e) => !e.shared)).toBe(true)
  })
})

describe('identical, empty and unavailable routes', () => {
  it('identical routes have zero deltas and no exclusive items', () => {
    const c = compareRoutes(diamond, ['e1', 'e3'], ['e1', 'e3'])
    expect(c.identical).toBe(true)
    expect(c.divergence.kind).toBe('identical')
    expect(c.divergenceTime).toBeNull()
    expect(c.events.onlyA).toEqual([])
    expect(c.events.onlyB).toEqual([])
    expect(c.scenes.onlyA).toEqual([])
    expect(c.events.shared).toHaveLength(c.events.a.length)
    for (const v of [c.deltas.duration, c.deltas.events, c.deltas.avgIntensity, c.deltas.findingsTotal]) expect(v).toBe(0)
    expect(c.incomplete).toBe(false)
  })
  it('two empty routes are identical single-scene routes', () => {
    const c = compareRoutes(diamond, [], [])
    expect(c.identical).toBe(true)
    expect(c.a.status).toBe('active')
  })
  it('a project without start or scenes is unavailable and incomplete', () => {
    const c = compareRoutes(proj([sc('a')], [], null), ['x'], [])
    expect(c.a.unavailable).toBe(true)
    expect(c.divergence.kind).toBe('unavailable')
    expect(c.incomplete).toBe(true)
    expect(compareRoutes(proj([], []), [], []).incomplete).toBe(true)
  })
  it('routes without events give null deltas for averages and rates', () => {
    const quiet = proj([sc('a'), sc('b', { kind: 'ending' })], [tr('e', 'a', 'b')])
    const c = compareRoutes(quiet, [], ['e'])
    expect(c.a.avgIntensity).toBeNull()
    expect(c.deltas.avgIntensity).toBeNull()
    expect(c.deltas.peakIntensity).toBeNull()
    expect(c.deltas.duration).toBe(11)
    expect(c.deltas.events).toBe(0)
  })
})

describe('divergence', () => {
  it('detects a route that ends where the other continues', () => {
    const c = compareRoutes(diamond, ['e1'], ['e1', 'e3'])
    expect(c.divergence.kind).toBe('diverges')
    if (c.divergence.kind !== 'diverges') return
    expect(c.divergence.sceneId).toBe('x')
    expect(c.divergence.sharedSteps).toBe(2)
    expect(c.divergence.next.a).toBeNull()
    expect(c.divergence.next.b?.transitionId).toBe('e3')
    expect(c.divergence.time).toBe(21)
  })
  it('detects different branches from the start scene', () => {
    const c = compareRoutes(diamond, ['e1'], ['e2'])
    if (c.divergence.kind !== 'diverges') throw new Error('expected divergence')
    expect(c.divergence.sharedSteps).toBe(1)
    expect(c.divergence.sceneId).toBe('s')
    expect(c.divergence.time).toBe(10)
  })
})

describe('events: stable identity, order and timing', () => {
  it('shares the same scene/trigger in both routes but keeps each route’s own time', () => {
    const c = compareRoutes(diamond, ['e1', 'e3'], ['e2', 'e4'])
    const z = c.events.shared.find((e) => e.name === 't_z')!
    expect(z.timeA).toBe(10 + 1 + 10 + 1 + 3)
    expect(z.timeB).toBe(10 + 5 + 10 + 1 + 3)
    expect(z.shift).toBe(4)
    expect(c.events.shared.map((e) => e.name)).toEqual(['t_s', 't_z'])
    expect(c.events.onlyA.map((e) => e.name)).toEqual(['t_x'])
    expect(c.events.onlyB.map((e) => e.name)).toEqual(['t_y'])
    expect(c.events.a.map((e) => e.name)).toEqual(['t_s', 't_x', 't_z'])
    expect(c.events.a.map((e) => e.time)).toEqual([...c.events.a.map((e) => e.time)].sort((x, y) => x - y))
  })
  it('treats each visit of a repeated scene as a different occurrence; once-triggers fire on visit 1 only', () => {
    const p = proj(
      [
        sc('s'),
        sc('l', { loop: { enabled: true, maxIterations: 3, exitCondition: '' }, triggers: [trg('t_l', 1, 5, { once: false }), trg('t_once', 2, 7, { once: true })] }),
        sc('end', { kind: 'ending' }),
      ],
      [tr('go', 's', 'l'), tr('again', 'l', 'l'), tr('out', 'l', 'end')],
    )
    const c = compareRoutes(p, ['go', 'again', 'out'], ['go', 'again', 'again', 'out'])
    const idsA = c.events.a.filter((e) => e.name === 't_l').map((e) => e.visit)
    const idsB = c.events.b.filter((e) => e.name === 't_l').map((e) => e.visit)
    expect(idsA).toEqual([1, 2])
    expect(idsB).toEqual([1, 2, 3])
    expect(c.events.onlyB.map((e) => `${e.name}#${e.visit}`)).toEqual(['t_l#3'])
    expect(c.events.a.filter((e) => e.name === 't_once')).toHaveLength(1)
    expect(c.a.repeatVisits).toBe(1)
    expect(c.b.repeatVisits).toBe(2)
    expect(c.deltas.repeatVisits).toBe(1)
    expect(c.scenes.shared.find((s) => s.id === 'l')).toMatchObject({ visitsA: 2, visitsB: 3 })
  })
})

describe('assumptions and hypothetical events', () => {
  const p = proj(
    [sc('s'), sc('x', { triggers: [trg('t_h', 1, 4, { condition: 'player has key' })] }), sc('y', { kind: 'ending' })],
    [tr('e1', 's', 'x', { condition: 'door unlocked' }), tr('e2', 's', 'y')],
  )
  it('counts conditional transitions and triggers and flags them in the lists', () => {
    const c = compareRoutes(p, ['e2'], ['e1'])
    expect(c.a.assumedTransitions).toBe(0)
    expect(c.b.assumedTransitions).toBe(1)
    expect(c.deltas.assumedTransitions).toBe(1)
    expect(c.b.hypothetical).toBe(1)
    expect(c.events.onlyB[0].hypothetical).toBe(true)
    expect(c.transitions.onlyB[0].assumed).toBe(true)
    expect(c.transitions.onlyA[0].assumed).toBe(false)
  })
})

describe('invalidated routes and shared limits', () => {
  it('reports steps dropped by graph edits instead of presenting the route as complete', () => {
    const edited = { ...diamond, transitions: diamond.transitions.filter((t) => t.id !== 'e3') }
    const c = compareRoutes(edited, ['e1', 'e3'], ['e2', 'e4'])
    expect(c.a.dropped).toBe(1)
    expect(c.b.dropped).toBe(0)
    expect(c.a.visits).toBe(2)
    expect(c.incomplete).toBe(true)
  })
  it('applies the same step cap to both routes', () => {
    const c = compareRoutes(diamond, ['e1', 'e3'], ['e2', 'e4'], { stepCap: 1 })
    expect(c.a.dropped).toBe(1)
    expect(c.b.dropped).toBe(1)
    expect(c.a.visits).toBe(2)
    expect(c.b.visits).toBe(2)
    expect(c.incomplete).toBe(true)
  })
  it('uses the same pacing thresholds for both routes', () => {
    const dense = proj(
      [sc('s', { triggers: [trg('a', 1, 2), trg('b', 2, 3), trg('c', 3, 4)] }), sc('t', { kind: 'ending' })],
      [tr('e', 's', 't')],
    )
    const lax = compareRoutes(dense, ['e'], [])
    const strict = compareRoutes(dense, ['e'], [], {}, { escalationMin: 3 })
    expect(lax.a.findingsByCategory.escalation).toBe(strict.a.findingsByCategory.escalation)
    expect(lax.a.findingsByCategory.escalation).toBe(1)
    const c = compareRoutes(dense, ['e'], ['e'], {}, { silenceMin: 1 })
    expect(c.a.findingsTotal).toBe(c.b.findingsTotal)
  })
})

describe('purity', () => {
  it('does not mutate the project or the inputs', () => {
    const p = JSON.parse(JSON.stringify(diamond)) as Project
    const before = JSON.stringify(p)
    const ca = ['e1', 'e3']
    const cb = ['e2', 'e4']
    compareRoutes(p, ca, cb)
    expect(JSON.stringify(p)).toBe(before)
    expect(ca).toEqual(['e1', 'e3'])
    expect(cb).toEqual(['e2', 'e4'])
    expect(JSON.stringify(compareRoutes(p, ca, cb))).toBe(JSON.stringify(compareRoutes(p, ca, cb)))
  })
})
