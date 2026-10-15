import { create } from 'zustand'
import { emptyProject, newCharacter, newScene, newShot, newTransition, newTrigger, type DefaultNames } from '../lib/factory'
import { getLang } from '../i18n/store'
import { translate } from '../i18n'
import { uid } from '../lib/id'
import { loadLibrary, type LibraryIndex, type LoadNotice, type LoadedLibrary } from '../lib/library'
import { browserBackend, useSaveStatus } from '../lib/persist'
import type {
  Character,
  CharacterState,
  Project,
  Scene,
  SceneKind,
  Shot,
  Transition,
  Trigger,
  TransitionDirection,
} from '../lib/schema'
import { sampleProject } from '../lib/sample'
import { computeLayout } from '../lib/layout'
import { nextStart, shotReferences, sortedByTime } from '../lib/shots'
import { transitionDirectionSchema } from '../lib/schema'

export type View = 'graph' | 'timeline' | 'characters' | 'analysis' | 'simulator'
export type Selection = { type: 'scene' | 'edge'; id: string } | null

export const HISTORY_LIMIT = 50

/** Names for newly created items follow the current UI language; existing items are never renamed. */
export function defaultNames(): DefaultNames {
  const l = getLang()
  return {
    project: translate(l, 'default.project'),
    opening: translate(l, 'default.opening'),
    scene: translate(l, 'default.scene'),
    ending: translate(l, 'default.ending'),
    trigger: translate(l, 'default.trigger'),
    shot: translate(l, 'default.shot'),
    character: translate(l, 'default.character'),
    state: translate(l, 'default.state'),
    stateIdle: translate(l, 'default.stateIdle'),
  }
}

interface State {
  project: Project
  selection: Selection
  view: View
  timelineSceneId: string | null
  selectedTriggerId: string | null
  /** Undo/redo snapshots (session only, not persisted). */
  past: Project[]
  future: Project[]
  /** Set when stored data existed but could not be read at startup. */
  /** Library metadata (active id + project list). Never part of a project or its export. */
  library: LibraryIndex
  /** Listed projects whose stored record is unreadable (raw kept untouched in storage). */
  damaged: Record<string, { raw: string | null }>
  notices: LoadNotice[]
  /** Another tab changed this library; library operations are blocked until reload. */
  externalChange: boolean

  undo: () => void
  redo: () => void
  dismissNotice: (index: number) => void
  /** Replaces the active project with another one from the library (history is not carried over). */
  swapActive: (p: { project: Project; library: LibraryIndex; damaged?: State['damaged'] }) => void
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
  deleteScenes: (ids: string[]) => void
  setStart: (id: string) => void
  /** Auto-arranges scene positions (positions only). One undo step; returns false when nothing moved. */
  arrangeScenes: () => boolean

  addTransition: (source: string, target: string) => string | null
  /** Endpoints are fixed after creation (shot links in a direction depend on them). */
  updateTransition: (id: string, patch: Partial<Omit<Transition, 'source' | 'target'>>) => void
  /** Creates the direction when absent and merges the patch. Refuses (false) shot links outside the transition's source/target scene. */
  updateDirection: (transitionId: string, patch: Partial<TransitionDirection>) => boolean
  /** Removes the direction of a transition (explicit, undoable). */
  clearDirection: (transitionId: string) => void
  deleteTransition: (id: string) => void

