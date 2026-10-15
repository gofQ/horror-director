import { describe, expect, it } from 'vitest'
import { parseProject, serializeProject } from './io'
import { SCHEMA_VERSION, TYPE_COLORS, type Project } from './schema'
import { sampleProject } from './sample'
import { newComment, newSceneType } from './factory'
import { formatDiagnostics } from './diagnostics'
import { branch, branchProject, link } from '../test/branchProject'

type Raw = { schemaVersion: number; project: Record<string, unknown> & { scenes: Record<string, unknown>[]; transitions: Record<string, unknown>[]; logicNodes?: Record<string, unknown>[]; comments?: Record<string, unknown>[]; sceneTypes?: Record<string, unknown>[] } }
const exportOf = (p: Project) => JSON.parse(serializeProject(p)) as Raw
const errorsOf = (e: unknown) => {
  const r = parseProject(JSON.stringify(e))
  if (r.ok) throw new Error('expected rejection')
  return formatDiagnostics('en', r.errors).join('\n')
}
const full = (): Project => {
  const p = branchProject()
  const ty = { ...newSceneType('dream'), id: 'ty1', name: 'False Awakening', icon: 'Moon' as const, color: TYPE_COLORS[1], description: 'You wake up. Or do you?', duration: 45 }
  p.sceneTypes = [ty]
  p.scenes = p.scenes.map((s) => (s.id === 'collapse' ? { ...s, typeId: 'ty1' } : s))
  p.comments = [{ ...newComment({ x: 10, y: 20 }), id: 'note1', title: 'Act 1', text: 'Village\nsquare ✦', color: TYPE_COLORS[3], width: 400, height: 220 }]
  return p
}

describe('schema 5 export and round trip', () => {
  it('writes schemaVersion 5 and round-trips branches, comments, scene types and ports exactly', () => {
    expect(SCHEMA_VERSION).toBe(8)
    const p = full()
    const text = serializeProject(p)
    expect(exportOf(p).schemaVersion).toBe(8)
    const r = parseProject(text)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.project).toEqual(p)
    expect(JSON.parse(serializeProject(r.project)).project).toEqual(JSON.parse(text).project)
    const e = exportOf(r.project)
    expect(e.project.transitions.find((t) => t.id === 'yes')).toMatchObject({ source: 'if1', sourcePort: 'true' })
    expect(e.project.transitions.find((t) => t.id === 'c_end')).not.toHaveProperty('sourcePort')
  })
})

describe('older files import into v5 without changes', () => {
  const old = (version: number) => {
    const e = exportOf(sampleProject())
    e.schemaVersion = version
    delete e.project.logicNodes
    delete e.project.comments
    delete e.project.sceneTypes
    if (version < 4) for (const s of e.project.scenes) delete s.audioCues
    if (version < 3) for (const t of e.project.transitions) delete t.direction
    if (version < 2) for (const s of e.project.scenes) delete s.shots
    return e
  }
  it.each([1, 2, 3, 4])('schema %i: new collections become empty; topology, shots, directions and cues are preserved', (v) => {
    const base = sampleProject()
    const r = parseProject(JSON.stringify(old(v)))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.schemaVersion).toBe(v)
    expect(r.project.logicNodes).toEqual([])
    expect(r.project.comments).toEqual([])
    expect(r.project.sceneTypes).toEqual([])
    expect(r.project.scenes.every((s) => s.typeId === undefined)).toBe(true)
    expect(r.project.transitions.every((t) => t.sourcePort === undefined)).toBe(true)
    expect(r.project.transitions.map((t) => [t.id, t.source, t.target, t.label, t.style, t.condition, t.duration])).toEqual(
      base.transitions.map((t) => [t.id, t.source, t.target, t.label, t.style, t.condition, t.duration]),
    )
    if (v >= 3) expect(r.project.transitions.map((t) => t.direction)).toEqual(base.transitions.map((t) => t.direction))
    if (v >= 2) expect(r.project.scenes.map((s) => s.shots)).toEqual(base.scenes.map((s) => s.shots))
    if (v >= 4) expect(r.project.scenes.map((s) => s.audioCues)).toEqual(base.scenes.map((s) => s.audioCues))
    expect(exportOf(r.project).schemaVersion).toBe(8)
    expect(r.warnings.some((w) => w.code === 'diag.migratedV1')).toBe(v === 1)
  })
  it('a bare legacy project imports with empty collections', () => {
    const bare = old(4).project
    const r = parseProject(JSON.stringify(bare))
    expect(r.ok && r.project.logicNodes).toEqual([])
  })
  it('the sample project still has its original topology and no logic data', () => {
    const s = sampleProject()
    expect(s.scenes).toHaveLength(8)
    expect(s.transitions).toHaveLength(10)
    expect([s.logicNodes, s.comments, s.sceneTypes]).toEqual([[], [], []])
  })
})

