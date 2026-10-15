import { describe, expect, it } from 'vitest'
import { clampOptions, DEFAULT_STEP_CAP, formatClock, simulateRoute } from './simulate'
import { formatDiagnostics } from './diagnostics'
import { sampleProject } from './sample'
import { newScene, newTransition, newTrigger } from './factory'
import type { Project, Scene, SceneKind, Transition, Trigger } from './schema'

const sc = (id: string, o: Partial<Scene> = {}): Scene => ({ ...newScene('reality'), id, title: id.toUpperCase(), duration: 10, ...o })
const tr = (id: string, source: string, target: string, o: Partial<Transition> = {}): Transition => ({ ...newTransition(source, target), id, duration: 1, ...o })
const trg = (id: string, time: number, intensity: number, o: Partial<Trigger> = {}): Trigger => ({ ...newTrigger(), id, name: id, time, intensity, ...o })
const proj = (scenes: Scene[], transitions: Transition[], start: string | null = scenes[0]?.id ?? null): Project => ({
  name: 'p',
  description: '',
  startSceneId: start,
  scenes,
  transitions,
  logicNodes: [], comments: [], sceneTypes: [], flags: [], characters: [],
})
const loopScene = (id: string, maxIterations: number, o: Partial<Scene> = {}) =>
  sc(id, { loop: { enabled: true, maxIterations, exitCondition: '' }, ...o })
const codes = (r: { warnings: { code: string }[] }) => r.warnings.map((w) => w.code)

describe('empty and invalid projects', () => {
  it('reports empty and missing-start projects without throwing', () => {
    expect(simulateRoute(proj([], []), []).status).toBe('empty')
    expect(simulateRoute(proj([sc('a')], [], null), []).status).toBe('noStart')
    expect(simulateRoute(proj([sc('a')], [], 'ghost'), ['x']).status).toBe('noStart')
    expect(simulateRoute(proj([], []), ['x']).current).toBeNull()
  })
})

describe('branching and route status', () => {
  const p = proj(
    [sc('a'), sc('b'), sc('c', { kind: 'ending' }), sc('d')],
    [tr('e1', 'a', 'b'), tr('e2', 'a', 'c'), tr('e3', 'b', 'd')],
  )
  it('offers every outgoing transition at the start and follows either choice', () => {
    const start = simulateRoute(p, [])
    expect(start.status).toBe('active')
    expect(start.options.map((o) => o.transitionId)).toEqual(['e1', 'e2'])
    expect(simulateRoute(p, ['e1']).current?.sceneId).toBe('b')
    const end = simulateRoute(p, ['e2'])
    expect(end.current?.sceneId).toBe('c')
    expect(end.status).toBe('ending')
    expect(end.options).toEqual([])
  })
  it('identifies dead ends (non-ending scenes without a way forward)', () => {
    const r = simulateRoute(p, ['e1', 'e3'])
    expect(r.status).toBe('deadEnd')
    expect(r.current?.sceneId).toBe('d')
  })
  it('treats ending scenes as terminal even if they have outgoing transitions', () => {
    const q = proj([sc('a'), sc('z', { kind: 'ending' }), sc('b')], [tr('e1', 'a', 'z'), tr('e2', 'z', 'b')])
    const r = simulateRoute(q, ['e1'])
    expect(r.status).toBe('ending')
    expect(r.options).toEqual([])
    // and a route that tries to continue past an ending is truncated
    const cont = simulateRoute(q, ['e1', 'e2'])
    expect(cont.validChoices).toEqual(['e1'])
    expect(cont.invalidated).toBe(1)
  })
  it('exposes label, style, duration, condition and crossing for each option', () => {
    const q = proj(
      [sc('a'), sc('b', { kind: 'dream' })],
      [tr('e1', 'a', 'b', { label: 'Descend', style: 'glitch', duration: 2.5, condition: 'has key' })],
    )
    expect(simulateRoute(q, []).options[0]).toMatchObject({
      label: 'Descend',
      style: 'glitch',
      duration: 2.5,
      condition: 'has key',
      crossing: 'reality->dream',
      targetTitle: 'B',
      targetKind: 'dream',
      blocked: null,
    })
  })
})

