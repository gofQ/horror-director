import type { AudioCue, Scene } from './schema'

/**
 * Pure helpers for the audio planner. Cues are planning notes only: nothing here changes authored
 * timing, overlaps are normal (layers), and a silence cue never mutes anything.
 */
export interface AudioCueInfo {
  /** `start + duration` in scene-relative seconds. */
  end: number
  /** Ends after the scene's duration. */
  exceeds: boolean
  /** Fade-in plus fade-out is longer than the cue itself. */
  fadeTooLong: boolean
}

export interface AudioAnalysis {
  byId: Record<string, AudioCueInfo>
  exceeding: number
  fadeTooLong: number
}

export function analyzeAudioCues(scene: Pick<Scene, 'audioCues' | 'duration'>): AudioAnalysis {
  const byId: Record<string, AudioCueInfo> = {}
  for (const c of scene.audioCues)
    byId[c.id] = {
      end: c.start + c.duration,
      exceeds: c.start + c.duration > scene.duration,
      fadeTooLong: c.fadeIn + c.fadeOut > c.duration,
    }
  const infos = Object.values(byId)
  return {
    byId,
    exceeding: infos.filter((x) => x.exceeds).length,
    fadeTooLong: infos.filter((x) => x.fadeTooLong).length,
  }
}

/**
 * Display lane per cue (greedy, in authored order): overlapping cues simply use more lanes.
 * Touching ends do not overlap. Never changes the authored order or timing.
 */
export function assignLanes(cues: readonly Pick<AudioCue, 'id' | 'start' | 'duration'>[]): { lanes: Record<string, number>; count: number } {
  const laneEnds: number[] = []
  const lanes: Record<string, number> = {}
  for (const c of cues) {
    let lane = laneEnds.findIndex((end) => end <= c.start)
    if (lane < 0) lane = laneEnds.length
    laneEnds[lane] = c.start + c.duration
    lanes[c.id] = lane
  }
  return { lanes, count: laneEnds.length }
}

/** Default start for a new cue: right after the latest-ending cue (0 for an empty list). */
export const nextCueStart = (cues: readonly AudioCue[]): number =>
  Math.round(Math.max(0, ...cues.map((c) => c.start + c.duration)) * 100) / 100
