import { describe, expect, it } from 'vitest'
import { simulateRoute } from './simulate'
import { analyzePacing } from './pacing'
import { compareRoutes } from './compare'
import { analyze } from './graph'
import { validateProject } from './validate'
import { FULL, returnNode, seqProject } from '../test/seqProject'
import { link, scene } from '../test/branchProject'
import { delayNode } from '../test/flowProject'
import type { Project } from './schema'

const kinds = (r: ReturnType<typeof simulateRoute>) => r.flow.map((f) => f.kind)

describe('Sequence: ordered execution', () => {
  it('a valid project has no blocking errors and only the intended structure', () => {
    expect(validateProject(seqProject()).errors).toEqual([])
    expect(analyze(seqProject()).issues.filter((i) => i.severity === 'error')).toEqual([])
  })
  it('runs Then 0 completely, then Then 1, and only then offers Completed', () => {
    const p = seqProject()
    let r = simulateRoute(p, ['in'])
    expect(r.pending).toMatchObject({ kind: 'sequence', stage: 0, stages: 2 })
    expect(r.options.map((o) => o.transitionId)).toEqual(['t0']) // Then 1 and Completed are NOT offered
    r = simulateRoute(p, ['in', 't0'])
    expect(r.pending).toMatchObject({ kind: 'event' })
    r = simulateRoute(p, ['in', 't0', 'e0r'])
    // control returned to the Sequence: no transition id was invented, the next stage is offered
    expect(r.validChoices).toEqual(['in', 't0', 'e0r'])
    expect(r.pending).toMatchObject({ kind: 'sequence', stage: 1 })
    expect(r.options.map((o) => o.transitionId)).toEqual(['t1'])
    r = simulateRoute(p, ['in', 't0', 'e0r', 't1', 'd1s', 's1r'])
    expect(r.pending).toMatchObject({ kind: 'sequence', stage: 2 })
    expect(r.options.map((o) => [o.transitionId, o.port])).toEqual([['done', 'completed']])
    r = simulateRoute(p, FULL)
    expect(r.pending).toBeNull()
    expect(r.steps.map((s) => s.sceneId)).toEqual(['start', 'door'])
    expect(r.validChoices).toEqual(FULL)
  })
  it('Then outputs are never alternatives: the second stage cannot be taken first, nor Completed early', () => {
    const p = seqProject()
    for (const early of [['in', 't1'], ['in', 'done'], ['in', 't0', 'e0r', 'done'], ['in', 't0', 'e0r', 't0']]) {
      const r = simulateRoute(p, early)
      expect(r.validChoices).toEqual(early.slice(0, early.length - 1))
      expect(r.invalidated).toBe(1)
      expect(r.steps).toHaveLength(1) // Door was never entered
    }
  })
  it('keeps Event timestamps, one-time Delay accumulation and Set Flag order across the stages', () => {
    const r = simulateRoute(seqProject(), FULL)
    const door = r.steps[1]
    expect(r.flow.map((f) => [f.kind, f.time])).toEqual([
      ['sequenceStart', 61],
      ['stageEnter', 61],
      ['event', 61],
      ['stageReturn', 61],
      ['stageEnter', 61],
      ['delayStart', 61],
      ['delayEnd', 68],
      ['flag', 68],
      ['stageReturn', 68],
      ['sequenceComplete', 68],
    ])
    expect(door.via!.duration).toBe(1 + 7) // link 1 s + the Delay exactly once; Sequence and Returns take no time
    expect(door.via!.delay).toBe(7)
    expect(door.start).toBe(68)
    expect(door.end).toBe(98)
    expect(r.stats.delayTotal).toBe(7)
    expect(r.steps[0].flags.broken).toBe(false)
    expect(door.flags.broken).toBe(true)
    expect(r.changes.map((c) => [c.flagName, c.before, c.after])).toEqual([['RealityBroken', false, true]])
    // trigger local times keep, absolute times shift with the later start
    const e = r.events.find((x) => x.triggerId === 'dr_t')!
    expect([e.localTime, e.absoluteTime]).toEqual([5, 73])
    expect(r.events.find((x) => x.triggerId === 'st_t')!.absoluteTime).toBe(10)
  })
  it('the flow trace names the Sequence start, each stage, each return and the completion in order', () => {
    const r = simulateRoute(seqProject(), FULL)
    expect(kinds(r).filter((k) => k.startsWith('sequence') || k.startsWith('stage'))).toEqual(['sequenceStart', 'stageEnter', 'stageReturn', 'stageEnter', 'stageReturn', 'sequenceComplete'])
    expect(r.flow.filter((f) => f.kind === 'stageEnter' || f.kind === 'stageReturn').map((f) => [f.kind, f.stage])).toEqual([['stageEnter', 0], ['stageReturn', 0], ['stageEnter', 1], ['stageReturn', 1]])
    const times = r.flow.map((f) => f.time)
    expect([...times].sort((a, b) => a - b)).toEqual(times)
  })
  it('creates no scene visit or trigger occurrence and leaves pacing/occurrences untouched', () => {
    const r = simulateRoute(seqProject(), FULL)
    expect(r.steps).toHaveLength(2)
    expect(r.events.map((e) => e.triggerId)).toEqual(['st_t', 'dr_t'])
    const plain = seqProject()
    plain.logicNodes = []
    plain.transitions = [link('in', 'start', 'door', { duration: 8 }), link('door_end', 'door', 'end')]
    const direct = simulateRoute(plain, ['in'])
    expect(r.stats.occurrences).toBe(direct.stats.occurrences)
    expect(r.stats.avgIntensity).toBe(direct.stats.avgIntensity)
    expect(r.steps.map((s) => [s.sceneId, s.start, s.end])).toEqual(direct.steps.map((s) => [s.sceneId, s.start, s.end]))
    expect(analyzePacing(r).overview.perKind).toEqual(analyzePacing(direct).overview.perKind)
  })
})

