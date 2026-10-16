import { describe, expect, it } from 'vitest'
import { analyze } from './graph'
import { parseProject, serializeProject } from './io'
import { showcaseProject, showcaseVariant, isShowcase, SHOWCASE_NAME, SHOWCASE_NAME_TR, SHOWCASE_TEXT } from './showcase'
import { sampleProject } from './sample'
import { simulateRoute } from './simulate'
import { validateProject } from './validate'
import { buildPlan } from './production/plan'
import { assessPlan } from './production/readiness'
import { buildBrief } from './production/brief'
import { asPT, renderMarkdown, renderTaskCsv } from './production/render'
import { makeT } from '../i18n'
import type { Project } from './schema'

const en = showcaseProject('en')
const tr = showcaseProject('tr')

/** Leaf keys whose strings are technical (ids, enums, ports, paths, colours, structured data): identical in every variant. */
const TECHNICAL = new Set([
  'id', 'source', 'target', 'sourcePort', 'startSceneId', 'kind', 'typeId', 'type', 'unrealLevel', 'color', 'icon', 'baseKind', 'role', 'style',
  'direction', 'origin', 'framing', 'movement', 'technique', 'eventCategory', 'flagId', 'op', 'sceneId', 'characterId', 'stateId', 'sequenceId',
  'asset', 'sourceShotId', 'targetShotId', 'is', 'prompt',
])
type Leaf = { path: string; key: string; value: string }
const isTech = (l: Leaf) => TECHNICAL.has(l.key) || l.path.includes('.characterStates.') // values are state ids
const PROPER_NAMES = new Set(['Elena', 'Mara'])

function leaves(v: unknown, path = '', key = ''): Leaf[] {
  if (typeof v === 'string') return [{ path, key, value: v }]
  if (Array.isArray(v)) return v.flatMap((x, i) => leaves(x, `${path}[${i}]`, key))
  if (v && typeof v === 'object') return Object.entries(v).flatMap(([k, x]) => leaves(x, `${path}.${k}`, k))
  return []
}
const jsonOf = (p: Project) => JSON.parse(JSON.stringify(p)) as Project

