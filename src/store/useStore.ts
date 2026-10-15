import { create } from 'zustand'
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware'
import { emptyProject, newCharacter, newScene, newTransition, newTrigger } from '../lib/factory'
import { uid } from '../lib/id'
import type {
  Character,
  CharacterState,
  Project,
  Scene,
  SceneKind,
  Transition,
  Trigger,
} from '../lib/schema'
import { sampleProject } from '../lib/sample'
import { projectSchema } from '../lib/schema'

export type View = 'graph' | 'timeline' | 'characters' | 'analysis'
export type Selection = { type: 'scene' | 'edge'; id: string } | null

interface State {
  project: Project
  selection: Selection
  view: View
  timelineSceneId: string | null
  selectedTriggerId: string | null

  setView: (v: View) => void
  select: (s: Selection) => void
  focusScene: (id: string) => void
  loadProject: (p: Project) => void
  resetProject: () => void
  loadSample: () => void
  updateProject: (patch: Partial<Pick<Project, 'name' | 'description'>>) => void

  addScene: (kind: SceneKind, position: { x: number; y: number }) => string
  updateScene: (id: string, patch: Partial<Scene>) => void
  moveScene: (id: string, position: { x: number; y: number }) => void
  deleteScene: (id: string) => void
  setStart: (id: string) => void

  addTransition: (source: string, target: string) => string | null
  updateTransition: (id: string, patch: Partial<Transition>) => void
  deleteTransition: (id: string) => void

  setTimelineScene: (id: string | null) => void
  selectTrigger: (id: string | null) => void
  addTrigger: (sceneId: string, time: number) => string
  updateTrigger: (sceneId: string, id: string, patch: Partial<Trigger>) => void
  deleteTrigger: (sceneId: string, id: string) => void

  addCharacter: () => string
  updateCharacter: (id: string, patch: Partial<Character>) => void
  deleteCharacter: (id: string) => void
  addCharacterState: (charId: string) => void
  updateCharacterState: (charId: string, stateId: string, patch: Partial<CharacterState>) => void
  deleteCharacterState: (charId: string, stateId: string) => void
  setSceneCharacterState: (sceneId: string, charId: string, stateId: string | null) => void
}

