import { describe, expect, it } from 'vitest'
import { simulateRoute } from './simulate'
import { compareRoutes } from './compare'
import { analyzePacing } from './pacing'
import { check, flag, setNode, stateProject } from '../test/stateProject'
import { branch, link, scene } from '../test/branchProject'
import { emptyProject } from './factory'
import { newTrigger } from './factory'
import type { Expr, Project } from './schema'

const via = ['a', 'b'] // start → SET → IF (pending at the IF)

describe('Set Flag in the story path simulator', () => {
  it('starts from the project defaults and applies the assignment when the node is entered', () => {
    const p = stateProject()
    expect(simulateRoute(p, []).state).toEqual({ insulted: false, ritual: true })
    const atSet = simulateRoute(p, ['a'])
    expect(atSet.pending).toMatchObject({ kind: 'setFlag', nodeId: 'set1', evaluated: null })
    expect(atSet.state.insulted).toBe(true) // applied on entry
    expect(atSet.changes).toEqual([{ nodeId: 'set1', nodeTitle: 'set1', flagId: 'insulted', flagName: 'VillagerWasInsulted', before: false, after: true, stepIndex: 0 }])
    expect(atSet.options.map((o) => [o.transitionId, o.targetType])).toEqual([['b', 'branch']])
    expect(atSet.steps).toHaveLength(1) // no visit, no extra step
  })
  it('is zero-time and creates no visits or trigger occurrences', () => {
    const p = stateProject()
    p.scenes = p.scenes.map((s) => (s.id === 'start' ? { ...s, triggers: [{ ...newTrigger(5), id: 't0', name: 'x' }] } : s))
    const r = simulateRoute(p, [...via, 'yes'])
    expect(r.steps.map((s) => s.sceneId)).toEqual(['start', 'bad'])
    expect(r.steps[1].start).toBe(60 + 1) // only the scene link into the SET node (1 s); SET and IF outputs add 0
    expect(r.stats.visits).toBe(2)
    expect(r.events.map((e) => e.triggerId)).toEqual(['t0'])
    expect(r.steps[1].via!.changes.map((c) => c.flagName)).toEqual(['VillagerWasInsulted'])
    expect(r.steps[1].flags).toEqual({ insulted: true, ritual: true })
    expect(r.steps[0].flags).toEqual({ insulted: false, ritual: true })
  })
  it('links count toward the step cap', () => {
    const r = simulateRoute(stateProject(), [...via, 'yes', 'bad_end'], { stepCap: 3 })
    expect(r.validChoices).toEqual(['a', 'b', 'yes'])
    expect(r.status).toBe('stepLimit')
  })
  it('applies assignments in route order, including repeated changes of one flag', () => {
    const p = stateProject()
    p.logicNodes.push(setNode('set2', 'insulted', false))
    p.transitions = p.transitions.map((t) => (t.id === 'bad_end' ? { ...t, target: 'set2' } : t))
    p.transitions.push(link('c', 'set2', 'good'))
    const r = simulateRoute(p, [...via, 'yes', 'bad_end', 'c'])
    expect(r.changes.map((c) => [c.nodeId, c.before, c.after])).toEqual([['set1', false, true], ['set2', true, false]])
    expect(r.state.insulted).toBe(false)
    expect(r.steps.at(-1)!.flags.insulted).toBe(false)
  })
  it('an unassigned Set Flag (no flag) changes nothing', () => {
    const p = stateProject()
    p.logicNodes = p.logicNodes.map((n) => (n.id === 'set1' ? { ...n, flagId: null } : n))
    const r = simulateRoute(p, ['a'])
    expect(r.changes).toEqual([])
    expect(r.state.insulted).toBe(false)
  })
  it('replays from the start: back / restart / graph edits recompute the state', () => {
    const p = stateProject()
    expect(simulateRoute(p, [...via, 'yes']).state.insulted).toBe(true)
    expect(simulateRoute(p, ['a']).state.insulted).toBe(true)
    expect(simulateRoute(p, []).state.insulted).toBe(false) // restart
    const edited = { ...p, flags: p.flags.map((f) => (f.id === 'insulted' ? { ...f, defaultValue: true } : f)) }
    expect(simulateRoute(edited, []).state.insulted).toBe(true)
    const removed = { ...p, logicNodes: p.logicNodes.filter((n) => n.id !== 'set1'), transitions: p.transitions.filter((t) => t.id !== 'a' && t.id !== 'b') }
    const r = simulateRoute(removed, [...via, 'yes'])
    expect(r.invalidated).toBe(3)
    expect(r.validChoices).toEqual([])
  })
  it('does not mutate the project', () => {
    const p = stateProject()
    const copy = structuredClone(p)
    simulateRoute(p, [...via, 'yes'])
    expect(p).toEqual(copy)
  })
})