  setTimelineScene: (id: string | null) => void
  selectTrigger: (id: string | null) => void
  addTrigger: (sceneId: string, time: number) => string
  updateTrigger: (sceneId: string, id: string, patch: Partial<Trigger>) => void
  deleteTrigger: (sceneId: string, id: string) => void
  /** Cinematic shots (planning notes; independent of triggers/transitions). Authored timing is never changed implicitly. */
  addShot: (sceneId: string) => string
  updateShot: (sceneId: string, id: string, patch: Partial<Omit<Shot, 'id'>>) => void
  /** Refuses (false, nothing changes) while transition directions link the shot, unless `clearReferences`; then shot and links go in one undo step. */
  deleteShot: (sceneId: string, id: string, opts?: { clearReferences?: boolean }) => boolean
  /** Inserts a copy right after the original, starting where the original ends. */
  duplicateShot: (sceneId: string, id: string, copyTitle: string) => string | null
  /** Moves a shot one place in the authored order (timing untouched). */
  moveShot: (sceneId: string, id: string, dir: -1 | 1) => void
  /** Reorders by start time (stable); one undo step, no history entry when already sorted. */
  sortShotsByTime: (sceneId: string) => void

  addCharacter: () => string
  updateCharacter: (id: string, patch: Partial<Character>) => void
  deleteCharacter: (id: string) => void
  addCharacterState: (charId: string) => void
  updateCharacterState: (charId: string, stateId: string, patch: Partial<CharacterState>) => void
  deleteCharacterState: (charId: string, stateId: string) => void
  setSceneCharacterState: (sceneId: string, charId: string, stateId: string | null) => void
}

type Partialer = Partial<State> | ((s: State) => Partial<State>)
/** `coalesce`: consecutive edits with the same key within `ms` share a single undo step. */
type Setter = (partial: Partialer, coalesce?: { key: string; ms?: number }) => void

let lastKey: string | null = null
let lastTime = 0

function withHistory(rawSet: (p: Partial<State>) => void, get: () => State): Setter {
  return (partial, coalesce) => {
    const s = get()
    let next = typeof partial === 'function' ? partial(s) : partial
    if (next.project && next.project !== s.project) {
      const now = Date.now()
      const merge = !!coalesce && lastKey === coalesce.key && now - lastTime < (coalesce.ms ?? 800)
      lastKey = coalesce?.key ?? null
      lastTime = now
      if (!merge) next = { ...next, past: [...s.past, s.project].slice(-HISTORY_LIMIT), future: [] }
    }
    rawSet(next)
  }
}

/** Drops selection/timeline references that no longer exist after a history jump. */
function reconcile(project: Project, s: State): Partial<State> {
  const scenes = new Set(project.scenes.map((x) => x.id))
  const edges = new Set(project.transitions.map((x) => x.id))
  const sel = s.selection
  const selOk = !sel || (sel.type === 'scene' ? scenes.has(sel.id) : edges.has(sel.id))
  const tl =
    s.timelineSceneId && scenes.has(s.timelineSceneId) ? s.timelineSceneId : (project.scenes[0]?.id ?? null)
  const trgOk = project.scenes.some((x) => x.triggers.some((t) => t.id === s.selectedTriggerId))
  return {
    selection: selOk ? sel : null,
    timelineSceneId: tl,
    selectedTriggerId: trgOk ? s.selectedTriggerId : null,
  }
}

const mapScene = (p: Project, id: string, fn: (s: Scene) => Scene): Project => ({
  ...p,
  scenes: p.scenes.map((s) => (s.id === id ? fn(s) : s)),
})
const keysOf = (o: object) => Object.keys(o).sort().join(',')

/** Boot-time load: migrates legacy data when needed and picks the remembered active project. */
export const bootDeps = () => ({
  now: Date.now,
  newId: () => uid('p'),
  sample: sampleProject,
  empty: () => emptyProject(defaultNames()),
})
const boot: LoadedLibrary = loadLibrary(browserBackend(), bootDeps())
export const bootResult = boot
if (boot.bootError) useSaveStatus.setState({ status: { state: 'error', reason: boot.bootError } })

const startScene = (p: Project) => p.startSceneId ?? p.scenes[0]?.id ?? null