describe('malformed v5 data is rejected without repair', () => {
  const mutate = (fn: (e: Raw) => void) => {
    const e = exportOf(full())
    fn(e)
    return e
  }
  const tr = (e: Raw, id: string) => e.project.transitions.find((t) => t.id === id)!
  it('schema versions newer than 8', () => expect(errorsOf(mutate((e) => (e.schemaVersion = 9)))).toMatch(/schema version 9/))
  it('unknown fields on nodes, comments, types and links', () => {
    expect(errorsOf(mutate((e) => (e.project.logicNodes![0].script = 'x = 1')))).toMatch(/script/)
    expect(errorsOf(mutate((e) => (e.project.comments![0].shape = 'box')))).toMatch(/shape/)
    expect(errorsOf(mutate((e) => (e.project.sceneTypes![0].extra = 1)))).toMatch(/extra/)
    expect(errorsOf(mutate((e) => (tr(e, 'yes').targetPort = 'in')))).toMatch(/targetPort/)
  })
  it('invalid values', () => {
    expect(() => errorsOf(mutate((e) => (e.project.logicNodes![0].type = 'and')))).not.toThrow()
    expect(() => errorsOf(mutate((e) => (tr(e, 'yes').sourcePort = 'maybe')))).not.toThrow()
    expect(() => errorsOf(mutate((e) => (e.project.sceneTypes![0].color = '#123456')))).not.toThrow()
    expect(() => errorsOf(mutate((e) => (e.project.sceneTypes![0].icon = 'Rocket')))).not.toThrow()
    expect(() => errorsOf(mutate((e) => (e.project.sceneTypes![0].baseKind = 'void')))).not.toThrow()
    expect(() => errorsOf(mutate((e) => (e.project.sceneTypes![0].name = '')))).not.toThrow()
    expect(() => errorsOf(mutate((e) => (e.project.comments![0].width = 5)))).not.toThrow()
    expect(() => errorsOf(mutate((e) => (e.project.logicNodes = null as never)))).not.toThrow()
  })
  it('duplicate ids across scenes, IF nodes and comments, and duplicate scene types', () => {
    expect(errorsOf(mutate((e) => (e.project.logicNodes![0].id = 'sq')))).toMatch(/Duplicate node id "sq"/)
    expect(errorsOf(mutate((e) => (e.project.comments![0].id = 'if1')))).toMatch(/Duplicate node id "if1"/)
    expect(errorsOf(mutate((e) => e.project.sceneTypes!.push({ ...e.project.sceneTypes![0] })))).toMatch(/Duplicate scene type id/)
  })
  it('dangling endpoints, comment endpoints and ports', () => {
    expect(errorsOf(mutate((e) => (tr(e, 'into').target = 'ghost')))).toMatch(/ghost/)
    expect(errorsOf(mutate((e) => (tr(e, 'into').target = 'note1')))).toMatch(/comment/)
    expect(errorsOf(mutate((e) => delete tr(e, 'yes').sourcePort))).toMatch(/without a TRUE\/FALSE output/)
    expect(errorsOf(mutate((e) => (tr(e, 'c_end').sourcePort = 'true')))).toMatch(/does not start at an IF or Random Branch node/)
  })
  it('two connections on one output pin, duplicate links and self-links', () => {
    expect(errorsOf(mutate((e) => (tr(e, 'no').sourcePort = 'true')))).toMatch(/already connected/)
    expect(errorsOf(mutate((e) => e.project.transitions.push({ ...tr(e, 'into'), id: 'into2' })))).toMatch(/duplicates another connection/)
    expect(errorsOf(mutate((e) => e.project.transitions.push({ ...tr(e, 'yes'), id: 'self', target: 'if1', sourcePort: 'false' })))).toMatch(/to itself/)
  })
  it('logic-only cycles', () => {
    const p = full()
    p.logicNodes = [...p.logicNodes, branch('if2')]
    p.transitions = [...p.transitions.filter((t) => t.id !== 'yes'), link('a', 'if1', 'if2', { sourcePort: 'true' }), link('b', 'if2', 'if1', { sourcePort: 'true' })]
    const r = parseProject(serializeProject(p))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(formatDiagnostics('en', r.errors).join('\n')).toMatch(/cycle that never reaches a scene/)
  })
  it('transition designs on connections touching an IF node', () => {
    const e = mutate((x) => (tr(x, 'into').direction = { technique: 'none', playerBelief: '', reality: '', visualContinuity: '', audioContinuity: '', reveal: '', unrealNotes: '', sourceShotId: null, targetShotId: null }))
    expect(errorsOf(e)).toMatch(/cannot carry a transition design/)
  })
  it('scene type references: missing type and mismatching base kind', () => {
    expect(errorsOf(mutate((e) => (e.project.scenes.find((s) => s.id === 'talk')!.typeId = 'nope')))).toMatch(/scene type "nope"/)
    expect(errorsOf(mutate((e) => (e.project.scenes.find((s) => s.id === 'collapse')!.kind = 'nightmare')))).toMatch(/different base kind/)
  })
  it('IF nodes without condition or with open outputs only warn', () => {
    const p = full()
    p.logicNodes = [...p.logicNodes, branch('lonely', { condition: '' })]
    const r = parseProject(serializeProject(p))
    expect(r.ok).toBe(true)
    if (r.ok) {
      const text = formatDiagnostics('en', r.warnings).join('\n')
      expect(text).toMatch(/no condition text/)
      expect(text).toMatch(/TRUE output of IF node "lonely" is not connected/)
      expect(text).toMatch(/no incoming connection/)
    }
  })
})