const mapScene = (p: Project, id: string, fn: (s: Scene) => Scene): Project => ({
  ...p,
  scenes: p.scenes.map((s) => (s.id === id ? fn(s) : s)),
})

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      project: sampleProject(),
      selection: null,
      view: 'graph',
      timelineSceneId: 's_hall',
      selectedTriggerId: null,

      setView: (view) => set({ view }),
      select: (selection) => set({ selection }),
      focusScene: (id) => set({ view: 'graph', selection: { type: 'scene', id } }),
      loadProject: (project) =>
        set({
          project,
          selection: null,
          selectedTriggerId: null,
          timelineSceneId: project.startSceneId ?? project.scenes[0]?.id ?? null,
        }),
      resetProject: () => get().loadProject(emptyProject()),
      loadSample: () => get().loadProject(sampleProject()),
      updateProject: (patch) => set((s) => ({ project: { ...s.project, ...patch } })),

      addScene: (kind, position) => {
        const scene = newScene(kind, position)
        set((s) => ({
          project: {
            ...s.project,
            scenes: [...s.project.scenes, scene],
            startSceneId: s.project.startSceneId ?? scene.id,
          },
          selection: { type: 'scene', id: scene.id },
        }))
        return scene.id
      },
      updateScene: (id, patch) =>
        set((s) => ({ project: mapScene(s.project, id, (sc) => ({ ...sc, ...patch })) })),
      moveScene: (id, position) =>
        set((s) => ({ project: mapScene(s.project, id, (sc) => ({ ...sc, position })) })),
      deleteScene: (id) =>
        set((s) => {
          const scenes = s.project.scenes.filter((x) => x.id !== id)
          return {
            project: {
              ...s.project,
              scenes,
              transitions: s.project.transitions.filter((t) => t.source !== id && t.target !== id),
              startSceneId:
                s.project.startSceneId === id ? (scenes[0]?.id ?? null) : s.project.startSceneId,
            },
            selection: s.selection?.id === id ? null : s.selection,
            timelineSceneId: s.timelineSceneId === id ? (scenes[0]?.id ?? null) : s.timelineSceneId,
          }
        }),
      setStart: (id) => set((s) => ({ project: { ...s.project, startSceneId: id } })),

      addTransition: (source, target) => {
        const exists = get().project.transitions.some(
          (t) => t.source === source && t.target === target,
        )
        if (exists) return null
        const t = newTransition(source, target)
        if (source === target) t.style = 'loopback'
        set((s) => ({
          project: { ...s.project, transitions: [...s.project.transitions, t] },
          selection: { type: 'edge', id: t.id },
        }))
        return t.id
      },
      updateTransition: (id, patch) =>
        set((s) => ({
          project: {
            ...s.project,
            transitions: s.project.transitions.map((t) => (t.id === id ? { ...t, ...patch } : t)),
          },
        })),
      deleteTransition: (id) =>
        set((s) => ({
          project: { ...s.project, transitions: s.project.transitions.filter((t) => t.id !== id) },
          selection: s.selection?.id === id ? null : s.selection,
        })),

      setTimelineScene: (id) => set({ timelineSceneId: id, selectedTriggerId: null }),
      selectTrigger: (id) => set({ selectedTriggerId: id }),
      addTrigger: (sceneId, time) => {
        const t = newTrigger(Math.max(0, Math.round(time)))
        set((s) => ({
          project: mapScene(s.project, sceneId, (sc) => ({ ...sc, triggers: [...sc.triggers, t] })),
          selectedTriggerId: t.id,
        }))
        return t.id
      },
      updateTrigger: (sceneId, id, patch) =>
        set((s) => ({
          project: mapScene(s.project, sceneId, (sc) => ({
            ...sc,
            triggers: sc.triggers.map((t) => (t.id === id ? { ...t, ...patch } : t)),
          })),
        })),
      deleteTrigger: (sceneId, id) =>
        set((s) => ({
          project: mapScene(s.project, sceneId, (sc) => ({
            ...sc,
            triggers: sc.triggers.filter((t) => t.id !== id),
          })),
          selectedTriggerId: s.selectedTriggerId === id ? null : s.selectedTriggerId,
        })),

      addCharacter: () => {
        const c = newCharacter()
        set((s) => ({ project: { ...s.project, characters: [...s.project.characters, c] } }))
        return c.id
      },
      updateCharacter: (id, patch) =>
        set((s) => ({
          project: {
            ...s.project,
            characters: s.project.characters.map((c) => (c.id === id ? { ...c, ...patch } : c)),
          },
        })),
      deleteCharacter: (id) =>
        set((s) => ({
          project: {
            ...s.project,
            characters: s.project.characters.filter((c) => c.id !== id),
            scenes: s.project.scenes.map((sc) => {
              if (!(id in sc.characterStates)) return sc
              const { [id]: _removed, ...rest } = sc.characterStates
              return { ...sc, characterStates: rest }
            }),
          },
        })),
      addCharacterState: (charId) =>
        set((s) => ({
          project: {
            ...s.project,
            characters: s.project.characters.map((c) =>
              c.id === charId
                ? {
                    ...c,
                    states: [
                      ...c.states,
                      { id: uid('st'), name: 'New state', behavior: '', aggression: 0 },
                    ],
                  }
                : c,
            ),
          },
        })),
      updateCharacterState: (charId, stateId, patch) =>
        set((s) => ({
          project: {
            ...s.project,
            characters: s.project.characters.map((c) =>
              c.id === charId
                ? { ...c, states: c.states.map((st) => (st.id === stateId ? { ...st, ...patch } : st)) }
                : c,
            ),
          },
        })),
      deleteCharacterState: (charId, stateId) =>
        set((s) => ({
          project: {
            ...s.project,
            characters: s.project.characters.map((c) =>
              c.id === charId ? { ...c, states: c.states.filter((st) => st.id !== stateId) } : c,
            ),
            scenes: s.project.scenes.map((sc) => {
              if (sc.characterStates[charId] !== stateId) return sc
              const { [charId]: _removed, ...rest } = sc.characterStates
              return { ...sc, characterStates: rest }
            }),
          },
        })),
      setSceneCharacterState: (sceneId, charId, stateId) =>
        set((s) => ({
          project: mapScene(s.project, sceneId, (sc) => {
            const next = { ...sc.characterStates }
            if (stateId) next[charId] = stateId
            else delete next[charId]
            return { ...sc, characterStates: next }
          }),
        })),
    }),
    {
      name: 'horror-director:project:v1',
      storage: createJSONStorage(() => debouncedLocalStorage()),
      merge: (persisted, current) => {
        const p = persisted as { project?: unknown; timelineSceneId?: string | null } | undefined
        const parsed = projectSchema.safeParse(p?.project)
        if (!parsed.success) return current
        return { ...current, project: parsed.data, timelineSceneId: p?.timelineSceneId ?? null }
      },
      partialize: (s) => ({ project: s.project, timelineSceneId: s.timelineSceneId }),
    },
  ),
)

/** localStorage wrapper that coalesces rapid writes (node dragging) and survives storage errors. */
function debouncedLocalStorage(): StateStorage {
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending: [string, string] | null = null
  const flush = () => {
    if (!pending) return
    try {
      localStorage.setItem(pending[0], pending[1])
    } catch (e) {
      console.warn('Horror Director: could not save to localStorage', e)
    }
    pending = null
  }
  if (typeof window !== 'undefined') window.addEventListener('beforeunload', flush)
  return {
    getItem: (name) => {
      try {
        return localStorage.getItem(name)
      } catch {
        return null
      }
    },
    setItem: (name, value) => {
      pending = [name, value]
      clearTimeout(timer)
      timer = setTimeout(flush, 300)
    },
    removeItem: (name) => {
      try {
        localStorage.removeItem(name)
      } catch {
        /* ignore */
      }
    },
  }
}
