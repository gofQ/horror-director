import { describe, expect, it } from 'vitest'
import { buildSequence } from './sequence'
import { newAudioCue, newShot, newTrigger } from './factory'
import { sampleProject } from './sample'
import type { AudioCue, Scene, Shot, Trigger } from './schema'

const shot = (id: string, start: number, duration = 5, extra: Partial<Shot> = {}): Shot => ({ ...newShot(start), id, title: id, duration, ...extra })
const cue = (id: string, start: number, duration = 5, extra: Partial<AudioCue> = {}): AudioCue => ({ ...newAudioCue(start), id, title: id, duration, ...extra })
const trg = (id: string, time: number, extra: Partial<Trigger> = {}): Trigger => ({ ...newTrigger(time), id, name: id, ...extra })
const scene = (p: Partial<Pick<Scene, 'shots' | 'audioCues' | 'triggers' | 'duration'>> = {}) => ({ shots: [], audioCues: [], triggers: [], duration: 60, ...p })
const keys = (s: ReturnType<typeof buildSequence>) => s.items.map((i) => i.key)

describe('buildSequence ordering', () => {
  it('orders chronologically with stable, kind-prefixed keys', () => {
    const s = buildSequence(scene({ shots: [shot('a', 10)], audioCues: [cue('x', 5)], triggers: [trg('t', 7)] }))
    expect(keys(s)).toEqual(['audio:x', 'trigger:t', 'shot:a'])
  })
  it('breaks equal timestamps by kind (shot, audio, trigger) then authored order', () => {
    const s = buildSequence(
      scene({ shots: [shot('s2', 4), shot('s1', 4)], audioCues: [cue('a2', 4), cue('a1', 4)], triggers: [trg('t2', 4), trg('t1', 4)] }),
    )
    expect(keys(s)).toEqual(['shot:s2', 'shot:s1', 'audio:a2', 'audio:a1', 'trigger:t2', 'trigger:t1'])
  })
  it('is deterministic and keeps the same key for the same item across calls', () => {
    const sc = scene({ shots: [shot('a', 3)], triggers: [trg('t', 3)] })
    expect(keys(buildSequence(sc))).toEqual(keys(buildSequence(sc)))
  })
  it('keeps the original object references and never mutates the input', () => {
    const sh = shot('a', 2)
    const sc = Object.freeze(scene({ shots: Object.freeze([sh]) as unknown as Shot[], audioCues: Object.freeze([cue('c', 1)]) as unknown as AudioCue[], triggers: Object.freeze([trg('t', 1)]) as unknown as Trigger[] }))
    const before = JSON.stringify(sc)
    const s = buildSequence(sc)
    expect(s.items.find((i) => i.key === 'shot:a')!.ref).toBe(sh)
    expect(JSON.stringify(sc)).toBe(before)
  })
  it('does not reorder authored arrays (out-of-order shots keep their order in the input)', () => {
    const sc = scene({ shots: [shot('late', 20), shot('early', 1)] })
    const s = buildSequence(sc)
    expect(keys(s)).toEqual(['shot:early', 'shot:late'])
    expect(sc.shots.map((x) => x.id)).toEqual(['late', 'early'])
  })
})

describe('layers, overlap and lanes', () => {
  it('layers overlapping audio and shots in lanes without any warning', () => {
    const s = buildSequence(
      scene({ shots: [shot('a', 0, 10), shot('b', 5, 10)], audioCues: [cue('x', 0, 30), cue('y', 5, 4, { type: 'silence' }), cue('z', 6, 4, { type: 'whisper' })] }),
    )
    expect(s.items.filter((i) => i.kind === 'shot').map((i) => i.lane)).toEqual([0, 1])
    expect(s.items.filter((i) => i.kind === 'audio').map((i) => i.lane)).toEqual([0, 1, 2])
    expect(s.laneCount).toMatchObject({ shot: 2, audio: 3, trigger: 1 })
    expect(s.warnings).toMatchObject({ shotsBeyond: 0, audioBeyond: 0, triggersBeyond: 0, fadesTooLong: 0 })
  })
  it('marks silence cues but does not treat them as problems', () => {
    const s = buildSequence(scene({ audioCues: [cue('x', 0, 5, { type: 'silence' })] }))
    const item = s.items[0]
    expect(item.kind === 'audio' && item.silence).toBe(true)
    expect(s.warnings.audioBeyond + s.warnings.fadesTooLong).toBe(0)
  })
  it('never turns audio cues into triggers', () => {
    const s = buildSequence(scene({ audioCues: [cue('x', 0), cue('y', 2, 2, { type: 'stinger' })] }))
    expect(s.counts).toEqual({ shot: 0, audio: 2, trigger: 0 })
    expect(s.items.every((i) => i.kind === 'audio')).toBe(true)
  })
})