describe('Sequence: incomplete and invalid graphs are reported, never completed silently', () => {
  it('an unconnected stage output stops the Sequence with a warning (not complete)', () => {
    const p = seqProject()
    p.transitions = p.transitions.filter((t) => t.id !== 't1')
    const r = simulateRoute(p, ['in', 't0', 'e0r'])
    expect(r.status).toBe('deadEnd')
    expect(r.options).toEqual([])
    expect(r.warnings.map((w) => w.code)).toContain('diag.sim.seqStageOpen')
    expect(r.steps).toHaveLength(1)
    const a = validateProject(p)
    expect(a.errors).toEqual([])
    expect(a.warnings.map((w) => w.code)).toContain('diag.seqOpenOutput')
  })
  it('a stage that does not reach its Return is a warning in validation and a dead end in simulation', () => {
    const p = seqProject()
    p.transitions = p.transitions.filter((t) => t.id !== 'e0r')
    const r = simulateRoute(p, ['in', 't0'])
    expect(r.status).toBe('deadEnd')
    expect(r.warnings.map((w) => w.code)).toContain('diag.sim.seqStageOpen')
    expect(validateProject(p).warnings.map((w) => w.code)).toContain('diag.seqStageOpen')
    expect(validateProject(p).errors).toEqual([])
  })
  it('a missing Completed leaves the route at the finished Sequence', () => {
    const p = seqProject()
    p.transitions = p.transitions.filter((t) => t.id !== 'done')
    const r = simulateRoute(p, ['in', 't0', 'e0r', 't1', 'd1s', 's1r'])
    expect(r.status).toBe('deadEnd')
    expect(r.pending).toMatchObject({ kind: 'sequence', stage: 2 })
  })
  it('structurally invalid graphs (wrong owner, wrong stage, scene in a stage) stop the replay instead of being repaired', () => {
    const wrongStage = seqProject()
    wrongStage.logicNodes = wrongStage.logicNodes.map((n) => (n.id === 'R0' ? { ...n, stage: 1 } : n))
    expect(simulateRoute(wrongStage, ['in', 't0', 'e0r']).validChoices).toEqual(['in', 't0'])
    const sceneInStage = seqProject()
    sceneInStage.transitions = sceneInStage.transitions.map((t) => (t.id === 'e0r' ? { ...t, target: 'door' } : t))
    const r = simulateRoute(sceneInStage, ['in', 't0', 'e0r'])
    expect(r.validChoices).toEqual(['in', 't0'])
    expect(r.invalidated).toBe(1)
    expect(r.warnings.map((w) => w.code)).toContain('diag.sim.seqIllegal')
    const outside = seqProject()
    outside.transitions = outside.transitions.map((t) => (t.id === 'in' ? { ...t, target: 'R0' } : t))
    expect(simulateRoute(outside, ['in']).validChoices).toEqual([])
  })
})

