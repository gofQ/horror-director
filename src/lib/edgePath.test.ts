import { describe, expect, it } from 'vitest'
import { edgeGeometry, type EdgeInput } from './edgePath'

const base: EdgeInput = { sx: 400, sy: 100, tx: 700, ty: 100, self: false, reciprocal: false, rank: 0 }
const nums = (g: ReturnType<typeof edgeGeometry>) => g.d.match(/-?\d+(\.\d+)?/g)!.map(Number)

describe('edgeGeometry', () => {
  it('forward edges are a smooth curve between the handles with the label between them', () => {
    const g = edgeGeometry(base)
    expect(g.d.startsWith('M 400,100 C')).toBe(true)
    expect(g.d.endsWith('700,100')).toBe(true)
    expect(g.labelX).toBe(550)
    expect(g.labelY).toBe(100)
  })

  it('back edges route below the nodes instead of through them', () => {
    const g = edgeGeometry({ ...base, sx: 700, tx: 100 })
    expect(g.labelY).toBeGreaterThan(100 + 90)
    expect(g.labelX).toBeCloseTo(400, 0)
  })

  it('a reciprocal pair never overlaps: forward vs back, and rank separates same-column pairs', () => {
    const fwd = edgeGeometry({ ...base, reciprocal: true, rank: 0 })
    const back = edgeGeometry({ ...base, sx: 700, tx: 400, reciprocal: true, rank: 1 })
    expect(Math.hypot(fwd.labelX - back.labelX, fwd.labelY - back.labelY)).toBeGreaterThan(80)
    const same0 = edgeGeometry({ sx: 500, sy: 100, tx: 480, ty: 100, self: false, reciprocal: true, rank: 0 })
    const same1 = edgeGeometry({ sx: 500, sy: 100, tx: 480, ty: 100, self: false, reciprocal: true, rank: 1 })
    expect(same1.labelY - same0.labelY).toBeGreaterThanOrEqual(50)
    expect(same0.d).not.toBe(same1.d)
  })

  it('vertically stacked reciprocal pairs use separate S-curves with non-coinciding labels', () => {
    const down = edgeGeometry({ sx: 600, sy: 260, tx: 415, ty: 580, self: false, reciprocal: true, rank: 0 })
    const up = edgeGeometry({ sx: 600, sy: 580, tx: 415, ty: 260, self: false, reciprocal: true, rank: 1 })
    expect(Math.abs(down.labelX - up.labelX)).toBeGreaterThanOrEqual(90)
    expect(down.d).not.toBe(up.d)
    // not routed underneath the lower node: label stays between the two handles vertically
    for (const g of [down, up]) {
      expect(g.labelY).toBeGreaterThan(260)
      expect(g.labelY).toBeLessThan(580)
    }
    // a non-reciprocal stacked edge is not shifted
    const solo = edgeGeometry({ sx: 600, sy: 260, tx: 415, ty: 580, self: false, reciprocal: false, rank: 0 })
    expect(solo.labelX).toBeCloseTo((600 + 415) / 2, 0)
  })

  it('self-loops start at the source handle, end at the target handle, and arc above', () => {
    const g = edgeGeometry({ sx: 300, sy: 200, tx: 60, ty: 200, self: true, reciprocal: false, rank: 0 })
    expect(g.d.startsWith('M 300,200 C')).toBe(true)
    expect(g.d.endsWith('60,200')).toBe(true)
    expect(g.labelY).toBeLessThan(200 - 100)
    expect(g.labelX).toBeCloseTo(180, 0)
  })

  it('is deterministic and finite even for degenerate input', () => {
    const same = { sx: 10, sy: 10, tx: 10, ty: 10, self: false, reciprocal: false, rank: 0 as const }
    const g = edgeGeometry(same)
    expect(edgeGeometry(same)).toEqual(g)
    expect([...nums(g), g.labelX, g.labelY].every(Number.isFinite)).toBe(true)
    const weird = edgeGeometry({ ...same, sx: NaN })
    expect(Number.isFinite(weird.labelX)).toBe(true)
  })

  it('geometry depends only on handle positions (stable while dragging/zooming)', () => {
    const a = edgeGeometry({ ...base, sx: 410, tx: 710 })
    const b = edgeGeometry({ ...base, sx: 400, tx: 700 })
    expect(a.labelX - b.labelX).toBe(10)
    expect(a.labelY).toBe(b.labelY)
  })
})