describe('scene boundary', () => {
  it('extends the range for items past the scene end without clamping them', () => {
    const s = buildSequence(scene({ duration: 30, shots: [shot('a', 28, 10)], audioCues: [cue('x', 35, 10)], triggers: [trg('t', 50)] }))
    expect(s.sceneEnd).toBe(30)
    expect(s.range).toBe(50)
    expect(s.items.find((i) => i.key === 'shot:a')).toMatchObject({ start: 28, end: 38, exceeds: true })
    expect(s.items.find((i) => i.key === 'audio:x')).toMatchObject({ start: 35, end: 45, exceeds: true })
    expect(s.items.find((i) => i.key === 'trigger:t')).toMatchObject({ start: 50, end: 50, exceeds: true })
    expect(s.warnings).toMatchObject({ shotsBeyond: 1, audioBeyond: 1, triggersBeyond: 1 })
  })
  it('items that end exactly at the scene end are inside it; the range is the scene duration', () => {
    const s = buildSequence(scene({ duration: 30, shots: [shot('a', 25, 5)], triggers: [trg('t', 30)] }))
    expect(s.range).toBe(30)
    expect(s.warnings.shotsBeyond + s.warnings.triggersBeyond).toBe(0)
  })
  it('flags fades longer than their cue (equal is fine)', () => {
    const s = buildSequence(scene({ audioCues: [cue('x', 0, 4, { fadeIn: 2, fadeOut: 3 }), cue('y', 0, 4, { fadeIn: 2, fadeOut: 2 })] }))
    expect(s.warnings.fadesTooLong).toBe(1)
    expect(s.items.map((i) => i.kind === 'audio' && i.fadeTooLong)).toEqual([true, false])
  })
})

describe('empty and partial scenes', () => {
  it('an empty scene is empty with a minimal range', () => {
    const s = buildSequence(scene({ duration: 90 }))
    expect(s.items).toEqual([])
    expect(s.range).toBe(90)
    expect(s.warnings).toMatchObject({ empty: true, partial: false })
    expect(s.laneCount).toEqual({ shot: 1, audio: 1, trigger: 1 })
  })
  it('partially planned scenes are reported as partial; fully planned are not', () => {
    expect(buildSequence(scene({ triggers: [trg('t', 1)] })).warnings).toMatchObject({ empty: false, partial: true })
    expect(buildSequence(scene({ shots: [shot('a', 0)], audioCues: [cue('x', 0)] })).warnings.partial).toBe(true)
    expect(buildSequence(scene({ shots: [shot('a', 0)], audioCues: [cue('x', 0)], triggers: [trg('t', 0)] })).warnings).toMatchObject({ empty: false, partial: false })
  })
})

describe('conditional triggers', () => {
  it('marks triggers with a free-text condition as hypothetical (whitespace does not count)', () => {
    const s = buildSequence(scene({ triggers: [trg('a', 1, { condition: 'player looks left' }), trg('b', 2, { condition: '   ' }), trg('c', 3)] }))
    expect(s.items.map((i) => i.kind === 'trigger' && i.hypothetical)).toEqual([true, false, false])
  })
})

describe('sample project', () => {
  it('builds a mixed sequence for the first scene', () => {
    const sc = sampleProject().scenes.find((x) => x.id === 's_hall')!
    const s = buildSequence(sc)
    expect(s.counts).toEqual({ shot: 3, audio: 4, trigger: 2 })
    expect(s.items).toHaveLength(9)
    expect(new Set(keys(s)).size).toBe(9)
  })
})
