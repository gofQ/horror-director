import { describe, expect, it } from 'vitest'
import { analyzePacing, clampPacing, DEFAULT_PACING, type PacingAnalysis, type PacingCategory } from './pacing'
import { simulateRoute, type SimOptions } from './simulate'
import { newScene, newTransition, newTrigger } from './factory'
import type { Project, Scene, Transition, Trigger, TriggerKind } from './schema'

/** [time, intensity, kind?, extra?] */
type T = [number, number, TriggerKind?, Partial<Trigger>?]
const trigs = (list: T[]): Trigger[] =>
  list.map(([time, intensity, kind = 'audio', extra = {}], i) => ({ ...newTrigger(), id: `t${i}`, name: `t${i}`, time, intensity, kind, ...extra }))
const sc = (id: string, duration: number, list: T[] = [], kind: Scene['kind'] = 'reality'): Scene => ({
  ...newScene(kind),
  id,
  title: id,
  duration,
  triggers: trigs(list),
})
const tr = (id: string, s: string, t: string, o: Partial<Transition> = {}): Transition => ({ ...newTransition(s, t), id, duration: 1, ...o })
const proj = (scenes: Scene[], transitions: Transition[] = []): Project => ({ name: 'p', description: '', startSceneId: scenes[0]?.id ?? null, scenes, transitions, logicNodes: [], comments: [], sceneTypes: [], flags: [], characters: [] })

/** One scene route. `complete` = the route ends in a dead end (finished); otherwise another scene follows. */
function analyze(list: T[], o: { duration?: number; complete?: boolean; options?: Parameters<typeof analyzePacing>[1] } = {}): PacingAnalysis {
  const duration = o.duration ?? 1000
  const complete = o.complete ?? true
  const p = complete ? proj([sc('a', duration, list)]) : proj([sc('a', duration, list), sc('b', 10)], [tr('go', 'a', 'b')])
  return analyzePacing(simulateRoute(p, []), o.options)
}
const of = (a: PacingAnalysis, c: PacingCategory) => a.findings.filter((f) => f.category === c)
const times = (xs: number[], intensity = 3, kind: TriggerKind = 'audio'): T[] => xs.map((t) => [t, intensity, kind])

describe('trigger clustering (>= 4 events within 20 s)', () => {
  it('needs four events within the window, boundaries inclusive', () => {
    expect(of(analyze(times([0, 5, 10])), 'cluster')).toHaveLength(0)
    const exact = of(analyze(times([0, 6, 13, 20])), 'cluster')
    expect(exact).toHaveLength(1)
    expect(exact[0]).toMatchObject({ start: 0, end: 20, severity: 'informational' })
    expect(exact[0].values).toMatchObject({ count: 4, spanSeconds: 20, minCount: 4, windowSeconds: 20 })
    expect(of(analyze(times([0, 6, 13, 20.5])), 'cluster')).toHaveLength(0)
  })
  it('is a caution from six events', () => {
    expect(of(analyze(times([0, 3, 6, 9, 12])), 'cluster')[0].severity).toBe('informational')
    expect(of(analyze(times([0, 3, 6, 9, 12, 15])), 'cluster')[0].severity).toBe('caution')
  })
  it('reports one finding for overlapping windows of a dense run', () => {
    const f = of(analyze(times([0, 5, 10, 15, 20, 25, 30, 35])), 'cluster')
    expect(f).toHaveLength(1)
    expect(f[0]).toMatchObject({ start: 0, end: 35, severity: 'caution' })
    expect(f[0].eventKeys).toHaveLength(8)
  })
  it('reports separate clusters in time order', () => {
    const f = of(analyze(times([0, 5, 10, 15, 100, 105, 110, 115])), 'cluster')
    expect(f.map((x) => [x.start, x.end])).toEqual([[0, 15], [100, 115]])
  })
})

describe('high-intensity repetition (>= 2 events with intensity >= 8 within 45 s)', () => {
  const high = (...ts: [number, number][]) => ts.map(([t, i]) => [t, i] as T)
  it('uses intensity 8 as the inclusive threshold', () => {
    expect(of(analyze(high([0, 8], [10, 8])), 'highRepeat')).toHaveLength(1)
    expect(of(analyze(high([0, 8], [10, 7])), 'highRepeat')).toHaveLength(0)
  })
  it('window boundary is 45 s inclusive', () => {
    expect(of(analyze(high([0, 9], [45, 9])), 'highRepeat')).toHaveLength(1)
    expect(of(analyze(high([0, 9], [46, 9])), 'highRepeat')).toHaveLength(0)
  })
  it('is informational for two events and a caution from three', () => {
    expect(of(analyze(high([0, 8], [20, 9])), 'highRepeat')[0].severity).toBe('informational')
    const three = of(analyze(high([0, 8], [20, 9], [40, 10])), 'highRepeat')
    expect(three).toHaveLength(1)
    expect(three[0]).toMatchObject({ severity: 'caution', start: 0, end: 40 })
    expect(three[0].values.peak).toBe(10)
  })
  it('ignores lower-intensity events between high ones', () => {
    const f = of(analyze(high([0, 8], [10, 2], [20, 8])), 'highRepeat')
    expect(f).toHaveLength(1)
    expect(f[0].eventKeys).toEqual(['0:t0', '0:t2'])
  })
})

