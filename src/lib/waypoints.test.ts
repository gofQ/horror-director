import { describe, expect, it } from 'vitest'
import { insertAt, moveAt, nearestSegmentIndex, removeAt, shift, translate } from './waypoints'
import { edgeGeometry } from './edgePath'
import { WAYPOINT_MAX } from './schema'

const S = { x: 0, y: 0 }
const T = { x: 300, y: 0 }

describe('waypoint helpers', () => {
  it('picks the nearest segment of source → points → target', () => {
    expect(nearestSegmentIndex(S, [], T, { x: 150, y: 10 })).toBe(0)
    const pts = [{ x: 100, y: 100 }, { x: 200, y: 100 }]
    expect(nearestSegmentIndex(S, pts, T, { x: 50, y: 50 })).toBe(0)
    expect(nearestSegmentIndex(S, pts, T, { x: 150, y: 100 })).toBe(1)
    expect(nearestSegmentIndex(S, pts, T, { x: 260, y: 40 })).toBe(2)
  })
  it('is immutable and keeps order', () => {
    const base = [{ x: 1, y: 1 }, { x: 3, y: 3 }]
    const copy = structuredClone(base)
    expect(insertAt(base, 1, { x: 2, y: 2 }).map((p) => p.x)).toEqual([1, 2, 3])
    expect(insertAt(base, 99, { x: 9, y: 9 }).map((p) => p.x)).toEqual([1, 3, 9])
    expect(insertAt(undefined, 0, { x: 5, y: 5 })).toEqual([{ x: 5, y: 5 }])
    expect(moveAt(base, 0, { x: 7, y: 8 })).toEqual([{ x: 7, y: 8 }, { x: 3, y: 3 }])
    expect(removeAt(base, 0)).toEqual([{ x: 3, y: 3 }])
    expect(translate(base, 10, -1)).toEqual([{ x: 11, y: 0 }, { x: 13, y: 2 }])
    expect(shift(base, 0, 1).map((p) => p.x)).toEqual([3, 1])
    expect(shift(base, 0, -1)).toEqual(base)
    expect(base).toEqual(copy)
  })
  it('never exceeds the maximum number of points', () => {
    let pts = [] as { x: number; y: number }[]
    for (let i = 0; i < WAYPOINT_MAX + 5; i++) pts = insertAt(pts, pts.length, { x: i, y: i })
    expect(pts).toHaveLength(WAYPOINT_MAX)
  })
  it('rounds coordinates to one decimal', () => {
    expect(insertAt([], 0, { x: 1.2345, y: -9.8765 })).toEqual([{ x: 1.2, y: -9.9 }])
  })
})

describe('edge geometry with reroute points', () => {
  const base = { sx: 0, sy: 0, tx: 300, ty: 0, self: false, reciprocal: false, rank: 0 as const }
  it('without points the route is exactly the automatic one', () => {
    expect(edgeGeometry({ ...base, waypoints: [] })).toEqual(edgeGeometry(base))
    expect(edgeGeometry({ ...base, waypoints: undefined })).toEqual(edgeGeometry(base))
  })
  it('passes through every point in order, ends at the target pin, and keeps the label finite', () => {
    const g = edgeGeometry({ ...base, waypoints: [{ x: 100, y: 120 }, { x: 200, y: -80 }] })
    expect(g.d.startsWith('M 0,0')).toBe(true)
    expect(g.d).toContain('100,120')
    expect(g.d.indexOf('100,120')).toBeLessThan(g.d.indexOf('200,-80'))
    expect(g.d.trim().endsWith('300,0')).toBe(true)
    expect(g.d.match(/ C /g)).toHaveLength(3)
    expect(Number.isFinite(g.labelX) && Number.isFinite(g.labelY)).toBe(true)
  })
  it('works for self-loops and backward wires', () => {
    expect(edgeGeometry({ ...base, tx: 0, self: true, waypoints: [{ x: 60, y: -150 }] }).d).toContain('60,-150')
    expect(edgeGeometry({ ...base, tx: -200, ty: 300, waypoints: [{ x: -50, y: 150 }] }).d).toContain('-50,150')
  })
})
