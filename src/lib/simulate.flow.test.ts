import { describe, expect, it } from 'vitest'
import { simulateRoute } from './simulate'
import { analyzePacing } from './pacing'
import { compareRoutes } from './compare'
import { analyze } from './graph'
import { flowProject, delayNode } from '../test/flowProject'
import { check, stateProject } from '../test/stateProject'
import type { Project } from './schema'

const toA = ['l1', 'l2', 'l3', 'la']
const toB = ['l1', 'l2', 'l3', 'lb']
const withSeconds = (p: Project, seconds: number): Project => ({ ...p, logicNodes: p.logicNodes.map((n) => (n.id === 'D' ? { ...n, seconds } : n)) })

describe('Delay: route clock', () => {
  it('adds its seconds exactly once, in traversal order, and later scenes start later', () => {
    const r = simulateRoute(flowProject(), toA)
    const a = r.steps[1]
    expect(a.sceneId).toBe('a')
    expect(a.via!.duration).toBe(13) // 1 s link + 12 s delay
    expect(a.via!.delay).toBe(12)
    expect(a.start).toBe(60 + 13)
    expect(a.end).toBe(73 + 30) // the authored scene duration is unchanged
    expect(a.duration).toBe(30)
    expect(r.stats.totalDuration).toBe(103)
    expect(r.stats.delayTotal).toBe(12)
  })
  it('is not double counted while pending, on replay or when extended', () => {
    const p = flowProject()
    const pending = simulateRoute(p, ['l1'])
    expect(pending.pending).toMatchObject({ kind: 'delay', seconds: 12 })
    expect(pending.clock).toBe(73)
    expect(pending.stats.delayTotal).toBe(12)
    expect(pending.stats.totalDuration).toBe(60) // still the end of the last scene
    expect(simulateRoute(p, ['l1'])).toEqual(pending)
    const later = simulateRoute(p, toA)
    expect(later.stats.delayTotal).toBe(12)
    expect(later.clock).toBe(later.current!.end)
  })
  it('scene-local triggers keep their local time; only the absolute time shifts with the later start', () => {
    const noDelay = simulateRoute(withSeconds(flowProject(), 0), toA)
    const delayed = simulateRoute(flowProject(), toA)
    const e0 = noDelay.events.find((e) => e.triggerId === 'a_t')!
    const e1 = delayed.events.find((e) => e.triggerId === 'a_t')!
    expect(e1.localTime).toBe(e0.localTime)
    expect(e1.absoluteTime - e0.absoluteTime).toBe(12)
    expect(delayed.events.find((e) => e.triggerId === 'st_t')!.absoluteTime).toBe(10) // before the delay: unchanged
    expect(delayed.steps[0]).toEqual(noDelay.steps[0])
    expect(delayed.steps[1].duration).toBe(noDelay.steps[1].duration)
  })
  it('chains several delays in order', () => {
    const p = flowProject()
    p.logicNodes = [...p.logicNodes, delayNode('D2', 3)]
    p.transitions = p.transitions.map((t) => (t.id === 'l3' ? { ...t, target: 'D2' } : t)).concat([{ ...p.transitions[0], id: 'l3b', source: 'D2', target: 'R', duration: 0 }])
    const r = simulateRoute(p, ['l1', 'l2', 'l3', 'l3b', 'la'])
    expect(r.steps[1].via!.delay).toBe(15)
    expect(r.flow.filter((f) => f.kind === 'delayStart').map((f) => f.time)).toEqual([61, 73])
    expect(r.flow.filter((f) => f.kind === 'delayEnd').map((f) => f.time)).toEqual([73, 76])
    expect(r.steps[1].start).toBe(76)
  })
})

describe('Event: narrative trace', () => {
  it('appends an ordered, absolutely timed entry when traversed and is not a scene trigger', () => {
    const r = simulateRoute(flowProject(), toA)
    expect(r.flow.map((f) => f.kind)).toEqual(['delayStart', 'delayEnd', 'event', 'random'])
    const ev = r.flow.find((f) => f.kind === 'event')!
    expect(ev).toMatchObject({ nodeId: 'E', title: 'Church bell', category: 'reveal', description: 'The bell rings once', time: 73 })
    const times = r.flow.map((f) => f.time)
    expect([...times].sort((x, y) => x - y)).toEqual(times)
    expect(r.events.map((e) => e.triggerId)).toEqual(['st_t', 'a_t']) // only scene triggers
    expect(r.steps).toHaveLength(2) // Event/Delay/Random create no scene visit
    expect(r.stats.eventCount).toBe(1)
  })
  it('never changes pacing intensity, trigger counts or scene data', () => {
    const base = flowProject()
    const plain: Project = {
      ...base,
      logicNodes: [],
      transitions: [{ ...base.transitions[0], id: 'direct', source: 'start', target: 'a', duration: 13 }, base.transitions[5], base.transitions[6]],
    }
    const withNodes = simulateRoute(base, toA)
    const direct = simulateRoute(plain, ['direct'])
    expect(withNodes.stats.occurrences).toBe(direct.stats.occurrences)
    expect(withNodes.stats.avgIntensity).toBe(direct.stats.avgIntensity)
    expect(withNodes.stats.peakIntensity).toBe(direct.stats.peakIntensity)
    expect(withNodes.steps.map((s) => [s.sceneId, s.start, s.end])).toEqual(direct.steps.map((s) => [s.sceneId, s.start, s.end]))
    expect(analyzePacing(withNodes).overview.perKind).toEqual(analyzePacing(direct).overview.perKind)
  })
})

