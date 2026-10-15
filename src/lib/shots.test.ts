import { describe, expect, it } from 'vitest'
import { analyzeShots, nextStart, sortedByTime } from './shots'
import { newShot } from './factory'
import type { Shot } from './schema'

const sh = (id: string, start: number, duration: number): Shot => ({ ...newShot(), id, title: id, start, duration })
const scene = (shots: Shot[], duration = 60) => ({ shots, duration })

describe('analyzeShots', () => {
  it('reports no warnings for sequential shots, including touching ends', () => {
    const a = analyzeShots(scene([sh('a', 0, 10), sh('b', 10, 10), sh('c', 20, 5)]))
    expect(a.overlapPairs).toBe(0)
    expect(a.exceeding).toBe(0)
    expect(a.outOfOrder).toBe(0)
    expect(a.byId.b.end).toBe(20)
  })

  it('detects overlaps symmetrically and counts pairs', () => {
    const a = analyzeShots(scene([sh('a', 0, 10), sh('b', 9.5, 10), sh('c', 15, 10)]))
    expect(a.byId.a.overlaps).toEqual(['b'])
    expect(a.byId.b.overlaps.sort()).toEqual(['a', 'c'])
    expect(a.byId.c.overlaps).toEqual(['b'])
    expect(a.overlapPairs).toBe(2)
  })

  it('flags shots ending after the scene (ending exactly at the end is fine)', () => {
    const a = analyzeShots(scene([sh('a', 50, 10), sh('b', 55, 10), sh('c', 70, 1)], 60))
    expect(a.byId.a.exceeds).toBe(false)
    expect(a.byId.b.exceeds).toBe(true)
    expect(a.byId.c.exceeds).toBe(true)
    expect(a.exceeding).toBe(2)
  })

  it('flags shots that start before the previous shot in authored order', () => {
    const a = analyzeShots(scene([sh('a', 20, 5), sh('b', 0, 5), sh('c', 0, 5)]))
    expect(a.byId.a.outOfOrder).toBe(false)
    expect(a.byId.b.outOfOrder).toBe(true)
    expect(a.byId.c.outOfOrder).toBe(false) // equal start is not out of order
    expect(a.outOfOrder).toBe(1)
  })

  it('handles an empty list and never mutates its input', () => {
    expect(analyzeShots(scene([]))).toEqual({ byId: {}, overlapPairs: 0, exceeding: 0, outOfOrder: 0 })
    const shots = [sh('a', 5, 1), sh('b', 0, 1)]
    const before = JSON.stringify(shots)
    analyzeShots(scene(shots))
    sortedByTime(shots)
    expect(JSON.stringify(shots)).toBe(before)
  })
})

describe('sortedByTime / nextStart', () => {
  it('sorts by start and keeps authored order for ties (stable), without changing timing', () => {
    const shots = [sh('a', 10, 1), sh('b', 0, 1), sh('c', 10, 2), sh('d', 0, 3)]
    const sorted = sortedByTime(shots)
    expect(sorted.map((s) => s.id)).toEqual(['b', 'd', 'a', 'c'])
    expect(sorted.map((s) => [s.start, s.duration])).toEqual([[0, 1], [0, 3], [10, 1], [10, 2]])
    expect(sorted[0]).toBe(shots[1]) // same objects
  })

  it('starts a new shot after the latest-ending shot', () => {
    expect(nextStart([])).toBe(0)
    expect(nextStart([sh('a', 0, 5), sh('b', 3, 10), sh('c', 1, 1)])).toBe(13)
    expect(nextStart([sh('a', 0, 0.333)])).toBe(0.33)
  })
})