describe('structured IF conditions', () => {
  it('evaluates against the current state and marks the matching output valid, the other an override', () => {
    const r = simulateRoute(stateProject(), via)
    expect(r.pending).toMatchObject({ kind: 'branch', evaluated: true }) // SET made insulted TRUE
    expect(r.options.map((o) => [o.port, o.logic])).toEqual([['true', 'valid'], ['false', 'override']])
  })
  it('uses defaults when no Set Flag ran before', () => {
    const p = stateProject()
    p.transitions = p.transitions.map((t) => (t.id === 'a' ? { ...t, target: 'if1' } : t))
    const r = simulateRoute(p, ['a'])
    expect(r.pending).toMatchObject({ evaluated: false })
    expect(r.options.map((o) => [o.port, o.logic])).toEqual([['true', 'override'], ['false', 'valid']])
  })
  it('a logically valid choice is not an assumption; an override is, and is counted', () => {
    const ok = simulateRoute(stateProject(), [...via, 'yes'])
    expect(ok.steps[1].via!.branches[0]).toMatchObject({ port: 'true', logic: 'valid', evaluated: true })
    expect(ok.steps[1].via!.condition).toBe('')
    expect(ok.stats.overrides).toBe(0)
    const over = simulateRoute(stateProject(), [...via, 'no'])
    expect(over.steps[1].sceneId).toBe('good') // never silently changed
    expect(over.steps[1].via!.branches[0]).toMatchObject({ port: 'false', logic: 'override', evaluated: true })
    expect(over.steps[1].via!.condition).toContain('free text') // the override rests on an assumption
    expect(over.stats.overrides).toBe(1)
  })
  it('legacy free-text conditions are never evaluated: manual options, no evaluation', () => {
    const p = stateProject(undefined)
    p.logicNodes = p.logicNodes.map((n) => (n.id === 'if1' ? { ...n, expression: undefined, condition: 'insulted is TRUE' } : n))
    const r = simulateRoute(p, via)
    expect(r.pending).toMatchObject({ evaluated: null })
    expect(r.options.map((o) => o.logic)).toEqual(['manual', 'manual'])
    const t = simulateRoute(p, [...via, 'yes'])
    expect(t.steps[1].via!.branches[0]).toMatchObject({ logic: 'manual', evaluated: null })
    expect(t.steps[1].via!.condition).toBe('insulted is TRUE')
    expect(t.stats.overrides).toBe(0)
  })
  it('AND / OR / NOT conditions follow the flag state', () => {
    const expr: Expr = { op: 'and', args: [check('insulted'), { op: 'not', arg: check('ritual') }] }
    expect(simulateRoute(stateProject(expr), via).pending!.evaluated).toBe(false) // ritual defaults TRUE
    const or: Expr = { op: 'or', args: [check('insulted'), check('ritual', false)] }
    expect(simulateRoute(stateProject(or), via).pending!.evaluated).toBe(true)
  })
  it('a deleted flag reference evaluates as FALSE without crashing', () => {
    expect(simulateRoute(stateProject(check('ghost')), via).pending!.evaluated).toBe(false)
  })
  it('nested IFs: each structured IF is evaluated at its own moment', () => {
    const p = stateProject()
    p.logicNodes.push(branch('if2', { expression: check('ritual') }))
    p.transitions = p.transitions.map((t) => (t.id === 'no' ? { ...t, target: 'if2' } : t))
    p.transitions.push(link('r_yes', 'if2', 'good', { sourcePort: 'true', duration: 0 }), link('r_no', 'if2', 'bad', { sourcePort: 'false', duration: 0 }))
    const r = simulateRoute(p, [...via, 'no'])
    expect(r.pending).toMatchObject({ nodeId: 'if2', evaluated: true })
    const done = simulateRoute(p, [...via, 'no', 'r_yes'])
    expect(done.steps.at(-1)!.via!.branches.map((b) => [b.nodeId, b.logic])).toEqual([['if1', 'override'], ['if2', 'valid']])
  })
})