describe('both showcase variants', () => {
  for (const [name, p] of [['English', en], ['Turkish', tr]] as const) {
    it(`${name}: zero validation errors and warnings, no analysis warnings, full round-trip`, () => {
      const v = validateProject(p)
      expect(v.errors).toEqual([])
      expect(v.warnings).toEqual([])
      const a = analyze(p)
      expect(a.reachable.size).toBe(p.scenes.length + p.logicNodes.length)
      expect(a.issues.filter((i) => i.severity !== 'info')).toEqual([])
      const r = parseProject(serializeProject(p))
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.project).toEqual(p)
      expect(JSON.parse(serializeProject(p)).schemaVersion).toBe(9)
    })
  }

  it('are deterministic fresh objects; English keeps its established name', () => {
    expect(showcaseProject('tr')).toEqual(tr)
    expect(showcaseProject()).toEqual(en)
    expect(showcaseProject('en')).not.toBe(showcaseProject('en'))
    expect(en.name).toBe(SHOWCASE_NAME)
    expect(tr.name).toBe(SHOWCASE_NAME_TR)
    expect(tr.name).toBe('Boş Köy (Vitrin Örneği)')
  })

  it('share every id, position, port, timing, flag, expression and path: only authored text differs', () => {
    const a = leaves(en)
    const b = leaves(tr)
    expect(b.map((l) => l.path)).toEqual(a.map((l) => l.path)) // identical shape and ordering
    for (let i = 0; i < a.length; i++) {
      if (isTech(a[i])) expect(b[i].value, a[i].path).toBe(a[i].value)
    }
    // blank every translatable string: what is left (numbers, booleans, structure) must be deep-equal
    const blank = (p: Project) =>
      JSON.parse(JSON.stringify(p), (k, v) => (typeof v === 'string' && !TECHNICAL.has(k) ? '' : v)) as Project
    expect(blank(tr)).toEqual(blank(en))
    expect(tr.transitions.map((t) => [t.id, t.source, t.target, t.sourcePort, t.waypoints])).toEqual(en.transitions.map((t) => [t.id, t.source, t.target, t.sourcePort, t.waypoints]))
    expect(tr.logicNodes.map((n) => [n.id, n.type, n.probabilityA, n.seconds, n.expression, n.flagId, n.sequenceId, n.stage])).toEqual(en.logicNodes.map((n) => [n.id, n.type, n.probabilityA, n.seconds, n.expression, n.flagId, n.sequenceId, n.stage]))
    expect(tr.scenes.map((s) => s.unrealLevel)).toEqual(en.scenes.map((s) => s.unrealLevel))
    expect(tr.flags.map((f) => [f.id, f.defaultValue])).toEqual(en.flags.map((f) => [f.id, f.defaultValue]))
  })

  it('Turkish translates every authored string and contains no English narrative text', () => {
    const a = leaves(en)
    const b = leaves(tr)
    const same: string[] = []
    for (let i = 0; i < a.length; i++) {
      if (isTech(a[i])) continue
      if (a[i].value === '') {
        expect(b[i].value, b[i].path).toBe('')
        continue
      }
      if (b[i].value === a[i].value && !PROPER_NAMES.has(a[i].value)) same.push(`${a[i].path}: ${a[i].value}`)
    }
    expect(same).toEqual([])
    const english = /\b(the|and|of|with|to|that|not|are|into|from|your|you|she)\b/i
    const offenders = b.filter((l) => !isTech(l) && english.test(l.value)).map((l) => `${l.path}: ${l.value}`)
    expect(offenders).toEqual([])
    // non-empty everywhere the English has text, and the Turkish alphabet is really used
    expect(JSON.stringify(tr)).toMatch(/[ğüşıöçĞÜŞİÖÇ]/)
    const t = SHOWCASE_TEXT.tr
    expect(Object.keys(t.scenes)).toEqual(Object.keys(SHOWCASE_TEXT.en.scenes))
    expect(Object.keys(t.links)).toEqual(Object.keys(SHOWCASE_TEXT.en.links))
  })

  it('translated flag names are consistent with the texts that mention them', () => {
    const names = tr.flags.map((f) => f.name)
    const gate = tr.comments.find((c) => c.id === 'note_gate')!.text
    const ifx = tr.logicNodes.find((n) => n.id === 'if_expr')!.description
    for (const n of ['anahtarıBuldu', 'gerçeklikParçalandı', 'çocuğaGüvendi']) {
      expect(names).toContain(n)
      expect(gate).toContain(n)
      expect(ifx).toContain(n)
    }
  })
})

const OPEN = ['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e8', 'e9', 'e11', 'e12', 'e13']
const ROUTES: Record<string, string[]> = {
  escape: [...OPEN, 'e14', 'e16', 'e17', 'e18', 'e19', 'e20', 'e21', 'e22', 'e23', 'e24'],
  awakening: [...OPEN, 'e14', 'e16', 'e17', 'e18', 'e19', 'e20', 'e21', 'e22', 'e23', 'e25'],
  absorbed: ['e1', 'e2', 'e3', 'e4', 'e5', 'e7', 'e13', 'e15'],
  ifGate: ['e1', 'e2', 'e3', 'e4', 'e5', 'e7', 'e13'],
  loop: ['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e8', 'e9', 'e10', 'e10', 'e10', 'e10', 'e10'],
  partial: ['e1', 'e2', 'e3'],
}
const trace = (p: Project, choices: string[]) => {
  const r = simulateRoute(p, choices)
  return {
    status: r.status,
    scenes: r.steps.map((s) => [s.sceneId, s.visit, s.start, s.end, s.flags]),
    flow: r.flow.map((f) => [f.kind, f.time]),
    options: r.options.map((o) => [o.transitionId, o.logic]),
    pending: r.pending?.kind ?? null,
  }
}

