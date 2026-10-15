import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CORRUPT_PREFIX, createSafeStorage, hydrate, preserveUnreadable, useSaveStatus, type Backend } from './persist'
import { sampleProject } from './sample'

function memory(): Backend & { data: Map<string, string>; failWrites: boolean } {
  const data = new Map<string, string>()
  const b = {
    data,
    failWrites: false,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (b.failWrites) throw Object.assign(new Error('full'), { name: 'QuotaExceededError' })
      data.set(k, v)
    },
    removeItem: (k: string) => void data.delete(k),
  }
  return b
}
const status = () => useSaveStatus.getState().status

beforeEach(() => {
  vi.useFakeTimers()
  useSaveStatus.setState({ status: { state: 'saved', at: null } })
})
afterEach(() => vi.useRealTimers())

describe('safe storage', () => {
  it('debounces writes and reports saved', () => {
    const b = memory()
    const s = createSafeStorage(() => b, { delay: 100, now: () => 123 })
    s.setItem('k', '1')
    s.setItem('k', '2')
    expect(status()).toEqual({ state: 'pending' })
    expect(b.data.has('k')).toBe(false)
    vi.advanceTimersByTime(100)
    expect(b.data.get('k')).toBe('2')
    expect(status()).toEqual({ state: 'saved', at: 123 })
  })

  it('flush writes immediately', () => {
    const b = memory()
    const s = createSafeStorage(() => b)
    s.setItem('k', 'v')
    s.flush()
    expect(b.data.get('k')).toBe('v')
  })

  it('reports quota errors and retries pending data on the next flush', () => {
    const b = memory()
    const s = createSafeStorage(() => b, { delay: 10 })
    b.failWrites = true
    s.setItem('k', 'v')
    vi.advanceTimersByTime(10)
    expect(status()).toEqual({ state: 'error', reason: 'full' })
    expect(b.data.has('k')).toBe(false)
    b.failWrites = false
    s.flush()
    expect(b.data.get('k')).toBe('v')
    expect(status().state).toBe('saved')
  })

  it('survives an unavailable backend', () => {
    const s = createSafeStorage(() => {
      throw new Error('no storage')
    })
    expect(s.getItem('k')).toBeNull()
    s.setItem('k', 'v')
    s.flush()
    expect(status()).toMatchObject({ state: 'error' })
    expect(() => s.removeItem('k')).not.toThrow()
  })
})

describe('hydration and compatibility', () => {
  it('loads data in the exact v0.1 persisted shape', () => {
    const v01 = JSON.parse(JSON.stringify({ state: { project: sampleProject(), timelineSceneId: 's_bed' }, version: 0 }))
    const h = hydrate(v01.state)
    expect(h.unreadable).toBe(false)
    expect(h.project).toEqual(sampleProject())
    expect(h.timelineSceneId).toBe('s_bed')
  })
  it('fills defaults for older data lacking optional fields', () => {
    const old = { project: { name: 'Old', scenes: [{ id: 'a', title: 'A', kind: 'reality', position: { x: 1, y: 2 } }] } }
    const h = hydrate(old)
    expect(h.project?.scenes[0].triggers).toEqual([])
    expect(h.project?.scenes[0].duration).toBe(120)
  })
  it('treats nothing stored as a fresh start, and invalid data as unreadable', () => {
    expect(hydrate(undefined)).toMatchObject({ project: null, unreadable: false })
    expect(hydrate({ project: { name: 1 } })).toMatchObject({ project: null, unreadable: true })
    expect(hydrate({})).toMatchObject({ unreadable: true })
  })
  it('preserves unreadable raw data under a separate key', () => {
    const b = memory()
    const key = preserveUnreadable('{broken', b, 42)
    expect(key).toBe(`${CORRUPT_PREFIX}42`)
    expect(b.data.get(key!)).toBe('{broken')
    expect(preserveUnreadable(null, b)).toBeNull()
    b.failWrites = true
    expect(preserveUnreadable('x', b)).toBeNull()
  })
})