describe('repetitive scare types (>= 4 of one kind within the analysis window)', () => {
  it('boundaries are inclusive and the window is configurable', () => {
    expect(of(analyze(times([0, 40, 80, 120])), 'kindRepeat')).toHaveLength(1)
    expect(of(analyze(times([0, 40, 80, 121])), 'kindRepeat')).toHaveLength(0)
    expect(of(analyze(times([0, 40, 80, 120]), { options: { kindWindow: 100 } }), 'kindRepeat')).toHaveLength(0)
    expect(of(analyze(times([0, 40, 80, 121]), { options: { kindWindow: 150 } }), 'kindRepeat')).toHaveLength(1)
  })
  it('counts kinds independently and orders findings by time then kind', () => {
    const list: T[] = [...times([0, 30, 60, 90], 3, 'audio'), ...times([15, 45, 75, 105], 3, 'visual')]
    const f = of(analyze(list), 'kindRepeat')
    expect(f.map((x) => [x.kind, x.start, x.end])).toEqual([['audio', 0, 90], ['visual', 15, 105]])
    expect(of(analyze([...times([0, 30, 60], 3, 'audio'), ...times([15, 45, 75], 3, 'visual')]), 'kindRepeat')).toHaveLength(0)
  })
  it('is a caution from six occurrences', () => {
    expect(of(analyze(times([0, 20, 40, 60, 80])), 'kindRepeat')[0].severity).toBe('informational')
    expect(of(analyze(times([0, 20, 40, 60, 80, 100])), 'kindRepeat')[0].severity).toBe('caution')
  })
})

describe('extended trigger-free intervals (>= 90 s, reported neutrally)', () => {
  it('detects an interior gap of exactly 90 s but not 89 s', () => {
    const ok = of(analyze(times([0, 90]), { duration: 90 }), 'silence')
    expect(ok).toHaveLength(1)
    expect(ok[0]).toMatchObject({ start: 0, end: 90, severity: 'informational' })
    expect(ok[0].eventKeys).toEqual(['0:t0', '0:t1'])
    expect(of(analyze(times([0, 89]), { duration: 89 }), 'silence')).toHaveLength(0)
  })
  it('detects a leading gap from the route start', () => {
    const f = of(analyze(times([95, 100]), { duration: 100 }), 'silence')
    expect(f).toHaveLength(1)
    expect(f[0]).toMatchObject({ start: 0, end: 95, edge: 'start' })
  })
  it('detects trailing silence only when the route is finished', () => {
    const done = of(analyze(times([0, 5]), { duration: 100, complete: true }), 'silence')
    expect(done).toHaveLength(1)
    expect(done[0]).toMatchObject({ start: 5, end: 100, edge: 'end' })
    expect(of(analyze(times([0, 5]), { duration: 100, complete: false }), 'silence')).toHaveLength(0)
  })
  it('honours a configured minimum', () => {
    expect(of(analyze(times([0, 50]), { duration: 50, options: { silenceMin: 40 } }), 'silence')).toHaveLength(1)
    expect(of(analyze(times([0, 50]), { duration: 50, options: { silenceMin: 60 } }), 'silence')).toHaveLength(0)
  })
  it('reports the longest trigger-free interval in the overview', () => {
    const a = analyze(times([10, 30, 130]), { duration: 140 })
    expect(a.overview.longestSilence).toEqual({ start: 30, end: 130, seconds: 100, edge: undefined })
  })
})

