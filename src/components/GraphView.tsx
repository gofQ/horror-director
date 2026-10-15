import { useCallback, useMemo } from 'react'
import {
  Background,
  BackgroundVariant,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  getViewportForBounds,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeChange,
  type EdgeChange,
  type NodeProps,
} from '@xyflow/react'
import { Flag, Network, Repeat, Zap } from 'lucide-react'
import { useState } from 'react'
import { useStore } from '../store/useStore'
import { SCENE_KINDS, crossingOf, type Scene, type SceneKind, type TransitionStyle } from '../lib/schema'
import { KIND_COLOR } from '../lib/theme'
import { useT } from '../i18n/store'
import { analyze } from '../lib/graph'
import { edgeGeometry } from '../lib/edgePath'
import { NODE_H, NODE_W } from '../lib/layout'

type SceneNodeData = {
  scene: Scene
  isStart: boolean
  unreachable: boolean
  chips: { id: string; name: string; color: string; state: string }[]
}
type SceneFlowNode = Node<SceneNodeData, 'scene'>

function SceneNode({ data, selected }: NodeProps<SceneFlowNode>) {
  const { scene, isStart, unreachable, chips } = data
  const { t } = useT()
  return (
    <div
      className={`scene-node${selected ? ' selected' : ''}${unreachable ? ' unreachable' : ''}`}
      style={{ ['--kind' as string]: KIND_COLOR[scene.kind] }}
    >
      <Handle type="target" position={Position.Left} />
      <div className="scene-node-head">
        <span className="kind-dot" />
        <span className="scene-node-kind">{t(`kind.${scene.kind}`)}</span>
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
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

type TransitionData = {
  label: string
  style: string
  crossing: string
  selfLoop: boolean
  color: string
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
  const text = d.label || t(`style.${d.style as TransitionStyle}`)
  return (
    <>
      <BaseEdge
        id={id}
        path={geo.d}
        markerEnd={`url(#arrow-${id})`}
        interactionWidth={22}
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
      <EdgeLabelRenderer>
        <div
          className={`edge-label nodrag nopan${selected ? ' selected' : ''}`}
          data-testid="edge-label"
          data-edge-id={id}
          title={text}
          style={{ transform: `translate(-50%, -50%) translate(${geo.labelX}px, ${geo.labelY}px)`, borderColor: d.color }}
          onClick={() => select({ type: 'edge', id })}
        >
          {d.crossing === 'reality->dream' && <span title={t('crossing.down')}>↓ </span>}
          {d.crossing === 'dream->reality' && <span title={t('crossing.up')}>↑ </span>}
          {text}
        </div>
      </EdgeLabelRenderer>
    </>
  )
}

const nodeTypes = { scene: SceneNode }
const edgeTypes = { transition: TransitionEdge }

function Canvas() {
  const project = useStore((s) => s.project)
  const selection = useStore((s) => s.selection)
  const select = useStore((s) => s.select)
  const moveScene = useStore((s) => s.moveScene)
  const deleteScene = useStore((s) => s.deleteScene)
  const deleteTransition = useStore((s) => s.deleteTransition)
  const addTransition = useStore((s) => s.addTransition)
  const addScene = useStore((s) => s.addScene)
  const rf = useReactFlow()
  const { t } = useT()
  const arrangeScenes = useStore((s) => s.arrangeScenes)
  const sceneCount = useStore((s) => s.project.scenes.length)
  const [arrangeMsg, setArrangeMsg] = useState('')

  const analysis = useMemo(() => analyze(project), [project])

  const nodes: SceneFlowNode[] = useMemo(
    () =>
      project.scenes.map((scene) => ({
        id: scene.id,
        type: 'scene' as const,
        position: scene.position,
        selected: selection?.type === 'scene' && selection.id === scene.id,
        data: {
          scene,
          isStart: project.startSceneId === scene.id,
          unreachable: !!project.startSceneId && !analysis.reachable.has(scene.id),
          chips: Object.entries(scene.characterStates).flatMap(([cid, sid]) => {
            const c = project.characters.find((c) => c.id === cid)
            const st = c?.states.find((s) => s.id === sid)
            return c && st ? [{ id: cid, name: c.name, color: c.color, state: st.name }] : []
          }),
        },
      })),
    [project, selection, analysis],
  )

  const edges: TransitionFlowEdge[] = useMemo(() => {
    const kind = new Map(project.scenes.map((s) => [s.id, s.kind]))
    const pairs = new Set(project.transitions.map((t) => `${t.source}\u0000${t.target}`))
    return project.transitions.map((t) => {
      const a = kind.get(t.source) ?? 'reality'
      const b = kind.get(t.target) ?? 'reality'
      const crossing = crossingOf(a, b)
      const color =
        crossing === 'same-layer' ? KIND_COLOR[b] : crossing === 'reality->dream' ? '#d98cff' : '#f0c36d'
      return {
        id: t.id,
        source: t.source,
        target: t.target,
        type: 'transition' as const,
        selected: selection?.type === 'edge' && selection.id === t.id,
        markerEnd: { type: MarkerType.ArrowClosed },
        data: {
          label: t.label,
          style: t.style,
          crossing,
          selfLoop: t.source === t.target,
          color,
          reciprocal: t.source !== t.target && pairs.has(`${t.target}\u0000${t.source}`),
          rank: (t.source < t.target ? 0 : 1) as 0 | 1,
        },
      }
    })
  }, [project, selection])

  const onNodesChange = useCallback(
    (changes: NodeChange<SceneFlowNode>[]) => {
      for (const c of changes) {
        if (c.type === 'position' && c.position) moveScene(c.id, c.position)
        else if (c.type === 'remove') deleteScene(c.id)
      }
    },
    [moveScene, deleteScene],
  )
  const onEdgesChange = useCallback(
    (changes: EdgeChange<TransitionFlowEdge>[]) => {
      for (const c of changes) if (c.type === 'remove') deleteTransition(c.id)
    },
    [deleteTransition],
  )
  const onConnect = useCallback(
    (c: Connection) => {
      if (c.source && c.target) addTransition(c.source, c.target)
    },
    [addTransition],
  )

  /** Fits the arranged graph incl. the room self-loop arcs (above) and back-edge arcs (below) need. */
  const fitArranged = () => {
    const scenes = useStore.getState().project.scenes
    if (scenes.length === 0) return
    const xs = scenes.map((sc) => sc.position.x)
    const ys = scenes.map((sc) => sc.position.y)
    const minX = Math.min(...xs)
    const minY = Math.min(...ys)
    const bounds = {
      x: minX - 60,
      y: minY - 170,
      width: Math.max(...xs) + NODE_W - minX + 120,
      height: Math.max(...ys) + NODE_H - minY + 170 + 200,
    }
    const el = document.querySelector('.react-flow')
    const w = el?.clientWidth ?? 900
    const h = el?.clientHeight ?? 600
    const vp = getViewportForBounds(bounds, w, h, 0.2, 1, 0.04)
    void rf.setViewport(vp, { duration: 300 })
  }

  const autoArrange = () => {
    const moved = arrangeScenes()
    setArrangeMsg(moved ? t('graph.arranged') : t('graph.alreadyArranged'))
    // viewport only: positions live in the project and are never read back from the viewport
    if (moved) setTimeout(fitArranged, 50)
  }

  const addAtCenter = (kind: SceneKind) => {
    const el = document.querySelector('.react-flow')
    const r = el?.getBoundingClientRect()
    const p = rf.screenToFlowPosition({
      x: (r?.left ?? 0) + (r?.width ?? 600) / 2 - 90 + Math.random() * 40,
      y: (r?.top ?? 0) + (r?.height ?? 400) / 2 - 40 + Math.random() * 40,
    })
    addScene(kind, p)
  }

  return (
    <div className="graph-wrap">
      <div className="palette" role="toolbar" aria-label={t('palette.title')}>
        <span className="palette-title">{t('palette.title')}</span>
        {SCENE_KINDS.map((k) => (
          <button
            key={k}
            className="btn small"
            style={{ ['--kind' as string]: KIND_COLOR[k] }}
            data-testid={`add-${k}`}
            onClick={() => addAtCenter(k)}
            title={t(`kind.${k}.hint`)}
          >
            <span className="kind-dot" /> {t(`kind.${k}`)}
          </button>
        ))}
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
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={(_, n) => select({ type: 'scene', id: n.id })}
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
          nodeColor={(n) => KIND_COLOR[(n.data as SceneNodeData).scene.kind]}
        />
      </ReactFlow>
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
