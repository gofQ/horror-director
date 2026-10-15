import type { Project, Scene, Shot } from './schema'

/**
 * Pure helpers for the shot planner. Shots are planning notes only: nothing here changes authored
 * timing, and shots are independent of scene triggers and transitions.
 */
export interface ShotInfo {
  /** `start + duration` in scene-relative seconds. */
  end: number
  /** Ends after the scene's duration (the part beyond it is `end - sceneDuration`). */
  exceeds: boolean
  /** Ids of the other shots whose time range overlaps this one (touching ends do not overlap). */
  overlaps: string[]
  /** Starts earlier than the previous shot in authored order. */
  outOfOrder: boolean
}

export interface ShotAnalysis {
  byId: Record<string, ShotInfo>
  /** Number of overlapping pairs. */
  overlapPairs: number
  /** Number of shots ending after the scene duration. */
  exceeding: number
  outOfOrder: number
}

export function analyzeShots(scene: Pick<Scene, 'shots' | 'duration'>): ShotAnalysis {
  const shots = scene.shots
  const byId: Record<string, ShotInfo> = {}
  shots.forEach((s, i) => {
    byId[s.id] = {
      end: s.start + s.duration,
      exceeds: s.start + s.duration > scene.duration,
      overlaps: [],
      outOfOrder: i > 0 && s.start < shots[i - 1].start,
    }
  })
  let overlapPairs = 0
  for (let i = 0; i < shots.length; i++)
    for (let j = i + 1; j < shots.length; j++) {
      const a = shots[i]
      const b = shots[j]
      if (a.start < b.start + b.duration && b.start < a.start + a.duration) {
        byId[a.id].overlaps.push(b.id)
        byId[b.id].overlaps.push(a.id)
        overlapPairs++
      }
    }
  const infos = Object.values(byId)
  return {
    byId,
    overlapPairs,
    exceeding: infos.filter((x) => x.exceeds).length,
    outOfOrder: infos.filter((x) => x.outOfOrder).length,
  }
}

/** Stable sort by start time (authored order breaks ties). Does not change any timing. */
export const sortedByTime = (shots: readonly Shot[]): Shot[] =>
  shots.map((s, i) => ({ s, i })).sort((a, b) => a.s.start - b.s.start || a.i - b.i).map((x) => x.s)

/** Default start for a new shot: right after the latest-ending shot (0 for an empty list). */
export const nextStart = (shots: readonly Shot[]): number =>
  Math.round(Math.max(0, ...shots.map((s) => s.start + s.duration)) * 100) / 100

export interface ShotReference {
  transitionId: string
  /** Which end of the transition links the shot (a self-loop can link the same shot in both roles). */
  role: 'source' | 'target'
}

/** Transition directions that link `shotId` of scene `sceneId` (source shot of an outgoing, target shot of an incoming transition). */
export function shotReferences(project: Pick<Project, 'transitions'>, sceneId: string, shotId: string): ShotReference[] {
  const out: ShotReference[] = []
  for (const t of project.transitions) {
    if (t.source === sceneId && t.direction?.sourceShotId === shotId) out.push({ transitionId: t.id, role: 'source' })
    if (t.target === sceneId && t.direction?.targetShotId === shotId) out.push({ transitionId: t.id, role: 'target' })
  }
  return out
}
