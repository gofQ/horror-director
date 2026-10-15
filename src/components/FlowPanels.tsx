import { Dices } from 'lucide-react'
import { useT } from '../i18n/store'
import { useSim } from '../store/simulator'
import { formatClock, type FlowEntry, type SimResult } from '../lib/simulate'
import { RANDOM_PORT_COLOR } from './FlowNodes'

/** Compact chronological trace of events, delays, decisions and flag assignments of the simulated route. */
export function FlowTrace({ result }: { result: SimResult }) {
  const { t } = useT()
  const marks = useSim((s) => s.marks)
  const row = (e: FlowEntry) => {
    switch (e.kind) {
      case 'event':
        return (
          <>
            <strong>{e.title || t('default.event')}</strong> <span className="badge">{t(`event.cat.${e.category ?? 'story'}`)}</span>
            {e.description?.trim() && <span className="muted"> — {e.description.trim()}</span>}
          </>
        )
      case 'delayStart':
        return (
          <>
            {t('flow.delayStart', { title: e.title || t('default.delay'), n: e.seconds ?? 0 })}
          </>
        )
      case 'delayEnd':
        return <>{t('flow.delayEnd', { title: e.title || t('default.delay') })}</>
      case 'if':
        return (
          <>
            {t('flow.if', { title: e.title || t('default.branch'), port: t(`pin.${e.port ?? "a"}`) })}
            {e.logic && e.logic !== 'manual' && <span className={`sim-logic ${e.logic}`}> {t(`sim.logic.${e.logic}`)}</span>}
            {e.logic === 'manual' && <span className="muted"> · {t('flow.assumed')}</span>}
          </>
        )
      case 'flag':
        return <>{t('flow.flag', { flag: e.flagName ?? '', before: e.before ? t('bool.true') : t('bool.false'), after: e.after ? t('bool.true') : t('bool.false') })}</>
      case 'sequenceStart':
        return <>{t('flow.sequenceStart', { title: e.title || t('default.sequence') })}</>
      case 'stageEnter':
        return <>{t('flow.stageEnter', { title: e.title || t('default.sequence'), n: (e.stage ?? 0) + 1 })}</>
      case 'stageReturn':
        return <>{t('flow.stageReturn', { title: e.title || t('default.sequence'), n: (e.stage ?? 0) + 1 })}</>
      case 'sequenceComplete':
        return <>{t('flow.sequenceComplete', { title: e.title || t('default.sequence') })}</>
      case 'random': {
        const mark = e.choiceIndex !== undefined ? marks[e.choiceIndex] : undefined
        return (
          <>
            {t('flow.random', { title: e.title || t('default.random'), port: t(`pin.${e.port ?? "a"}`), label: e.label || '', p: e.port === 'a' ? (e.probabilityA ?? 50) : 100 - (e.probabilityA ?? 50) })}{' '}
            <span className={`sim-logic ${mark?.mode === 'rolled' ? 'valid' : 'override'}`} data-testid="flow-provenance" data-mode={mark?.mode ?? 'unknown'}>
              {mark?.mode === 'rolled' ? t('flow.rolled', { seed: mark.seed ?? '' }) : mark?.mode === 'manual' ? t('flow.manual') : t('flow.unknownSource')}
            </span>
          </>
        )
      }
    }
  }
  return (
    <div className="card flow-trace" data-testid="flow-trace">
      <div className="section-title">{t('flow.title')}</div>
      {result.flow.length === 0 ? (
        <p className="muted">{t('flow.empty')}</p>
      ) : (
        <ol>
          {result.flow.map((e) => (
            <li key={e.key} data-testid="flow-entry" data-kind={e.kind} data-time={e.time}>
              <span className="flow-time">{formatClock(e.time)}</span>
              <span className={`flow-kind ${e.kind}`}>{t(`flow.kind.${e.kind}`)}</span>
              <span className="flow-text">{row(e)}</span>
            </li>
          ))}
        </ol>
      )}
      <p className="muted">{t('flow.note')}</p>
    </div>
  )
}

/** Seeded, explicit outcome roll for the Random Branch the route waits at (never changes the route by itself). */
export function RandomPanel({ result }: { result: SimResult }) {
  const { t } = useT()
  const { seed, setSeed, rollPreview, rollOutcome, clearRoll, choose, choices } = useSim()
  const p = result.pending
  if (!p || p.kind !== 'random') return null
  const pa = p.probabilityA ?? 50
  const prob = { a: pa, b: Math.round((100 - pa) * 100) / 100 }
  const label = (port: 'a' | 'b') => (port === 'a' ? p.labelA : p.labelB) || t(`pin.${port}`)
  const preview = rollPreview && rollPreview.nodeId === p.nodeId && rollPreview.index === choices.length ? rollPreview : null
  const target = preview ? result.options.find((o) => o.port === preview.outcome) : undefined
  return (
    <div className="sim-random" data-testid="sim-random">
      <div className="section-title">{t('sim.random.title')}</div>
      <p className="muted">
        {(['a', 'b'] as const).map((port) => (
          <span key={port} style={{ color: RANDOM_PORT_COLOR[port], marginRight: 10 }}>
            <strong>{t(`pin.${port}`)}</strong> {label(port)} {prob[port]}%
          </span>
        ))}
      </p>
      <div className="row-actions">
        <label className="sim-seed">
          <span className="field-label">{t('sim.random.seed')}</span>
          <input className="input" data-testid="sim-seed" value={seed} maxLength={64} onChange={(e) => setSeed(e.target.value)} />
        </label>
        <button className="btn" data-testid="sim-roll" onClick={() => rollOutcome(p.nodeId, pa)}>
          <Dices size={14} /> {t('sim.random.roll')}
        </button>
      </div>
      {preview && (
        <div className="issue info" role="status" data-testid="sim-roll-result" data-outcome={preview.outcome}>
          <span>
            {t('sim.random.result', { port: t(`pin.${preview.outcome}`), label: label(preview.outcome), seed: preview.seed, u: Math.round(preview.u * 10000) / 10000 })}
            {pa === 0 && ' ' + t('random.never')}
            {pa === 100 && ' ' + t('random.always')}
          </span>
          {target ? (
            <button className="btn small" data-testid="sim-roll-commit" disabled={target.blocked !== null} onClick={() => choose(target.transitionId, { mode: 'rolled', seed: preview.seed, u: preview.u })}>
              {t('sim.random.commit', { port: t(`pin.${preview.outcome}`) })}
            </button>
          ) : (
            <span className="sim-blocked" data-testid="sim-roll-open">{t('sim.random.openOutcome', { port: t(`pin.${preview.outcome}`) })}</span>
          )}
          <button className="btn small" data-testid="sim-roll-dismiss" onClick={clearRoll}>
            {t('sim.random.dismiss')}
          </button>
        </div>
      )}
      <p className="muted">{t('sim.random.caveat')}</p>
    </div>
  )
}
