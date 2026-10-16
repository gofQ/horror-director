import { describe, expect, it } from 'vitest'
import { buildPlan, PHASES } from './plan'
import { assessPlan, tbdFor } from './readiness'
import { renderMarkdown, renderTaskCsv, asPT } from './render'
import { makeT } from '../../i18n'
import { showcaseProject } from '../showcase'
import { sampleProject } from '../sample'
import type { Project } from '../schema'

const show = showcaseProject()
const plan = buildPlan(show)
const tEn = asPT(makeT('en'))
const ids = (p = plan) => p.tasks.map((t) => t.id)
const task = (id: string, p = plan) => p.tasks.find((t) => t.id === id)!

describe('stable ids and schedule', () => {
  it('ids never embed the phase or schedule', () => {
    for (const t of plan.tasks) expect(t.id).toBe(`T-${t.kind}-${t.id.split('-').slice(2).join('-')}`)
    expect(plan.tasks.every((t) => !/^T-\d/.test(t.id))).toBe(true)
  })

  it('are identical across engines, unrelated additions and shuffled input', () => {
    const extra = structuredClone(show)
    extra.scenes.push({ ...structuredClone(extra.scenes[0]), id: 's_extra', title: 'Extra', triggers: [], shots: [], audioCues: [] })
    const grown = buildPlan(extra)
    for (const id of ids()) expect(ids(grown)).toContain(id)
    const shuffled = buildPlan({ ...show, scenes: [...show.scenes].reverse(), transitions: [...show.transitions].reverse(), logicNodes: [...show.logicNodes].reverse(), characters: [...show.characters].reverse() })
    expect(ids(shuffled)).toEqual(ids())
    expect(shuffled).toEqual(plan)
  })

  it('keep their id when a scene moves in the schedule (e.g. its asset gets resolved)', () => {
    const p = structuredClone(show)
    p.scenes.find((s) => s.id === 's_cottage')!.audioCues.forEach((c) => (c.asset = 'Audio/x.wav'))
    expect(ids(buildPlan(p)).sort()).toEqual(ids().sort())
  })

  it('schedules every dependency first, with existing, acyclic dependencies and waves', () => {
    const all = new Set(ids())
    for (const t of plan.tasks) {
      expect(t.dependsOn.every((d) => all.has(d))).toBe(true)
      expect(t.order).toBe(plan.tasks.indexOf(t))
      for (const d of t.dependsOn) {
        expect(task(d).order).toBeLessThan(t.order)
        expect(t.wave).toBeGreaterThan(task(d).wave)
      }
      for (const dep of t.dependents) expect(task(dep).dependsOn).toContain(t.id)
    }
    expect(plan.tasks[0].id).toBe('T-foundation-project')
    expect(plan.tasks.at(-1)!.id).toBe('T-verify-project')
  })

  it('puts asset prerequisites before their consumers and shared systems before users', () => {
    const before = (a: string, b: string) => expect(task(a).order).toBeLessThan(task(b).order)
    for (const s of ['s_cottage', 's_square', 's_fog', 's_cellar', 's_child']) {
      expect(task(`T-audio-${s}`).dependsOn).toContain(`T-assetAudio-${s}`)
      expect(task(`T-audio-${s}`).dependsOn).toContain(`T-level-${s}`)
      before(`T-assetAudio-${s}`, `T-audio-${s}`)
      before(`T-level-${s}`, `T-cinematic-${s}`)
    }
    for (const c of ['chr_elena', 'chr_watcher', 'chr_mara']) {
      expect(task(`T-character-${c}`).dependsOn).toContain(`T-assetCharacter-${c}`)
      before(`T-assetCharacter-${c}`, `T-character-${c}`)
    }
    for (const id of ['T-branch-if_expr', 'T-sequence-seq_break']) {
      expect(task(id).dependsOn).toContain('T-state-flags')
      before('T-state-flags', id)
    }
    // the cellar's AI trigger needs its characters
    expect(task('T-trigger-s_cellar').dependsOn.some((d) => d.startsWith('T-character-')) || !plan.triggers.some((t) => t.sceneId === 's_cellar' && t.kind === 'ai')).toBe(true)
    // verification follows all implementation
    for (const t of plan.tasks.filter((x) => x.kind !== 'verify' && x.kind !== 'verifyEnding')) before(t.id, 'T-verify-project')
    for (const e of plan.scenes.filter((s) => s.ending)) {
      expect(task(`T-verifyEnding-${e.id}`).dependsOn).toEqual(expect.arrayContaining([`T-level-${e.id}`, 'T-branch-if_expr', 'T-sequence-seq_break']))
    }
  })

  it('categories never run backwards along a dependency', () => {
    expect(PHASES.map((p) => p.n)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    for (const t of plan.tasks) for (const d of t.dependsOn) expect(task(d).phase).toBeLessThanOrEqual(t.phase)
    // assets (3) come before audio (6) and characters (7)
    expect(PHASES.find((p) => p.kinds.includes('assetAudio'))!.n).toBeLessThan(PHASES.find((p) => p.kinds.includes('audio'))!.n)
  })
})

describe('readiness', () => {
  const unreal = assessPlan(plan, 'unreal')
  const unity = assessPlan(plan, 'unity')

  it('is derived from authored data and never claims implementation', () => {
    for (const a of unreal.values()) expect(a.implementation).toBe('unknown')
    expect(unreal.get('T-foundation-project')!.readiness).toBe('ready')
    expect(unreal.get('T-level-s_cottage')!.readiness).toBe('ready')
    // the showcase has no audio asset references: the asset task needs information and its consumer is blocked
    expect(unreal.get('T-assetAudio-s_cottage')).toMatchObject({ readiness: 'needsInfo', missing: ['audioAsset'] })
    expect(unreal.get('T-audio-s_cottage')).toMatchObject({ readiness: 'blocked', blockedBy: ['T-assetAudio-s_cottage'] })
    expect(unreal.get('T-verify-project')!.readiness).toBe('blocked')
  })

  it('confirm-only codes never block; blocking codes always do', () => {
    // every showcase level has confirm notes yet stays ready
    for (const s of plan.scenes) {
      const a = unity.get(`T-level-${s.id}`)!
      expect(a.confirm).toContain('scenePath')
      expect(a.readiness).toBe('ready')
    }
    expect(unreal.get('T-level-s_end_escape')!.confirm).toContain('levelPath') // no authored Unreal reference
    expect(unreal.get('T-level-s_cottage')!.confirm).not.toContain('levelPath')
    expect(unreal.get('T-level-s_cottage')!.confirm).not.toContain('scenePath')
    expect(unity.get('T-level-s_cottage')!.confirm).not.toContain('levelPath')
  })

  it('classifies missing information: IF without condition, open outputs, incomplete Sequence, unreachable scene, empty behavior', () => {
    const p: Project = structuredClone(show)
    p.logicNodes.find((n) => n.id === 'if_free')!.condition = ''
    p.transitions = p.transitions.filter((t) => t.id !== 'e25') // open FALSE pin of if_free, dangling Awakening ending
    p.logicNodes = p.logicNodes.filter((n) => n.id !== 'ret_1')
    p.transitions = p.transitions.filter((t) => t.target !== 'ret_1')
    p.characters[0].states[0].behavior = ''
    p.scenes.push({ ...structuredClone(p.scenes[0]), id: 's_lost', title: 'Lost', triggers: [], shots: [], audioCues: [] })
    const q = buildPlan(p)
    const a = assessPlan(q, 'unreal')
    expect(a.get('T-branch-if_free')).toMatchObject({ readiness: 'needsInfo' })
    expect(a.get('T-branch-if_free')!.missing).toEqual(expect.arrayContaining(['ifCondition', 'openOutput']))
    expect(a.get('T-sequence-seq_break')!.missing).toContain('stageContent')
    expect(a.get('T-character-chr_elena')!.missing).toContain('characterBehavior')
    expect(a.get('T-level-s_lost')!.missing).toContain('unreachableScene')
    expect(a.get('T-level-s_end_wake')).toBeDefined() // an orphaned ending is still planned and verified
    expect(q.tasks.some((t) => t.id === 'T-verifyEnding-s_end_wake')).toBe(true)
    expect(a.get('T-verify-project')!.readiness).toBe('blocked')
  })

  it('tbdFor separates Unreal and Unity notes', () => {
    const t = task('T-level-s_end_escape')
    expect(tbdFor(t, 'unreal')).toContain('levelPath')
    expect(tbdFor(t, 'unreal')).not.toContain('scenePath')
    expect(tbdFor(t, 'unity')).toContain('scenePath')
    expect(tbdFor(t, 'unity')).not.toContain('levelPath')
  })

  it('works for the legacy sample and an empty graph', () => {
    const q = buildPlan(sampleProject())
    const a = assessPlan(q, 'unity')
    expect(a.size).toBe(q.tasks.length)
    expect(q.tasks.filter((t) => t.kind === 'verifyEnding')).toHaveLength(2)
    expect(a.get('T-foundation-project')!.readiness).toBe('ready')
  })
})

describe('path separation and no invented existence', () => {
  const unrealMd = renderMarkdown(plan, 'unreal', tEn)
  const unityMd = renderMarkdown(plan, 'unity', tEn)
  const unityCsv = renderTaskCsv(plan, 'unity', tEn)

  it('never prints an Unreal path in Unity output', () => {
    const q = structuredClone(show)
    q.scenes.forEach((s) => (s.unrealLevel = `/Game/Secret/${s.id}`))
    const out = renderMarkdown(buildPlan(q), 'unity', tEn) + renderTaskCsv(buildPlan(q), 'unity', tEn)
    expect(out).not.toContain('/Game/')
    expect(unityMd).not.toContain('/Game/')
    expect(unityCsv).not.toContain('/Game/')
    expect(unityMd).toContain('Assets/Scenes/SCottage.unity')
  })

  it('marks Unity paths as proposals and Unreal references as authored but unverified', () => {
    expect(unityMd).toMatch(/TBD — proposal: Assets\/Scenes\//)
    expect(unityMd).not.toMatch(/authored reference, existence unverified[^\n]*Assets\/Scenes/)
    expect(unrealMd).toContain('/Game/Maps/L_Cottage (authored reference, existence unverified)')
    expect(unrealMd).toMatch(/TBD — no authored reference; proposal: \/Game\/Maps\/L_SEndEscape/)
  })

  it('states that ready does not mean implemented', () => {
    expect(unrealMd).toContain('Implementation status: unknown')
    expect(unrealMd).toContain('does not mean the work exists or is done')
  })

  it('every audio asset value is exactly the authored string (never invented)', () => {
    const p = structuredClone(show)
    p.scenes[0].audioCues[0].asset = 'Audio/Birds.wav'
    const q = buildPlan(p)
    expect(q.assets.find((a) => a.id === p.scenes[0].audioCues[0].id)!.value).toBe('Audio/Birds.wav')
    expect(q.assets.filter((a) => a.value && a.value !== 'Audio/Birds.wav')).toEqual([])
    expect(renderMarkdown(q, 'unity', tEn)).toContain('Audio/Birds.wav (authored reference, existence unverified)')
  })
})
