import { useEffect, useRef } from 'react'
import { Copy, Trash2 } from 'lucide-react'
import { useStore } from '../store/useStore'
import { useT } from '../i18n/store'
import { formatClock } from '../lib/simulate'
import { DELAY_MAX_SECONDS, EVENT_CATEGORIES, RANDOM_LABEL_MAX, RANDOM_PORTS, type EventCategory } from '../lib/schema'
import { Field, NumberInput, TextArea, TextInput } from './fields'

/** Shared header: title, duplicate and delete (test ids are `<prefix>-duplicate` / `<prefix>-delete`). */
function Head({ id, prefix, title }: { id: string; prefix: string; title: string }) {
  const { t } = useT()
  const duplicate = useStore((s) => s.duplicateNode)
  const del = useStore((s) => s.deleteScenes)
  return (
    <div className="insp-head">
      <h3>{title}</h3>
      <span>
        <button className="btn small" data-testid={`${prefix}-duplicate`} onClick={() => duplicate(id)} title={t('ctx.duplicate')}>
          <Copy size={14} />
        </button>{' '}
        <button className="btn small danger" data-testid={`${prefix}-delete`} onClick={() => del([id])}>
          <Trash2 size={14} /> {t('btn.delete')}
        </button>
      </span>
    </div>
  )
}

/** Focuses the first control when the node was opened via its context menu ("Edit …"). */
function useFocusOnRequest(id: string) {
  const focusReq = useStore((s) => s.inspectorFocus)
  const ref = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (focusReq !== id) return
    ref.current?.focus()
    useStore.getState().requestInspectorFocus(null)
  }, [focusReq, id])
  return ref
}


export function EventInspector({ id }: { id: string }) {
  const { t } = useT()
  const node = useStore((s) => s.project.logicNodes.find((n) => n.id === id))
  const inCount = useStore((s) => s.project.transitions.filter((x) => x.target === id).length)
  const update = useStore((s) => s.updateLogicNode)
  const ref = useFocusOnRequest(id)
  if (!node) return null
  return (
    <>
      <Head id={id} prefix="event" title={t('insp.event')} />
      <Field label={t('field.title')}>
        <input ref={ref as React.RefObject<HTMLInputElement>} className="input" data-testid="event-title" value={node.title} onChange={(e) => update(id, { title: e.target.value })} />
      </Field>
      <Field label={t('event.category')}>
        <select className="input" data-testid="event-category-select" value={node.eventCategory ?? 'story'} onChange={(e) => update(id, { eventCategory: e.target.value as EventCategory })}>
          {EVENT_CATEGORIES.map((c) => (
            <option key={c} value={c}>{t(`event.cat.${c}`)}</option>
          ))}
        </select>
      </Field>
      <Field label={t('field.description')}>
        <TextArea value={node.description} rows={3} onChange={(description) => update(id, { description })} />
      </Field>
      <p className="muted">{t('event.note')}</p>
      <p className="muted">{t('branch.incoming', { n: inCount })}</p>
    </>
  )
}

export function DelayInspector({ id }: { id: string }) {
  const { t } = useT()
  const node = useStore((s) => s.project.logicNodes.find((n) => n.id === id))
  const inCount = useStore((s) => s.project.transitions.filter((x) => x.target === id).length)
  const update = useStore((s) => s.updateLogicNode)
  const wrap = useFocusOnRequest(id)
  if (!node) return null
  const seconds = node.seconds ?? 0
  return (
    <>
      <Head id={id} prefix="delay" title={t('insp.delay')} />
      <Field label={t('field.title')}>
        <TextInput value={node.title} onChange={(title) => update(id, { title })} />
      </Field>
      <Field label={t('delay.seconds')} hint={t('delay.hint2', { max: DELAY_MAX_SECONDS })}>
        <div ref={wrap as React.RefObject<HTMLDivElement>} data-testid="delay-seconds">
          <NumberInput value={seconds} min={0} max={DELAY_MAX_SECONDS} step={0.5} onChange={(v) => update(id, { seconds: v })} />
        </div>
      </Field>
      <p className="muted" data-testid="delay-clock">{t('delay.clock', { clock: formatClock(seconds), n: seconds })}</p>
      <Field label={t('delay.notes')}>
        <TextArea value={node.description} rows={3} onChange={(description) => update(id, { description })} />
      </Field>
      <p className="muted">{t('delay.note')}</p>
      <p className="muted">{t('branch.incoming', { n: inCount })}</p>
    </>
  )
}

export function RandomInspector({ id }: { id: string }) {
  const { t } = useT()
  const project = useStore((s) => s.project)
  const node = project.logicNodes.find((n) => n.id === id)
  const update = useStore((s) => s.updateLogicNode)
  const wrap = useFocusOnRequest(id)
  if (!node) return null
  const pa = node.probabilityA ?? 50
  const pb = Math.round((100 - pa) * 100) / 100
  const titleOf = (tid: string) => project.scenes.find((s) => s.id === tid)?.title ?? project.logicNodes.find((n) => n.id === tid)?.title ?? tid
  const label = (port: 'a' | 'b') => (port === 'a' ? node.labelA : node.labelB) ?? ''
  return (
    <>
      <Head id={id} prefix="random" title={t('insp.random')} />
      <Field label={t('field.title')}>
        <TextInput value={node.title} onChange={(title) => update(id, { title })} />
      </Field>
      {RANDOM_PORTS.map((port) => (
        <Field key={port} label={t(port === 'a' ? 'random.labelA' : 'random.labelB')}>
          <input
            className="input"
            data-testid={`random-label-${port}`}
            maxLength={RANDOM_LABEL_MAX}
            value={label(port)}
            onChange={(e) => update(id, port === 'a' ? { labelA: e.target.value } : { labelB: e.target.value })}
          />
        </Field>
      ))}
      <Field label={t('random.probability')}>
        <div className="prob-row" ref={wrap as React.RefObject<HTMLDivElement>}>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={pa}
            aria-label={t('random.probability')}
            data-testid="random-prob-range"
            onChange={(e) => update(id, { probabilityA: Number(e.target.value) })}
          />
          <div data-testid="random-prob-a">
            <NumberInput value={pa} min={0} max={100} step={1} onChange={(v) => update(id, { probabilityA: v })} />
          </div>
        </div>
      </Field>
      <p className="muted" data-testid="random-prob-b">{t('random.probB', { a: pa, b: pb })}</p>
      {(pa === 0 || pa === 100) && <p className="muted" data-testid="random-boundary">{t(pa === 0 ? 'random.never' : 'random.always')}</p>}
      <div className="section-title">{t('branch.outputs')}</div>
      <ul className="branch-outs" data-testid="random-outs">
        {RANDOM_PORTS.map((port) => {
          const link = project.transitions.find((x) => x.source === id && x.sourcePort === port)
          return (
            <li key={port} data-port={port}>
              <strong>{t(`pin.${port}`)}</strong> {label(port) && <em>{label(port)}</em>} → {link ? titleOf(link.target) : <span className="muted">{t('branch.unconnected')}</span>}
            </li>
          )
        })}
      </ul>
      <p className="muted">{t('random.note')}</p>
      <p className="muted">{t('branch.incoming', { n: project.transitions.filter((x) => x.target === id).length })}</p>
    </>
  )
}
