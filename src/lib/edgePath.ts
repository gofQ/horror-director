/**
 * Edge geometry in flow coordinates (pure, so dragging and zooming never change the routing rules).
 *  - forward: smooth curve source → target
 *  - back, same row (target not clearly right of source, little vertical gap): arc routed *below* the
 *    nodes instead of through them; the second edge of a reciprocal pair (rank 1) arcs deeper
 *  - back, different rows (e.g. vertically stacked scenes): S-curve; a reciprocal pair is pushed to
 *    opposite sides (by rank) so A→B and B→A and their labels never coincide
 *  - self: arc above the node
 */
export interface EdgeInput {
  sx: number
  sy: number
  tx: number
  ty: number
  self: boolean
  reciprocal: boolean
  /** Stable 0/1 tie-break for reciprocal pairs (derived from ids by the caller). */
  rank: 0 | 1
}
export interface EdgeGeometry {
  d: string
  labelX: number
  labelY: number
}

const FORWARD_MIN_DX = 24
const BACK_DEPTH = 110
const RECIPROCAL_EXTRA = 60
const SELF_RISE = 150
/** Below this vertical gap a backward edge would cut through the nodes, so it arcs underneath. */
const SAME_ROW_DY = 140
const S_OFFSET = 80
const RECIPROCAL_SHIFT = 70

type Pt = [number, number]
const cubic = (p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt => {
  const u = 1 - t
  const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t]
  return [
    w[0] * p0[0] + w[1] * p1[0] + w[2] * p2[0] + w[3] * p3[0],
    w[0] * p0[1] + w[1] * p1[1] + w[2] * p2[1] + w[3] * p3[1],
  ]
}
const fmt = (n: number) => (Number.isFinite(n) ? Math.round(n * 100) / 100 : 0)
const path = (a: Pt, b: Pt, c: Pt, d: Pt) =>
  `M ${fmt(a[0])},${fmt(a[1])} C ${fmt(b[0])},${fmt(b[1])} ${fmt(c[0])},${fmt(c[1])} ${fmt(d[0])},${fmt(d[1])}`

export function edgeGeometry(i: EdgeInput): EdgeGeometry {
  const a: Pt = [i.sx, i.sy]
  const d: Pt = [i.tx, i.ty]
  let b: Pt
  let c: Pt
  if (i.self) {
    b = [i.sx + 90, i.sy - SELF_RISE]
    c = [i.tx - 90, i.ty - SELF_RISE]
  } else if (i.tx - i.sx > FORWARD_MIN_DX) {
    const dx = Math.max(40, (i.tx - i.sx) * 0.5)
    b = [i.sx + dx, i.sy]
    c = [i.tx - dx, i.ty]
  } else if (Math.abs(i.ty - i.sy) >= SAME_ROW_DY) {
    const shift = i.reciprocal ? (i.rank === 0 ? -RECIPROCAL_SHIFT : RECIPROCAL_SHIFT) : 0
    b = [i.sx + S_OFFSET + shift, i.sy]
    c = [i.tx - S_OFFSET + shift, i.ty]
  } else {
    const depth = BACK_DEPTH + (i.reciprocal && i.rank === 1 ? RECIPROCAL_EXTRA : 0)
    const base = Math.max(i.sy, i.ty)
    // choose the control height so the curve's apex (t = .5) sits `depth` below the lower handle
    const y = (base + depth - (i.sy + i.ty) / 8) / 0.75
    b = [i.sx + 70, y]
    c = [i.tx - 70, y]
  }
  const [labelX, labelY] = cubic(a, b, c, d, 0.5)
  return { d: path(a, b, c, d), labelX: fmt(labelX), labelY: fmt(labelY) }
}
