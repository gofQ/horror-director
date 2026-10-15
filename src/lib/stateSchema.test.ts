import { describe, expect, it } from 'vitest'
import { parseProject, serializeProject } from './io'
import { SCHEMA_VERSION, type Project } from './schema'
import { sampleProject } from './sample'
import { formatDiagnostics } from './diagnostics'
import { branchProject } from '../test/branchProject'
import { check, stateProject } from '../test/stateProject'

type Raw = { schemaVersion: number; project: Record<string, unknown> & { scenes: Record<string, unknown>[]; transitions: Record<string, unknown>[]; logicNodes?: Record<string, unknown>[]; flags?: Record<string, unknown>[] } }
const exportOf = (p: Project) => JSON.parse(serializeProject(p)) as Raw
const errorsOf = (e: unknown) => {
  const r = parseProject(JSON.stringify(e))
  if (r.ok) throw new Error('expected rejection')
  return formatDiagnostics('en', r.errors).join('\n')
}
const full = (): Project => {
  const p = stateProject({ op: 'or', args: [check('insulted'), { op: 'not', arg: check('ritual', false) }] })
  return p
}

describe('schema 6 export and round trip', () => {
  it('writes schemaVersion 6 and round-trips flags, Set Flag nodes and structured conditions exactly', () => {
    expect(SCHEMA_VERSION).toBe(9)
    const p = full()
    const text = serializeProject(p)
    expect(exportOf(p).schemaVersion).toBe(9)
    const r = parseProject(text)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.project).toEqual(p)
    expect(JSON.parse(serializeProject(r.project)).project).toEqual(JSON.parse(text).project)
    const e = exportOf(r.project)
    expect(e.project.flags).toEqual([
      { id: 'insulted', name: 'VillagerWasInsulted', description: '', defaultValue: false },
      { id: 'ritual', name: 'RitualCompleted', description: '', defaultValue: true },
    ])
    expect(e.project.logicNodes!.find((n) => n.id === 'set1')).toMatchObject({ type: 'setFlag', flagId: 'insulted', value: true })
    expect(e.project.transitions.find((t) => t.id === 'b')).not.toHaveProperty('sourcePort')
    expect(e.project.logicNodes!.find((n) => n.id === 'if1')).toHaveProperty('expression')
  })
})

describe('older files import into v6 without changes', () => {
  it.each([1, 2, 3, 4, 5])('schema %i: flags are empty and everything else is preserved', (v) => {
    const base = v === 5 ? branchProject() : sampleProject()
    const e = exportOf(base)
    e.schemaVersion = v
    delete e.project.flags
    if (v < 5) {
      delete e.project.logicNodes
      delete e.project.comments
      delete e.project.sceneTypes
    }
    if (v < 4) for (const s of e.project.scenes) delete s.audioCues
    if (v < 3) for (const t of e.project.transitions) delete t.direction
    if (v < 2) for (const s of e.project.scenes) delete s.shots
    const r = parseProject(JSON.stringify(e))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.schemaVersion).toBe(v)
    expect(r.project.flags).toEqual([])
    expect(r.project.transitions.map((t) => [t.id, t.source, t.target, t.sourcePort, t.duration])).toEqual(base.transitions.map((t) => [t.id, t.source, t.target, t.sourcePort, t.duration]))
    expect(r.project.logicNodes).toEqual(base.logicNodes)
    expect(r.project.logicNodes.every((n) => n.expression === undefined && n.flagId === undefined)).toBe(true)
    if (v === 5) expect(r.project).toEqual(base)
    expect(exportOf(r.project).schemaVersion).toBe(9)
  })
  it('a bare legacy project imports with no flags', () => {
    const bare = exportOf(sampleProject()).project
    delete bare.flags
    const r = parseProject(JSON.stringify(bare))
    expect(r.ok && r.project.flags).toEqual([])
  })
  it('the sample project is unchanged apart from the empty flag list', () => {
    const s = sampleProject()
    expect([s.scenes.length, s.transitions.length, s.flags]).toEqual([8, 10, []])
  })
})

