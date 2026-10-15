import { describe, expect, it } from 'vitest'
import { parseProject, serializeProject } from './io'
import { AUDIO_CUE_TYPES, AUDIO_DIRECTIONS, AUDIO_ORIGINS, SCHEMA_VERSION, type Project } from './schema'
import { sampleProject } from './sample'
import { newAudioCue } from './factory'
import { formatDiagnostics } from './diagnostics'

const clone = (): Project => structuredClone(sampleProject())
type Raw = { schemaVersion: number; project: { scenes: Record<string, unknown>[]; transitions: Record<string, unknown>[] } }
const exportOf = (p: Project) => JSON.parse(serializeProject(p)) as Raw
const reject = (e: unknown) => {
  const r = parseProject(JSON.stringify(e))
  if (r.ok) throw new Error('expected rejection')
  return formatDiagnostics('en', r.errors).join('\n')
}
const rawCues = (e: Raw, scene = 's_hall') => e.project.scenes.find((s) => s.id === scene)!.audioCues as Record<string, unknown>[]

describe('schema 5 export and round trip', () => {
  it('writes schemaVersion 5 with every cue field and survives import byte-stably', () => {
    expect(SCHEMA_VERSION).toBe(5)
    const p = clone()
    const s = p.scenes.find((x) => x.id === 's_living')!
    s.audioCues.push({ ...newAudioCue(1), id: 'u1', title: 'Düşük “fısıltı” ✦', type: 'whisper', origin: 'ambiguous', direction: 'moving', level: 2.5, fadeIn: 0.5, fadeOut: 1.25, loop: true, asset: '/Game/Audio/Whisper_01', notes: 'left\nto right', prompt: 'a distant voice' })
    const text = serializeProject(p)
    expect(exportOf(p).schemaVersion).toBe(5)
    const r = parseProject(text)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.schemaVersion).toBe(5)
    expect(r.project).toEqual(p)
    expect(JSON.parse(serializeProject(r.project)).project).toEqual(JSON.parse(text).project)
  })

  it('the sample project carries audio cues and keeps shots, directions, triggers and characters', () => {
    const e = exportOf(clone())
    expect(rawCues(e).length).toBeGreaterThan(0)
    expect(e.project.scenes.some((s) => (s.shots as unknown[]).length > 0)).toBe(true)
    expect(e.project.transitions.some((t) => t.direction)).toBe(true)
  })
})

describe('older files import into v4', () => {
  const strip = (e: Raw, version: number) => {
    e.schemaVersion = version
    for (const s of e.project.scenes) delete s.audioCues
    return e
  }
  it.each([1, 2, 3])('schema %i: audioCues become [] and nothing else changes', (v) => {
    const base = clone()
    const e = strip(exportOf(base), v)
    if (v < 3) for (const t of e.project.transitions) delete t.direction
    if (v < 2) for (const s of e.project.scenes) delete s.shots
    const r = parseProject(JSON.stringify(e))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.schemaVersion).toBe(v)
    expect(r.project.scenes.every((s) => s.audioCues.length === 0)).toBe(true)
    expect(r.project.scenes.map((s) => s.triggers)).toEqual(base.scenes.map((s) => s.triggers))
    expect(r.project.characters).toEqual(base.characters)
    if (v >= 2) expect(r.project.scenes.map((s) => s.shots)).toEqual(base.scenes.map((s) => s.shots))
    if (v >= 3) expect(r.project.transitions).toEqual(base.transitions)
    expect(r.warnings.some((w) => w.code === 'diag.migratedV1')).toBe(v === 1)
    expect(exportOf(r.project).schemaVersion).toBe(5)
  })
  it('a bare legacy project imports with empty audio cues', () => {
    const bare = exportOf(clone()).project
    for (const s of bare.scenes) delete s.audioCues
    const r = parseProject(JSON.stringify(bare))
    expect(r.ok && r.project.scenes.every((s) => s.audioCues.length === 0)).toBe(true)
  })
  it('missing optional cue fields get defaults', () => {
    const e = exportOf(clone())
    rawCues(e).splice(0, rawCues(e).length, { id: 'm', title: 'Minimal', start: 0, duration: 1, type: 'music' })
    const r = parseProject(JSON.stringify(e))
    expect(r.ok && r.project.scenes.find((s) => s.id === 's_hall')!.audioCues[0]).toMatchObject({ origin: 'non-diegetic', direction: 'nonspatial', level: 5, fadeIn: 0, fadeOut: 0, loop: false, asset: '', notes: '', prompt: '' })
  })
})