export const useStore = create<State>()(
  (rawSet, get) => {
      const set = withHistory(rawSet, get)
      return {
        project: boot.project,
        selection: null,
        view: 'graph',
        timelineSceneId: startScene(boot.project),
        selectedTriggerId: null,
        past: [],
        future: [],
        library: boot.index,
        damaged: boot.damaged,
        notices: boot.notices,
        externalChange: false,

        undo: () => {
          const s = get()
          const prev = s.past[s.past.length - 1]
          if (!prev) return
          lastKey = null
          rawSet({
            project: prev,
            past: s.past.slice(0, -1),
            future: [...s.future, s.project],
            ...reconcile(prev, s),
          })
        },
        redo: () => {
          const s = get()
          const next = s.future[s.future.length - 1]
          if (!next) return
          lastKey = null
          rawSet({
            project: next,
            future: s.future.slice(0, -1),
            past: [...s.past, s.project].slice(-HISTORY_LIMIT),
            ...reconcile(next, s),
          })
        },
        dismissNotice: (i) => rawSet({ notices: get().notices.filter((_, k) => k !== i) }),
        swapActive: ({ project, library, damaged }) => {
          lastKey = null // never coalesce across projects
          rawSet({
            project,
            library,
            ...(damaged ? { damaged } : {}),
            selection: null,
            selectedTriggerId: null,
            timelineSceneId: startScene(project),
            past: [], // undo/redo never crosses project boundaries
            future: [],
          })
        },

        setView: (view) => rawSet({ view }),
        select: (selection) => rawSet({ selection }),
        focusScene: (id) => rawSet({ view: 'graph', selection: { type: 'scene', id } }),
        loadProject: (project) =>
          set({
            project,
            selection: null,
            selectedTriggerId: null,
            timelineSceneId: project.startSceneId ?? project.scenes[0]?.id ?? null,
          }),
        resetProject: () => get().loadProject(emptyProject(defaultNames())),
        loadSample: () => get().loadProject(sampleProject()),
        updateProject: (patch) =>
          set((s) => ({ project: { ...s.project, ...patch } }), { key: `project:${keysOf(patch)}` }),

        addScene: (kind, position) => {
          const scene = newScene(kind, position, defaultNames())
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
          set((s) => ({ project: mapScene(s.project, id, (sc) => ({ ...sc, ...patch })) }), {
            key: `scene:${id}:${keysOf(patch)}`,
          }),
        moveScene: (id, position) =>
          set((s) => ({ project: mapScene(s.project, id, (sc) => ({ ...sc, position })) }), {
            key: `move:${id}`,
          }),
        deleteScene: (id) => get().deleteScenes([id]),
        deleteScenes: (ids) =>
          set(
            (s) => {
              const gone = new Set(ids.filter((id) => s.project.scenes.some((x) => x.id === id)))
              if (gone.size === 0) return {}
              const scenes = s.project.scenes.filter((x) => !gone.has(x.id))
              return {
                project: {
                  ...s.project,
                  scenes,
                  transitions: s.project.transitions.filter((t) => !gone.has(t.source) && !gone.has(t.target)),
                  startSceneId:
                    s.project.startSceneId && gone.has(s.project.startSceneId)
                      ? (scenes[0]?.id ?? null)
                      : s.project.startSceneId,
                },
                selection: s.selection && gone.has(s.selection.id) ? null : s.selection,
                timelineSceneId:
                  s.timelineSceneId && gone.has(s.timelineSceneId)
                    ? (scenes[0]?.id ?? null)
                    : s.timelineSceneId,
              }
            },
            // React Flow reports a Delete keypress as several events; fold them into one step.
            { key: 'delete', ms: 300 },
          ),
        arrangeScenes: () => {
          const pos = computeLayout(get().project)
          const moved = get().project.scenes.some((sc) => {
            const p = pos[sc.id]
            return p && (p.x !== sc.position.x || p.y !== sc.position.y)
          })
          if (!moved) return false
          // no coalesce key: exactly one history entry holding the previous project
          set((s) => ({
            project: {
              ...s.project,
              scenes: s.project.scenes.map((sc) => (pos[sc.id] ? { ...sc, position: pos[sc.id] } : sc)),
            },
          }))
          return true
        },
        setStart: (id) => set((s) => ({ project: { ...s.project, startSceneId: id } })),

        addTransition: (source, target) => {
          const exists = get().project.transitions.some((t) => t.source === source && t.target === target)
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
          set(
            (s) => ({
              project: {
                ...s.project,
                transitions: s.project.transitions.map((t) => (t.id === id ? { ...t, ...patch } : t)),
              },
            }),
            { key: `tr:${id}:${keysOf(patch)}` },
          ),
        updateDirection: (transitionId, patch) => {
          const project = get().project
          const tr = project.transitions.find((t) => t.id === transitionId)
          if (!tr) return false
          const src = project.scenes.find((x) => x.id === tr.source)
          const dst = project.scenes.find((x) => x.id === tr.target)
          if (patch.sourceShotId && !src?.shots.some((x) => x.id === patch.sourceShotId)) return false
          if (patch.targetShotId && !dst?.shots.some((x) => x.id === patch.targetShotId)) return false
          set(
            (s) => ({
              project: {
                ...s.project,
                transitions: s.project.transitions.map((t) =>
                  t.id === transitionId ? { ...t, direction: { ...(t.direction ?? transitionDirectionSchema.parse({})), ...patch } } : t,
                ),
              },
            }),
            { key: `dir:${transitionId}:${keysOf(patch)}` },
          )
          return true
        },
        clearDirection: (transitionId) =>
          set((s) => {
            const tr = s.project.transitions.find((t) => t.id === transitionId)
            if (!tr?.direction) return {}
            return {
              project: {
                ...s.project,
                transitions: s.project.transitions.map((t) => {
                  if (t.id !== transitionId) return t
                  const { direction, ...rest } = t
                  void direction
                  return rest
                }),
              },
            }
          }),
        deleteTransition: (id) =>
          set(
            (s) => {
              if (!s.project.transitions.some((t) => t.id === id)) return {}
              return {
                project: { ...s.project, transitions: s.project.transitions.filter((t) => t.id !== id) },
                selection: s.selection?.id === id ? null : s.selection,
              }
            },
            { key: 'delete', ms: 300 },
          ),

        setTimelineScene: (id) => rawSet({ timelineSceneId: id, selectedTriggerId: null }),
        selectTrigger: (id) => rawSet({ selectedTriggerId: id }),
        addTrigger: (sceneId, time) => {
          const t = newTrigger(Math.max(0, Math.round(time)), defaultNames())
          set((s) => ({
            project: mapScene(s.project, sceneId, (sc) => ({ ...sc, triggers: [...sc.triggers, t] })),
            selectedTriggerId: t.id,
          }))
          return t.id
        },
        updateTrigger: (sceneId, id, patch) =>
          set(
            (s) => ({
              project: mapScene(s.project, sceneId, (sc) => ({
                ...sc,
                triggers: sc.triggers.map((t) => (t.id === id ? { ...t, ...patch } : t)),
              })),
            }),
            { key: `trg:${id}:${keysOf(patch)}` },
          ),
        deleteTrigger: (sceneId, id) =>
          set((s) => ({
            project: mapScene(s.project, sceneId, (sc) => ({
              ...sc,
              triggers: sc.triggers.filter((t) => t.id !== id),
            })),
            selectedTriggerId: s.selectedTriggerId === id ? null : s.selectedTriggerId,
          })),

        addShot: (sceneId) => {
          const scene = get().project.scenes.find((x) => x.id === sceneId)
          const shot = newShot(nextStart(scene?.shots ?? []), defaultNames())
          set((s) => ({ project: mapScene(s.project, sceneId, (sc) => ({ ...sc, shots: [...sc.shots, shot] })) }))
          return shot.id
        },
        updateShot: (sceneId, id, patch) =>
          set(
            (s) => ({
              project: mapScene(s.project, sceneId, (sc) => ({
                ...sc,
                shots: sc.shots.map((x) => (x.id === id ? { ...x, ...patch } : x)),
              })),
            }),
            { key: `shot:${id}:${keysOf(patch)}` },
          ),
        deleteShot: (sceneId, id, opts) => {
          const project = get().project
          if (!project.scenes.find((x) => x.id === sceneId)?.shots.some((x) => x.id === id)) return false
          const refs = shotReferences(project, sceneId, id)
          if (refs.length > 0 && !opts?.clearReferences) return false
          set((s) => {
            const cleared = new Set(refs.map((r) => r.transitionId))
            return {
              project: {
                ...mapScene(s.project, sceneId, (sc) => ({ ...sc, shots: sc.shots.filter((x) => x.id !== id) })),
                transitions: s.project.transitions.map((t) => {
                  if (!cleared.has(t.id) || !t.direction) return t
                  const d = { ...t.direction }
                  if (t.source === sceneId && d.sourceShotId === id) d.sourceShotId = null
                  if (t.target === sceneId && d.targetShotId === id) d.targetShotId = null
                  return { ...t, direction: d }
                }),
              },
            }
          })
          return true
        },
        duplicateShot: (sceneId, id, copyTitle) => {
          const src = get().project.scenes.find((x) => x.id === sceneId)?.shots.find((x) => x.id === id)
          if (!src) return null
          const copy: Shot = { ...src, id: uid('shot'), title: copyTitle, start: Math.round((src.start + src.duration) * 100) / 100 }
          set((s) => ({
            project: mapScene(s.project, sceneId, (sc) => {
              const i = sc.shots.findIndex((x) => x.id === id)
              return { ...sc, shots: [...sc.shots.slice(0, i + 1), copy, ...sc.shots.slice(i + 1)] }
            }),
          }))
          return copy.id
        },
        moveShot: (sceneId, id, dir) => {
          const shots = get().project.scenes.find((x) => x.id === sceneId)?.shots ?? []
          const i = shots.findIndex((x) => x.id === id)
          const j = i + dir
          if (i < 0 || j < 0 || j >= shots.length) return
          set((s) => ({
            project: mapScene(s.project, sceneId, (sc) => {
              const next = [...sc.shots]
              ;[next[i], next[j]] = [next[j], next[i]]
              return { ...sc, shots: next }
            }),
          }))
        },
        sortShotsByTime: (sceneId) => {
          const shots = get().project.scenes.find((x) => x.id === sceneId)?.shots ?? []
          const sorted = sortedByTime(shots)
          if (sorted.every((x, i) => x === shots[i])) return
          set((s) => ({ project: mapScene(s.project, sceneId, (sc) => ({ ...sc, shots: sortedByTime(sc.shots) })) }))
        },

        addCharacter: () => {
          const c = newCharacter(defaultNames())
          set((s) => ({ project: { ...s.project, characters: [...s.project.characters, c] } }))
          return c.id
        },
        updateCharacter: (id, patch) =>
          set(
            (s) => ({
              project: {
                ...s.project,
                characters: s.project.characters.map((c) => (c.id === id ? { ...c, ...patch } : c)),
              },
            }),
            { key: `chr:${id}:${keysOf(patch)}` },
          ),
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
                      states: [...c.states, { id: uid('st'), name: defaultNames().state, behavior: '', aggression: 0 }],
                    }
                  : c,
              ),
            },
          })),
        updateCharacterState: (charId, stateId, patch) =>
          set(
            (s) => ({
              project: {
                ...s.project,
                characters: s.project.characters.map((c) =>
                  c.id === charId
                    ? { ...c, states: c.states.map((st) => (st.id === stateId ? { ...st, ...patch } : st)) }
                    : c,
                ),
              },
            }),
            { key: `st:${stateId}:${keysOf(patch)}` },
          ),
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
      }
    },
)
