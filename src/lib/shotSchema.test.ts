import { describe, expect, it } from 'vitest'
import { buildExport, parseProject, serializeProject } from './io'
import { SCHEMA_VERSION, type Project } from './schema'
import { sampleProject } from './sample'
import { newShot } from './factory'
import { formatDiagnostics } from './diagnostics'

const when = new Date('2026-01-01T00:00:00Z')
const clone = (): Project => structuredClone(sampleProject())
const text = (p: unknown) => JSON.stringify(p)
const reject = (p: unknown) => {
  const r = parseProject(text(p))
  if (r.ok) throw new Error('expected rejection')
  return formatDiagnostics('en', r.errors).join('\n')
}
const withShots = (): Project => {
  const p = clone()
  p.scenes[1].shots = [
    { id: 'x1', title: 'Düş ✦ “quote”', start: 1.5, duration: 4.25, framing: 'extreme-close-up', movement: 'handheld', technique: 'false-awakening', soundNotes: 'Satır\nsonu', visualNotes: 'Ünlü' },
    { id: 'x2', title: '', start: 0, duration: 0.1, framing: 'pov', movement: 'tracking', technique: 'impossible-space', soundNotes: '', visualNotes: '' },
  ]
  return p
}
const v1File = (p: Project) => {
  const e = JSON.parse(serializeProject(p)) as { schemaVersion: number; project: { scenes: Record<string, unknown>[] } }
  e.schemaVersion = 1
  for (const s of e.project.scenes) delete s.shots
  for (const t of (e.project as unknown as { transitions: Record<string, unknown>[] }).transitions) delete t.direction
  return e
}

describe('schema 3 export', () => {
  it('writes schemaVersion 3 and the shots of every scene', () => {
    expect(SCHEMA_VERSION).toBe(6)
    const e = buildExport(withShots(), when)
    expect(e.schemaVersion).toBe(6)
    expect(e.project.scenes.every((s) => Array.isArray(s.shots))).toBe(true)
    expect(e.project.scenes[1].shots).toHaveLength(2)
  })

  it('round-trips every shot field, order and unicode exactly (and byte-stably)', () => {
    const p = withShots()
    const first = serializeProject(p)
    const r = parseProject(first)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.project).toEqual(p)
    expect(r.schemaVersion).toBe(6)
    expect(r.warnings.some((w) => w.code === 'diag.migratedV1')).toBe(false)
    const strip = (s: string) => s.replace(/"exportedAt": "[^"]+"/, '')
    expect(strip(serializeProject(r.project))).toBe(strip(first))
  })

  it('new shots validate and export', () => {
    const p = clone()
    p.scenes[0].shots.push(newShot(3))
    const r = parseProject(serializeProject(p))
    expect(r.ok).toBe(true)
  })
})

describe('schema 1 and legacy files', () => {
  it('imports a schema-1 export: shots default to [], older fields untouched, flagged as migrated', () => {
    const original = clone()
    const r = parseProject(text(v1File(sampleProject())))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.project).toEqual({
      ...original,
      scenes: original.scenes.map((s) => ({ ...s, shots: [] })),
      transitions: original.transitions.map(({ direction, ...rest }) => (void direction, rest)),
    })
    expect(r.schemaVersion).toBe(1)
    expect(r.warnings.map((w) => w.code)).toContain('diag.migratedV1')
    expect(r.project.scenes.every((s) => s.shots.length === 0)).toBe(true)
  })

  it('imports a bare legacy project without shots and exports it as schema 3 without losing fields', () => {
    const bare = v1File(sampleProject()).project
    const r = parseProject(text(bare))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.schemaVersion).toBeNull()
    expect(r.warnings.map((w) => w.code)).toContain('diag.migratedV1')
    const out = JSON.parse(serializeProject(r.project)) as { schemaVersion: number; project: { scenes: Record<string, unknown>[] } }
    expect(out.schemaVersion).toBe(6)
    const stripShots = (scenes: Record<string, unknown>[]) => scenes.map(({ shots, ...rest }) => (void shots, rest))
    expect(stripShots(out.project.scenes)).toEqual(stripShots(bare.scenes))
    expect(out.project.scenes.every((s) => Array.isArray(s.shots) && (s.shots as unknown[]).length === 0)).toBe(true)
  })

  it('a schema-1 file that already contains valid shots keeps them (nothing is dropped)', () => {
    const e = JSON.parse(serializeProject(withShots())) as { schemaVersion: number }
    e.schemaVersion = 1
    const r = parseProject(text(e))
    expect(r.ok && r.project.scenes[1].shots.length).toBe(2)
  })
})

describe('malformed schema 2 files are rejected without repair', () => {
  const edit = (fn: (shot: Record<string, unknown>, scene: Record<string, unknown>) => void) => {
    const e = JSON.parse(serializeProject(withShots())) as { project: { scenes: { shots: Record<string, unknown>[] }[] } }
    fn(e.project.scenes[1].shots[0], e.project.scenes[1] as unknown as Record<string, unknown>)
    return e
  }
  it('duplicate shot ids', () => {
    expect(reject(edit((s, scene) => ((scene.shots as Record<string, unknown>[])[1].id = s.id)))).toMatch(/Duplicate shot id "x1"/)
  })
  it('invalid enum values', () => {
    expect(reject(edit((s) => (s.framing = 'dutch-angle')))).toMatch(/framing/)
    expect(reject(edit((s) => (s.movement = 'drone')))).toMatch(/movement/)
    expect(reject(edit((s) => (s.technique = 'jump-cut')))).toMatch(/technique/)
  })
  it('negative start, zero duration, wrong types and missing required fields', () => {
    expect(reject(edit((s) => (s.start = -1)))).toMatch(/start/)
    expect(reject(edit((s) => (s.duration = 0)))).toMatch(/duration/)
    expect(reject(edit((s) => (s.duration = '5')))).toMatch(/duration/)
    expect(reject(edit((s) => delete s.id))).toMatch(/\.id/)
    expect(reject(edit((s) => delete s.framing))).toMatch(/framing/)
  })
  it('unknown fields inside a shot are never silently dropped', () => {
    expect(reject(edit((s) => (s.lens = '35mm')))).toMatch(/lens/)
  })
  it('shots must be an array', () => {
    expect(reject(edit((_s, scene) => (scene.shots = 'nope')))).toMatch(/shots/)
  })
  it('schema versions newer than 6', () => {
    const e = JSON.parse(serializeProject(clone())) as Record<string, unknown>
    e.schemaVersion = 7
    expect(reject(e)).toMatch(/schema version 7/)
  })
  it('overlapping and late shots import with warnings only', () => {
    const p = withShots()
    p.scenes[1].shots[1] = { ...p.scenes[1].shots[1], start: 2, duration: 5000 }
    const r = parseProject(serializeProject(p))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.warnings.map((w) => w.code)).toEqual(expect.arrayContaining(['diag.shotOverlap', 'diag.shotLate']))
  })
})