describe('escalation sequences (>= 3 consecutive strictly increasing events)', () => {
  const run = (...pairs: [number, number][]) => pairs.map(([t, i]) => [t, i, 'audio'] as T)
  it('needs three events with strictly increasing intensity', () => {
    expect(of(analyze(run([0, 2], [10, 4])), 'escalation')).toHaveLength(0)
    const f = of(analyze(run([0, 2], [10, 4], [20, 6])), 'escalation')
    expect(f).toHaveLength(1)
    expect(f[0]).toMatchObject({ start: 0, end: 20, severity: 'informational' })
    expect(f[0].values).toMatchObject({ count: 3, firstIntensity: 2, lastIntensity: 6 })
  })
  it('equal intensity breaks a run', () => {
    expect(of(analyze(run([0, 2], [10, 4], [20, 4], [30, 6])), 'escalation')).toHaveLength(0)
  })
  it('reports maximal runs once and separates distinct runs', () => {
    const five = of(analyze(run([0, 2], [10, 4], [20, 6], [30, 7], [40, 9])), 'escalation')
    expect(five).toHaveLength(1)
    expect(five[0].values.count).toBe(5)
    const two = of(analyze(run([0, 1], [10, 3], [20, 5], [30, 2], [40, 4], [50, 6])), 'escalation')
    expect(two.map((f) => [f.start, f.end])).toEqual([[0, 20], [30, 50]])
  })
  it('breaks runs across gaps longer than 60 s (inclusive)', () => {
    expect(of(analyze(run([0, 2], [60, 4], [120, 6])), 'escalation')).toHaveLength(1)
    expect(of(analyze(run([0, 2], [61, 4], [122, 6])), 'escalation')).toHaveLength(0)
  })
})

describe('determinism and ordering', () => {
  it('gives identical, ordered results regardless of trigger declaration order', () => {
    const list: T[] = [[0, 2], [10, 4], [20, 6], [100, 8], [105, 9], [300, 3]]
    const a = analyze(list, { duration: 400 })
    const b = analyze([...list].reverse(), { duration: 400 })
    expect(a.findings.map((f) => [f.category, f.start, f.end, f.values.count])).toEqual(
      b.findings.map((f) => [f.category, f.start, f.end, f.values.count]),
    )
    expect(analyze(list, { duration: 400 })).toEqual(a)
    const starts = a.findings.map((f) => f.start)
    expect(starts).toEqual([...starts].sort((x, y) => x - y))
    expect(new Set(a.findings.map((f) => f.id)).size).toBe(a.findings.length)
  })
})

describe('hypothetical triggers and assumed transitions', () => {
  it('marks findings that include conditional triggers', () => {
    const list: T[] = [[0, 3, 'audio', { condition: 'player looks at door' }], [5, 3], [10, 3], [15, 3]]
    const f = of(analyze(list), 'cluster')[0]
    expect(f.dependsOnHypothetical).toBe(true)
    expect(of(analyze(times([0, 5, 10, 15])), 'cluster')[0].dependsOnHypothetical).toBe(false)
  })
  it('marks findings reached through a conditional transition, but not earlier ones', () => {
    const p = proj(
      [sc('a', 200, times([0, 5, 10, 15])), sc('b', 200, times([0, 5, 10, 15]))],
      [tr('e1', 'a', 'b', { condition: 'has key' })],
    )
    const a = analyzePacing(simulateRoute(p, ['e1']))
    const clusters = of(a, 'cluster')
    expect(clusters).toHaveLength(2)
    expect(clusters[0].sceneIds).toEqual(['a'])
    expect(clusters[0].dependsOnAssumedTransitions).toBe(false)
    expect(clusters[1].sceneIds).toEqual(['b'])
    expect(clusters[1].dependsOnAssumedTransitions).toBe(true)
    const unconditional = proj(p.scenes, [tr('e1', 'a', 'b')])
    expect(of(analyzePacing(simulateRoute(unconditional, ['e1'])), 'cluster').every((f) => !f.dependsOnAssumedTransitions)).toBe(true)
  })
  it('keeps hypothetical events in the overview counts', () => {
    const a = analyze([[0, 9, 'audio', { condition: 'x' }], [10, 4]])
    expect(a.overview.plannedEvents).toBe(2)
    expect(a.overview.hypotheticalEvents).toBe(1)
    expect(a.overview.highIntensity).toBe(1)
  })
})

describe('only valid planned occurrences are analyzed', () => {
  it('excludes beyond-duration events', () => {
    const a = analyze(times([11, 12, 13, 14]), { duration: 10 })
    expect(a.overview.plannedEvents).toBe(0)
    expect(of(a, 'cluster')).toHaveLength(0)
    expect(a.insufficient).toBe(true)
  })
  it('counts once-only triggers a single time across repeated visits', () => {
    const p = proj([sc('a', 10, [[2, 3, 'audio', { once: true }], [5, 3, 'audio', { once: false }]])], [tr('loop', 'a', 'a')])
    const sim = simulateRoute(p, ['loop', 'loop'])
    const a = analyzePacing(sim)
    expect(a.overview.plannedEvents).toBe(4) // once@2 + every@5, @16, @27
    expect(sim.stats.onceSkipped).toBe(2)
  })
  it('treats repeated visits as one timeline', () => {
    const p = proj([sc('a', 3, [[1, 3, 'audio', { once: false }]])], [tr('loop', 'a', 'a')])
    const a = analyzePacing(simulateRoute(p, ['loop', 'loop', 'loop', 'loop']))
    const c = of(a, 'cluster')
    expect(c).toHaveLength(1)
    expect([c[0].start, c[0].end, c[0].values.count]).toEqual([1, 17, 5])
    expect(c[0].sceneIds).toEqual(['a'])
    expect(new Set(c[0].eventKeys.map((k) => k.split(':')[0])).size).toBe(5) // five different visits
  })
})

