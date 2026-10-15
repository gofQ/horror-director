import { describe, expect, it } from 'vitest'
import { parseProject, serializeProject } from './io'
import { DIRECTION_TECHNIQUES, SCHEMA_VERSION, type Project } from './schema'
import { sampleProject } from './sample'
import { newShot } from './factory'
import { formatDiagnostics } from './diagnostics'
import { shotReferences } from './shots'

const clone = (): Project => structuredClone(sampleProject())
const text = (p: unknown) => JSON.stringify(p)
const reject = (p: unknown) => {
  const r = parseProject(text(p))
  if (r.ok) throw new Error('expected rejection')
  return formatDiagnostics('en', r.errors).join('\n')
}
type RawExport = { schemaVersion: number; project: { scenes: Record<string, unknown>[]; transitions: Record<string, unknown>[] } }
const exportOf = (p: Project) => JSON.parse(serializeProject(p)) as RawExport
const transition = (e: RawExport, id: string) => e.project.transitions.find((t) => t.id === id)!
const direction = (e: RawExport, id: string) => transition(e, id).direction as Record<string, unknown>

/** Sample plus a shot on the self-looping scene, linked as both source and destination of "Wrong door". */
const withSelfLoop = (): Project => {
  const p = clone()
  const loop = p.scenes.find((s) => s.id === 's_loop')!
  loop.shots.push({ ...newShot(2), id: 'loop_shot', title: 'Déjà vu ✦', framing: 'pov', movement: 'handheld', technique: 'impossible-space' })
  const e6 = p.transitions.find((t) => t.id === 'e6')!
  e6.direction = {
    technique: 'reality-reveal',
    playerBelief: 'Another door.',
    reality: 'The same door.\nAgain.',
    visualContinuity: 'Exact match',
    audioContinuity: 'Hum',
    reveal: 'Scratches repeat',
    unrealNotes: 'Reuse the level',
    sourceShotId: 'loop_shot',
    targetShotId: 'loop_shot',
  }
  return p
}

describe('schema 3 export and round trip', () => {
  it('writes schemaVersion 3 and keeps directions (links, nulls, unicode, self-loop) exactly', () => {
    expect(SCHEMA_VERSION).toBe(5)
    const p = withSelfLoop()
    const first = serializeProject(p)
    const r = parseProject(first)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.project).toEqual(p)
    expect(r.schemaVersion).toBe(5)
    expect(r.warnings.map((w) => w.code)).not.toContain('diag.migratedV1')
    const strip = (s: string) => s.replace(/"exportedAt": "[^"]+"/, '')
    expect(strip(serializeProject(r.project))).toBe(strip(first))
    expect(direction(exportOf(p), 'e1').sourceShotId).toBe('sh2')
    expect(direction(exportOf(p), 'e1').targetShotId).toBeNull()
  })

  it('transitions without a direction export without a direction key and stay valid', () => {
    const e = exportOf(clone())
    expect('direction' in transition(e, 'e2')).toBe(false)
    expect('direction' in transition(e, 'e1')).toBe(true)
    expect(parseProject(text(e)).ok).toBe(true)
  })

  it('an empty direction object is valid and gets its defaults', () => {
    const e = exportOf(clone())
    transition(e, 'e2').direction = {}
    const r = parseProject(text(e))
    expect(r.ok && r.project.transitions.find((t) => t.id === 'e2')!.direction).toEqual({
      technique: 'none', playerBelief: '', reality: '', visualContinuity: '', audioContinuity: '', reveal: '', unrealNotes: '', sourceShotId: null, targetShotId: null,
    })
  })

  it('supports every direction technique including the reality reveal', () => {
    for (const technique of DIRECTION_TECHNIQUES) {
      const e = exportOf(clone())
      direction(e, 'e1').technique = technique
      expect(parseProject(text(e)).ok, technique).toBe(true)
    }
    expect(DIRECTION_TECHNIQUES).toContain('reality-reveal')
  })
})

