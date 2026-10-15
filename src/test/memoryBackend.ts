import type { Backend } from '../lib/persist'

export interface MemoryBackend extends Backend {
  data: Map<string, string>
  /** Throw a QuotaExceededError for writes whose key matches. */
  failWhen: ((key: string) => boolean) | null
  /** Accept writes but silently store nothing (simulates a broken backend). */
  dropWrites: boolean
}

export function memoryBackend(seed: Record<string, string> = {}): MemoryBackend {
  const data = new Map(Object.entries(seed))
  const b: MemoryBackend = {
    data,
    failWhen: null,
    dropWrites: false,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      if (b.failWhen?.(k)) throw Object.assign(new Error('quota'), { name: 'QuotaExceededError' })
      if (!b.dropWrites) data.set(k, v)
    },
    removeItem: (k) => void data.delete(k),
    keys: () => [...data.keys()],
  }
  return b
}
