import { describe, expect, it } from 'vitest'
import { hashSeed, mulberry32, rollRandom } from './random'

describe('seeded random helper', () => {
  it('hashes and generates deterministically', () => {
    expect(hashSeed('abc')).toBe(hashSeed('abc'))
    expect(hashSeed('abc')).not.toBe(hashSeed('abd'))
    const a = mulberry32(42)
    const b = mulberry32(42)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
    const g = mulberry32(7)
    for (let i = 0; i < 1000; i++) {
      const v = g()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
  it('gives the same result for the same seed and decision context, and varies with the context', () => {
    const input = { seed: 'night', nodeId: 'R', index: 3, probabilityA: 50 }
    expect(rollRandom(input)).toEqual(rollRandom({ ...input }))
    const draws = new Set(Array.from({ length: 20 }, (_, i) => rollRandom({ ...input, index: i }).u))
    expect(draws.size).toBeGreaterThan(15)
    expect(rollRandom({ ...input, seed: 'other' }).u).not.toBe(rollRandom(input).u)
    expect(rollRandom({ ...input, nodeId: 'R2' }).u).not.toBe(rollRandom(input).u)
  })
  it('0 % never rolls A and 100 % always rolls A', () => {
    for (let i = 0; i < 500; i++) {
      expect(rollRandom({ seed: 's', nodeId: 'R', index: i, probabilityA: 0 }).outcome).toBe('b')
      expect(rollRandom({ seed: 's', nodeId: 'R', index: i, probabilityA: 100 }).outcome).toBe('a')
    }
  })
  it('follows the authored probability on average (a sanity check, not a verification)', () => {
    let a = 0
    const n = 4000
    for (let i = 0; i < n; i++) if (rollRandom({ seed: 'dist', nodeId: 'R', index: i, probabilityA: 30 }).outcome === 'a') a++
    expect(a / n).toBeGreaterThan(0.26)
    expect(a / n).toBeLessThan(0.34)
  })
})
