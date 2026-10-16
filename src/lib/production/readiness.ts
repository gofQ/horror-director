import { BLOCKING_TBD, type Engine, type Plan, type PlanTask, type TbdCode } from './plan'

/**
 * Readiness is derived from authored information only. "ready" means enough information exists to START the task;
 * it never claims the work exists in an engine project (`implementation` is always `unknown`: the app has no engine access).
 */
export type Readiness = 'ready' | 'needsInfo' | 'blocked'
export const READINESS: readonly Readiness[] = ['ready', 'needsInfo', 'blocked']

export interface TaskAssessment {
  readiness: Readiness
  /** Essential authored inputs that are missing (they make the task `needsInfo`). */
  missing: TbdCode[]
  /** Items a human should confirm (a proposal exists; they never block). */
  confirm: TbdCode[]
  /** Direct dependencies that are not `ready`. */
  blockedBy: string[]
  implementation: 'unknown'
}

/** The task's TBD codes as they apply to one engine (Unreal-only and Unity-only notes are filtered). */
export function tbdFor(task: Pick<PlanTask, 'tbd'>, engine: Engine): TbdCode[] {
  return task.tbd.filter((c) => (c === 'levelPath' ? engine === 'unreal' : c === 'scenePath' ? engine === 'unity' : true))
}
export const isBlockingTbd = (c: TbdCode): boolean => BLOCKING_TBD.includes(c)

/** Assessment of every task, computed in schedule order so dependency readiness is already known. */
export function assessPlan(plan: Plan, engine: Engine): Map<string, TaskAssessment> {
  const out = new Map<string, TaskAssessment>()
  for (const task of plan.tasks) {
    const tbd = tbdFor(task, engine)
    const missing = tbd.filter(isBlockingTbd)
    const confirm = tbd.filter((c) => !isBlockingTbd(c))
    const blockedBy = task.dependsOn.filter((d) => out.get(d)?.readiness !== 'ready')
    const readiness: Readiness = missing.length ? 'needsInfo' : blockedBy.length ? 'blocked' : 'ready'
    out.set(task.id, { readiness, missing, confirm, blockedBy, implementation: 'unknown' })
  }
  return out
}
