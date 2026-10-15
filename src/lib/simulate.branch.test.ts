import { describe, expect, it } from 'vitest'
import { simulateRoute } from './simulate'
import { compareRoutes } from './compare'
import { analyzePacing } from './pacing'
import { sampleProject } from './sample'
import { newTrigger } from './factory'
import { branch, branchProject, link, scene } from '../test/branchProject'
import type { Project } from './schema'

const base = branchProject()
const route = (...ids: string[]) => simulateRoute(base, ids)

describe('branch in the story path simulator', () => {
  it('stops at the IF node and asks for an explicit TRUE/FALSE choice (assumption, never evaluated)', () => {
    const r = route('into')
    expect(r.pending).toEqual({ nodeId: 'if1', kind: 'branch', title: 'Insulted?', condition: 'Did the protagonist insult the villagers?', evaluated: null })
    expect(r.status).toBe('active')
    expect(r.steps).toHaveLength(1) // no extra visit for the IF node
    expect(r.current!.sceneId).toBe('sq')
    expect(r.options.map((o) => [o.transitionId, o.port, o.targetType, o.targetId])).toEqual([
      ['yes', 'true', 'scene', 'collapse'],
      ['no', 'false', 'scene', 'talk'],
    ])
    expect(r.options[0].fromBranch).toEqual({ nodeId: 'if1', title: 'Insulted?', condition: 'Did the protagonist insult the villagers?' })
  })
  it('lists the link into the branch as a branch option from the scene', () => {
    const r = route()
    expect(r.pending).toBeNull()
    expect(r.options).toHaveLength(1)
    expect(r.options[0]).toMatchObject({ transitionId: 'into', targetType: 'branch', targetTitle: 'Insulted?', duration: 2 })
  })
  it('TRUE and FALSE lead to different scenes; the branch takes zero scene time and creates one visit', () => {
    const t = route('into', 'yes')
    const f = route('into', 'no')
    expect(t.steps.map((s) => s.sceneId)).toEqual(['sq', 'collapse'])
    expect(f.steps.map((s) => s.sceneId)).toEqual(['sq', 'talk'])
    expect(t.pending).toBeNull()
    // sq runs 0–60, hop = 2 (into) + 0 (output) seconds
    expect(t.steps[1]).toMatchObject({ start: 62, end: 122, visit: 1 })
    expect(t.steps[1].via).toMatchObject({ transitionId: 'yes', duration: 2, linkIds: ['into', 'yes'], label: 'Talk', crossing: 'reality->dream' })
    expect(t.steps[1].via!.branches).toEqual([{ nodeId: 'if1', title: 'Insulted?', condition: 'Did the protagonist insult the villagers?', port: 'true', logic: 'manual', evaluated: null }])
    expect(t.stats.visits).toBe(2)
    expect(t.stats.realityToDream).toBe(1)
    expect(f.stats.realityToDream).toBe(0)
  })
  it('shows the chosen condition as an assumption', () => {
    const t = route('into', 'yes')
    expect(t.steps[1].via!.condition).toContain('Did the protagonist insult the villagers?')
    expect(t.steps[1].via!.linkCondition).toBe('')
    expect(t.stats.hypothetical).toBe(0) // only trigger conditions are hypothetical events
  })
  it('does not invent trigger occurrences: events only come from the scenes visited', () => {
    const t = route('into', 'yes', 'c_end')
    expect(t.events.map((e) => e.triggerId)).toEqual(['sq_t', 'co_t'])
    expect(t.stats.occurrences).toBe(2)
    expect(t.events.find((e) => e.triggerId === 'co_t')!.absoluteTime).toBe(62 + 5)
  })
  it('reaches an ending through either branch', () => {
    expect(route('into', 'yes', 'c_end').status).toBe('ending')
    expect(route('into', 'no', 't_end').status).toBe('ending')
  })
  it('counts every link toward the step cap', () => {
    const r = simulateRoute(base, ['into', 'yes'], { stepCap: 2 })
    expect(r.validChoices).toEqual(['into', 'yes'])
    expect(r.status).toBe('stepLimit')
    const cut = simulateRoute(base, ['into', 'yes', 'c_end'], { stepCap: 2 })
    expect(cut.validChoices).toEqual(['into', 'yes'])
  })
  it('revalidates after graph edits: removed links truncate the route and report it', () => {
    const edited: Project = { ...base, transitions: base.transitions.filter((t) => t.id !== 'yes') }
    const r = simulateRoute(edited, ['into', 'yes', 'c_end'])
    expect(r.validChoices).toEqual(['into'])
    expect(r.invalidated).toBe(2)
    expect(r.pending?.nodeId).toBe('if1')
    // deleting the IF node drops the whole route behind the scene
    const noIf: Project = { ...base, logicNodes: [], transitions: base.transitions.filter((t) => !['into', 'yes', 'no'].includes(t.id)) }
    expect(simulateRoute(noIf, ['into', 'yes']).validChoices).toEqual([])
  })
  it('rejects choices out of order (a branch output without being at the branch, a scene link while pending)', () => {
    expect(route('yes').invalidated).toBe(1)
    expect(route('into', 'c_end').invalidated).toBe(1)
    expect(route('into', 'c_end').pending?.nodeId).toBe('if1')
  })
  it('a branch with unconnected outputs is a dead end while pending; an open output is simply absent', () => {
    const p: Project = { ...base, transitions: base.transitions.filter((t) => t.id !== 'yes' && t.id !== 'no') }
    const r = simulateRoute(p, ['into'])
    expect(r.options).toEqual([])
    expect(r.status).toBe('deadEnd')
    const one = simulateRoute({ ...base, transitions: base.transitions.filter((t) => t.id !== 'no') }, ['into'])
    expect(one.options.map((o) => o.port)).toEqual(['true'])
  })
  it('nested IF nodes keep being explicit choices and add up link durations', () => {
    const p: Project = {
      ...base,
      logicNodes: [...base.logicNodes, branch('if2', { condition: 'Is it night?' })],
      transitions: [
        ...base.transitions.filter((t) => t.id !== 'no'),
        link('no', 'if1', 'if2', { sourcePort: 'false', duration: 0 }),
        link('n_day', 'if2', 'talk', { sourcePort: 'false', duration: 1 }),
        link('n_night', 'if2', 'collapse', { sourcePort: 'true', duration: 0 }),
      ],
    }
    const r = simulateRoute(p, ['into', 'no', 'n_day'])
    expect(r.steps.map((s) => s.sceneId)).toEqual(['sq', 'talk'])
    expect(r.steps[1].via!.branches.map((b) => [b.nodeId, b.port])).toEqual([['if1', 'false'], ['if2', 'false']])
    expect(r.steps[1].via!.duration).toBe(3)
    expect(simulateRoute(p, ['into', 'no']).pending?.nodeId).toBe('if2')
  })
})