describe('malformed v6 data is rejected without repair', () => {
  const mutate = (fn: (e: Raw) => void) => {
    const e = exportOf(full())
    fn(e)
    return e
  }
  it('schema versions newer than 9', () => expect(errorsOf(mutate((e) => (e.schemaVersion = 10)))).toMatch(/schema version 10/))
  it('unknown fields and bad flag data', () => {
    expect(errorsOf(mutate((e) => (e.project.flags![0].type = 'number')))).toMatch(/type/)
    expect(errorsOf(mutate((e) => (e.project.flags![0].defaultValue = 'yes')))).toMatch(/defaultValue/)
    expect(errorsOf(mutate((e) => (e.project.flags![0].name = '')))).toMatch(/name/)
  })
  it('bad expressions: unknown operator, script string, empty group, extra fields', () => {
    const node = (e: Raw) => e.project.logicNodes!.find((n) => n.id === 'if1')!
    expect(errorsOf(mutate((e) => (node(e).expression = { op: 'xor', args: [] })))).toMatch(/expression/)
    expect(errorsOf(mutate((e) => (node(e).expression = 'insulted == true')))).toMatch(/expression/)
    expect(errorsOf(mutate((e) => (node(e).expression = { op: 'and', args: [] })))).toMatch(/expression/)
    expect(errorsOf(mutate((e) => (node(e).expression = { op: 'flag', flagId: 'insulted', is: true, js: '1' })))).toMatch(/js|expression/)
  })
  it('dangling or duplicate references and wrong node fields', () => {
    expect(errorsOf(mutate((e) => (e.project.logicNodes!.find((n) => n.id === 'set1')!.flagId = 'ghost')))).toMatch(/ghost/)
    expect(errorsOf(mutate((e) => (e.project.logicNodes!.find((n) => n.id === 'if1')!.expression = check('ghost'))))).toMatch(/ghost/)
    expect(errorsOf(mutate((e) => e.project.flags!.push({ ...e.project.flags![0] })))).toMatch(/Duplicate flag/)
    expect(errorsOf(mutate((e) => e.project.flags!.push({ ...e.project.flags![0], id: 'dup2', name: 'villagerwasinsulted' })))).toMatch(/share the name/)
    expect(errorsOf(mutate((e) => (e.project.logicNodes!.find((n) => n.id === 'set1')!.expression = check('insulted'))))).toMatch(/do not belong/)
    expect(errorsOf(mutate((e) => (e.project.logicNodes!.find((n) => n.id === 'if1')!.value = true)))).toMatch(/do not belong/)
  })
  it('port on a Set Flag link, two outputs, duplicate node ids and a Set Flag logic loop', () => {
    const tr = (e: Raw, id: string) => e.project.transitions.find((t) => t.id === id)!
    expect(errorsOf(mutate((e) => (tr(e, 'b').sourcePort = 'true')))).toMatch(/output pin/)
    expect(errorsOf(mutate((e) => e.project.transitions.push({ ...tr(e, 'bad_end'), id: 'x2', source: 'set1', target: 'good' })))).toMatch(/more than one outgoing/)
    expect(errorsOf(mutate((e) => (e.project.logicNodes![0].id = 'start')))).toMatch(/Duplicate node id/)
    expect(
      errorsOf(
        mutate((e) => {
          tr(e, 'no').target = 'set1'
        }),
      ),
    ).toMatch(/never reaches a scene/)
  })
  it('a transition design on a Set Flag link', () => {
    const tr = (e: Raw, id: string) => e.project.transitions.find((t) => t.id === id)!
    expect(errorsOf(mutate((e) => (tr(e, 'a').direction = { technique: 'none', notes: '', sourceShotId: null, targetShotId: null })))).toMatch(/transition design/)
  })
})