describe('empty, short, unfinished and limited routes', () => {
  it('handles empty and start-less projects', () => {
    for (const p of [proj([]), { ...proj([sc('a', 10)]), startSceneId: null }]) {
      const a = analyzePacing(simulateRoute(p, []))
      expect(a.insufficient).toBe(true)
      expect(a.findings).toEqual([])
      expect(a.overview).toMatchObject({ plannedEvents: 0, eventsPerMinute: null, routeSeconds: 0, longestSilence: null, highIntensity: 0 })
    }
  })
  it('needs at least two planned events for pattern detection', () => {
    const none = analyze([], { duration: 300 })
    expect(none.insufficient).toBe(true)
    expect(none.findings).toEqual([])
    expect(none.overview.longestSilence).toMatchObject({ start: 0, end: 300, seconds: 300, edge: 'start' })
    const one = analyze([[10, 9]], { duration: 300 })
    expect(one.insufficient).toBe(true)
    expect(one.findings).toEqual([])
    expect(one.overview.plannedEvents).toBe(1)
  })
  it('computes events per minute from the route time', () => {
    expect(analyze(times([0, 1, 2, 3, 4, 5]), { duration: 120 }).overview.eventsPerMinute).toBe(3)
  })
  it('does not evaluate trailing silence on unfinished routes and flags completeness', () => {
    const open = analyze(times([0, 5]), { duration: 200, complete: false })
    expect(open.overview.routeComplete).toBe(false)
    expect(of(open, 'silence')).toHaveLength(0)
    expect(analyze(times([0, 5]), { duration: 200, complete: true }).overview.routeComplete).toBe(true)
  })
  it('treats a step-limited route as unfinished', () => {
    const p = proj([sc('a', 60, times([0, 5])), sc('b', 60, times([0, 5]))], [tr('ab', 'a', 'b'), tr('ba', 'b', 'a')])
    const opts: Partial<SimOptions> = { stepCap: 3 }
    const sim = simulateRoute(p, ['ab', 'ba', 'ab', 'ba'], opts)
    expect(sim.status).toBe('stepLimit')
    const a = analyzePacing(sim)
    expect(a.overview.routeComplete).toBe(false)
    expect(of(a, 'silence').every((f) => f.edge !== 'end')).toBe(true)
  })
  it('endings count as finished routes', () => {
    const p = proj([sc('a', 10, times([0, 5])), sc('z', 200, [], 'ending')], [tr('go', 'a', 'z')])
    const a = analyzePacing(simulateRoute(p, ['go']))
    expect(a.overview.routeComplete).toBe(true)
    expect(of(a, 'silence')[0]).toMatchObject({ edge: 'end', start: 5, end: 211 })
  })
})

describe('overview', () => {
  it('summarizes kinds, high intensity and counts', () => {
    const a = analyze([[0, 9, 'jumpscare'], [10, 8, 'jumpscare'], [20, 3, 'audio'], [30, 7, 'visual']], { duration: 100 })
    expect(a.overview.perKind).toMatchObject({ jumpscare: 2, audio: 1, visual: 1, ai: 0, environment: 0, narrative: 0 })
    expect(a.overview.highIntensity).toBe(2)
    expect(a.overview.plannedEvents).toBe(4)
  })
})

describe('purity and options', () => {
  it('never mutates its input', () => {
    const sim = simulateRoute(proj([sc('a', 100, [[50, 3], [10, 4], [30, 9]])]), [])
    const before = structuredClone(sim)
    analyzePacing(sim)
    expect(sim).toEqual(before)
  })
  it('clamps options to safe ranges and defaults invalid values', () => {
    expect(clampPacing()).toEqual(DEFAULT_PACING)
    expect(clampPacing({ clusterCount: 1, silenceMin: 0, highThreshold: 99, kindWindow: NaN, escalationMin: 1 })).toMatchObject({
      clusterCount: 2,
      silenceMin: 1,
      highThreshold: 10,
      kindWindow: 120,
      escalationMin: 3,
    })
  })
})
