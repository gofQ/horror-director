import type { Engine, PlanTask, TaskKind } from './plan'

/**
 * Engine adapters. They contribute only language-neutral *proposed* identifiers (class / asset names) for a task;
 * the wording (concepts, instructions, acceptance criteria) comes from the localized `plan.<u|y>.<kind>.*` keys.
 * Nothing here claims an existing asset, script or system, and no executable engine code is produced.
 */
export interface EngineAdapter {
  id: Engine
  /** Short key prefix of the engine-specific i18n keys. */
  prefix: 'u' | 'y'
  fileBase: string
  proposals(task: Pick<PlanTask, 'kind' | 'sources'>): string[]
}

/** `s_cottage` → `SCottage`: a safe identifier fragment derived from a source id. */
export const pascal = (id: string): string =>
  id
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join('') || 'Item'

const subjectId = (t: Pick<PlanTask, 'sources'>) => t.sources[0]?.id ?? 'item'

const unreal: EngineAdapter = {
  id: 'unreal',
  prefix: 'u',
  fileBase: 'production-plan-unreal',
  proposals(t) {
    const n = pascal(subjectId(t))
    const m: Partial<Record<TaskKind, string[]>> = {
      foundation: ['BP_NarrativeDirector', 'UNarrativeStateSubsystem (GameInstance Subsystem)'],
      state: ['UNarrativeStateSubsystem', 'DT_NarrativeFlags (Data Table)'],
      level: [`L_${n} (Level)`, `DA_Scene_${n} (Data Asset)`],
      transition: ['BP_LevelTransition (Blueprint function library)'],
      branch: [`Branch_${n} (Blueprint function)`],
      random: [`Random_${n} (seeded Blueprint function)`],
      event: [`Event_${n} (Blueprint Event Dispatcher)`],
      delay: [`Delay_${n} (Timer / Delay node)`],
      sequence: [`Seq_${n} (Blueprint macro or Level Sequence)`],
      cinematic: [`LS_${n} (Level Sequence)`],
      audio: [`MS_${n} (MetaSound Source)`, `AC_${n} (Audio Component)`],
      character: [`ST_${n} (State Tree)`, `BP_${n}Controller (AI Controller)`],
      trigger: [`BP_HorrorTrigger_${n} (Actor Component)`],
      assets: ['Content/Horror/ (folder structure)'],
      verify: ['Functional Test map (Automation)'],
    }
    return m[t.kind] ?? []
  },
}

const unity: EngineAdapter = {
  id: 'unity',
  prefix: 'y',
  fileBase: 'production-plan-unity',
  proposals(t) {
    const n = pascal(subjectId(t))
    const m: Partial<Record<TaskKind, string[]>> = {
      foundation: ['NarrativeDirector (MonoBehaviour)', 'NarrativeGraph (ScriptableObject)'],
      state: ['NarrativeState (C# class)', 'NarrativeFlags (ScriptableObject)'],
      level: [`Scene_${n}.unity (Scene)`, `SceneData_${n} (ScriptableObject)`],
      transition: ['SceneTransitionService (C# class)'],
      branch: [`Branch_${n} (C# method)`],
      random: [`Random_${n} (seeded System.Random)`],
      event: [`Event_${n} (C# event / UnityEvent)`],
      delay: [`Delay_${n} (Coroutine or Awaitable)`],
      sequence: [`Seq_${n} (coroutine or Timeline)`],
      cinematic: [`TL_${n} (Timeline)`, `CM_${n} (Cinemachine camera)`],
      audio: [`AudioCueSet_${n} (ScriptableObject)`, 'AudioMixer_Main (AudioMixer)'],
      character: [`${n}Controller (MonoBehaviour state machine)`, `${n}Agent (NavMeshAgent)`],
      trigger: [`HorrorTrigger_${n} (MonoBehaviour)`],
      assets: ['Assets/Horror/ (folder structure)'],
      verify: ['PlayMode tests (Test Framework)'],
    }
    return m[t.kind] ?? []
  },
}

export const ADAPTERS: Record<Engine, EngineAdapter> = { unreal, unity }
