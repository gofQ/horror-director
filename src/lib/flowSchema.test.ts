import { describe, expect, it } from 'vitest'
import { parseProject, serializeProject } from './io'
import { SCHEMA_VERSION, type Project } from './schema'
import { validateProject } from './validate'
import { formatDiagnostics } from './diagnostics'
import { sampleProject } from './sample'
import { branchProject } from '../test/branchProject'
import { stateProject } from '../test/stateProject'
import { flowProject } from '../test/flowProject'

type RawNode = Record<string, unknown>
type Raw = { schemaVersion: number; project: { logicNodes: RawNode[]; transitions: Record<string, unknown>[] } & Record<string, unknown> }
const exportOf = (p: Project) => JSON.parse(serializeProject(p)) as Raw
const reject = (e: unknown) => {
  const r = parseProject(JSON.stringify(e))
  if (r.ok) throw new Error('expected rejection')
  return formatDiagnostics('en', r.errors).join('\n')
}
const mutate = (fn: (e: Raw) => void) => {
  const e = exportOf(flowProject())
  fn(e)
  return e
}
const node = (e: Raw, id: string) => e.project.logicNodes.find((n) => n.id === id)!

describe('schema 8 export and round trip', () => {
  it('writes schemaVersion 8 and round-trips Event, Delay and Random nodes exactly', () => {
    expect(SCHEMA_VERSION).toBe(9)
    const p = flowProject()
    const text = serializeProject(p)
    const e = exportOf(p)
    expect(e.schemaVersion).toBe(9)
    expect(node(e, 'D')).toMatchObject({ type: 'delay', seconds: 12 })
    expect(node(e, 'E')).toMatchObject({ type: 'event', eventCategory: 'reveal', description: 'The bell rings once' })
    expect(node(e, 'R')).toMatchObject({ type: 'random', probabilityA: 30, labelA: 'Door opens', labelB: 'Silence' })
    expect(e.project.transitions.find((t) => t.id === 'la')).toMatchObject({ sourcePort: 'a' })
    const r = parseProject(text)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.project).toEqual(p)
    expect(JSON.parse(serializeProject(r.project)).project).toEqual(JSON.parse(text).project)
  })
  it('keeps waypoints on connections of the new nodes', () => {
    const p = flowProject()
    p.transitions = p.transitions.map((t) => (t.id === 'la' ? { ...t, waypoints: [{ x: 10, y: 20 }] } : t))
    const r = parseProject(serializeProject(p))
    expect(r.ok && r.project.transitions.find((t) => t.id === 'la')!.waypoints).toEqual([{ x: 10, y: 20 }])
  })
  it('imports every older version and bare projects unchanged', () => {
    for (const p of [sampleProject(), branchProject(), stateProject()]) {
      for (const v of [1, 2, 3, 4, 5, 6, 7]) {
        const e = exportOf(p)
        e.schemaVersion = v
        const r = parseProject(JSON.stringify(e))
        expect(r.ok).toBe(true)
        if (r.ok) expect(r.project.logicNodes).toEqual(p.logicNodes)
      }
      const bare = parseProject(JSON.stringify(exportOf(p).project))
      expect(bare.ok).toBe(true)
    }
  })
  it('rejects versions newer than 9', () => expect(reject(mutate((e) => (e.schemaVersion = 10)))).toMatch(/schema version 10/))
})

describe('malformed v8 data is rejected without repair', () => {
  it('delay seconds: negative, above the bound, not a number, missing', () => {
    expect(reject(mutate((e) => (node(e, 'D').seconds = -1)))).toBeTruthy()
    expect(reject(mutate((e) => (node(e, 'D').seconds = 3601)))).toBeTruthy()
    expect(reject(mutate((e) => (node(e, 'D').seconds = '5')))).toBeTruthy()
    expect(reject(mutate((e) => delete node(e, 'D').seconds))).toMatch(/required field/)
    const ok = mutate((e) => (node(e, 'D').seconds = 3600))
    expect(parseProject(JSON.stringify(ok)).ok).toBe(true)
  })
  it('random probability and labels', () => {
    expect(reject(mutate((e) => (node(e, 'R').probabilityA = 101)))).toBeTruthy()
    expect(reject(mutate((e) => (node(e, 'R').probabilityA = -0.5)))).toBeTruthy()
    expect(reject(mutate((e) => (node(e, 'R').labelA = 'x'.repeat(41))))).toBeTruthy()
    expect(reject(mutate((e) => delete node(e, 'R').probabilityA))).toMatch(/required field/)
    for (const pa of [0, 100, 33.5]) expect(parseProject(JSON.stringify(mutate((e) => (node(e, 'R').probabilityA = pa)))).ok).toBe(true)
  })
  it('unknown fields and unknown categories are rejected, not dropped', () => {
    expect(reject(mutate((e) => (node(e, 'E').script = 'run()')))).toMatch(/unrecognised/i)
    expect(reject(mutate((e) => (node(e, 'E').eventCategory = 'jumpscare')))).toBeTruthy()
    expect(reject(mutate((e) => (node(e, 'R').type = 'dice')))).toBeTruthy()
  })
  it('fields that belong to another node type', () => {
    expect(reject(mutate((e) => (node(e, 'E').seconds = 5)))).toMatch(/do not belong/)
    expect(reject(mutate((e) => (node(e, 'D').probabilityA = 50)))).toMatch(/do not belong/)
    expect(reject(mutate((e) => (node(e, 'R').flagId = null)))).toMatch(/do not belong/)
  })
  it('ports and cardinality', () => {
    const tr = (e: Raw, id: string) => e.project.transitions.find((t) => t.id === id)!
    expect(reject(mutate((e) => (tr(e, 'la').sourcePort = 'true')))).toMatch(/does not belong/)
    expect(reject(mutate((e) => (tr(e, 'la').sourcePort = 'c')))).toBeTruthy()
    expect(reject(mutate((e) => delete tr(e, 'la').sourcePort))).toMatch(/without an output pin/)
    expect(reject(mutate((e) => (tr(e, 'l2').sourcePort = 'a')))).toMatch(/does not start at an IF, Random Branch or Sequence/)
    expect(reject(mutate((e) => (tr(e, 'lb').sourcePort = 'a')))).toMatch(/already connected/)
    expect(reject(mutate((e) => e.project.transitions.push({ ...tr(e, 'l2'), id: 'extra', target: 'a' })))).toMatch(/more than one outgoing/)
  })
  it('logic-only cycles and dangling references', () => {
    expect(reject(mutate((e) => e.project.transitions.push({ ...e.project.transitions[1], id: 'back', source: 'E', target: 'D' })))).toMatch(/cycle|loop/i)
    expect(reject(mutate((e) => ((e.project.transitions.find((t) => t.id === 'l2') as { target: string }).target = 'ghost')))).toBeTruthy()
  })
  it('a valid flow project has no blocking errors', () => {
    expect(validateProject(flowProject()).errors).toEqual([])
  })
})
