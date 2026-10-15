import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Background,
  BackgroundVariant,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  getBezierPath,
  getViewportForBounds,
  Handle,
  MarkerType,
  MiniMap,
  NodeResizer,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type ConnectionLineComponentProps,
  type Edge,
  type EdgeChange,
  type EdgeProps,
  type FinalConnectionState,
  type Node,
  type NodeChange,
  type NodeProps,
} from '@xyflow/react'
import { Clapperboard, Copy, Flag, FlagTriangleRight, GitBranch, Focus, Maximize, Network, Pencil, Plus, Repeat, StickyNote, Trash2, Volume2, Zap } from 'lucide-react'
import { useStore, type NewNodeSpec } from '../store/useStore'
import { BRANCH_PORTS, SCENE_KINDS, crossingOf, type BranchPort, type GraphComment, type LogicNode, type Scene, type SceneType, type TransitionStyle } from '../lib/schema'
import { KIND_COLOR } from '../lib/theme'
import { useT } from '../i18n/store'
import { analyze } from '../lib/graph'
import { edgeGeometry } from '../lib/edgePath'
import { NODE_H, NODE_W } from '../lib/layout'
import { canConnect, type ConnectReason } from '../lib/graphRules'
import { TYPE_ICON_COMPONENTS } from '../lib/sceneTypes'
import { ContextMenu, isEditableTarget, longPressHandlers, useContextMenu, type MenuItem } from './ContextMenu'
import { useExprText } from './useExprText'
import { ShotPlannerDialog } from './ShotPlannerDialog'
import { AudioPlannerDialog } from './AudioPlannerDialog'

const PORT_COLOR: Record<BranchPort, string> = { true: '#6ee7a1', false: '#ff6b7d' }
const LOGIC_COLOR = '#e0af68'
const SET_COLOR = '#5fd6c4'
/** Vertical centre of the first pin row (head height + half a row) and the row pitch. */
const PIN_TOP = 47
const PIN_PITCH = 26

type SceneNodeData = {
  scene: Scene
  sceneType?: SceneType
  isStart: boolean
  unreachable: boolean
  chips: { id: string; name: string; color: string; state: string }[]
}
type BranchNodeData = { node: LogicNode; unreachable: boolean }
type SetFlagNodeData = { node: LogicNode; unreachable: boolean; flagName: string | null }
type CommentNodeData = { comment: GraphComment }
type SceneFlowNode = Node<SceneNodeData, 'scene'>
type BranchFlowNode = Node<BranchNodeData, 'branch'>
type SetFlagFlowNode = Node<SetFlagNodeData, 'setFlag'>
type CommentFlowNode = Node<CommentNodeData, 'comment'>
type FlowNode = SceneFlowNode | BranchFlowNode | SetFlagFlowNode | CommentFlowNode

