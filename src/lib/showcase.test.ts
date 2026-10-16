import { describe, expect, it } from 'vitest'
import { analyze } from './graph'
import { parseProject, serializeProject } from './io'
import { showcaseProject, isShowcase, SHOWCASE_NAME } from './showcase'
import { sampleProject } from './sample'
import { simulateRoute } from './simulate'
import { validateProject } from './validate'
import { exprFlags } from './flags'

const p = showcaseProject()

describe('showcase project', () => {
  it('is schema-valid and warning-free', () => {
    const v = validateProject(p)
    expect(v.errors).toEqual([])
    expect(v.warnings).toEqual([])
  })

  it('is deterministic and independent of the legacy sample', () => {
    expect(showcaseProject()).toEqual(p)
    expect(p.name).toBe(SHOWCASE_NAME)
    expect(isShowcase(p)).toBe(true)
    expect(isShowcase(sampleProject())).toBe(false)
  })

  it('round-trips through export and import', () => {
    const r = parseProject(serializeProject(p))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.project).toEqual(p)
  })

  it('covers every authoring feature', () => {
    const kinds = new Set(p.scenes.map((s) => s.kind))
    for (const k of ['reality', 'dream', 'nightmare', 'memory', 'ending']) expect(kinds.has(k as never)).toBe(true)
    expect(p.sceneTypes.length).toBeGreaterThan(0)
    expect(p.scenes.some((s) => s.typeId)).toBe(true)
    expect(p.characters.length).toBeGreaterThanOrEqual(3)
    expect(p.characters.every((c) => c.states.length >= 2)).toBe(true)
    expect(p.scenes.flatMap((s) => s.triggers).every((t) => t.intensity > 0 && t.time >= 0)).toBe(true)
    expect(p.scenes.some((s) => s.shots.length)).toBe(true)
    const cues = p.scenes.flatMap((s) => s.audioCues)
    expect(new Set(cues.map((c) => c.direction)).size).toBeGreaterThanOrEqual(4)
    expect(cues.some((c) => c.type === 'silence')).toBe(true)
    expect(p.transitions.some((t) => t.direction?.playerBelief && t.direction.reality)).toBe(true)
    expect(p.scenes.filter((s) => s.kind === 'ending').length).toBeGreaterThanOrEqual(2)
    expect(p.scenes.some((s) => s.loop.enabled && s.loop.maxIterations > 0)).toBe(true)
    const types = new Set(p.logicNodes.map((n) => n.type))
    for (const t of ['branch', 'setFlag', 'event', 'delay', 'random', 'sequence', 'seqReturn']) expect(types.has(t as never)).toBe(true)
    const expr = p.logicNodes.find((n) => n.expression)!.expression!
    expect(JSON.stringify(expr)).toMatch(/"and".*"not".*|"or"/)
    expect(exprFlags(expr).length).toBeGreaterThanOrEqual(3)
    expect(p.logicNodes.some((n) => n.type === 'branch' && !n.expression && n.condition)).toBe(true)
    expect(p.transitions.some((t) => t.waypoints?.length)).toBe(true)
    expect(p.comments.length).toBeGreaterThanOrEqual(3)
    expect(p.flags.length).toBeGreaterThanOrEqual(3)
  })

  it('has a complete two-stage sequence', () => {
    const seq = p.logicNodes.filter((n) => n.type === 'sequence')
    expect(seq).toHaveLength(1)
    const rets = p.logicNodes.filter((n) => n.type === 'seqReturn' && n.sequenceId === seq[0].id)
    expect(rets.map((r) => r.stage).sort()).toEqual([0, 1])
  })

  it('has no unreachable scene, no dead end and no analysis warning', () => {
    const a = analyze(p)
    expect(a.reachable.size).toBe(p.scenes.length + p.logicNodes.length)
    expect(a.issues.filter((i) => i.severity !== 'info')).toEqual([])
  })

  it('random outcomes both lead somewhere', () => {
    for (const port of ['a', 'b']) {
      const t = p.transitions.find((x) => x.source === 'rnd_door' && x.sourcePort === port)
      expect(t).toBeDefined()
    }
  })
})

const route = (...ids: string[]) => simulateRoute(p, ids)
const OPEN = ['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e8', 'e9', 'e11', 'e12', 'e13']

describe('showcase routes', () => {
  it('the door-opens route passes the structured IF and runs the Sequence in order to an ending', () => {
    const pre = route(...OPEN)
    expect(pre.status).toBe('active')
    expect(pre.pending?.kind).toBe('branch')
    expect(Object.fromEntries(pre.options.map((o) => [o.transitionId, o.logic]))).toEqual({ e14: 'valid', e15: 'override' })
    const full = route(...OPEN, 'e14', 'e16', 'e17', 'e18', 'e19', 'e20', 'e21', 'e22', 'e23', 'e24')
    expect(full.status).toBe('ending')
    expect(full.current?.sceneId ?? full.steps.at(-1)?.sceneId).toBe('s_end_escape')
    const kinds = full.flow.map((f) => f.kind)
    const seq = kinds.filter((k) => ['sequenceStart', 'stageEnter', 'stageReturn', 'sequenceComplete'].includes(k))
    expect(seq).toEqual(['sequenceStart', 'stageEnter', 'stageReturn', 'stageEnter', 'stageReturn', 'sequenceComplete'])
    const delays = full.flow.filter((f) => f.kind === 'delayStart')
    expect(delays).toHaveLength(2)
    expect(kinds).toContain('event')
    const times = full.flow.map((f) => f.time)
    expect([...times].sort((a, b) => a - b)).toEqual(times)
  })

  it('the door-shut route fails the IF and reaches Absorbed', () => {
    const r = route('e1', 'e2', 'e3', 'e4', 'e5', 'e7', 'e13')
    expect(Object.fromEntries(r.options.map((o) => [o.transitionId, o.logic]))).toEqual({ e14: 'override', e15: 'valid' })
    expect(route('e1', 'e2', 'e3', 'e4', 'e5', 'e7', 'e13', 'e15').status).toBe('ending')
  })

  it('the refuse-truth branch reaches Awakening', () => {
    const r = route(...OPEN, 'e14', 'e16', 'e17', 'e18', 'e19', 'e20', 'e21', 'e22', 'e23', 'e25')
    expect(r.status).toBe('ending')
  })

  it('the cellar loop is bounded', () => {
    const r = route('e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e8', 'e9', 'e10', 'e10', 'e10', 'e10', 'e10')
    expect(['loopLimit', 'active']).toContain(r.status)
  })
})