describe('branches inside cycles and safety limits', () => {
  // loop → IF → TRUE: back to loop (loop scene has limits) / FALSE: exit
  const cyc = (loopCfg: Partial<Project['scenes'][number]['loop']>): Project => ({
    ...base,
    scenes: [scene('loop', 'nightmare', { loop: { enabled: true, maxIterations: 2, exitCondition: 'x', ...loopCfg } }), scene('out', 'ending')],
    logicNodes: [branch('b', { condition: 'Does the player turn around?' })],
    transitions: [link('l_b', 'loop', 'b', { duration: 1 }), link('b_t', 'b', 'loop', { sourcePort: 'true', duration: 0 }), link('b_f', 'b', 'out', { sourcePort: 'false', duration: 0 })],
    startSceneId: 'loop',
  })
  it('honors loop maxIterations when entering the loop scene through the branch', () => {
    const turn = ['l_b', 'b_t']
    const r = simulateRoute(cyc({}), [...turn, ...turn])
    expect(r.steps.map((s) => s.sceneId)).toEqual(['loop', 'loop', 'loop']) // 1 + maxIterations (2) visits
    expect(r.pending).toBeNull()
    // the next trip through the IF node is possible, but TRUE (back into the loop) is blocked, FALSE stays open
    const again = simulateRoute(cyc({}), [...turn, ...turn, 'l_b'])
    expect(again.pending?.nodeId).toBe('b')
    expect(again.options.find((o) => o.port === 'true')!.blocked).toBe('loopLimit')
    expect(again.options.find((o) => o.port === 'false')!.blocked).toBeNull()
    expect(simulateRoute(cyc({}), [...turn, ...turn, 'l_b', 'b_t']).invalidated).toBe(1)
    expect(simulateRoute(cyc({}), [...turn, ...turn, 'l_b', 'b_f']).status).toBe('ending')
  })
  it('uses the unlimited safety limit for maxIterations 0 and the step cap as the hard stop', () => {
    const turn = ['l_b', 'b_t']
    const r = simulateRoute(cyc({ maxIterations: 0 }), Array(10).fill(turn).flat(), { unlimitedLimit: 2 })
    expect(r.steps).toHaveLength(3) // 1 + 2 allowed repeats
    expect(r.invalidated).toBeGreaterThan(0)
    const capped = simulateRoute(cyc({ enabled: false }), Array(30).fill(turn).flat(), { stepCap: 6 })
    expect(capped.validChoices).toHaveLength(6)
    expect(capped.status).toBe('stepLimit')
  })
})

