import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { Dices, Milestone, Timer } from 'lucide-react'
import { RANDOM_PORTS, type LogicNode, type RandomPort } from '../lib/schema'
import { useT } from '../i18n/store'

/** Blueprint-style nodes of the flow-control family (schema 8): Event, Delay and Random Branch. */
export const EVENT_COLOR = '#bb9af7'
export const DELAY_COLOR = '#7aa2f7'
export const RANDOM_COLOR = '#e879f9'
export const RANDOM_PORT_COLOR: Record<RandomPort, string> = { a: '#7dcfff', b: '#ff9e64' }
/** Vertical centre of the first pin row (head height + half a row) and the row pitch. */
export const PIN_TOP = 47
export const PIN_PITCH = 26

export type FlowNodeData = { node: LogicNode; unreachable: boolean }
export type EventFlowNode = Node<FlowNodeData, 'event'>
export type DelayFlowNode = Node<FlowNodeData, 'delay'>
export type RandomFlowNode = Node<FlowNodeData, 'random'>

const cls = (kind: string, selected: boolean | undefined, unreachable: boolean) => `bp-node bp-${kind}${selected ? ' selected' : ''}${unreachable ? ' unreachable' : ''}`

export function EventNode({ data, selected }: NodeProps<EventFlowNode>) {
  const { node, unreachable } = data
  const { t } = useT()
  return (
    <div className={cls('event', selected, unreachable)} data-testid="event-node" style={{ ['--kind' as string]: EVENT_COLOR, ['--accent' as string]: EVENT_COLOR }}>
      <div className="bp-head">
        <Milestone size={13} aria-hidden="true" />
        <span className="bp-title">{node.title || t('default.event')}</span>
        <span className="badge">{t('event.badge')}</span>
      </div>
      <Handle id="in" type="target" position={Position.Left} className="bp-handle exec" style={{ top: PIN_TOP }} aria-label={t('pin.in')} />
      <Handle id="out" type="source" position={Position.Right} className="bp-handle exec" style={{ top: PIN_TOP }} aria-label={t('pin.out')} />
      <div className="bp-pinrow">
        <span className="bp-pinlabel">{t('pin.in')}</span>
        <span className="bp-pinlabel">{t('pin.out')}</span>
      </div>
      <div className="bp-flowbody" data-testid="event-category">
        <span className="badge">{t(`event.cat.${node.eventCategory ?? 'story'}`)}</span>
        {node.description.trim() && <span className="bp-flowtext">{node.description.trim()}</span>}
      </div>
    </div>
  )
}

export function DelayNode({ data, selected }: NodeProps<DelayFlowNode>) {
  const { node, unreachable } = data
  const { t } = useT()
  return (
    <div className={cls('delay', selected, unreachable)} data-testid="delay-node" style={{ ['--kind' as string]: DELAY_COLOR, ['--accent' as string]: DELAY_COLOR }}>
      <div className="bp-head">
        <Timer size={13} aria-hidden="true" />
        <span className="bp-title">{node.title || t('default.delay')}</span>
        <span className="badge">{t('delay.badge')}</span>
      </div>
      <Handle id="in" type="target" position={Position.Left} className="bp-handle exec" style={{ top: PIN_TOP }} aria-label={t('pin.in')} />
      <Handle id="out" type="source" position={Position.Right} className="bp-handle exec" style={{ top: PIN_TOP }} aria-label={t('pin.out')} />
      <div className="bp-pinrow">
        <span className="bp-pinlabel">{t('pin.in')}</span>
        <span className="bp-pinlabel">{t('pin.out')}</span>
      </div>
      <div className="bp-flowbody">
        <span className="bp-delay-time" data-testid="delay-duration">{t('delay.display', { n: node.seconds ?? 0 })}</span>
      </div>
    </div>
  )
}

export function RandomNode({ data, selected }: NodeProps<RandomFlowNode>) {
  const { node, unreachable } = data
  const { t } = useT()
  const pa = node.probabilityA ?? 50
  const pct: Record<RandomPort, number> = { a: pa, b: Math.round((100 - pa) * 100) / 100 }
  const label = (port: RandomPort) => (port === 'a' ? node.labelA : node.labelB) || t(`pin.${port}`)
  return (
    <div className={cls('random', selected, unreachable)} data-testid="random-node" style={{ ['--kind' as string]: RANDOM_COLOR, ['--accent' as string]: RANDOM_COLOR }}>
      <div className="bp-head">
        <Dices size={13} aria-hidden="true" />
        <span className="bp-title">{node.title || t('default.random')}</span>
        <span className="badge">{t('random.badge')}</span>
      </div>
      <Handle id="in" type="target" position={Position.Left} className="bp-handle exec" style={{ top: PIN_TOP }} aria-label={t('pin.in')} />
      {RANDOM_PORTS.map((port, i) => (
        <Handle
          key={port}
          id={port}
          type="source"
          position={Position.Right}
          className={`bp-handle port-${port}`}
          data-port={port}
          style={{ top: PIN_TOP + i * PIN_PITCH, background: RANDOM_PORT_COLOR[port] }}
          aria-label={`${t(`pin.${port}`)} ${label(port)} ${pct[port]}%`}
        />
      ))}
      <div className="bp-branch-pins">
        <span className="bp-pinlabel">{t('pin.in')}</span>
        <span className="bp-branch-outs">
          {RANDOM_PORTS.map((port) => (
            <span key={port} className={`bp-pinlabel out ${port}`} data-testid={`random-pin-${port}`} style={{ color: RANDOM_PORT_COLOR[port] }}>
              {label(port)} · {pct[port]}%
            </span>
          ))}
        </span>
      </div>
    </div>
  )
}