describe('Sequence: Back, Restart, edits, limits and repeated visits', () => {
  it('rebuilds the frame from the chosen transition ids after Back and after edits', () => {
    const p = seqProject()
    const back = simulateRoute(p, FULL.slice(0, 4))
    expect(back.pending).toMatchObject({ kind: 'delay' })
    const again = simulateRoute(p, FULL.slice(0, 3))
    expect(again.pending).toMatchObject({ kind: 'sequence', stage: 1 })
    const edited = { ...p, transitions: p.transitions.filter((t) => t.id !== 'e0r') }
    const r = simulateRoute(edited, FULL)
    expect(r.validChoices).toEqual(['in', 't0'])
    expect(r.invalidated).toBe(5)
    expect(simulateRoute(p, FULL)).toEqual(simulateRoute(structuredClone(p), FULL))
  })
  it('the step cap counts the links of the stages', () => {
    const r = simulateRoute(seqProject(), FULL, { stepCap: 4 })
    expect(r.validChoices).toEqual(FULL.slice(0, 4))
    expect(r.status).toBe('stepLimit')
    expect(r.pending).toMatchObject({ kind: 'delay' })
  })
  it('visiting the Sequence again starts a fresh invocation (stages run again)', () => {
    const p = seqProject()
    p.scenes = p.scenes.map((s) => (s.id === 'door' ? { ...s, kind: 'reality' as const, loop: { enabled: true, maxIterations: 3, exitCondition: '' } } : s))
    p.transitions = [...p.transitions, link('back', 'door', 'start')].filter((t) => t.id !== 'door_end')
    const route = [...FULL, 'back', ...FULL]
    const r = simulateRoute(p, route)
    expect(r.validChoices).toEqual(route)
    expect(r.steps.map((s) => s.sceneId)).toEqual(['start', 'door', 'start', 'door'])
    expect(r.flow.filter((f) => f.kind === 'sequenceStart')).toHaveLength(2)
    expect(r.flow.filter((f) => f.kind === 'stageReturn')).toHaveLength(4)
    expect(r.stats.delayTotal).toBe(14) // each invocation counts its Delay once
    const mid = simulateRoute(p, [...FULL, 'back', 'in', 't0', 'e0r'])
    expect(mid.pending).toMatchObject({ kind: 'sequence', stage: 1 }) // the second invocation starts at stage 0 again
  })
  it('a Delay in a stage shifts the later scene and its triggers, nothing else', () => {
    const base = simulateRoute(seqProject(), FULL)
    const noDelay = seqProject()
    noDelay.logicNodes = noDelay.logicNodes.map((n) => (n.id === 'D1' ? { ...n, seconds: 0 } : n))
    const r0 = simulateRoute(noDelay, FULL)
    expect(base.steps[1].start - r0.steps[1].start).toBe(7)
    expect(base.steps[1].duration).toBe(r0.steps[1].duration)
    expect(r0.steps[1].flags.broken).toBe(true)
  })
})

describe('Sequence: comparison', () => {
  it('A/B comparison shows the duration shift and unaffected pacing', () => {
    const p = seqProject()
    const withSeq = compareRoutes(p, FULL, FULL)
    expect(withSeq.a.duration).toBe(98)
    expect(withSeq.a.delayTotal).toBe(7)
    expect(withSeq.identical).toBe(true)
    const partial = compareRoutes(p, FULL, FULL.slice(0, 3))
    expect(partial.b.finished).toBe(false)
    expect(partial.a.duration - partial.b.duration).toBe(38) // 98 − 60
    expect(partial.a.events).toBe(2)
  })
})

