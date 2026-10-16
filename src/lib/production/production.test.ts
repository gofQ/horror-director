import { describe, expect, it } from 'vitest'
import { makeT } from '../../i18n'
import { buildPlan, ENGINES, PHASES, type Plan } from './plan'
import { asPT, csvField, csvFileName, planFileName, renderMarkdown, renderTaskCsv } from './render'
import { showcaseProject } from '../showcase'
import { sampleProject } from '../sample'
import { emptyProject } from '../factory'
import { memoryBackend } from '../../test/memoryBackend'
import type { Project } from '../schema'

const deepFreeze = <T,>(o: T): T => {
  if (o && typeof o === 'object') {
    Object.freeze(o)
    for (const v of Object.values(o as object)) deepFreeze(v)
  }
  return o
}
const show = showcaseProject()
const plan = buildPlan(show)
const tEn = asPT(makeT('en'))
const tTr = asPT(makeT('tr'))

describe('buildPlan', () => {
  it('is deterministic and does not mutate a frozen project', () => {
    const frozen = deepFreeze(structuredClone(show))
    expect(buildPlan(frozen)).toEqual(plan)
    expect(buildPlan(showcaseProject())).toEqual(plan)
  })

  it('stays identical when the input arrays are shuffled', () => {
    const shuffled: Project = { ...show, scenes: [...show.scenes].reverse(), transitions: [...show.transitions].reverse(), logicNodes: [...show.logicNodes].reverse(), flags: [...show.flags].reverse() }
    expect(buildPlan(shuffled)).toEqual(plan)
  })

  it('plans the full graph: every scene, every ending, both Random outputs', () => {
    expect(plan.scenes.map((s) => s.id).sort()).toEqual(show.scenes.map((s) => s.id).sort())
    expect(plan.scenes.filter((s) => s.ending)).toHaveLength(3)
    const rnd = plan.nodes.find((n) => n.type === 'random')!
    expect(rnd.ports.map((p) => p.port)).toEqual(['a', 'b'])
    expect(rnd.probabilityA).toBe(60)
    const levelTasks = plan.tasks.filter((t) => t.kind === 'level')
    expect(levelTasks).toHaveLength(show.scenes.length)
  })

  it('keeps Scene → logic → Scene hops with their pins', () => {
    const hop = plan.links.find((l) => l.from === 's_square' && l.to === 's_child')
    expect(hop?.via.map((v) => v.type)).toEqual(['event', 'setFlag', 'delay', 'random'])
    expect(hop?.via.at(-1)?.port).toBe('b')
    expect(hop?.delaySeconds).toBe(8)
  })

  it('orders Sequence stages Then 0 → Return 0 → Then 1 → Return 1 → Completed', () => {
    const s = plan.sequences[0]
    expect(s.stages.map((x) => [x.stage, x.chain.map((c) => c.id), x.returnId, x.complete])).toEqual([
      [0, ['evt_crack', 'set_broken'], 'ret_0', true],
      [1, ['dly_beat', 'evt_silence'], 'ret_1', true],
    ])
    expect(s.completed?.id).toBe('if_free')
    // stage nodes are planned inside the Sequence task, not as separate tasks
    expect(plan.tasks.some((t) => t.id === 'T-event-evt_crack')).toBe(false)
    expect(plan.tasks.find((t) => t.kind === 'sequence')?.sources.map((x) => x.id)).toContain('ret_1')
  })

  it('distinguishes structured from free-text conditions', () => {
    const structured = plan.nodes.find((n) => n.id === 'if_expr')!
    const free = plan.nodes.find((n) => n.id === 'if_free')!
    expect(structured.expression).not.toBeNull()
    expect(free.expression).toBeNull()
    expect(free.condition).toMatch(/not evaluated/)
    expect(plan.tasks.find((t) => t.id === 'T-branch-if_free')?.tbd).toEqual([])
  })

  it('carries belief versus reality from transition direction notes', () => {
    const l = plan.links.find((x) => x.linkIds.includes('e1'))!
    expect(l.direction?.playerBelief).toMatch(/leaving home/)
    expect(l.direction?.reality).toMatch(/loops/)
  })

  it('has stable task ids and valid, acyclic dependencies', () => {
    const ids = plan.tasks.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const t of plan.tasks) {
      expect(t.id).toMatch(/^T-[A-Za-z]+-/)
      expect(t.sources.length).toBeGreaterThan(0)
      for (const d of t.dependsOn) expect(ids).toContain(d)
      for (const d of t.dependsOn) {
        const dep = plan.tasks.find((x) => x.id === d)!
        expect(dep.phase).toBeLessThanOrEqual(t.phase)
        expect(dep.order).toBeLessThan(t.order)
      }
    }
    const known = new Set(show.scenes.map((s) => s.id).concat(show.logicNodes.map((n) => n.id), show.transitions.map((t) => t.id), show.flags.map((f) => f.id), show.characters.map((c) => c.id), plan.triggers.map((t) => t.id), ['project']))
    for (const t of plan.tasks) for (const s of t.sources) expect(known.has(s.id)).toBe(true)
    // acyclic: depth-first
    const dep = new Map(plan.tasks.map((t) => [t.id, t.dependsOn]))
    const state = new Map<string, number>()
    const visit = (id: string) => {
      expect(state.get(id)).not.toBe(1)
      if (state.get(id) === 2) return
      state.set(id, 1)
      dep.get(id)!.forEach(visit)
      state.set(id, 2)
    }
    ids.forEach(visit)
    expect(PHASES.map((p) => p.n)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('reports unreachable scenes and incomplete authoring instead of omitting them', () => {
    const p = structuredClone(show)
    p.scenes.push({ ...structuredClone(p.scenes[0]), id: 's_orphan', title: 'Orphan', unrealLevel: '', triggers: [], shots: [], audioCues: [] })
    p.logicNodes = p.logicNodes.filter((n) => n.id !== 'ret_1')
    p.transitions = p.transitions.filter((t) => t.target !== 'ret_1')
    const q = buildPlan(p)
    expect(q.gaps.some((g) => g.code === 'unreachable' && g.ids[0] === 's_orphan')).toBe(true)
    expect(q.scenes.some((s) => s.id === 's_orphan')).toBe(true)
    expect(q.tasks.some((t) => t.id === 'T-level-s_orphan' && t.tbd.includes('levelPath') && t.tbd.includes('unreachableScene'))).toBe(true)
    expect(q.sequences[0].stages[1].complete).toBe(false)
    expect(q.tasks.find((t) => t.kind === 'sequence')?.tbd).toContain('stageContent')
    expect(q.issues.length).toBeGreaterThan(0)
  })

  it('handles an empty project without throwing', () => {
    const q = buildPlan({ ...emptyProject(), scenes: [], startSceneId: null })
    expect(q.gaps.map((g) => g.code)).toEqual(expect.arrayContaining(['noStart', 'noEnding']))
    for (const e of ENGINES) expect(renderMarkdown(q, e, tEn)).toContain('## 14.')
  })

  it('works for the legacy sample too', () => {
    const q = buildPlan(sampleProject())
    expect(q.scenes).toHaveLength(8)
    expect(q.tasks.find((t) => t.kind === 'state')).toBeUndefined()
  })
})

describe('rendering', () => {
  const sections = (md: string) => [...md.matchAll(/^## (\d+)\. /gm)].map((m) => Number(m[1]))
  for (const [name, t] of [['en', tEn], ['tr', tTr]] as const) {
    for (const e of ENGINES) {
      it(`${e}/${name}: 14 sections, no unresolved placeholders, TBD markers`, () => {
        const md = renderMarkdown(plan, e, t)
        expect(sections(md)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14])
        expect(md).not.toMatch(/\{[a-z]+\}/i)
        expect(md).toContain('TBD')
        expect(md).toContain(plan.tasks[0].id)
        for (const task of plan.tasks) expect(md).toContain(`### ${task.id}`)
      })
    }
  }

  it('produces separate Unreal and Unity mappings', () => {
    const u = renderMarkdown(plan, 'unreal', tEn)
    const y = renderMarkdown(plan, 'unity', tEn)
    expect(u).toMatch(/GameInstance/)
    expect(u).toMatch(/Level Sequence/)
    expect(u).toMatch(/MetaSound/)
    expect(u).not.toMatch(/ScriptableObject|Cinemachine/)
    expect(y).toMatch(/ScriptableObject/)
    expect(y).toMatch(/Cinemachine/)
    expect(y).toMatch(/AudioMixer/)
    expect(y).not.toMatch(/MetaSound|Blueprint/)
    expect(planFileName('unreal')).toBe('production-plan-unreal.md')
    expect(planFileName('unity')).toBe('production-plan-unity.md')
    expect(csvFileName('unreal')).toBe('production-tasks-unreal.csv')
  })

  it('states semantics: Sequence order, Delay between scenes, Event milestones, Random intent', () => {
    const md = renderMarkdown(plan, 'unreal', tEn)
    expect(md).toMatch(/Then 0 subflow, Return 0, Then 1 subflow, Return 1, then Completed/)
    expect(md).toMatch(/not a timer inside a scene/)
    expect(md).toMatch(/planning milestones/)
    expect(md).toMatch(/not a guaranteed outcome/)
    expect(md).toMatch(/proposals, not existing assets/)
    expect(md).toMatch(/performs no Unreal or Unity runtime integration/)
    expect(md).toMatch(/Player believes/)
    expect(md).not.toMatch(/```/)
  })

  it('exports a parseable RFC 4180 CSV with one row per task', () => {
    const csv = renderTaskCsv(plan, 'unity', tEn)
    const rows = parseCsv(csv)
    expect(rows).toHaveLength(plan.tasks.length + 1)
    expect(rows[0].slice(0, 3)).toEqual(['Task ID', 'Order', 'Phase'])
    expect(new Set(rows.map((r) => r.length)).size).toBe(1)
    expect(rows.slice(1).map((r) => r[0])).toEqual(plan.tasks.map((t) => t.id))
    expect(csv.endsWith('\r\n')).toBe(true)
  })

  it('escapes quotes, commas, newlines and formula prefixes', () => {
    expect(csvField('a,b')).toBe('"a,b"')
    expect(csvField('say "hi"')).toBe('"say ""hi"""')
    expect(csvField('l1\nl2')).toBe('"l1\nl2"')
    expect(csvField('=SUM(A1)')).toBe("'=SUM(A1)")
    expect(csvField(3)).toBe('3')
    const p = structuredClone(show)
    p.scenes[0].title = 'Evil, "title"\n=HYPERLINK("x")'
    const rows = parseCsv(renderTaskCsv(buildPlan(p), 'unreal', tEn))
    expect(rows.find((r) => r[0] === 'T-level-s_cottage')![4]).toContain('Evil, "title"')
    const md = renderMarkdown(buildPlan({ ...p, scenes: p.scenes.map((s, i) => (i ? s : { ...s, title: 'a|b' })) }), 'unity', tEn)
    expect(md).toContain('a\\|b')
  })
})

describe('read-only', () => {
  it('never touches storage', () => {
    const backend = memoryBackend({ k: 'v' })
    const before = JSON.stringify(show)
    renderMarkdown(buildPlan(show), 'unreal', tEn)
    renderTaskCsv(buildPlan(show), 'unity', tTr)
    expect(JSON.stringify(show)).toBe(before)
    expect([...backend.data.entries()]).toEqual([['k', 'v']])
  })
})

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cur = ''
  let q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++ } else if (c === '"') q = false
      else cur += c
    } else if (c === '"') q = true
    else if (c === ',') { row.push(cur); cur = '' }
    else if (c === '\r' && text[i + 1] === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; i++ }
    else cur += c
  }
  return rows
}
export type { Plan }