describe('legacy scene-to-scene routes are unchanged', () => {
  it('the sample project simulates with the same steps, durations and options as plain transitions', () => {
    const s = sampleProject()
    const first = simulateRoute(s, [])
    expect(first.pending).toBeNull()
    expect(first.options.every((o) => o.targetType === 'scene' && o.port === undefined && o.fromBranch === undefined)).toBe(true)
    const opt = first.options[0]
    const r = simulateRoute(s, [opt.transitionId])
    const tr = s.transitions.find((t) => t.id === opt.transitionId)!
    expect(r.steps[1].via).toEqual({
      transitionId: tr.id,
      label: tr.label,
      style: tr.style,
      duration: tr.duration,
      delay: 0,
      condition: tr.condition.trim(),
      linkCondition: tr.condition.trim(),
      crossing: r.steps[1].via!.crossing,
      linkIds: [tr.id],
      branches: [],
      changes: [],
    })
    expect(r.steps[1].start).toBe(first.current!.end + tr.duration)
  })
})

describe('route comparison and pacing over branch paths', () => {
  const a = ['into', 'yes', 'c_end']
  const b = ['into', 'no', 't_end']
  it('diverges at the branch choice and compares TRUE vs FALSE paths', () => {
    const c = compareRoutes(base, a, b, {}, {})
    expect(c.divergence).toMatchObject({ kind: 'diverges', sharedSteps: 1, sceneId: 'sq' })
    if (c.divergence.kind === 'diverges') expect(c.divergence.next.a!.transitionId).not.toBe(c.divergence.next.b!.transitionId)
    expect(c.scenes.onlyA.map((x) => x.id)).toEqual(['collapse'])
    expect(c.scenes.onlyB.map((x) => x.id)).toEqual(['talk'])
    expect(c.scenes.shared.map((x) => x.id).sort()).toEqual(['end', 'sq'])
  })
  it('flags branch hops as assumed transitions and keeps event counts correct', () => {
    const c = compareRoutes(base, a, b, {}, {})
    expect(c.a.assumedTransitions).toBe(1)
    expect(c.b.assumedTransitions).toBe(1)
    expect(c.a.events).toBe(2)
    expect(c.b.events).toBe(1)
    expect(c.incomplete).toBe(false)
  })
  it('identical routes show no divergence; pacing keeps counting only scene triggers', () => {
    const same = compareRoutes(base, a, a, {}, {})
    expect(same.identical).toBe(true)
    expect(same.divergence).toEqual({ kind: 'identical' })
    const p: Project = {
      ...base,
      scenes: base.scenes.map((s) => (s.id === 'collapse' ? { ...s, triggers: [{ ...newTrigger(1), id: 'x1', intensity: 9 }, { ...newTrigger(2), id: 'x2', intensity: 9 }] } : s)),
    }
    const pace = analyzePacing(simulateRoute(p, a))
    expect(pace.overview.plannedEvents).toBe(3) // Bell + two in the collapse scene; the IF node adds none
  })
})
