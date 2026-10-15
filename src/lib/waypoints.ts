import { WAYPOINT_MAX, type Waypoint } from './schema'

/** Pure helpers for reroute points (all immutable; results never exceed `WAYPOINT_MAX`). */
type Pt = { x: number; y: number }

const round = (n: number) => Math.round(n * 10) / 10
export const roundPoint = (p: Pt): Waypoint => ({ x: round(p.x), y: round(p.y) })

/** Distance from `p` to the segment a–b. */
function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/**
 * Index at which a new point near `p` belongs in `points`: the wire is the polyline
 * source → points… → target, and the point goes into the nearest segment.
 */
export function nearestSegmentIndex(source: Pt, points: readonly Pt[], target: Pt, p: Pt): number {
  const chain = [source, ...points, target]
  let best = 0
  let bestD = Infinity
  for (let i = 0; i < chain.length - 1; i++) {
    const d = distToSegment(p, chain[i], chain[i + 1])
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  return best
}

export const canAdd = (points: readonly Pt[] | undefined) => (points?.length ?? 0) < WAYPOINT_MAX

export function insertAt(points: readonly Waypoint[] | undefined, index: number, p: Pt): Waypoint[] {
  const list = [...(points ?? [])]
  if (list.length >= WAYPOINT_MAX) return list
  list.splice(Math.max(0, Math.min(list.length, index)), 0, roundPoint(p))
  return list
}

export function moveAt(points: readonly Waypoint[], index: number, p: Pt): Waypoint[] {
  return points.map((q, i) => (i === index ? roundPoint(p) : q))
}

export const removeAt = (points: readonly Waypoint[], index: number): Waypoint[] => points.filter((_, i) => i !== index)

export const translate = (points: readonly Waypoint[], dx: number, dy: number): Waypoint[] =>
  points.map((q) => roundPoint({ x: q.x + dx, y: q.y + dy }))

/** Swaps a point with its neighbour (keyboard/touch alternative to dragging order). */
export function shift(points: readonly Waypoint[], index: number, by: -1 | 1): Waypoint[] {
  const j = index + by
  if (j < 0 || j >= points.length) return [...points]
  const list = [...points]
  ;[list[index], list[j]] = [list[j], list[index]]
  return list
}
