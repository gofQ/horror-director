import { describe, expect, it } from 'vitest'
import { analyzeAudioCues, assignLanes, nextCueStart } from './audio'
import { newAudioCue } from './factory'
import type { AudioCue } from './schema'

const cue = (id: string, start: number, duration: number, extra: Partial<AudioCue> = {}): AudioCue => ({ ...newAudioCue(start), id, duration, ...extra })

describe('analyzeAudioCues', () => {
  it('flags only cues that end after the scene (touching the end is fine)', () => {
    const a = analyzeAudioCues({ duration: 10, audioCues: [cue('a', 5, 5), cue('b', 5, 5.01), cue('c', 0, 1)] })
    expect(a.byId.a.exceeds).toBe(false)
    expect(a.byId.b.exceeds).toBe(true)
    expect(a.exceeding).toBe(1)
  })
  it('flags fades longer than the cue (equal is fine) and ignores overlaps entirely', () => {
    const a = analyzeAudioCues({ duration: 100, audioCues: [cue('a', 0, 4, { fadeIn: 2, fadeOut: 2 }), cue('b', 1, 4, { fadeIn: 3, fadeOut: 1.5 }), cue('c', 2, 4)] })
    expect(a.byId.a.fadeTooLong).toBe(false)
    expect(a.byId.b.fadeTooLong).toBe(true)
    expect(a.fadeTooLong).toBe(1)
    expect(a.exceeding).toBe(0)
  })
})

describe('assignLanes', () => {
  it('stacks overlapping cues in separate lanes and reuses free lanes, never reordering', () => {
    const cues = [cue('a', 0, 10), cue('b', 2, 3), cue('c', 4, 3), cue('d', 5, 1), cue('e', 10, 2)]
    const { lanes, count } = assignLanes(cues)
    expect(lanes).toEqual({ a: 0, b: 1, c: 2, d: 1, e: 0 })
    expect(count).toBe(3)
    expect(cues.map((c) => c.id)).toEqual(['a', 'b', 'c', 'd', 'e'])
  })
  it('handles an empty list and treats a silence cue like any other layer', () => {
    expect(assignLanes([])).toEqual({ lanes: {}, count: 0 })
    expect(assignLanes([cue('a', 0, 5), cue('s', 1, 2, { type: 'silence' })]).lanes.s).toBe(1)
  })
})

describe('nextCueStart', () => {
  it('starts after the latest-ending cue', () => {
    expect(nextCueStart([])).toBe(0)
    expect(nextCueStart([cue('a', 0, 9), cue('b', 2, 3)])).toBe(9)
  })
})