describe('loops, repeat visits and limits with state', () => {
  function loopProject(): Project {
    const p: Project = {
      ...emptyProject(),
      startSceneId: 'room',
      scenes: [scene('room', 'reality', { loop: { enabled: true, maxIterations: 2, exitCondition: '' } }), scene('out', 'ending')],
      flags: [flag('seen', 'Seen')],
      logicNodes: [setNode('s', 'seen', true), branch('i', { expression: check('seen') })],
      transitions: [
        link('go', 'room', 's'),
        link('s_i', 's', 'i', { duration: 0 }),
        link('again', 'i', 'room', { sourcePort: 'false', duration: 0 }),
        link('leave', 'i', 'out', { sourcePort: 'true', duration: 0 }),
      ],
    }
    return p
  }
  it('flag state persists across repeat visits and the loop limit still applies', () => {
    const p = loopProject()
    const route = ['go', 's_i', 'again', 'go', 's_i', 'again', 'go', 's_i', 'again'] // forced what-if loop
    const r = simulateRoute(p, route)
    expect(r.steps.filter((s) => s.sceneId === 'room')).toHaveLength(3) // 1 + maxIterations (2)
    expect(r.validChoices).toEqual(route.slice(0, 8)) // the 3rd return is blocked by the loop limit
    expect(r.state.seen).toBe(true)
    expect(r.stats.overrides).toBe(2) // 'again' contradicts "seen is TRUE" each time
    const blocked = simulateRoute(p, route.slice(0, 8))
    expect(blocked.options.find((o) => o.transitionId === 'again')?.blocked).toBe('loopLimit')
  })
  it('the step cap bounds an unlimited loop through Set Flag nodes', () => {
    const p = loopProject()
    p.scenes = p.scenes.map((s) => (s.id === 'room' ? { ...s, loop: { enabled: false, maxIterations: 0, exitCondition: '' } } : s))
    const route = Array.from({ length: 30 }, (_, i) => ['go', 's_i', 'again'][i % 3])
    const r = simulateRoute(p, route, { stepCap: 10 })
    expect(r.validChoices).toHaveLength(10)
    expect(r.status).toBe('stepLimit')
  })
})

describe('comparison and pacing with flags', () => {
  const a = [...via, 'yes', 'bad_end']
  const b = [...via, 'no', 'good_end']
  it('compares valid and override routes and reports the overrides', () => {
    const c = compareRoutes(stateProject(), a, b)
    expect(c.a.overrides).toBe(0)
    expect(c.b.overrides).toBe(1)
    expect(c.divergence).toMatchObject({ kind: 'diverges', sharedSteps: 1 })
  })
  it('event timing and pacing ignore flag nodes entirely', () => {
    const p = stateProject()
    p.scenes = p.scenes.map((s) => (s.id === 'bad' ? { ...s, triggers: [{ ...newTrigger(5), id: 'tb', intensity: 9 }] } : s))
    const withFlags = simulateRoute(p, a)
    const plain = structuredClone(p)
    plain.flags = []
    plain.logicNodes = plain.logicNodes.map((n) => (n.type === 'setFlag' ? { ...n, flagId: null } : n))
    const without = simulateRoute(plain, a)
    expect(withFlags.events.map((e) => [e.triggerId, e.absoluteTime])).toEqual(without.events.map((e) => [e.triggerId, e.absoluteTime]))
    expect(analyzePacing(withFlags).overview).toEqual(analyzePacing(without).overview)
  })
})