describe('Random Branch', () => {
  it('waits for an explicit choice with A first, authored probabilities and labels', () => {
    const r = simulateRoute(flowProject(), ['l1', 'l2', 'l3'])
    expect(r.pending).toMatchObject({ kind: 'random', probabilityA: 30, labelA: 'Door opens', labelB: 'Silence' })
    expect(r.options.map((o) => [o.port, o.fromRandom?.probability, o.fromRandom?.label])).toEqual([
      ['a', 30, 'Door opens'],
      ['b', 70, 'Silence'],
    ])
    expect(r.options.every((o) => o.logic === undefined && o.fromBranch === undefined)).toBe(true)
    expect(r.status).toBe('active')
    expect(r.stats.randomDecisions).toBe(0)
  })
  it('records the explicit choice in the flow trace and the route as a transition id', () => {
    const r = simulateRoute(flowProject(), toB)
    expect(r.validChoices).toEqual(toB)
    expect(r.flow.at(-1)).toMatchObject({ kind: 'random', port: 'b', label: 'Silence', probabilityA: 30, choiceIndex: 3, time: 73 })
    expect(r.stats.randomDecisions).toBe(1)
    expect(r.steps[1].sceneId).toBe('b')
  })
  it('handles the 0 % and 100 % boundaries without hiding either output', () => {
    for (const pa of [0, 100]) {
      const p = flowProject()
      p.logicNodes = p.logicNodes.map((n) => (n.id === 'R' ? { ...n, probabilityA: pa } : n))
      const r = simulateRoute(p, ['l1', 'l2', 'l3'])
      expect(r.options.map((o) => o.fromRandom!.probability).sort((x, y) => x - y)).toEqual(pa === 0 ? [0, 100] : [0, 100])
      expect(simulateRoute(p, toA).validChoices).toEqual(toA) // the improbable output can still be explored by hand
    }
  })
  it('reports a missing output connection and keeps the rest followable', () => {
    const p = flowProject()
    p.transitions = p.transitions.filter((t) => t.id !== 'lb')
    const r = simulateRoute(p, ['l1', 'l2', 'l3'])
    expect(r.options.map((o) => o.port)).toEqual(['a'])
    expect(r.warnings.map((w) => w.code)).toContain('diag.sim.randomOpenPort')
    const none = flowProject()
    none.transitions = none.transitions.filter((t) => t.source !== 'R')
    expect(simulateRoute(none, ['l1', 'l2', 'l3']).status).toBe('deadEnd')
  })
  it('invalidates choices whose port no longer fits, instead of repairing them', () => {
    const p = flowProject()
    p.transitions = p.transitions.map((t) => (t.id === 'lb' ? { ...t, sourcePort: 'true' as const } : t))
    const r = simulateRoute(p, toB)
    expect(r.validChoices).toEqual(['l1', 'l2', 'l3'])
    expect(r.invalidated).toBe(1)
  })
})

describe('traversal model: state, limits, replay', () => {
  it('keeps Set Flag order, structured IF evaluation and free-text assumptions', () => {
    const r = simulateRoute(stateProject(check('insulted')), ['a', 'b', 'no'])
    expect(r.flow.map((f) => f.kind)).toEqual(['flag', 'if'])
    expect(r.flow[0]).toMatchObject({ kind: 'flag', flagName: 'VillagerWasInsulted', before: false, after: true, time: 61 })
    expect(r.flow[1]).toMatchObject({ kind: 'if', port: 'false', logic: 'override', evaluated: true })
    expect(r.steps[1].via!.condition).toContain('free text that must never be evaluated') // assumption of the override, never evaluated
    expect(r.stats.overrides).toBe(1)
  })
  it('keeps the link-count step cap', () => {
    const r = simulateRoute(flowProject(), toA, { stepCap: 3 })
    expect(r.validChoices).toEqual(['l1', 'l2', 'l3'])
    expect(r.status).toBe('stepLimit')
  })
  it('replays deterministically and drops tails invalidated by graph edits', () => {
    const p = flowProject()
    expect(simulateRoute(p, toA)).toEqual(simulateRoute(structuredClone(p), toA))
    const edited = { ...p, transitions: p.transitions.filter((t) => t.id !== 'l2') }
    const r = simulateRoute(edited, toA)
    expect(r.validChoices).toEqual(['l1'])
    expect(r.invalidated).toBe(3)
  })
  it('a graph with waypoints, Event, Delay and Random nodes still analyzes and compares', () => {
    const p = flowProject()
    const a = analyze(p)
    expect(a.stats).toMatchObject({ events: 1, delays: 1, randoms: 1 })
    expect(a.issues.filter((i) => i.severity === 'error')).toEqual([])
    const cmp = compareRoutes(p, toA, toB, {}, {}, { a: { 3: { mode: 'rolled' } }, b: { 3: { mode: 'manual' } } })
    expect(cmp.a.duration).toBe(103)
    expect(cmp.b.duration).toBe(93)
    expect(cmp.a.delayTotal).toBe(12)
    expect(cmp.b.delayTotal).toBe(12)
    expect([cmp.a.randomRolled, cmp.a.randomManual, cmp.b.randomRolled, cmp.b.randomManual]).toEqual([1, 0, 0, 1])
    expect(compareRoutes(p, toA, toB).a.randomRolled).toBe(0) // provenance unknown when absent
  })
})
