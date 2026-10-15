import { create } from 'zustand'
import { useStore } from './useStore'
import { clampOptions, defaultOptions, type SimOptions } from '../lib/simulate'
import { clampPacing, type PacingOptions } from '../lib/pacing'
import { rollRandom } from '../lib/random'
import type { RandomPort } from '../lib/schema'

export const SEED_MAX = 64
export const DEFAULT_SEED = 'seed'

/** How a Random Branch output ended up in the route: picked by hand (what-if) or from an explicit seeded roll. */
export interface RandomMark {
  mode: 'manual' | 'rolled'
  /** Rolled only: the seed and the draw that were committed. */
  seed?: string
  u?: number
}
/** Marks of the route, keyed by the index of the choice (only Random Branch decisions carry one). */
export type RandomMarks = Record<number, RandomMark>
/** An explicit roll that the user has seen but not committed yet. */
export interface RollPreview {
  /** Index of the decision it was drawn for (the length of the route at that time). */
  index: number
  nodeId: string
  seed: string
  u: number
  outcome: RandomPort
}

const keepBelow = (marks: RandomMarks, length: number): RandomMarks =>
  Object.fromEntries(Object.entries(marks).filter(([i]) => Number(i) < length))

/**
 * Simulator session state. Deliberately separate from the project store: it is never persisted,
 * never part of autosave/undo history, and holds only the chosen transition ids and the limits.
 * The route is replayed (and revalidated) against the live project by `simulateRoute`.
 */
interface SimState {
  choices: string[]
  options: SimOptions
  selectedEventKey: string | null
  /** Pacing finding highlighted on the chart (ignored once it no longer exists). */
  selectedFindingId: string | null
  /** Adjustable pacing thresholds (session-only; the UI exposes the kind window and silence minimum). */
  pacing: PacingOptions
  /** Route A of the comparison: a copy of the choices made when pinned (session-only, never pruned). */
  pinned: { projectId: string; choices: string[]; marks: RandomMarks } | null
  /** Session-only seed of the explicit Random Branch roll (never saved with the project). */
  seed: string
  /** How each Random Branch decision was made, by choice index. Session-only provenance. */
  marks: RandomMarks
  rollPreview: RollPreview | null
  /** How many chosen steps were dropped because graph edits invalidated them (0 = none). */
  invalidatedNotice: number
  choose: (transitionId: string, mark?: RandomMark) => void
  setSeed: (seed: string) => void
  /** Draws (seeded, explicit) for the Random Branch the route waits at. Does not change the route. */
  rollOutcome: (nodeId: string, probabilityA: number) => void
  clearRoll: () => void
  back: () => void
  restart: () => void
  setOptions: (o: Partial<SimOptions>) => void
  /** Replaces the route with its still-valid prefix. */
  prune: (validChoices: string[], invalidated: number) => void
  selectEvent: (key: string | null) => void
  selectFinding: (id: string | null) => void
  setPacing: (o: Partial<PacingOptions>) => void
  /** Pins the current route as Route A for the active project (replaces any earlier pin). */
  pinRouteA: () => void
  clearPin: () => void
  reset: () => void
}

export const useSim = create<SimState>((set) => ({
  choices: [],
  options: defaultOptions(),
  selectedEventKey: null,
  selectedFindingId: null,
  pacing: clampPacing(),
  pinned: null,
  seed: DEFAULT_SEED,
  marks: {},
  rollPreview: null,
  invalidatedNotice: 0,
  choose: (id, mark) =>
    set((s) => ({
      choices: [...s.choices, id],
      marks: mark ? { ...s.marks, [s.choices.length]: mark } : s.marks,
      rollPreview: null,
      invalidatedNotice: 0,
      selectedEventKey: null,
      selectedFindingId: null,
    })),
  back: () =>
    set((s) => ({
      choices: s.choices.slice(0, -1),
      marks: keepBelow(s.marks, s.choices.length - 1),
      rollPreview: null,
      invalidatedNotice: 0,
      selectedEventKey: null,
      selectedFindingId: null,
    })),
  restart: () => set({ choices: [], marks: {}, rollPreview: null, invalidatedNotice: 0, selectedEventKey: null, selectedFindingId: null }),
  setSeed: (seed) => set({ seed: seed.slice(0, SEED_MAX), rollPreview: null }),
  rollOutcome: (nodeId, probabilityA) =>
    set((s) => {
      const index = s.choices.length
      const r = rollRandom({ seed: s.seed, nodeId, index, probabilityA })
      return { rollPreview: { index, nodeId, seed: s.seed, u: r.u, outcome: r.outcome } }
    }),
  clearRoll: () => set({ rollPreview: null }),
  setOptions: (o) => set((s) => ({ options: clampOptions({ ...s.options, ...o }) })),
  prune: (validChoices, invalidated) =>
    set((s) => ({ choices: validChoices, marks: keepBelow(s.marks, validChoices.length), rollPreview: null, invalidatedNotice: invalidated > 0 ? invalidated : s.invalidatedNotice })),
  selectEvent: (key) => set({ selectedEventKey: key }),
  selectFinding: (id) => set((s) => ({ selectedFindingId: s.selectedFindingId === id ? null : id })),
  setPacing: (o) => set((s) => ({ pacing: clampPacing({ ...s.pacing, ...o }) })),
  pinRouteA: () =>
    set((s) => {
      const projectId = useStore.getState().library.activeId
      return projectId ? { pinned: { projectId, choices: [...s.choices], marks: { ...s.marks } } } : {}
    }),
  clearPin: () => set({ pinned: null }),
  reset: () => set({ choices: [], marks: {}, rollPreview: null, invalidatedNotice: 0, selectedEventKey: null, selectedFindingId: null, pinned: null }),
}))

// The route belongs to one project: switching projects starts over (limits are kept).
useStore.subscribe((s, prev) => {
  if (s.library.activeId !== prev.library.activeId) useSim.getState().reset()
})