describe('malformed v4 data is rejected without repair', () => {
  const mutate = (fn: (cues: Record<string, unknown>[], e: Raw) => void) => {
    const e = exportOf(clone())
    fn(rawCues(e), e)
    return e
  }
  it('unknown fields', () => expect(reject(mutate((c) => (c[0].volumeDb = -6)))).toMatch(/volumeDb/))
  it('duplicate cue ids within a scene', () => expect(reject(mutate((c) => (c[1].id = c[0].id)))).toMatch(/Duplicate audio cue id/))
  it('the same cue id in different scenes is allowed', () => {
    const e = mutate((c, ex) => {
      const other = ex.project.scenes.find((s) => s.id === 's_living')!
      other.audioCues = [{ ...c[0] }]
    })
    expect(parseProject(JSON.stringify(e)).ok).toBe(true)
  })
  it.each([
    ['type', 'laser'], ['origin', 'maybe'], ['direction', 'sideways'],
    ['start', -1], ['duration', 0], ['duration', -3], ['level', 11], ['level', -1], ['fadeIn', -0.1], ['fadeOut', -2],
    ['loop', 'yes'], ['title', 5], ['asset', null], ['id', ''], ['start', '3'],
  ])('invalid %s = %j', (k, v) => {
    expect(() => reject(mutate((c) => (c[0][k as string] = v)))).not.toThrow()
  })
  it('audioCues must be an array; null is not accepted', () => {
    expect(() => reject(mutate((_c, e) => (e.project.scenes[0].audioCues = null)))).not.toThrow()
    expect(() => reject(mutate((_c, e) => (e.project.scenes[0].audioCues = {})))).not.toThrow()
  })
  it('schema versions newer than 5', () => {
    const e = exportOf(clone())
    e.schemaVersion = 6
    expect(reject(e)).toMatch(/schema version 6/)
  })
})

describe('overlaps, timing and metadata are intentional, not errors', () => {
  it('overlapping layers, silence under sound, fades and loops import without errors or warnings about overlap', () => {
    const p = clone()
    const s = p.scenes.find((x) => x.id === 's_living')!
    s.audioCues = [
      { ...newAudioCue(0), id: 'l1', type: 'ambience', duration: 30, loop: true },
      { ...newAudioCue(5), id: 'l2', type: 'silence', duration: 4 },
      { ...newAudioCue(6), id: 'l3', type: 'whisper', direction: 'behind', duration: 4 },
    ]
    const r = parseProject(serializeProject(p))
    expect(r.ok).toBe(true)
    if (r.ok) expect(formatDiagnostics('en', r.warnings).join('\n')).not.toMatch(/overlap/i)
  })
  it('cues past the scene end and fades longer than the cue warn but still import', () => {
    const p = clone()
    const s = p.scenes.find((x) => x.id === 's_living')!
    s.audioCues = [{ ...newAudioCue(s.duration - 1), id: 'late', duration: 5, fadeIn: 4, fadeOut: 4 }]
    const r = parseProject(serializeProject(p))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const codes = r.warnings.map((w) => w.code)
    expect(codes).toContain('diag.audioLate')
    expect(codes).toContain('diag.audioFade')
    expect(r.project.scenes.find((x) => x.id === 's_living')!.audioCues[0].start).toBe(s.duration - 1)
  })
  it('every enum value round-trips', () => {
    const p = clone()
    const s = p.scenes.find((x) => x.id === 's_living')!
    s.audioCues = AUDIO_CUE_TYPES.flatMap((type, i) =>
      AUDIO_ORIGINS.flatMap((origin, j) => AUDIO_DIRECTIONS.map((direction, k) => ({ ...newAudioCue(0), id: `c${i}_${j}_${k}`, type, origin, direction }))),
    )
    const r = parseProject(serializeProject(p))
    expect(r.ok && r.project.scenes.find((x) => x.id === 's_living')!.audioCues).toEqual(s.audioCues)
  })
  it('does not touch existing scene ambience, shot sound notes or transition audio continuity', () => {
    const p = clone()
    const r = parseProject(serializeProject(p))
    expect(r.ok && r.project.scenes.map((s) => [s.ambience, s.shots.map((x) => x.soundNotes)])).toEqual(p.scenes.map((s) => [s.ambience, s.shots.map((x) => x.soundNotes)]))
    expect(r.ok && r.project.transitions.map((t) => t.direction?.audioContinuity)).toEqual(p.transitions.map((t) => t.direction?.audioContinuity))
  })
})