function SceneNode({ data, selected }: NodeProps<SceneFlowNode>) {
  const { scene, sceneType, isStart, unreachable, chips } = data
  const { t } = useT()
  const Icon = sceneType ? TYPE_ICON_COMPONENTS[sceneType.icon] : null
  return (
    <div
      className={`bp-node bp-scene scene-node${selected ? ' selected' : ''}${unreachable ? ' unreachable' : ''}`}
      data-kind={scene.kind}
      data-type-id={scene.typeId}
      style={{ ['--kind' as string]: KIND_COLOR[scene.kind], ['--accent' as string]: sceneType?.color ?? KIND_COLOR[scene.kind] }}
    >
      <div className="bp-head scene-node-head">
        {Icon ? <Icon size={13} style={{ color: sceneType!.color }} aria-hidden="true" /> : <span className="kind-dot" />}
        <span className="scene-node-kind">{t(`kind.${scene.kind}`)}</span>
        {sceneType && <span className="bp-type-pill" data-testid="scene-type-pill" style={{ ['--c' as string]: sceneType.color }}>{sceneType.name}</span>}
        <span className="scene-node-badges">
          {isStart && (
            <span title={t('node.start')} className="badge start">
              <Flag size={11} />
            </span>
          )}
          {scene.loop.enabled && (
            <span title={t('node.loops')} className="badge loop">
              <Repeat size={11} />
            </span>
          )}
          {scene.triggers.length > 0 && (
            <span title={t('node.triggers', { n: scene.triggers.length })} className="badge trig">
              <Zap size={11} /> {scene.triggers.length}
            </span>
          )}
        </span>
      </div>
      <Handle id="in" type="target" position={Position.Left} className="bp-handle exec" style={{ top: PIN_TOP }} aria-label={t('pin.in')} />
      <Handle id="out" type="source" position={Position.Right} className="bp-handle exec" style={{ top: PIN_TOP }} aria-label={t('pin.out')} />
      <div className="bp-pinrow">
        <span className="bp-pinlabel">{t('pin.in')}</span>
        <span className="bp-pinlabel">{t('pin.out')}</span>
      </div>
      <div className="scene-node-title">{scene.title || t('scene.untitled')}</div>
      {scene.unrealLevel && <div className="scene-node-sub">{scene.unrealLevel}</div>}
      {chips.length > 0 && (
        <div className="scene-node-chips">
          {chips.map((c) => (
            <span key={c.id} className="chip" style={{ ['--c' as string]: c.color }} title={c.name}>
              {c.name.split(' ')[0]}: {c.state}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function BranchNode({ data, selected }: NodeProps<BranchFlowNode>) {
  const { node, unreachable } = data
  const { t } = useT()
  const exprText = useExprText()
  return (
    <div className={`bp-node bp-branch${selected ? ' selected' : ''}${unreachable ? ' unreachable' : ''}`} data-testid="branch-node" style={{ ['--kind' as string]: LOGIC_COLOR, ['--accent' as string]: LOGIC_COLOR }}>
      <div className="bp-head">
        <GitBranch size={13} aria-hidden="true" />
        <span className="bp-title">{node.title || t('default.branch')}</span>
        <span className="badge">{t('branch.badge')}</span>
      </div>
      <Handle id="in" type="target" position={Position.Left} className="bp-handle exec" style={{ top: PIN_TOP }} aria-label={t('pin.in')} />
      {BRANCH_PORTS.map((port, i) => (
        <Handle
          key={port}
          id={port}
          type="source"
          position={Position.Right}
          className={`bp-handle port-${port}`}
          data-port={port}
          style={{ top: PIN_TOP + i * PIN_PITCH, background: PORT_COLOR[port] }}
          aria-label={t(`pin.${port}`)}
        />
      ))}
      <div className="bp-branch-pins">
        <span className="bp-pinlabel">{t('pin.in')}</span>
        <span className="bp-branch-outs">
          <span className="bp-pinlabel out true" style={{ color: PORT_COLOR.true }}>{t('pin.true')}</span>
          <span className="bp-pinlabel out false" style={{ color: PORT_COLOR.false }}>{t('pin.false')}</span>
        </span>
      </div>
      {node.expression && (
        <div className="bp-expr" data-testid="branch-expression" title={exprText(node.expression)}>
          <span className="badge">{t('expr.badge')}</span> {exprText(node.expression)}
        </div>
      )}
      <div className={`bp-condition${node.condition.trim() ? '' : ' empty'}`} data-testid="branch-condition">
        {node.condition.trim() || (node.expression ? '' : t('branch.noCondition'))}
      </div>
    </div>
  )
}

function SetFlagNode({ data, selected }: NodeProps<SetFlagFlowNode>) {
  const { node, unreachable, flagName } = data
  const { t } = useT()
  return (
    <div className={`bp-node bp-setflag${selected ? ' selected' : ''}${unreachable ? ' unreachable' : ''}`} data-testid="setflag-node" style={{ ['--kind' as string]: SET_COLOR, ['--accent' as string]: SET_COLOR }}>
      <div className="bp-head">
        <FlagTriangleRight size={13} aria-hidden="true" />
        <span className="bp-title">{node.title || t('default.setFlag')}</span>
        <span className="badge">{t('setflag.badge')}</span>
      </div>
      <Handle id="in" type="target" position={Position.Left} className="bp-handle exec" style={{ top: PIN_TOP }} aria-label={t('pin.in')} />
      <Handle id="out" type="source" position={Position.Right} className="bp-handle exec" style={{ top: PIN_TOP }} aria-label={t('pin.out')} />
      <div className="bp-pinrow">
        <span className="bp-pinlabel">{t('pin.in')}</span>
        <span className="bp-pinlabel">{t('pin.out')}</span>
      </div>
      <div className={`bp-assign${flagName ? '' : ' empty'}`} data-testid="setflag-assign">
        {flagName ? (
          <>
            <span className="bp-assign-name">{flagName}</span> = <span className={`bp-bool ${node.value ? 'on' : 'off'}`}>{node.value ? t('bool.true') : t('bool.false')}</span>
          </>
        ) : (
          t('setflag.noFlag')
        )}
      </div>
    </div>
  )
}

function CommentNode({ data, selected }: NodeProps<CommentFlowNode>) {
  const { comment } = data
  const updateComment = useStore((s) => s.updateComment)
  return (
    <div className={`bp-comment${selected ? ' selected' : ''}`} data-testid="comment-node" style={{ ['--c' as string]: comment.color }}>
      <NodeResizer
        isVisible={selected}
        minWidth={120}
        minHeight={80}
        onResizeEnd={(_, p) => updateComment(comment.id, { width: Math.round(p.width), height: Math.round(p.height), position: { x: Math.round(p.x), y: Math.round(p.y) } })}
      />
      <div className="bp-comment-title"><StickyNote size={12} aria-hidden="true" /> {comment.title}</div>
      {comment.text && <div className="bp-comment-text">{comment.text}</div>}
    </div>
  )
}

type TransitionData = {
  label: string
  style: string
  crossing: string
  selfLoop: boolean
  color: string
  port?: BranchPort
  /** The opposite ordered pair also exists. */
  reciprocal: boolean
  /** Stable 0/1 tie-break (from ids) so a reciprocal pair routes on different lanes. */
  rank: 0 | 1
}
type TransitionFlowEdge = Edge<TransitionData, 'transition'>

function TransitionEdge(props: EdgeProps<TransitionFlowEdge>) {
  const { id, sourceX, sourceY, targetX, targetY, data, selected } = props
  const d = data!
  const { t } = useT()
  const select = useStore((s) => s.select)
  const geo = edgeGeometry({
    sx: sourceX,
    sy: sourceY,
    tx: targetX,
    ty: targetY,
    self: d.selfLoop,
    reciprocal: d.reciprocal,
    rank: d.rank,
  })
  const crossing = d.crossing !== 'same-layer'
  const text = d.label || (d.port ? '' : t(`style.${d.style as TransitionStyle}`))
  return (
    <>
      <BaseEdge
        id={id}
        path={geo.d}
        markerEnd={`url(#arrow-${id})`}
        interactionWidth={22}
        className="bp-wire"
        style={{
          stroke: d.color,
          strokeWidth: selected ? 3 : 2,
          strokeDasharray: crossing ? '7 5' : undefined,
          filter: selected ? `drop-shadow(0 0 6px ${d.color})` : undefined,
        }}
      />
      <defs>
        <marker id={`arrow-${id}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill={d.color} />
        </marker>
      </defs>
      {(text || d.port) && (
        <EdgeLabelRenderer>
          <div
            className={`edge-label nodrag nopan${selected ? ' selected' : ''}`}
            data-testid="edge-label"
            data-edge-id={id}
            data-port={d.port}
            title={text}
            style={{ transform: `translate(-50%, -50%) translate(${geo.labelX}px, ${geo.labelY}px)`, borderColor: d.color }}
            onClick={() => select({ type: 'edge', id })}
          >
            {d.port && <strong style={{ color: PORT_COLOR[d.port] }}>{t(`pin.${d.port}`)}{text ? ' · ' : ''}</strong>}
            {d.crossing === 'reality->dream' && <span title={t('crossing.down')}>↓ </span>}
            {d.crossing === 'dream->reality' && <span title={t('crossing.up')}>↑ </span>}
            {text}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

/** Connection preview coloured by validity (checked before the wire is committed). */
function ConnectionLine({ fromX, fromY, toX, toY, connectionStatus, fromPosition, toPosition }: ConnectionLineComponentProps) {
  const [path] = getBezierPath({ sourceX: fromX, sourceY: fromY, targetX: toX, targetY: toY, sourcePosition: fromPosition ?? Position.Right, targetPosition: toPosition ?? Position.Left })
  const color = connectionStatus === 'valid' ? '#6ee7a1' : connectionStatus === 'invalid' ? '#ff6b7d' : '#cfc7e0'
  return (
    <g data-testid="connection-line" data-status={connectionStatus ?? 'none'}>
      <path d={path} fill="none" stroke={color} strokeWidth={2.5} strokeDasharray="6 4" />
      <circle cx={toX} cy={toY} r={5} fill={color} />
    </g>
  )
}

const nodeTypes = { scene: SceneNode, branch: BranchNode, setFlag: SetFlagNode, comment: CommentNode }
const edgeTypes = { transition: TransitionEdge }
const isPort = (v: unknown): v is BranchPort => v === 'true' || v === 'false'

type Pending = { x: number; y: number; from?: { id: string; port?: BranchPort } }

function Canvas() {
  const project = useStore((s) => s.project)
  const selection = useStore((s) => s.selection)
  const select = useStore((s) => s.select)
  const store = useStore.getState
  const rf = useReactFlow()
  const { t } = useT()
  const sceneCount = useStore((s) => s.project.scenes.length + s.project.logicNodes.length)
  const [arrangeMsg, setArrangeMsg] = useState('')
  const [notice, setNotice] = useState('')
  // Node sizes measured by React Flow (kept in session state, never in the project) so the minimap can draw the nodes.
  const [dims, setDims] = useState<Record<string, { width: number; height: number }>>({})
  const [planner, setPlanner] = useState<{ kind: 'shot' | 'audio'; sceneId: string } | null>(null)
  const { menu, open, close } = useContextMenu()
  const wrapRef = useRef<HTMLDivElement>(null)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const analysis = useMemo(() => analyze(project), [project])
  const typeById = useMemo(() => new Map(project.sceneTypes.map((x) => [x.id, x])), [project.sceneTypes])

  const say = useCallback((msg: string) => {
    setNotice(msg)
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => setNotice(''), 4000)
  }, [])
  useEffect(() => () => void (noticeTimer.current && clearTimeout(noticeTimer.current)), [])
  const rejected = (reason: ConnectReason) => say(t(`connect.${reason}`))

  const nodes: FlowNode[] = useMemo(() => {
    const hasStart = !!project.startSceneId
    const comments: CommentFlowNode[] = project.comments.map((comment) => ({
      id: comment.id,
      type: 'comment' as const,
      position: comment.position,
      selected: selection?.type === 'comment' && selection.id === comment.id,
      zIndex: -1,
      measured: dims[comment.id],
      style: { width: comment.width, height: comment.height },
      data: { comment },
    }))
    const scenes: SceneFlowNode[] = project.scenes.map((scene) => ({
      id: scene.id,
      type: 'scene' as const,
      position: scene.position,
      measured: dims[scene.id],
      selected: selection?.type === 'scene' && selection.id === scene.id,
      data: {
        scene,
        sceneType: scene.typeId ? typeById.get(scene.typeId) : undefined,
        isStart: project.startSceneId === scene.id,
        unreachable: hasStart && !analysis.reachable.has(scene.id),
        chips: Object.entries(scene.characterStates).flatMap(([cid, sid]) => {
          const c = project.characters.find((c) => c.id === cid)
          const st = c?.states.find((s) => s.id === sid)
          return c && st ? [{ id: cid, name: c.name, color: c.color, state: st.name }] : []
        }),
      },
    }))
    const branches: (BranchFlowNode | SetFlagFlowNode)[] = project.logicNodes.map((node) =>
      node.type === 'setFlag'
        ? ({
            id: node.id,
            type: 'setFlag' as const,
            position: node.position,
            measured: dims[node.id],
            selected: selection?.type === 'node' && selection.id === node.id,
            data: { node, unreachable: hasStart && !analysis.reachable.has(node.id), flagName: project.flags.find((f) => f.id === node.flagId)?.name ?? null },
          } satisfies SetFlagFlowNode)
        : ({
            id: node.id,
            type: 'branch' as const,
            position: node.position,
            measured: dims[node.id],
            selected: selection?.type === 'node' && selection.id === node.id,
            data: { node, unreachable: hasStart && !analysis.reachable.has(node.id) },
          } satisfies BranchFlowNode),
    )
    return [...comments, ...scenes, ...branches]
  }, [project, selection, analysis, typeById, dims])

  const edges: TransitionFlowEdge[] = useMemo(() => {
    const kind = new Map(project.scenes.map((s) => [s.id, s.kind]))
    const logic = new Set(project.logicNodes.map((n) => n.id))
    const pairs = new Set(project.transitions.map((t) => `${t.source}\u0000${t.target}`))
    return project.transitions.map((tr) => {
      const a = kind.get(tr.source)
      const b = kind.get(tr.target)
      const crossing = a && b ? crossingOf(a, b) : 'same-layer'
      const color = tr.sourcePort
        ? PORT_COLOR[tr.sourcePort]
        : logic.has(tr.target)
          ? LOGIC_COLOR
          : crossing === 'same-layer'
            ? KIND_COLOR[b ?? 'reality']
            : crossing === 'reality->dream'
              ? '#d98cff'
              : '#f0c36d'
      return {
        id: tr.id,
        source: tr.source,
        target: tr.target,
        sourceHandle: tr.sourcePort ?? 'out',
        targetHandle: 'in',
        type: 'transition' as const,
        selected: selection?.type === 'edge' && selection.id === tr.id,
        markerEnd: { type: MarkerType.ArrowClosed },
        data: {
          label: tr.label,
          style: tr.style,
          crossing,
          selfLoop: tr.source === tr.target,
          color,
          port: tr.sourcePort,
          reciprocal: tr.source !== tr.target && pairs.has(`${tr.target}\u0000${tr.source}`),
          rank: (tr.source < tr.target ? 0 : 1) as 0 | 1,
        },
      }
    })
  }, [project, selection])

  const typeOf = (id: string): 'scene' | 'node' | 'comment' =>
    project.logicNodes.some((n) => n.id === id) ? 'node' : project.comments.some((c) => c.id === id) ? 'comment' : 'scene'

  const onNodesChange = useCallback((changes: NodeChange<FlowNode>[]) => {
    const removed: string[] = []
    const measured: Record<string, { width: number; height: number }> = {}
    for (const c of changes) {
      if (c.type === 'dimensions' && c.dimensions) measured[c.id] = { width: c.dimensions.width, height: c.dimensions.height }
      if (c.type === 'position' && c.position) store().moveNode(c.id, c.position)
      else if (c.type === 'remove') removed.push(c.id)
    }
    if (removed.length) store().deleteScenes(removed)
    if (Object.keys(measured).length)
      setDims((d) => {
        const next = { ...d }
        let changed = false
        for (const [id, m] of Object.entries(measured))
          if (d[id]?.width !== m.width || d[id]?.height !== m.height) {
            next[id] = m
            changed = true
          }
        return changed ? next : d
      })
  }, [store])
  const onEdgesChange = useCallback((changes: EdgeChange<TransitionFlowEdge>[]) => {
    for (const c of changes) if (c.type === 'remove') store().deleteTransition(c.id)
  }, [store])

  const connectionOf = (c: { source: string; target: string; sourceHandle?: string | null }) => ({
    source: c.source,
    sourcePort: isPort(c.sourceHandle) ? c.sourceHandle : undefined,
    target: c.target,
  })
  const isValidConnection = useCallback(
    (c: Connection | Edge) => canConnect(useStore.getState().project, connectionOf(c)).ok,
    [],
  )
  const onConnect = useCallback(
    (c: Connection) => {
      const r = canConnect(store().project, connectionOf(c))
      if (!r.ok) return rejected(r.reason)
      store().addTransition(c.source, c.target, connectionOf(c).sourcePort)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, t],
  )

  /** Fits the arranged graph incl. the room self-loop arcs (above) and back-edge arcs (below) need. */
  const fitArranged = () => {
    const p = useStore.getState().project
    const pts = [...p.scenes.map((x) => x.position), ...p.logicNodes.map((x) => x.position)]
    if (pts.length === 0) return
    const xs = pts.map((q) => q.x)
    const ys = pts.map((q) => q.y)
    const minX = Math.min(...xs)
    const minY = Math.min(...ys)
    const bounds = {
      x: minX - 60,
      y: minY - 170,
      width: Math.max(...xs) + NODE_W - minX + 120,
      height: Math.max(...ys) + NODE_H - minY + 170 + 200,
    }
    const el = document.querySelector('.react-flow')
    const vp = getViewportForBounds(bounds, el?.clientWidth ?? 900, el?.clientHeight ?? 600, 0.2, 1, 0.04)
    void rf.setViewport(vp, { duration: 300 })
  }
  const autoArrange = () => {
    const moved = store().arrangeScenes()
    setArrangeMsg(moved ? t('graph.arranged') : t('graph.alreadyArranged'))
    // viewport only: positions live in the project and are never read back from the viewport
    if (moved) setTimeout(fitArranged, 50)
  }

  const centerPoint = () => {
    const r = wrapRef.current?.getBoundingClientRect()
    return { x: (r?.left ?? 0) + (r?.width ?? 600) / 2 - 90 + Math.random() * 40, y: (r?.top ?? 0) + (r?.height ?? 400) / 2 - 40 + Math.random() * 40 }
  }
  const flowAt = (x: number, y: number) => rf.screenToFlowPosition({ x, y })

  /** Creates a node at a screen point; with `from` it is connected in the same undoable step. */
  const create = (spec: NewNodeSpec | { type: 'comment' }, x: number, y: number, from?: Pending['from']) => {
    const pos = flowAt(x, y)
    const s = store()
    if (spec.type === 'comment') return void s.addComment(pos)
    if (from) {
      const r = s.addNodeFromPin({ fromId: from.id, fromPort: from.port, position: pos, node: spec })
      if (!r) say(t(from.port ? 'connect.portTaken' : 'connect.outputTaken'))
      return
    }
    if (spec.type === 'branch' || spec.type === 'setFlag') return void s.addLogicNode(pos, spec.type)
    s.addScene(spec.kind, pos, spec.typeId)
  }

  /** Searchable, categorized creation list (compatible targets only when started from a pin). */
  const pickerItems = (x: number, y: number, from?: Pending['from']): MenuItem[] => {
    const types = store().project.sceneTypes
    const dot = (c: string) => <span className="kind-dot" style={{ ['--kind' as string]: c }} />
    return [
      ...SCENE_KINDS.map<MenuItem>((k) => ({
        id: `scene:${k}`,
        label: t(`kind.${k}`),
        group: t('pick.scenes'),
        keywords: `${t(`kind.${k}.hint`)} scene`,
        icon: dot(KIND_COLOR[k]),
        onSelect: () => create({ type: 'scene', kind: k }, x, y, from),
      })),
      ...types.map<MenuItem>((ty) => {
        const Icon = TYPE_ICON_COMPONENTS[ty.icon]
        return {
          id: `stype:${ty.id}`,
          label: ty.name,
          group: t('pick.custom'),
          keywords: `${t(`kind.${ty.baseKind}`)} custom scene type`,
          icon: <Icon size={13} style={{ color: ty.color }} />,
          onSelect: () => create({ type: 'scene', kind: ty.baseKind, typeId: ty.id }, x, y, from),
        }
      }),
      { id: 'branch', label: t('pick.branch'), group: t('pick.logic'), keywords: 'if branch condition true false', icon: <GitBranch size={13} />, onSelect: () => create({ type: 'branch' }, x, y, from) },
      { id: 'setflag', label: t('pick.setFlag'), group: t('pick.logic'), keywords: 'set flag variable state assign bayrak ata', icon: <FlagTriangleRight size={13} />, onSelect: () => create({ type: 'setFlag' }, x, y, from) },
      ...(from ? [] : [{ id: 'comment', label: t('pick.comment'), group: t('pick.notes'), keywords: 'comment note frame', icon: <StickyNote size={13} />, onSelect: () => create({ type: 'comment' }, x, y) } as MenuItem]),
    ]
  }
  const openPicker = (x: number, y: number, from?: Pending['from']) =>
    open({ x, y, items: pickerItems(x, y, from), ariaLabel: t('pick.title'), search: true, searchPlaceholder: t('pick.search'), emptyText: t('ctx.noResults') })

  const canvasMenu = (x: number, y: number): MenuItem[] => {
    const types = store().project.sceneTypes
    return [
      { id: 'add-scene', label: t('ctx.addScene'), icon: <Plus size={13} />, children: SCENE_KINDS.map<MenuItem>((k) => ({ id: `add-${k}`, label: t(`kind.${k}`), icon: <span className="kind-dot" style={{ ['--kind' as string]: KIND_COLOR[k] }} />, onSelect: () => create({ type: 'scene', kind: k }, x, y) })) },
      {
        id: 'add-custom',
        label: t('ctx.addCustom'),
        icon: <Plus size={13} />,
        disabled: types.length === 0,
        hint: types.length === 0 ? t('ctx.noCustom') : undefined,
        children: types.map<MenuItem>((ty) => {
          const Icon = TYPE_ICON_COMPONENTS[ty.icon]
          return { id: `add-type-${ty.id}`, label: ty.name, icon: <Icon size={13} style={{ color: ty.color }} />, onSelect: () => create({ type: 'scene', kind: ty.baseKind, typeId: ty.id }, x, y) }
        }),
      },
      { id: 'add-branch', label: t('ctx.addBranch'), icon: <GitBranch size={13} />, onSelect: () => create({ type: 'branch' }, x, y) },
      { id: 'add-setflag', label: t('ctx.addSetFlag'), icon: <FlagTriangleRight size={13} />, onSelect: () => create({ type: 'setFlag' }, x, y) },
      { id: 'add-comment', label: t('ctx.addComment'), icon: <StickyNote size={13} />, onSelect: () => create({ type: 'comment' }, x, y) },
      { id: 'add-node', label: t('ctx.addNode'), icon: <Plus size={13} />, onSelect: () => openPicker(x, y) },
      { id: 'arrange', label: t('graph.autoArrange'), icon: <Network size={13} />, separatorBefore: true, disabled: sceneCount < 2, onSelect: autoArrange },
      { id: 'fit', label: t('ctx.fitView'), icon: <Maximize size={13} />, onSelect: () => void rf.fitView({ padding: 0.2, duration: 300 }) },
    ]
  }

  const sceneMenu = (id: string): MenuItem[] => {
    const s = store()
    const isStart = s.project.startSceneId === id
    return [
      { id: 'edit', label: t('ctx.edit'), icon: <Pencil size={13} />, onSelect: () => { s.select({ type: 'scene', id }); void rf.fitView({ nodes: [{ id }], padding: 1.2, maxZoom: 1.2, duration: 300 }) } },
      { id: 'duplicate', label: t('ctx.duplicate'), icon: <Copy size={13} />, onSelect: () => void s.duplicateScene(id, t('ctx.copySuffix')) },
      { id: 'start', label: t('btn.setStart'), icon: <Flag size={13} />, disabled: isStart, onSelect: () => s.setStart(id) },
      { id: 'timeline', label: t('ctx.openTimeline'), icon: <Zap size={13} />, separatorBefore: true, onSelect: () => { s.setTimelineScene(id); s.setTimelineMode('triggers'); s.setView('timeline') } },
      { id: 'sequence', label: t('ctx.openSequence'), icon: <Zap size={13} />, onSelect: () => { s.setTimelineScene(id); s.setTimelineMode('sequence'); s.setView('timeline') } },
      { id: 'shots', label: t('ctx.openShots'), icon: <Clapperboard size={13} />, onSelect: () => setPlanner({ kind: 'shot', sceneId: id }) },
      { id: 'audio', label: t('ctx.openAudio'), icon: <Volume2 size={13} />, onSelect: () => setPlanner({ kind: 'audio', sceneId: id }) },
      { id: 'delete', label: t('btn.delete'), icon: <Trash2 size={13} />, danger: true, separatorBefore: true, onSelect: () => s.deleteScenes([id]) },
    ]
  }
  const branchMenu = (id: string): MenuItem[] => {
    const s = store()
    const isSet = s.project.logicNodes.find((n) => n.id === id)?.type === 'setFlag'
    return [
      { id: 'cond', label: t(isSet ? 'ctx.editSetFlag' : 'ctx.editCondition'), icon: <Pencil size={13} />, onSelect: () => { s.select({ type: 'node', id }); s.requestInspectorFocus(id) } },
      { id: 'duplicate', label: t('ctx.duplicate'), icon: <Copy size={13} />, onSelect: () => void s.duplicateNode(id) },
      { id: 'delete', label: t('btn.delete'), icon: <Trash2 size={13} />, danger: true, separatorBefore: true, onSelect: () => s.deleteScenes([id]) },
    ]
  }
  const commentMenu = (id: string): MenuItem[] => {
    const s = store()
    return [
      { id: 'edit', label: t('ctx.edit'), icon: <Pencil size={13} />, onSelect: () => s.select({ type: 'comment', id }) },
      { id: 'duplicate', label: t('ctx.duplicate'), icon: <Copy size={13} />, onSelect: () => void s.duplicateNode(id) },
      { id: 'delete', label: t('btn.delete'), icon: <Trash2 size={13} />, danger: true, separatorBefore: true, onSelect: () => s.deleteScenes([id]) },
    ]
  }
  const edgeMenu = (id: string): MenuItem[] => {
    const s = store()
    const tr = s.project.transitions.find((x) => x.id === id)
    return [
      { id: 'edit', label: t('ctx.editConnection'), icon: <Pencil size={13} />, onSelect: () => s.select({ type: 'edge', id }) },
      {
        id: 'insert',
        label: t('ctx.insertBranch'),
        icon: <GitBranch size={13} />,
        disabled: !!tr?.direction,
        hint: tr?.direction ? t('ctx.insertBlocked') : undefined,
        onSelect: () => void s.insertBranchOnTransition(id),
      },
      { id: 'delete', label: t('ctx.deleteConnection'), icon: <Trash2 size={13} />, danger: true, separatorBefore: true, onSelect: () => s.deleteTransition(id) },
    ]
  }

  /** Right click, long press and Shift+F10 all resolve the target from the DOM under the pointer/focus. */
  const openFor = (target: Element | null, x: number, y: number) => {
    const nodeEl = target?.closest('.react-flow__node')
    const edgeEl = target?.closest('.react-flow__edge, [data-edge-id]')
    if (nodeEl) {
      const id = nodeEl.getAttribute('data-id')!
      const kind = typeOf(id)
      select({ type: kind, id })
      return open({ x, y, items: kind === 'scene' ? sceneMenu(id) : kind === 'node' ? branchMenu(id) : commentMenu(id), ariaLabel: t('ctx.nodeMenu') })
    }
    if (edgeEl) {
      const id = edgeEl.getAttribute('data-edge-id') ?? edgeEl.getAttribute('data-id')!.replace(/^.*?(?=tr_)/, '')
      if (store().project.transitions.some((x) => x.id === id)) {
        select({ type: 'edge', id })
        return open({ x, y, items: edgeMenu(id), ariaLabel: t('ctx.edgeMenu') })
      }
    }
    open({ x, y, items: canvasMenu(x, y), ariaLabel: t('ctx.canvasMenu') })
  }

  const onContextMenu = (e: React.MouseEvent) => {
    const el = e.target as Element
    if (isEditableTarget(el) || el.closest('.palette, .react-flow__controls, .react-flow__minimap, .ctx-menu')) return // native menu
    e.preventDefault()
    openFor(el, e.clientX, e.clientY)
  }
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!((e.shiftKey && e.key === 'F10') || e.key === 'ContextMenu')) return
    if (isEditableTarget(e.target)) return
    e.preventDefault()
    const el = (e.target as Element).closest('.react-flow__node, .react-flow__edge') ?? (document.activeElement as Element | null)
    const box = (el && el.closest('.react-flow__node, .react-flow__edge'))?.getBoundingClientRect() ?? wrapRef.current?.getBoundingClientRect()
    if (!box) return
    openFor(el, box.left + Math.min(box.width / 2, 120), box.top + Math.min(box.height / 2, 60))
  }
  const lp = useMemo(() => longPressHandlers((p) => openFor(p.target instanceof Element ? p.target : null, p.clientX, p.clientY)), [project, t]) // eslint-disable-line react-hooks/exhaustive-deps

  const onConnectEnd = (e: MouseEvent | TouchEvent, state: FinalConnectionState) => {
    if (state.isValid) return
    const pt = 'changedTouches' in e ? e.changedTouches[0] : e
    if (state.toNode || state.toHandle) {
      // dropped on a node that cannot accept the wire: explain why, change nothing
      const from = state.fromHandle
      if (from?.nodeId && state.toNode) {
        const r = canConnect(store().project, { source: from.nodeId, sourcePort: isPort(from.id) ? from.id : undefined, target: state.toNode.id })
        if (!r.ok) rejected(r.reason)
      }
      return
    }
    const from = state.fromHandle
    if (!from || from.type !== 'source' || !from.nodeId) return
    openPicker(pt.clientX, pt.clientY, { id: from.nodeId, port: isPort(from.id) ? from.id : undefined })
  }

  // Palette "Add" buttons create at the canvas centre.
  const addAtCenter = (spec: NewNodeSpec | { type: 'comment' }) => {
    const p = centerPoint()
    create(spec, p.x, p.y)
  }

  return (
    <div className="graph-wrap" ref={wrapRef} onContextMenu={onContextMenu} onKeyDown={onKeyDown} {...lp}>
      <div className="palette" role="toolbar" aria-label={t('palette.title')}>
        <span className="palette-title">{t('palette.title')}</span>
        {SCENE_KINDS.map((k) => (
          <button
            key={k}
            className="btn small"
            style={{ ['--kind' as string]: KIND_COLOR[k] }}
            data-testid={`add-${k}`}
            onClick={() => addAtCenter({ type: 'scene', kind: k })}
            title={t(`kind.${k}.hint`)}
          >
            <span className="kind-dot" /> {t(`kind.${k}`)}
          </button>
        ))}
        <span className="palette-sep" aria-hidden="true" />
        <button className="btn small" data-testid="add-branch" onClick={() => addAtCenter({ type: 'branch' })} title={t('branch.hint')} style={{ ['--kind' as string]: LOGIC_COLOR }}>
          <GitBranch size={14} /> {t('pick.branch')}
        </button>
        <button className="btn small" data-testid="add-setflag" onClick={() => addAtCenter({ type: 'setFlag' })} title={t('setflag.hint')} style={{ ['--kind' as string]: SET_COLOR }}>
          <FlagTriangleRight size={14} /> {t('pick.setFlag')}
        </button>
        <button className="btn small" data-testid="add-comment" onClick={() => addAtCenter({ type: 'comment' })} title={t('comment.hint')}>
          <StickyNote size={14} /> {t('pick.comment')}
        </button>
        <button className="btn small" data-testid="add-node" onClick={() => { const p = centerPoint(); openPicker(p.x, p.y) }} title={t('pick.title')} aria-haspopup="menu">
          <Focus size={14} /> {t('ctx.addNode')}
        </button>
        <span className="palette-sep" aria-hidden="true" />
        <button
          className="btn small"
          data-testid="auto-arrange"
          onClick={autoArrange}
          disabled={sceneCount < 2}
          title={t('graph.autoArrangeTip')}
        >
          <Network size={14} /> {t('graph.autoArrange')}
        </button>
        <span className="sr-only" role="status" aria-live="polite">
          {arrangeMsg}
        </span>
      </div>
      {notice && (
        <div className="bp-toast" role="alert" data-testid="connect-notice">
          {notice}
        </div>
      )}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectEnd={onConnectEnd}
        isValidConnection={isValidConnection}
        connectionLineComponent={ConnectionLine}
        onNodeClick={(_, n) => select({ type: typeOf(n.id), id: n.id })}
        onEdgeClick={(_, e) => select({ type: 'edge', id: e.id })}
        onPaneClick={() => select(null)}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.2}
        deleteKeyCode={['Delete', 'Backspace']}
        colorMode="dark"
        proOptions={{ hideAttribution: false }}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} color="#2a2430" />
        <Controls showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          maskColor="rgba(8,6,10,0.7)"
          nodeColor={(n) =>
            n.type === 'branch' ? LOGIC_COLOR : n.type === 'setFlag' ? SET_COLOR : n.type === 'comment' ? '#3a3445' : KIND_COLOR[(n.data as SceneNodeData).scene.kind]
          }
        />
      </ReactFlow>
      {menu && <ContextMenu state={menu} onClose={close} />}
      {planner?.kind === 'shot' && <ShotPlannerDialog sceneId={planner.sceneId} onClose={() => setPlanner(null)} />}
      {planner?.kind === 'audio' && <AudioPlannerDialog sceneId={planner.sceneId} onClose={() => setPlanner(null)} />}
    </div>
  )
}

export function GraphView() {
  return (
    <ReactFlowProvider>
      <Canvas />
    </ReactFlowProvider>
  )
}