describe('Sequence: validation errors on imported/edited data', () => {
  const codes = (p: Project) => validateProject(p).errors.map((e) => e.code)
  it('wrong owner, dangling owner and stage mismatch', () => {
    const dangling = seqProject()
    dangling.logicNodes = dangling.logicNodes.map((n) => (n.id === 'R0' ? { ...n, sequenceId: 'ghost' } : n))
    expect(codes(dangling)).toContain('diag.seqReturnOwner')
    const mismatch = seqProject()
    mismatch.logicNodes = mismatch.logicNodes.map((n) => (n.id === 'R1' ? { ...n, stage: 0 } : n))
    expect(codes(mismatch)).toContain('diag.seqReturnMismatch')
    const other = seqProject()
    other.logicNodes = [...other.logicNodes, { ...other.logicNodes[0], id: 'Q2', title: 'Other' }]
    other.logicNodes = other.logicNodes.map((n) => (n.id === 'R0' ? { ...n, sequenceId: 'Q2' } : n))
    expect(codes(other)).toContain('diag.seqReturnMismatch')
  })
  it('forbidden nodes inside a stage and stage-to-stage shortcuts', () => {
    const scn = seqProject()
    scn.scenes = [...scn.scenes, scene('x', 'reality')]
    scn.transitions = scn.transitions.map((t) => (t.id === 't0' ? { ...t, target: 'x' } : t))
    expect(codes(scn)).toContain('diag.seqStageForbidden')
    const nested = seqProject()
    nested.logicNodes = [...nested.logicNodes, { ...nested.logicNodes[0], id: 'Q2', title: 'Nested' }]
    nested.transitions = nested.transitions.map((t) => (t.id === 't0' ? { ...t, target: 'Q2' } : t))
    expect(codes(nested)).toContain('diag.seqStageForbidden')
    const shortcut = seqProject()
    shortcut.transitions = shortcut.transitions.map((t) => (t.id === 'd1s' ? { ...t, source: 'E0' } : t)).filter((t) => t.id !== 'e0r')
    expect(codes(shortcut).length).toBeGreaterThan(0)
    const cross = seqProject()
    cross.transitions = [...cross.transitions, link('x', 'E0', 'S1')]
    expect(codes(cross)).toEqual(expect.arrayContaining(['diag.seqStageShortcut']))
    const completedIntoStage = seqProject()
    completedIntoStage.transitions = completedIntoStage.transitions.map((t) => (t.id === 'done' ? { ...t, target: 'D1' } : t))
    expect(codes(completedIntoStage)).toContain('diag.seqStageShortcut')
  })
  it('Return used outside its stage, with an output, or with two inputs', () => {
    const out = seqProject()
    out.transitions = [...out.transitions, link('r_out', 'R0', 'door')]
    expect(codes(out)).toContain('diag.seqReturnOutput')
    const outside = seqProject()
    outside.transitions = [...outside.transitions, link('x', 'door', 'R0')]
    expect(codes(outside)).toEqual(expect.arrayContaining(['diag.seqReturnInputs', 'diag.seqReturnOutside']))
    const viaCompleted = seqProject()
    viaCompleted.logicNodes = [...viaCompleted.logicNodes, returnNode('R9', 'Q', 1)]
    viaCompleted.transitions = viaCompleted.transitions.map((t) => (t.id === 'done' ? { ...t, target: 'R9' } : t))
    expect(codes(viaCompleted)).toContain('diag.seqReturnOutside')
  })
  it('unassigned Returns and unconnected outputs are warnings, not errors', () => {
    const p = seqProject()
    p.logicNodes = [...p.logicNodes, returnNode('Rx', null, 0), delayNode('Dx', 1)]
    const v = validateProject(p)
    expect(v.errors).toEqual([])
    expect(v.warnings.map((w) => w.code)).toContain('diag.seqReturnUnowned')
  })
})
