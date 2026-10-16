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
  /** Engine nouns substituted into the shared brief templates (proper nouns, not translated). */
  vocab: Record<'container' | 'director' | 'stateHolder' | 'dataAsset' | 'loader' | 'sequencer' | 'audio' | 'ai' | 'test' | 'trigger' | 'logic', string>
}

/** `s_cottage` → `SCottage`: a safe identifier fragment derived from a source id. */
export const pascal = (id: string): string =>
  id
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join('') || 'Item'

/** A *proposed* scene/level path for a scene id; never an existing asset. */
export const proposedScenePath = (engine: Engine, id: string): string => (engine === 'unreal' ? `/Game/Maps/L_${pascal(id)}` : `Assets/Scenes/${pascal(id)}.unity`)

const subjectId = (t: Pick<PlanTask, 'sources'>) => t.sources[0]?.id ?? 'item'

const unreal: EngineAdapter = {
  id: 'unreal',
  prefix: 'u',
  fileBase: 'production-plan-unreal',
  vocab: { container: 'Level', director: 'narrative director Blueprint', stateHolder: 'GameInstance subsystem', dataAsset: 'Data Table or Data Asset', loader: 'Open Level (or level streaming)', sequencer: 'Level Sequence (Sequencer)', audio: 'Audio Component with a MetaSound or Sound Cue', ai: 'State Tree or Behavior Tree on an AI Controller', test: 'Functional Test (Automation)', trigger: 'Actor Component or trigger volume', logic: 'Blueprint function or macro' },
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
      assetAudio: [`Content/Horror/Audio/${n}/ (folder, proposed)`],
      assetCharacter: [`Content/Horror/Characters/${n}/ (folder, proposed)`],
      verifyEnding: [`FT_Ending_${n} (Functional Test)`],
      verify: ['Functional Test map (Automation)'],
    }
    return m[t.kind] ?? []
  },
}

const unity: EngineAdapter = {
  id: 'unity',
  prefix: 'y',
  fileBase: 'production-plan-unity',
  vocab: { container: 'Scene', director: 'narrative director MonoBehaviour', stateHolder: 'narrative state class (or ScriptableObject)', dataAsset: 'ScriptableObject', loader: 'SceneManager', sequencer: 'Timeline with Cinemachine cameras', audio: 'AudioSource routed through an AudioMixer group', ai: 'state-machine controller (plus a NavMeshAgent if it moves)', test: 'PlayMode test (Test Framework)', trigger: 'MonoBehaviour or trigger collider', logic: 'C# method' },
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
      assetAudio: [`Assets/Horror/Audio/${n}/ (folder, proposed)`],
      assetCharacter: [`Assets/Horror/Characters/${n}/ (folder, proposed)`],
      verifyEnding: [`Ending${n}Tests (PlayMode test)`],
      verify: ['PlayMode tests (Test Framework)'],
    }
    return m[t.kind] ?? []
  },
}

export const ADAPTERS: Record<Engine, EngineAdapter> = { unreal, unity }
