import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { CornerDownLeft, ListOrdered, TriangleAlert } from 'lucide-react'
import { SEQUENCE_PORTS, type LogicNode, type SequencePort } from '../lib/schema'
import { useT } from '../i18n/store'
import { PIN_PITCH, PIN_TOP } from './FlowNodes'

/** Blueprint-style nodes of the ordered Sequence (schema 9): the Sequence itself and its Sequence Return. */
export const SEQUENCE_COLOR = '#ff9e64'
export const SEQ_RETURN_COLOR = '#f7768e'
/** Then 0 and Then 1 share the execution colour (they are stages, not alternatives); Completed is distinct. */
export const SEQUENCE_PORT_COLOR: Record<SequencePort, string> = { then0: '#ff9e64', then1: '#ffb86b', completed: '#9ece6a' }

export type SequenceNodeData = { node: LogicNode; unreachable: boolean; /** Incomplete or invalid authoring messages (already formatted). */ issues: string[]; ownerTitle?: string | null }
export type SequenceFlowNode = Node<SequenceNodeData, 'sequence'>
export type SeqReturnFlowNode = Node<SequenceNodeData, 'seqReturn'>

const cls = (kind: string, selected: boolean | undefined, unreachable: boolean) => `bp-node bp-${kind}${selected ? ' selected' : ''}${unreachable ? ' unreachable' : ''}`

export function SequenceNode({ data, selected }: NodeProps<SequenceFlowNode>) {
  const { node, unreachable, issues } = data
  const { t } = useT()
  return (
    <div className={cls('sequence', selected, unreachable)} data-testid="sequence-node" style={{ ['--kind' as string]: SEQUENCE_COLOR, ['--accent' as string]: SEQUENCE_COLOR }}>
      <div className="bp-head">
        <ListOrdered size={13} aria-hidden="true" />
        <span className="bp-title">{node.title || t('default.sequence')}</span>
        <span className="badge">{t('sequence.badge')}</span>
      </div>
      <Handle id="in" type="target" position={Position.Left} className="bp-handle exec" style={{ top: PIN_TOP }} aria-label={t('pin.in')} />
      {SEQUENCE_PORTS.map((port, i) => (
        <Handle
          key={port}
          id={port}
          type="source"
          position={Position.Right}
          className={`bp-handle port-${port}`}
          data-port={port}
          style={{ top: PIN_TOP + i * PIN_PITCH, background: SEQUENCE_PORT_COLOR[port] }}
          aria-label={t(`pin.${port}`)}
        />
      ))}
      <div className="bp-branch-pins bp-seq-pins">
        <span className="bp-pinlabel">{t('pin.in')}</span>
        <span className="bp-branch-outs">
          {SEQUENCE_PORTS.map((port, i) => (
            <span key={port} className={`bp-pinlabel out ${port}`} data-testid={`sequence-pin-${port}`} style={{ color: SEQUENCE_PORT_COLOR[port] }}>
              {i < 2 ? `${i + 1}. ` : ''}
              {t(`pin.${port}`)}
            </span>
          ))}
        </span>
      </div>
      {issues.length > 0 && (
        <div className="bp-incomplete" data-testid="sequence-incomplete" title={issues.join('\n')}>
          <TriangleAlert size={12} aria-hidden="true" /> {t('sequence.incomplete')}
        </div>
      )}
    </div>
  )
}

export function SeqReturnNode({ data, selected }: NodeProps<SeqReturnFlowNode>) {
  const { node, unreachable, issues, ownerTitle } = data
  const { t } = useT()
  return (
    <div className={cls('seqreturn', selected, unreachable)} data-testid="seqreturn-node" style={{ ['--kind' as string]: SEQ_RETURN_COLOR, ['--accent' as string]: SEQ_RETURN_COLOR }}>
      <div className="bp-head">
        <CornerDownLeft size={13} aria-hidden="true" />
        <span className="bp-title">{node.title || t('default.seqReturn')}</span>
        <span className="badge">{t('seqReturn.badge')}</span>
      </div>
      <Handle id="in" type="target" position={Position.Left} className="bp-handle exec" style={{ top: PIN_TOP }} aria-label={t('pin.in')} />
      <div className="bp-pinrow">
        <span className="bp-pinlabel">{t('pin.in')}</span>
      </div>
      <div className="bp-flowbody" data-testid="seqreturn-owner">
        {node.sequenceId ? (
          <span>
            {ownerTitle || node.sequenceId} · {t('sequence.stageLabel', { n: (node.stage ?? 0) })}
          </span>
        ) : (
          <span className="bp-incomplete" title={issues.join('\n')}>
            <TriangleAlert size={12} aria-hidden="true" /> {t('sequence.unowned')}
          </span>
        )}
      </div>
    </div>
  )
}