describe('timing offsets', () => {
  const p = proj(
    [
      sc('a', { duration: 10 }),
      sc('b', { duration: 20, triggers: [trg('tb', 4, 6)] }),
      sc('c', { duration: 5, triggers: [trg('tc', 1, 8)] }),
    ],
    [tr('e1', 'a', 'b', { duration: 2 }), tr('e2', 'b', 'c', { duration: 3 })],
  )
  it('adds scene and transition durations into absolute times', () => {
    const r = simulateRoute(p, ['e1', 'e2'])
    expect(r.steps.map((s) => [s.start, s.end])).toEqual([[0, 10], [12, 32], [35, 40]])
    expect(r.stats.totalDuration).toBe(40)
    expect(r.events.map((e) => [e.triggerId, e.localTime, e.absoluteTime])).toEqual([['tb', 4, 16], ['tc', 1, 36]])
    expect(r.timelineEnd).toBe(40)
  })
  it('handles repeated visits: offsets accumulate and once-only triggers fire on the first visit only', () => {
    const q = proj(
      [sc('a', { duration: 10, triggers: [trg('once', 3, 5, { once: true }), trg('every', 6, 7, { once: false })] })],
      [tr('loop', 'a', 'a', { duration: 1 })],
    )
    const r = simulateRoute(q, ['loop', 'loop'])
    expect(r.steps.map((s) => s.start)).toEqual([0, 11, 22])
    expect(r.steps.map((s) => s.visit)).toEqual([1, 2, 3])
    const absolute = r.events.map((e) => [e.triggerId, e.absoluteTime])
    expect(absolute).toEqual([['once', 3], ['every', 6], ['every', 17], ['every', 28]])
    expect(r.stats.onceSkipped).toBe(2)
    expect(r.stats.occurrences).toBe(4)
    expect(r.stats.repeatVisits).toBe(2)
    expect(r.stats.visits).toBe(3)
    expect(r.stats.uniqueScenes).toBe(1)
  })
  it('orders each scene’s events by local time', () => {
    const q = proj([sc('a', { triggers: [trg('late', 8, 1), trg('early', 2, 1)] })], [])
    expect(simulateRoute(q, []).events.map((e) => e.triggerId)).toEqual(['early', 'late'])
  })
})

describe('conditions are assumptions, never evaluated', () => {
  it('lists the condition text on options and steps and lets any condition be chosen', () => {
    const q = proj(
      [sc('a'), sc('b')],
      [tr('e1', 'a', 'b', { condition: 'false && never' })],
    )
    const r0 = simulateRoute(q, [])
    expect(r0.options[0].condition).toBe('false && never')
    expect(r0.options[0].blocked).toBeNull()
    const r1 = simulateRoute(q, ['e1'])
    expect(r1.current?.sceneId).toBe('b')
    expect(r1.steps[1].via?.condition).toBe('false && never')
  })
  it('marks conditional triggers hypothetical but still plans them', () => {
    const q = proj([sc('a', { triggers: [trg('t1', 1, 4, { condition: 'player looks at door' }), trg('t2', 2, 8)] })], [])
    const r = simulateRoute(q, [])
    expect(r.events.map((e) => [e.triggerId, e.hypothetical])).toEqual([['t1', true], ['t2', false]])
    expect(r.stats.hypothetical).toBe(1)
    expect(r.stats.occurrences).toBe(2)
    expect(r.stats.avgIntensity).toBe(6)
    expect(r.stats.peakIntensity).toBe(8)
  })
})

describe('beyond-duration triggers', () => {
  it('flags, does not shift, warns, and excludes them from statistics', () => {
    const q = proj([sc('a', { duration: 10, triggers: [trg('in', 5, 2), trg('out', 50, 9)] })], [])
    const r = simulateRoute(q, [])
    const out = r.events.find((e) => e.triggerId === 'out')!
    expect(out.beyondDuration).toBe(true)
    expect(out.absoluteTime).toBe(50) // true time, not clamped to the scene end
    expect(r.stats.occurrences).toBe(1)
    expect(r.stats.beyondDuration).toBe(1)
    expect(r.stats.peakIntensity).toBe(2)
    expect(r.stats.avgIntensity).toBe(2)
    expect(codes(r)).toContain('diag.sim.beyondDuration')
    expect(r.timelineEnd).toBe(50)
  })
})

