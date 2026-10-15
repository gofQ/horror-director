import { create } from 'zustand'
import { useStore } from './useStore'
import { clampOptions, defaultOptions, type SimOptions } from '../lib/simulate'
import { clampPacing, type PacingOptions } from '../lib/pacing'

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
  /** How many chosen steps were dropped because graph edits invalidated them (0 = none). */
  invalidatedNotice: number
  choose: (transitionId: string) => void
  back: () => void
  restart: () => void
  setOptions: (o: Partial<SimOptions>) => void
  /** Replaces the route with its still-valid prefix. */
  prune: (validChoices: string[], invalidated: number) => void
  selectEvent: (key: string | null) => void
  selectFinding: (id: string | null) => void
  setPacing: (o: Partial<PacingOptions>) => void
  reset: () => void
}

export const useSim = create<SimState>((set) => ({
  choices: [],
  options: defaultOptions(),
  selectedEventKey: null,
  selectedFindingId: null,
  pacing: clampPacing(),
  invalidatedNotice: 0,
  choose: (id) => set((s) => ({ choices: [...s.choices, id], invalidatedNotice: 0, selectedEventKey: null, selectedFindingId: null })),
  back: () => set((s) => ({ choices: s.choices.slice(0, -1), invalidatedNotice: 0, selectedEventKey: null, selectedFindingId: null })),
  restart: () => set({ choices: [], invalidatedNotice: 0, selectedEventKey: null, selectedFindingId: null }),
  setOptions: (o) => set((s) => ({ options: clampOptions({ ...s.options, ...o }) })),
  prune: (validChoices, invalidated) =>
    set((s) => ({ choices: validChoices, invalidatedNotice: invalidated > 0 ? invalidated : s.invalidatedNotice })),
  selectEvent: (key) => set({ selectedEventKey: key }),
  selectFinding: (id) => set((s) => ({ selectedFindingId: s.selectedFindingId === id ? null : id })),
  setPacing: (o) => set((s) => ({ pacing: clampPacing({ ...s.pacing, ...o }) })),
  reset: () => set({ choices: [], invalidatedNotice: 0, selectedEventKey: null, selectedFindingId: null }),
}))

// The route belongs to one project: switching projects starts over (limits are kept).
useStore.subscribe((s, prev) => {
  if (s.library.activeId !== prev.library.activeId) useSim.getState().reset()
})
