import { create } from 'zustand'
import { emptyProject, newAudioCue, newCharacter, newComment, newLogicNode, newSceneType, newScene, newShot, newTransition, newTrigger, type DefaultNames } from '../lib/factory'
import { getLang } from '../i18n/store'
import { translate } from '../i18n'
import { uid } from '../lib/id'
import { loadLibrary, type LibraryIndex, type LoadNotice, type LoadedLibrary } from '../lib/library'
import { browserBackend, useSaveStatus } from '../lib/persist'
import type {
  AudioCue,
  BranchPort,
  Character,
  GraphComment,
  LogicNode,
  SceneType,
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
import { nextCueStart } from '../lib/audio'
import { nextStart, shotReferences, sortedByTime } from '../lib/shots'
import { transitionDirectionSchema } from '../lib/schema'
import { canConnect, linkDuration } from '../lib/graphRules'

export type View = 'graph' | 'timeline' | 'characters' | 'analysis' | 'simulator'
export type Selection = { type: 'scene' | 'edge' | 'node' | 'comment'; id: string } | null

/** What `addNodeFromPin` creates at the drop position. */
export type NewNodeSpec = { type: 'scene'; kind: SceneKind; typeId?: string } | { type: 'branch' }

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
    audioCue: translate(l, 'default.audioCue'),
    branch: translate(l, 'default.branch'),
    comment: translate(l, 'default.comment'),
    sceneType: translate(l, 'default.sceneType'),
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
  /** Timeline tab mode (session only). */
  timelineMode: 'triggers' | 'sequence'
  /** Id of a node whose Inspector field should take focus once (e.g. "Edit condition"). */
  inspectorFocus: string | null
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

  /** With `typeId` the scene takes the type's base kind and default description/duration. */
  addScene: (kind: SceneKind, position: { x: number; y: number }, typeId?: string) => string
  updateScene: (id: string, patch: Partial<Scene>) => void
  moveScene: (id: string, position: { x: number; y: number }) => void
  /** Moves a scene, IF node or comment. */
  moveNode: (id: string, position: { x: number; y: number }) => void
  deleteScene: (id: string) => void
  /** Deletes scenes, IF nodes and comments with all their connections in one undo step (other scene data is untouched). */
  deleteScenes: (ids: string[]) => void
  /** Copies a scene's content with fresh ids (no connections), offset to the right-bottom; returns the new id. */
  duplicateScene: (id: string, copySuffix: string) => string | null
  duplicateNode: (id: string) => string | null
  addLogicNode: (position: { x: number; y: number }) => string
  updateLogicNode: (id: string, patch: Partial<Omit<LogicNode, 'id' | 'type'>>) => void
  addComment: (position: { x: number; y: number }) => string
  updateComment: (id: string, patch: Partial<Omit<GraphComment, 'id'>>) => void
  /** Creates a node at `position` and connects `fromId` (output pin `fromPort`) to it in ONE undo step; null (nothing changes) when the connection is invalid. */
  addNodeFromPin: (spec: { fromId: string; fromPort?: BranchPort; position: { x: number; y: number }; node: NewNodeSpec }) => { nodeId: string; transitionId: string } | null
  /** Puts a new IF node between a connection's endpoints (the original connection id is kept and ends at the IF). Refused (null) when the connection carries a transition design. */
  insertBranchOnTransition: (transitionId: string) => string | null
  addSceneType: (baseKind?: SceneKind) => string
  /** `baseKind` can only change while no scene uses the type; returns false (nothing changes) otherwise. */
  updateSceneType: (id: string, patch: Partial<Omit<SceneType, 'id'>>) => boolean
  /** Refuses ('inUse', nothing changes) while scenes use the type unless `detach`; then the scenes keep their kind and only lose `typeId` (one undo step). */
  deleteSceneType: (id: string, opts?: { detach?: boolean }) => 'deleted' | 'inUse' | 'missing'
  /** `null` makes the scene a plain scene of its current kind. Applying a type sets the scene's kind to the type's base kind. */
  applySceneType: (sceneId: string, typeId: string | null, plainKind?: SceneKind) => boolean
  setStart: (id: string) => void
  /** Auto-arranges scene positions (positions only). One undo step; returns false when nothing moved. */
  arrangeScenes: () => boolean

  /** Connects two nodes (scene or IF node; `sourcePort` is required when `source` is an IF node). Returns null when `canConnect` refuses. */
  addTransition: (source: string, target: string, sourcePort?: BranchPort) => string | null
  /** Endpoints and output pin are fixed after creation (shot links in a direction depend on them). */
  updateTransition: (id: string, patch: Partial<Omit<Transition, 'source' | 'target' | 'sourcePort'>>) => void
  /** Creates the direction when absent and merges the patch. Refuses (false) shot links outside the transition's source/target scene. */
  updateDirection: (transitionId: string, patch: Partial<TransitionDirection>) => boolean
  /** Removes the direction of a transition (explicit, undoable). */
  clearDirection: (transitionId: string) => void
  deleteTransition: (id: string) => void

  setTimelineScene: (id: string | null) => void
  setTimelineMode: (m: 'triggers' | 'sequence') => void
  requestInspectorFocus: (id: string | null) => void
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

  /** Audio cues (planning notes; independent of triggers, ambience and shot sound notes). Authored timing is never changed implicitly. */
  addAudioCue: (sceneId: string) => string
  /** Refuses (false, nothing changes) values that would make the cue invalid (negative start/fades, non-positive duration, level outside 0–10). */
  updateAudioCue: (sceneId: string, id: string, patch: Partial<Omit<AudioCue, 'id'>>) => boolean
  deleteAudioCue: (sceneId: string, id: string) => void
  /** Inserts a copy right after the original, starting where the original ends. */
  duplicateAudioCue: (sceneId: string, id: string, copyTitle: string) => string | null
  /** Moves a cue one place in the authored order (timing untouched). */
  moveAudioCue: (sceneId: string, id: string, dir: -1 | 1) => void

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
  const nodes = new Set(project.logicNodes.map((x) => x.id))
  const comments = new Set(project.comments.map((x) => x.id))
  const sel = s.selection
  const selOk =
    !sel ||
    (sel.type === 'scene' ? scenes.has(sel.id) : sel.type === 'node' ? nodes.has(sel.id) : sel.type === 'comment' ? comments.has(sel.id) : edges.has(sel.id))
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
        timelineMode: 'triggers',
        inspectorFocus: null,
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

        addScene: (kind, position, typeId) => {
          const ty = typeId ? get().project.sceneTypes.find((x) => x.id === typeId) : undefined
          const scene = newScene(ty ? ty.baseKind : kind, position, defaultNames())
          if (ty) {
            scene.typeId = ty.id
            scene.title = ty.name
            if (ty.description) scene.description = ty.description
            if (ty.duration) scene.duration = ty.duration
          }
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
          set(
            (s) => ({
              project: mapScene(s.project, id, (sc) => {
                const next = { ...sc, ...patch }
                // a scene whose kind no longer matches its type's base kind becomes a plain scene
                const ty = next.typeId ? s.project.sceneTypes.find((x) => x.id === next.typeId) : undefined
                if (next.typeId && (!ty || ty.baseKind !== next.kind)) delete next.typeId
                return next
              }),
            }),
            { key: `scene:${id}:${keysOf(patch)}` },
          ),
        moveScene: (id, position) =>
          set((s) => ({ project: mapScene(s.project, id, (sc) => ({ ...sc, position })) }), {
            key: `move:${id}`,
          }),
        moveNode: (id, position) =>
          set(
            (s) => {
              const p = s.project
              if (p.scenes.some((x) => x.id === id)) return { project: mapScene(p, id, (sc) => ({ ...sc, position })) }
              if (p.logicNodes.some((x) => x.id === id)) return { project: { ...p, logicNodes: p.logicNodes.map((n) => (n.id === id ? { ...n, position } : n)) } }
              if (p.comments.some((x) => x.id === id)) return { project: { ...p, comments: p.comments.map((c) => (c.id === id ? { ...c, position } : c)) } }
              return {}
            },
            { key: `move:${id}` },
          ),
        deleteScene: (id) => get().deleteScenes([id]),
        deleteScenes: (ids) =>
          set(
            (s) => {
              const p = s.project
              const gone = new Set(
                ids.filter((id) => p.scenes.some((x) => x.id === id) || p.logicNodes.some((x) => x.id === id) || p.comments.some((x) => x.id === id)),
              )
              if (gone.size === 0) return {}
              const scenes = p.scenes.filter((x) => !gone.has(x.id))
              return {
                project: {
                  ...p,
                  scenes,
                  logicNodes: p.logicNodes.filter((x) => !gone.has(x.id)),
                  comments: p.comments.filter((x) => !gone.has(x.id)),
                  transitions: p.transitions.filter((t) => !gone.has(t.source) && !gone.has(t.target)),
                  startSceneId: p.startSceneId && gone.has(p.startSceneId) ? (scenes[0]?.id ?? null) : p.startSceneId,
                },
                selection: s.selection && gone.has(s.selection.id) ? null : s.selection,
                timelineSceneId:
                  s.timelineSceneId && gone.has(s.timelineSceneId) ? (scenes[0]?.id ?? null) : s.timelineSceneId,
              }
            },
            // React Flow reports a Delete keypress as several events; fold them into one step.
            { key: 'delete', ms: 300 },
          ),
        duplicateScene: (id, copySuffix) => {
          const src = get().project.scenes.find((x) => x.id === id)
          if (!src) return null
          const copy: Scene = {
            ...structuredClone(src),
            id: uid('scene'),
            title: `${src.title} ${copySuffix}`.trim(),
            position: { x: src.position.x + 40, y: src.position.y + 60 },
            triggers: src.triggers.map((t) => ({ ...t, id: uid('trg') })),
            shots: src.shots.map((x) => ({ ...x, id: uid('shot') })),
            audioCues: src.audioCues.map((c) => ({ ...c, id: uid('cue') })),
          }
          set((s) => ({ project: { ...s.project, scenes: [...s.project.scenes, copy] }, selection: { type: 'scene', id: copy.id } }))
          return copy.id
        },
        duplicateNode: (id) => {
          const p = get().project
          const n = p.logicNodes.find((x) => x.id === id)
          const c = p.comments.find((x) => x.id === id)
          if (n) {
            const copy: LogicNode = { ...n, id: uid('if'), position: { x: n.position.x + 40, y: n.position.y + 60 } }
            set((s) => ({ project: { ...s.project, logicNodes: [...s.project.logicNodes, copy] }, selection: { type: 'node', id: copy.id } }))
            return copy.id
          }
          if (c) {
            const copy: GraphComment = { ...c, id: uid('note'), position: { x: c.position.x + 40, y: c.position.y + 60 } }
            set((s) => ({ project: { ...s.project, comments: [...s.project.comments, copy] }, selection: { type: 'comment', id: copy.id } }))
            return copy.id
          }
          return null
        },
        addLogicNode: (position) => {
          const n = newLogicNode(position, defaultNames())
          set((s) => ({ project: { ...s.project, logicNodes: [...s.project.logicNodes, n] }, selection: { type: 'node', id: n.id } }))
          return n.id
        },
        updateLogicNode: (id, patch) =>
          set(
            (s) => ({ project: { ...s.project, logicNodes: s.project.logicNodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) } }),
            { key: `node:${id}:${keysOf(patch)}` },
          ),
        addComment: (position) => {
          const c = newComment(position, defaultNames())
          set((s) => ({ project: { ...s.project, comments: [...s.project.comments, c] }, selection: { type: 'comment', id: c.id } }))
          return c.id
        },
        updateComment: (id, patch) =>
          set(
            (s) => ({ project: { ...s.project, comments: s.project.comments.map((c) => (c.id === id ? { ...c, ...patch } : c)) } }),
            { key: `comment:${id}:${keysOf(patch)}` },
          ),
        addNodeFromPin: ({ fromId, fromPort, position, node }) => {
          const base = get().project
          let newScenes = base.scenes
          let newBranches = base.logicNodes
          let nodeId: string
          if (node.type === 'branch') {
            const n = newLogicNode(position, defaultNames())
            newBranches = [...base.logicNodes, n]
            nodeId = n.id
          } else {
            const ty = node.typeId ? base.sceneTypes.find((x) => x.id === node.typeId) : undefined
            const sc = newScene(ty ? ty.baseKind : node.kind, position, defaultNames())
            if (ty) {
              sc.typeId = ty.id
              sc.title = ty.name
              if (ty.description) sc.description = ty.description
              if (ty.duration) sc.duration = ty.duration
            }
            newScenes = [...base.scenes, sc]
            nodeId = sc.id
          }
          const draft: Project = { ...base, scenes: newScenes, logicNodes: newBranches }
          if (!canConnect(draft, { source: fromId, sourcePort: fromPort, target: nodeId }).ok) return null
          const t = newTransition(fromId, nodeId)
          t.duration = linkDuration(draft, fromId)
          if (fromPort) t.sourcePort = fromPort
          set((s) => ({
            project: {
              ...s.project,
              scenes: newScenes,
              logicNodes: newBranches,
              transitions: [...s.project.transitions, t],
              startSceneId: s.project.startSceneId ?? (node.type === 'scene' ? nodeId : null),
            },
            selection: { type: node.type === 'scene' ? 'scene' : 'node', id: nodeId },
          }))
          return { nodeId, transitionId: t.id }
        },
        insertBranchOnTransition: (transitionId) => {
          const p = get().project
          const tr = p.transitions.find((t) => t.id === transitionId)
          if (!tr || tr.direction) return null
          const at = (id: string) => p.scenes.find((x) => x.id === id)?.position ?? p.logicNodes.find((x) => x.id === id)?.position
          const a = at(tr.source)
          const b = at(tr.target)
          if (!a || !b) return null
          const node = newLogicNode({ x: Math.round((a.x + b.x) / 2), y: Math.round((a.y + b.y) / 2) + 80 }, defaultNames())
          const out = newTransition(node.id, tr.target)
          out.duration = 0
          out.sourcePort = 'true'
          set((s) => ({
            project: {
              ...s.project,
              logicNodes: [...s.project.logicNodes, node],
              transitions: [
                ...s.project.transitions.map((t) => (t.id === transitionId ? { ...t, target: node.id } : t)),
                out,
              ],
            },
            selection: { type: 'node', id: node.id },
          }))
          return node.id
        },
        addSceneType: (baseKind = 'reality') => {
          const ty = newSceneType(baseKind, defaultNames())
          set((s) => ({ project: { ...s.project, sceneTypes: [...s.project.sceneTypes, ty] } }))
          return ty.id
        },
        updateSceneType: (id, patch) => {
          const p = get().project
          const ty = p.sceneTypes.find((x) => x.id === id)
          if (!ty) return false
          if (patch.baseKind !== undefined && patch.baseKind !== ty.baseKind && p.scenes.some((x) => x.typeId === id)) return false
          if (patch.name !== undefined && !patch.name.trim()) return false
          set(
            (s) => ({ project: { ...s.project, sceneTypes: s.project.sceneTypes.map((x) => (x.id === id ? { ...x, ...patch } : x)) } }),
            { key: `stype:${id}:${keysOf(patch)}` },
          )
          return true
        },
        deleteSceneType: (id, opts) => {
          const p = get().project
          if (!p.sceneTypes.some((x) => x.id === id)) return 'missing'
          if (p.scenes.some((x) => x.typeId === id) && !opts?.detach) return 'inUse'
          set((s) => ({
            project: {
              ...s.project,
              sceneTypes: s.project.sceneTypes.filter((x) => x.id !== id),
              scenes: s.project.scenes.map((sc) => {
                if (sc.typeId !== id) return sc
                const { typeId, ...rest } = sc
                void typeId
                return rest
              }),
            },
          }))
          return 'deleted'
        },
        applySceneType: (sceneId, typeId, plainKind) => {
          const p = get().project
          if (!p.scenes.some((x) => x.id === sceneId)) return false
          const ty = typeId ? p.sceneTypes.find((x) => x.id === typeId) : undefined
          if (typeId && !ty) return false
          set((s) => ({
            project: mapScene(s.project, sceneId, (sc) => {
              const { typeId: old, ...rest } = sc
              void old
              return ty ? { ...rest, kind: ty.baseKind, typeId: ty.id } : plainKind ? { ...rest, kind: plainKind } : rest
            }),
          }))
          return true
        },
        arrangeScenes: () => {
          const pos = computeLayout(get().project)
          const differs = (n: { id: string; position: { x: number; y: number } }) => {
            const p = pos[n.id]
            return !!p && (p.x !== n.position.x || p.y !== n.position.y)
          }
          const moved = get().project.scenes.some(differs) || get().project.logicNodes.some(differs)
          if (!moved) return false
          // no coalesce key: exactly one history entry holding the previous project
          set((s) => ({
            project: {
              ...s.project,
              scenes: s.project.scenes.map((sc) => (pos[sc.id] ? { ...sc, position: pos[sc.id] } : sc)),
              logicNodes: s.project.logicNodes.map((n) => (pos[n.id] ? { ...n, position: pos[n.id] } : n)),
            },
          }))
          return true
        },
        setStart: (id) => set((s) => ({ project: { ...s.project, startSceneId: id } })),

        addTransition: (source, target, sourcePort) => {
          const p = get().project
          if (!canConnect(p, { source, sourcePort, target }).ok) return null
          const t = newTransition(source, target)
          t.duration = linkDuration(p, source)
          if (sourcePort) t.sourcePort = sourcePort
          if (source === target) t.style = 'loopback'
          set((s) => ({
            project: { ...s.project, transitions: [...s.project.transitions, t] },
            selection: { type: 'edge', id: t.id },
          }))
          return t.id
        },
        updateTransition: (id, patch) => {
          // endpoints and the output pin are fixed at runtime too (not only by the type)
          const { source, target, sourcePort, ...safe } = patch as typeof patch & { source?: string; target?: string; sourcePort?: string }
          void source, void target, void sourcePort
          set(
            (s) => ({
              project: {
                ...s.project,
                transitions: s.project.transitions.map((t) => (t.id === id ? { ...t, ...safe } : t)),
              },
            }),
            { key: `tr:${id}:${keysOf(safe)}` },
          )
        },
        updateDirection: (transitionId, patch) => {
          const project = get().project
          const tr = project.transitions.find((t) => t.id === transitionId)
          if (!tr) return false
          const src = project.scenes.find((x) => x.id === tr.source)
          const dst = project.scenes.find((x) => x.id === tr.target)
          if (!src || !dst) return false // links touching an IF node carry no transition design
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

        setTimelineMode: (timelineMode) => rawSet({ timelineMode }),
        requestInspectorFocus: (inspectorFocus) => rawSet({ inspectorFocus }),
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

        addAudioCue: (sceneId) => {
          const scene = get().project.scenes.find((x) => x.id === sceneId)
          const cue = newAudioCue(nextCueStart(scene?.audioCues ?? []), defaultNames())
          set((s) => ({ project: mapScene(s.project, sceneId, (sc) => ({ ...sc, audioCues: [...sc.audioCues, cue] })) }))
          return cue.id
        },
        updateAudioCue: (sceneId, id, patch) => {
          if (!get().project.scenes.find((x) => x.id === sceneId)?.audioCues.some((x) => x.id === id)) return false
          const bad =
            (patch.start !== undefined && !(patch.start >= 0)) ||
            (patch.duration !== undefined && !(patch.duration > 0)) ||
            (patch.fadeIn !== undefined && !(patch.fadeIn >= 0)) ||
            (patch.fadeOut !== undefined && !(patch.fadeOut >= 0)) ||
            (patch.level !== undefined && !(patch.level >= 0 && patch.level <= 10))
          if (bad) return false
          set(
            (s) => ({
              project: mapScene(s.project, sceneId, (sc) => ({
                ...sc,
                audioCues: sc.audioCues.map((x) => (x.id === id ? { ...x, ...patch } : x)),
              })),
            }),
            { key: `audio:${id}:${keysOf(patch)}` },
          )
          return true
        },
        deleteAudioCue: (sceneId, id) =>
          set((s) => ({ project: mapScene(s.project, sceneId, (sc) => ({ ...sc, audioCues: sc.audioCues.filter((x) => x.id !== id) })) })),
        duplicateAudioCue: (sceneId, id, copyTitle) => {
          const src = get().project.scenes.find((x) => x.id === sceneId)?.audioCues.find((x) => x.id === id)
          if (!src) return null
          const copy: AudioCue = { ...src, id: uid('cue'), title: copyTitle, start: Math.round((src.start + src.duration) * 100) / 100 }
          set((s) => ({
            project: mapScene(s.project, sceneId, (sc) => {
              const i = sc.audioCues.findIndex((x) => x.id === id)
              return { ...sc, audioCues: [...sc.audioCues.slice(0, i + 1), copy, ...sc.audioCues.slice(i + 1)] }
            }),
          }))
          return copy.id
        },
        moveAudioCue: (sceneId, id, dir) => {
          const cues = get().project.scenes.find((x) => x.id === sceneId)?.audioCues ?? []
          const i = cues.findIndex((x) => x.id === id)
          const j = i + dir
          if (i < 0 || j < 0 || j >= cues.length) return
          set((s) => ({
            project: mapScene(s.project, sceneId, (sc) => {
              const next = [...sc.audioCues]
              ;[next[i], next[j]] = [next[j], next[i]]
              return { ...sc, audioCues: next }
            }),
          }))
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
