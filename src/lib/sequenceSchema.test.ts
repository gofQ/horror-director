import { describe, expect, it } from 'vitest'
import { parseProject, serializeProject } from './io'
import { SCHEMA_VERSION, type Project } from './schema'
import { formatDiagnostics } from './diagnostics'
import { sampleProject } from './sample'
import { branchProject } from '../test/branchProject'
import { stateProject } from '../test/stateProject'
import { flowProject } from '../test/flowProject'
import { seqProject } from '../test/seqProject'

type RawNode = Record<string, unknown>
type Raw = { schemaVersion: number; project: { logicNodes: RawNode[]; transitions: Record<string, unknown>[] } & Record<string, unknown> }
const exportOf = (p: Project) => JSON.parse(serializeProject(p)) as Raw
const reject = (e: unknown) => {
  const r = parseProject(JSON.stringify(e))
  if (r.ok) throw new Error('expected rejection')
  return formatDiagnostics('en', r.errors).join('\n')
}
const mutate = (fn: (e: Raw) => void) => {
  const e = exportOf(seqProject())
  fn(e)
  return e
}
const node = (e: Raw, id: string) => e.project.logicNodes.find((n) => n.id === id)!
const tr = (e: Raw, id: string) => e.project.transitions.find((t) => t.id === id)!

describe('schema 9 export and round trip', () => {
  it('writes schemaVersion 9 and round-trips Sequence and Return nodes with their ports and owners', () => {
    expect(SCHEMA_VERSION).toBe(9)
    const p = seqProject()
    const e = exportOf(p)
    expect(e.schemaVersion).toBe(9)
    expect(node(e, 'Q')).toMatchObject({ type: 'sequence', title: 'Haunting' })
    expect(node(e, 'R1')).toMatchObject({ type: 'seqReturn', sequenceId: 'Q', stage: 1 })
    expect(tr(e, 't0').sourcePort).toBe('then0')
    expect(tr(e, 'done').sourcePort).toBe('completed')
    const r = parseProject(serializeProject(p))
    expect(r.ok && r.project).toEqual(p)
  })
  it('keeps unassigned Returns (null owner) and waypoints', () => {
    const p = seqProject()
    p.logicNodes = p.logicNodes.map((n) => (n.id === 'R0' ? { ...n, sequenceId: null } : n))
    p.transitions = p.transitions.filter((t) => t.id !== 'e0r').map((t) => (t.id === 't0' ? { ...t, waypoints: [{ x: 1, y: 2 }] } : t))
    const r = parseProject(serializeProject(p))
    expect(r.ok && r.project.logicNodes.find((n) => n.id === 'R0')!.sequenceId).toBeNull()
    expect(r.ok && r.project.transitions.find((t) => t.id === 't0')!.waypoints).toEqual([{ x: 1, y: 2 }])
  })
  it('imports every older version and bare projects unchanged', () => {
    for (const p of [sampleProject(), branchProject(), stateProject(), flowProject()]) {
      for (const v of [1, 2, 3, 4, 5, 6, 7, 8]) {
        const e = exportOf(p)
        e.schemaVersion = v
        const r = parseProject(JSON.stringify(e))
        expect(r.ok).toBe(true)
        if (r.ok) expect(r.project).toEqual(p)
      }
      expect(parseProject(JSON.stringify(exportOf(p).project)).ok).toBe(true)
    }
  })
  it('rejects versions newer than 9', () => expect(reject(mutate((e) => (e.schemaVersion = 10)))).toMatch(/schema version 10/))
})

describe('malformed v9 data is rejected without repair', () => {
  it('ownership references and stages', () => {
    expect(reject(mutate((e) => (node(e, 'R0').sequenceId = 'ghost')))).toMatch(/not a Sequence/)
    expect(reject(mutate((e) => (node(e, 'R0').sequenceId = 'E0')))).toMatch(/not a Sequence/)
    expect(reject(mutate((e) => (node(e, 'R0').stage = 2)))).toBeTruthy()
    expect(reject(mutate((e) => (node(e, 'R0').stage = -1)))).toBeTruthy()
    expect(reject(mutate((e) => (node(e, 'R0').stage = 0.5)))).toBeTruthy()
    expect(reject(mutate((e) => (node(e, 'R0').stage = '0')))).toBeTruthy()
    expect(reject(mutate((e) => delete node(e, 'R0').stage))).toMatch(/required field/)
    expect(reject(mutate((e) => (node(e, 'R1').stage = 0)))).toMatch(/different Sequence or stage/)
  })
  it('fields of another node type and unknown fields', () => {
    expect(reject(mutate((e) => (node(e, 'Q').sequenceId = 'Q')))).toMatch(/do not belong/)
    expect(reject(mutate((e) => (node(e, 'Q').stage = 0)))).toMatch(/do not belong/)
    expect(reject(mutate((e) => (node(e, 'E0').sequenceId = 'Q')))).toMatch(/do not belong/)
    expect(reject(mutate((e) => (node(e, 'Q').stages = 3)))).toMatch(/unrecognised/i)
    expect(reject(mutate((e) => (node(e, 'R0').owner = 'Q')))).toMatch(/unrecognised/i)
  })
  it('invalid stage ports and cardinality', () => {
    expect(reject(mutate((e) => (tr(e, 't0').sourcePort = 'then2')))).toBeTruthy()
    expect(reject(mutate((e) => (tr(e, 't0').sourcePort = 'true')))).toMatch(/does not belong/)
    expect(reject(mutate((e) => delete tr(e, 't0').sourcePort))).toMatch(/without an output pin/)
    expect(reject(mutate((e) => (tr(e, 'e0r').sourcePort = 'then0')))).toMatch(/does not start at an IF, Random Branch or Sequence/)
    expect(reject(mutate((e) => (tr(e, 't1').sourcePort = 'then0')))).toMatch(/already connected/)
    expect(reject(mutate((e) => e.project.transitions.push({ ...tr(e, 'in'), id: 'x', source: 'R0', target: 'door' })))).toMatch(/must not have an outgoing/)
  })
  it('stage topology: scene / IF / nested Sequence / shortcut / premature Completed', () => {
    expect(reject(mutate((e) => ((tr(e, 'e0r') as { target: string }).target = 'door')))).toMatch(/not allowed inside a stage/)
    expect(reject(mutate((e) => ((tr(e, 'done') as { target: string }).target = 'D1')))).toMatch(/outside the stage/)
    expect(reject(mutate((e) => e.project.transitions.push({ ...tr(e, 'in'), id: 'x', source: 'E0', target: 'S1' })))).toBeTruthy()
  })
  it('incomplete authoring (open outputs, unclosed stage, unassigned Return) still imports', () => {
    const e = mutate((x) => {
      x.project.transitions = x.project.transitions.filter((t) => t.id !== 't1' && t.id !== 'e0r')
      node(x, 'R0').sequenceId = null
    })
    const r = parseProject(JSON.stringify(e))
    expect(r.ok).toBe(true)
  })
})