describe('loops and limits', () => {
  it('maxIterations counts additional repeat visits: N ⇒ N+1 total visits', () => {
    const q = proj([sc('a'), loopScene('l', 2)], [tr('in', 'a', 'l'), tr('self', 'l', 'l'), tr('out', 'l', 'a')])
    const two = simulateRoute(q, ['in', 'self', 'self'])
    expect(two.steps.filter((s) => s.sceneId === 'l').map((s) => s.visit)).toEqual([1, 2, 3])
    const self = two.options.find((o) => o.transitionId === 'self')!
    expect(self.blocked).toBe('loopLimit')
    expect(two.options.find((o) => o.transitionId === 'out')!.blocked).toBeNull()
    expect(two.status).toBe('active') // another option remains
    expect(formatDiagnostics('en', two.warnings)).toContain('“L” reached its loop limit (2 repeat visits).')
    // a route that exceeds the limit is truncated at the offending step
    const over = simulateRoute(q, ['in', 'self', 'self', 'self'])
    expect(over.validChoices).toEqual(['in', 'self', 'self'])
    expect(over.invalidated).toBe(1)
  })

  it('reports a stopped route when every option is blocked by a loop limit', () => {
    const q = proj([sc('a'), loopScene('l', 1)], [tr('in', 'a', 'l'), tr('self', 'l', 'l')])
    const r = simulateRoute(q, ['in', 'self'])
    expect(r.status).toBe('loopLimit')
    expect(r.options.every((o) => o.blocked === 'loopLimit')).toBe(true)
  })

  it('unlimited loops (0) use the separate safety limit', () => {
    const q = proj([loopScene('l', 0)], [tr('self', 'l', 'l')])
    const r = simulateRoute(q, ['self', 'self', 'self'], { unlimitedLimit: 3 })
    expect(r.stats.visits).toBe(4) // 1 + 3 repeats
    expect(r.options[0].blocked).toBe('safetyLimit')
    expect(r.status).toBe('loopLimit')
    expect(codes(r)).toContain('diag.sim.safetyLimit')
    expect(simulateRoute(q, ['self', 'self', 'self', 'self'], { unlimitedLimit: 3 }).invalidated).toBe(1)
  })

  it('scenes without loop settings are bounded only by the hard step cap', () => {
    const q = proj([sc('a'), sc('b')], [tr('ab', 'a', 'b'), tr('ba', 'b', 'a')])
    const route = Array.from({ length: 10 }, (_, i) => (i % 2 ? 'ba' : 'ab'))
    const capped = simulateRoute(q, route, { stepCap: 5 })
    expect(capped.status).toBe('stepLimit')
    expect(capped.validChoices).toHaveLength(5)
    expect(capped.invalidated).toBe(0) // truncated by the cap, not invalid
    expect(capped.options.every((o) => o.blocked === 'stepLimit')).toBe(true)
    expect(formatDiagnostics('en', capped.warnings)).toContain('Simulation stopped at the step limit of 5 transitions.')
  })

  it('has a default hard cap of 40 transitions and clamps configured limits', () => {
    expect(DEFAULT_STEP_CAP).toBe(40)
    const q = proj([sc('a'), sc('b')], [tr('ab', 'a', 'b'), tr('ba', 'b', 'a')])
    const route = Array.from({ length: 60 }, (_, i) => (i % 2 ? 'ba' : 'ab'))
    const r = simulateRoute(q, route)
    expect(r.validChoices).toHaveLength(40)
    expect(r.status).toBe('stepLimit')
    expect(clampOptions({ stepCap: 0, unlimitedLimit: 99 })).toEqual({ stepCap: 1, unlimitedLimit: 20 })
    expect(clampOptions({ stepCap: 9999 }).stepCap).toBe(200)
    expect(clampOptions({ stepCap: NaN, unlimitedLimit: -4 })).toEqual({ stepCap: 40, unlimitedLimit: 1 })
  })
})

describe('invalid references', () => {
  const p = proj([sc('a'), sc('b'), sc('c')], [tr('e1', 'a', 'b'), tr('e2', 'b', 'c')])
  it('truncates at an unknown transition', () => {
    const r = simulateRoute(p, ['e1', 'nope', 'e2'])
    expect(r.validChoices).toEqual(['e1'])
    expect(r.invalidated).toBe(2)
    expect(codes(r)).toContain('diag.sim.invalidated')
  })
  it('truncates at a transition that does not leave the current scene', () => {
    const r = simulateRoute(p, ['e2'])
    expect(r.validChoices).toEqual([])
    expect(r.invalidated).toBe(1)
  })
  it('revalidates after graph edits (deleted transition / scene / start)', () => {
    const edited = proj([sc('a'), sc('c')], [])
    const r = simulateRoute(edited, ['e1', 'e2'])
    expect(r.validChoices).toEqual([])
    expect(r.invalidated).toBe(2)
    expect(r.current?.sceneId).toBe('a')
    expect(simulateRoute({ ...p, startSceneId: 'gone' }, ['e1']).status).toBe('noStart')
  })
  it('excludes transitions to missing scenes from the options and warns', () => {
    const q = proj([sc('a'), sc('b')], [tr('ok', 'a', 'b'), tr('bad', 'a', 'ghost')])
    const r = simulateRoute(q, [])
    expect(r.options.map((o) => o.transitionId)).toEqual(['ok'])
    expect(codes(r)).toContain('diag.sim.missingTarget')
    expect(simulateRoute(q, ['bad']).invalidated).toBe(1)
  })
  it('applies loop limits that were lowered after the route was built', () => {
    const q = proj([loopScene('l', 3)], [tr('self', 'l', 'l')])
    expect(simulateRoute(q, ['self', 'self', 'self']).invalidated).toBe(0)
    const lowered = proj([loopScene('l', 1)], [tr('self', 'l', 'l')])
    const r = simulateRoute(lowered, ['self', 'self', 'self'])
    expect(r.validChoices).toEqual(['self'])
    expect(r.invalidated).toBe(2)
  })
})