describe('simulation parity', () => {
  for (const [name, choices] of Object.entries(ROUTES)) {
    it(`route "${name}" behaves identically in both languages`, () => {
      expect(trace(tr, choices)).toEqual(trace(en, choices))
    })
  }
  it('reaches every intended ending in both', () => {
    for (const p of [en, tr]) {
      expect(simulateRoute(p, ROUTES.escape).status).toBe('ending')
      expect(simulateRoute(p, ROUTES.awakening).status).toBe('ending')
      expect(simulateRoute(p, ROUTES.absorbed).status).toBe('ending')
      const ends = ['escape', 'awakening', 'absorbed'].map((k) => simulateRoute(p, ROUTES[k]).steps.at(-1)!.sceneId)
      expect(ends).toEqual(['s_end_escape', 's_end_wake', 's_end_absorbed'])
    }
  })
  it('Sequence stages, Delay seconds and structured IF flags match', () => {
    for (const p of [en, tr]) {
      const r = simulateRoute(p, ROUTES.escape)
      const kinds = r.flow.map((f) => f.kind).filter((k) => ['sequenceStart', 'stageEnter', 'stageReturn', 'sequenceComplete'].includes(k))
      expect(kinds).toEqual(['sequenceStart', 'stageEnter', 'stageReturn', 'stageEnter', 'stageReturn', 'sequenceComplete'])
      expect(r.flow.filter((f) => f.kind === 'delayStart')).toHaveLength(2)
      const gate = simulateRoute(p, ROUTES.ifGate)
      expect(Object.fromEntries(gate.options.map((o) => [o.transitionId, o.logic]))).toEqual({ e14: 'override', e15: 'valid' })
    }
  })
})

describe('production plans', () => {
  const planEn = buildPlan(en)
  const planTr = buildPlan(tr)
  it('have identical task ids, order, dependencies and readiness; Turkish subjects', () => {
    const sig = (pl: typeof planEn) => pl.tasks.map((t) => [t.id, t.order, t.wave, t.kind, t.dependsOn, t.sources, t.tbd])
    expect(sig(planTr)).toEqual(sig(planEn))
    for (const e of ['unreal', 'unity'] as const) {
      const a = assessPlan(planEn, e)
      const b = assessPlan(planTr, e)
      expect([...b].map(([id, x]) => [id, x.readiness, x.missing, x.confirm, x.blockedBy])).toEqual([...a].map(([id, x]) => [id, x.readiness, x.missing, x.confirm, x.blockedBy]))
    }
    expect(planTr.tasks.find((t) => t.id === 'T-level-s_cottage')!.subject).toBe('Kulübede Sabah')
  })
  for (const lang of ['en', 'tr'] as const) {
    const t = asPT(makeT(lang))
    it(`render valid Unreal and Unity output (UI ${lang})`, () => {
      for (const [name, plan] of [['en', planEn], ['tr', planTr]] as const) {
        const un = renderMarkdown(plan, 'unreal', t)
        const uy = renderMarkdown(plan, 'unity', t)
        expect(un, name).toContain('/Game/Maps/L_Cottage')
        expect(uy, name).not.toContain('/Game/')
        expect(un + uy + renderTaskCsv(plan, 'unreal', t) + renderTaskCsv(plan, 'unity', t)).not.toMatch(/\{[a-zA-Z]+\}/)
        for (const engine of ['unreal', 'unity'] as const) for (const task of plan.tasks) expect(buildBrief(plan, task.id, engine, t), `${name} ${engine} ${task.id}`).not.toBeNull()
      }
      expect(renderMarkdown(planTr, 'unity', t)).toContain('Kulübede Sabah')
    })
  }
})

describe('variant detection', () => {
  it('tells the variants apart without a persisted language field', () => {
    expect(showcaseVariant(en)).toBe('en')
    expect(showcaseVariant(tr)).toBe('tr')
    expect(showcaseVariant(sampleProject())).toBeNull()
    expect(isShowcase(tr)).toBe(true)
    expect(Object.keys(tr).sort()).toEqual(Object.keys(en).sort())
    // a renamed project keeps its variant while the scene titles are untouched
    expect(showcaseVariant({ ...jsonOf(tr), name: 'Benim köyüm' })).toBe('tr')
    expect(showcaseVariant({ ...jsonOf(en), name: 'My village' })).toBe('en')
  })
})