describe('v1 and v2 files import into v3', () => {
  const v2File = (p: Project) => {
    const e = exportOf(p)
    e.schemaVersion = 2
    for (const t of e.project.transitions) delete t.direction
    return e
  }
  it('imports a schema-2 export (shots, no directions), exports schema 3 with every field intact', () => {
    const p = clone()
    const r = parseProject(text(v2File(p)))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.schemaVersion).toBe(2)
    expect(r.warnings.map((w) => w.code)).not.toContain('diag.migratedV1')
    expect(r.project.scenes).toEqual(p.scenes) // shots preserved
    expect(r.project.transitions.every((t) => t.direction === undefined)).toBe(true)
    const out = exportOf(r.project)
    expect(out.schemaVersion).toBe(5)
    expect(out.project.transitions.every((t) => !('direction' in t))).toBe(true)
    expect(out.project.scenes).toEqual(exportOf(p).project.scenes)
  })

  it('imports a schema-1 export and a bare legacy project with notice, then exports schema 3', () => {
    const e = v2File(clone())
    e.schemaVersion = 1
    for (const s of e.project.scenes) delete s.shots
    for (const input of [e, e.project]) {
      const r = parseProject(text(input))
      expect(r.ok).toBe(true)
      if (!r.ok) continue
      expect(r.warnings.map((w) => w.code)).toContain('diag.migratedV1')
      expect(r.project.scenes.every((s) => s.shots.length === 0)).toBe(true)
      expect(r.project.transitions.every((t) => t.direction === undefined)).toBe(true)
      const out = exportOf(r.project)
      expect(out.schemaVersion).toBe(5)
      expect(out.project.transitions.map((t) => t.id)).toEqual(e.project.transitions.map((t) => t.id))
      expect(out.project.scenes.map((s) => s.id)).toEqual(e.project.scenes.map((s) => s.id))
    }
  })
})

describe('malformed v3 data is rejected without repair', () => {
  it('dangling source and destination links', () => {
    const e = exportOf(clone())
    direction(e, 'e1').sourceShotId = 'ghost'
    direction(e, 'e1').targetShotId = 'ghost2'
    const msg = reject(e)
    expect(msg).toMatch(/source shot "ghost" does not exist/)
    expect(msg).toMatch(/destination shot "ghost2" does not exist/)
  })

  it('links to a shot of the wrong scene (source and destination roles)', () => {
    const e = exportOf(clone())
    // sh2 belongs to s_hall: valid as the source of e1 (s_hall → s_living) but not as its destination shot or as e2's source
    direction(e, 'e1').targetShotId = 'sh2'
    expect(reject(e)).toMatch(/destination shot "sh2" belongs to a different scene/)
    const e2 = exportOf(clone())
    transition(e2, 'e2').direction = { sourceShotId: 'sh2' }
    expect(reject(e2)).toMatch(/source shot "sh2" belongs to a different scene/)
  })

  it('self-loop links must belong to the looping scene', () => {
    const p = withSelfLoop()
    const e = exportOf(p)
    direction(e, 'e6').targetShotId = 'sh1'
    expect(reject(e)).toMatch(/destination shot "sh1" belongs to a different scene/)
  })

  it('invalid technique, wrong types, null direction and unknown fields', () => {
    const edit = (fn: (d: Record<string, unknown>, t: Record<string, unknown>) => void) => {
      const e = exportOf(clone())
      fn(direction(e, 'e1'), transition(e, 'e1'))
      return e
    }
    expect(reject(edit((d) => (d.technique = 'jump-cut')))).toMatch(/technique/)
    expect(reject(edit((d) => (d.playerBelief = 5)))).toMatch(/playerBelief/)
    expect(reject(edit((d) => (d.sourceShotId = 7)))).toMatch(/sourceShotId/)
    expect(reject(edit((d) => (d.sourceShotId = '')))).toMatch(/sourceShotId/)
    expect(reject(edit((_d, t) => (t.direction = null)))).toMatch(/direction/)
    expect(reject(edit((_d, t) => (t.direction = 'text')))).toMatch(/direction/)
    expect(reject(edit((d) => (d.lens = '35mm')))).toMatch(/lens/)
  })

  it('schema versions newer than 5', () => {
    const e = exportOf(clone())
    e.schemaVersion = 6
    expect(reject(e)).toMatch(/schema version 6/)
  })
})

describe('shotReferences', () => {
  it('finds source and destination links, including both roles on a self-loop', () => {
    const p = withSelfLoop()
    expect(shotReferences(p, 's_hall', 'sh2')).toEqual([{ transitionId: 'e1', role: 'source' }])
    expect(shotReferences(p, 's_hall', 'sh1')).toEqual([])
    expect(shotReferences(p, 's_loop', 'loop_shot')).toEqual([
      { transitionId: 'e6', role: 'source' },
      { transitionId: 'e6', role: 'target' },
    ])
    expect(shotReferences(p, 's_living', 'sh2')).toEqual([]) // the same id in another scene is not a reference
  })
})