describe('route statistics', () => {
  const kinds: SceneKind[] = ['reality', 'dream', 'reality']
  const p = proj(
    kinds.map((k, i) => sc(['a', 'b', 'c'][i], { kind: k, duration: 10, triggers: [trg(`t${i}`, 1, [3, 9, 6][i])] })),
    [tr('ab', 'a', 'b', { duration: 2 }), tr('bc', 'b', 'c', { duration: 1 })],
  )
  it('summarizes duration, visits, intensity and dream/reality crossings', () => {
    const r = simulateRoute(p, ['ab', 'bc'])
    expect(r.status).toBe('deadEnd') // scene c has no way forward
    expect(r.stats).toMatchObject({
      totalDuration: 33,
      visits: 3,
      uniqueScenes: 3,
      occurrences: 3,
      avgIntensity: 6,
      peakIntensity: 9,
      realityToDream: 1,
      dreamToReality: 1,
      repeatVisits: 0,
      beyondDuration: 0,
      onceSkipped: 0,
    })
  })
  it('reports null intensity statistics when no trigger is planned', () => {
    const r = simulateRoute(proj([sc('a')], []), [])
    expect(r.stats.avgIntensity).toBeNull()
    expect(r.stats.peakIntensity).toBeNull()
  })
})

describe('sample project routes', () => {
  const p = sampleProject()
  const routeFree = ['e1', 'e2', 'e5', 'e7', 'e8']
  it('reaches the "Let Go" ending with hand-verified timing', () => {
    const r = simulateRoute(p, routeFree)
    expect(r.status).toBe('ending')
    expect(r.current?.title).toBe('Ending: Let Go')
    // 90 + 120 + 150 + 120 + 120 + 60 scene seconds + 5 one-second transitions
    expect(r.stats.totalDuration).toBe(665)
    expect(r.stats.visits).toBe(6)
    expect(r.stats.realityToDream).toBe(1)
  })
  it('reaches the other ending through a different branch', () => {
    const r = simulateRoute(p, ['e1', 'e2', 'e5', 'e7', 'e9'])
    expect(r.status).toBe('ending')
    expect(r.current?.title).toBe('Ending: Forever Asleep')
    expect(r.stats.totalDuration).toBe(650)
  })
  it('stops the corridor self-loop after maxIterations (4) additional visits', () => {
    const r = simulateRoute(p, ['e1', 'e2', 'e5', 'e6', 'e6', 'e6', 'e6'])
    expect(r.steps.filter((s) => s.sceneId === 's_loop')).toHaveLength(5)
    expect(r.options.find((o) => o.transitionId === 'e6')!.blocked).toBe('loopLimit')
    expect(r.options.find((o) => o.transitionId === 'e7')!.blocked).toBeNull()
    expect(simulateRoute(p, ['e1', 'e2', 'e5', 'e6', 'e6', 'e6', 'e6', 'e6']).invalidated).toBe(1)
  })
})

describe('purity', () => {
  it('is deterministic and never mutates the project', () => {
    const p = sampleProject()
    const before = structuredClone(p)
    const route = ['e1', 'e2', 'e5', 'e6']
    const a = simulateRoute(p, route)
    const b = simulateRoute(p, route)
    expect(b).toEqual(a)
    expect(p).toEqual(before)
  })
})

describe('formatClock', () => {
  it('formats m:ss and h:mm:ss', () => {
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(65)).toBe('1:05')
    expect(formatClock(665)).toBe('11:05')
    expect(formatClock(3725)).toBe('1:02:05')
    expect(formatClock(-3)).toBe('0:00')
  })
})
