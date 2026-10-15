import type { RandomPort } from './schema'

/** FNV-1a hash of a string to an unsigned 32-bit integer. */
export function hashSeed(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** mulberry32: a tiny deterministic PRNG returning a generator of floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface RollInput {
  seed: string
  nodeId: string
  /** Position of the decision in the route (the index of the choice being made). */
  index: number
  /** Probability of output A in percent (0–100). */
  probabilityA: number
}
export interface RollResult {
  /** The draw in [0, 1). */
  u: number
  outcome: RandomPort
}

/**
 * Seeded, explicit draw for one decision. The result depends only on (seed, node id, decision index, probability),
 * so replaying the same route with the same seed gives the same draw. 0 % never yields A, 100 % always yields A.
 */
export function rollRandom({ seed, nodeId, index, probabilityA }: RollInput): RollResult {
  const u = mulberry32(hashSeed(`${seed}\u0000${nodeId}\u0000${index}`))()
  return { u, outcome: u * 100 < probabilityA ? 'a' : 'b' }
}
