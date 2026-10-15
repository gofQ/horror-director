import { describe, expect, it } from 'vitest'
import { exportFileName, parseProject, serializeProject } from './io'
import { sampleProject } from './sample'
import { validateProject, findDroppedKeys } from './validate'
import type { Project } from './schema'

const clone = (): Project => structuredClone(sampleProject())
const parse = (p: unknown) => parseProject(JSON.stringify(p))
const errorsOf = (p: unknown) => {
  const r = parse(p)
  if (r.ok) throw new Error('expected rejection')
  return r.errors.join('\n')
}

describe('import validation', () => {
  it('accepts the sample and a full round-trip with no warnings', () => {
    const r = parseProject(serializeProject(clone()))
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.project).toEqual(sampleProject())
      expect(r.warnings).toEqual([])
    }
  })

  it('rejects duplicate scene ids', () => {
    const p = clone()
    p.scenes[1].id = p.scenes[0].id
    expect(errorsOf(p)).toMatch(/Duplicate scene id/)
  })
  it('rejects duplicate transition, character, state and trigger ids', () => {
    const p = clone()
    p.transitions[1].id = p.transitions[0].id
    p.characters[1].id = p.characters[0].id
    p.characters[0].states[1].id = p.characters[0].states[0].id
    p.scenes[0].triggers[1].id = p.scenes[0].triggers[0].id
    const e = errorsOf(p)
    for (const re of [/transition id/, /character id/, /state id/, /trigger id/]) expect(e).toMatch(re)
  })
  it('rejects dangling transitions', () => {
    const p = clone()
    p.transitions[0].target = 'ghost'
    expect(errorsOf(p)).toMatch(/missing target scene "ghost"/)
    const q = clone()
    q.transitions[0].source = 'ghost'
    expect(errorsOf(q)).toMatch(/missing source scene/)
  })
  it('rejects a dangling start scene', () => {
    const p = clone()
    p.startSceneId = 'ghost'
    expect(errorsOf(p)).toMatch(/startSceneId/)
  })
  it('rejects dangling character/state references', () => {
    const p = clone()
    p.scenes[0].characterStates = { nobody: 'x', chr_player: 'bad_state' }
    const e = errorsOf(p)
    expect(e).toMatch(/missing character "nobody"/)
    expect(e).toMatch(/missing state "bad_state"/)
  })
  it('never silently drops unknown fields', () => {
    const p = clone() as unknown as Record<string, unknown>
    ;(p.scenes as Record<string, unknown>[])[0].customUnrealTag = 'keep-me'
    p.studioNotes = 'important'
    const e = errorsOf(p)
    expect(e).toMatch(/Unrecognised field/)
    expect(e).toMatch(/scenes\[0\]\.customUnrealTag/)
    expect(e).toMatch(/studioNotes/)
  })
  it('rejects newer schema versions and foreign formats with clear messages', () => {
    const wrapped = JSON.parse(serializeProject(clone()))
    expect(errorsOf({ ...wrapped, schemaVersion: 2 })).toMatch(/schema version 2/)
    expect(errorsOf({ ...wrapped, format: 'other' })).toMatch(/Unrecognised file format/)
  })
  it('rejects malformed input without throwing', () => {
    for (const text of ['', 'nope', '[]', 'null', '42', '{}', '{"scenes":"x","name":"n"}']) {
      expect(parseProject(text).ok).toBe(false)
    }
  })
  it('reports schema errors with their path', () => {
    const p = clone()
    p.scenes[0].triggers[0].intensity = 99
    expect(errorsOf(p)).toMatch(/scenes\.0\.triggers\.0\.intensity/)
  })
  it('reports warnings but still allows import', () => {
    const p = clone()
    p.scenes[0].triggers[0].time = 9999
    p.startSceneId = null
    const r = parse(p)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.warnings.join()).toMatch(/after its/)
  })
  it('accepts the derived block written by exports', () => {
    const wrapped = JSON.parse(serializeProject(clone()))
    expect(wrapped.derived).toBeDefined()
    expect(parse(wrapped).ok).toBe(true)
  })
  it('caps very long error lists', () => {
    const p = clone()
    p.transitions = Array.from({ length: 200 }, (_, i) => ({ ...p.transitions[0], id: `x${i}`, target: 'ghost' }))
    const r = parse(p)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.length).toBeLessThanOrEqual(51)
  })
})

describe('data preservation', () => {
  it('preserves unicode text, long text and ids through export/import', () => {
    const p = clone()
    p.name = 'Kâbus 悪夢 🕯️'
    p.scenes[0].description = 'satır1\nsatır2 "quoted" \\ backslash '.repeat(50)
    const r = parseProject(serializeProject(p))
    expect(r.ok && r.project).toEqual(p)
  })
  it('validateProject agrees the sample is clean', () => {
    expect(validateProject(sampleProject())).toEqual({ errors: [], warnings: [] })
  })
  it('findDroppedKeys walks arrays and objects', () => {
    expect(findDroppedKeys({ a: [{ x: 1, y: 2 }] }, { a: [{ x: 1 }] })).toEqual(['a[0].y'])
    expect(findDroppedKeys({ a: 1 }, { a: 1, extra: 2 })).toEqual([])
  })
  it('builds safe file names', () => {
    expect(exportFileName({ ...clone(), name: '  ../x y?  ' })).toBe('x_y.horror.json')
    expect(exportFileName({ ...clone(), name: '???' })).toBe('project.horror.json')
  })
})
