import { useT } from '../i18n/store'
import { useSim } from '../store/simulator'
import { formatClock } from '../lib/simulate'
import { MIN_EVENTS, type PacingAnalysis, type PacingFinding } from '../lib/pacing'
import { TRIGGER_KINDS } from '../lib/schema'
import { TRIGGER_COLOR } from '../lib/theme'
import { NumberInput } from './fields'

interface Props {
  analysis: PacingAnalysis
  sceneTitle: (id: string) => string
  selectedId: string | null
}

/**
 * Pacing observations for the simulated route. Deliberately no score and no continuous curve:
 * everything shown is derived from authored trigger data and explained as a design observation.
 */
export function PacingPanel({ analysis, sceneTitle, selectedId }: Props) {
  const { t, formatNumber } = useT()
  const selectFinding = useSim((s) => s.selectFinding)
  const setPacing = useSim((s) => s.setPacing)
  const { overview: ov, findings, options: o, insufficient } = analysis
  const range = (start: number, end: number) => `${formatClock(start)}–${formatClock(end)}`
  const span = (f: PacingFinding) => Math.round(f.values.spanSeconds * 10) / 10
  const maxKind = Math.max(1, ...Object.values(ov.perKind))

  const what = (f: PacingFinding): string => {
    const v = f.values
    switch (f.category) {
      case 'cluster':
        return t('pacing.what.cluster', { count: v.count, span: span(f), min: v.minCount, window: v.windowSeconds, peak: v.peak })
      case 'highRepeat':
        return t('pacing.what.highRepeat', { count: v.count, span: span(f), threshold: v.intensityThreshold, min: v.minCount, window: v.windowSeconds })
      case 'kindRepeat':
        return t('pacing.what.kindRepeat', { count: v.count, span: span(f), kind: t(`trigger.${f.kind!}`), min: v.minCount, window: v.windowSeconds })
      case 'silence':
        return f.edge === 'start'
          ? t('pacing.what.silenceStart', { span: span(f), window: v.windowSeconds })
          : f.edge === 'end'
            ? t('pacing.what.silenceEnd', { span: span(f), window: v.windowSeconds })
            : t('pacing.what.silence', { span: span(f), window: v.windowSeconds })
      case 'escalation':
        return t('pacing.what.escalation', { count: v.count, span: span(f), first: v.firstIntensity, last: v.lastIntensity })
    }
  }

  return (
    <div className="card pacing-panel" data-testid="pacing-panel">
      <div className="section-title">{t('pacing.title')}</div>
      <p className="muted">{t('pacing.disclaimer')}</p>
      {!ov.routeComplete && ov.routeSeconds > 0 && <p className="issue info" data-testid="pacing-unfinished">{t('pacing.unfinished')}</p>}

      <div className="sim-stats" data-testid="pacing-overview">
        <div className="sim-stat" data-stat="events">
          <div className="sim-stat-value">{ov.plannedEvents}</div>
          <div className="sim-stat-label">{t('pacing.ov.events')}</div>
        </div>
        <div className="sim-stat" data-stat="perMinute">
          <div className="sim-stat-value">{ov.eventsPerMinute === null ? '—' : formatNumber(ov.eventsPerMinute)}</div>
          <div className="sim-stat-label">{t('pacing.ov.perMinute')}</div>
        </div>
        <div className="sim-stat" data-stat="high">
          <div className="sim-stat-value">{ov.highIntensity}</div>
          <div className="sim-stat-label">{t('pacing.ov.high', { n: o.highThreshold })}</div>
        </div>
        <div className="sim-stat" data-stat="hypothetical">
          <div className="sim-stat-value">{ov.hypotheticalEvents}</div>
          <div className="sim-stat-label">{t('pacing.ov.hypothetical')}</div>
        </div>
        <div className="sim-stat" data-stat="longest">
          <div className="sim-stat-value">{ov.longestSilence ? range(ov.longestSilence.start, ov.longestSilence.end) : '—'}</div>
          <div className="sim-stat-label">
            {t('pacing.ov.longest')}
            {ov.longestSilence && ` · ${t('unit.seconds', { n: Math.round(ov.longestSilence.seconds * 10) / 10 })}`}
          </div>
        </div>
      </div>

      {ov.plannedEvents > 0 && (
        <div className="pacing-kinds" data-testid="pacing-kinds">
          <div className="muted">{t('pacing.ov.kinds')}</div>
          {TRIGGER_KINDS.filter((k) => ov.perKind[k] > 0).map((k) => (
            <div className="pacing-kind-row" key={k} data-kind={k}>
              <span className="pacing-kind-name">{t(`trigger.${k}`)}</span>
              <span className="pacing-bar">
                <i style={{ width: `${(ov.perKind[k] / maxKind) * 100}%`, background: TRIGGER_COLOR[k] }} />
              </span>
              <span className="pacing-kind-count">{ov.perKind[k]}</span>
            </div>
          ))}
        </div>
      )}

      {insufficient ? (
        <p className="muted" data-testid="pacing-empty">{t('pacing.insufficient', { n: MIN_EVENTS })}</p>
      ) : (
        <>
          <div className="section-title">{t('pacing.findings', { n: findings.length })}</div>
          {findings.length === 0 ? (
            <p className="muted" data-testid="pacing-empty">{t('pacing.noFindings')}</p>
          ) : (
            <>
              <p className="muted">{t('pacing.select')}</p>
              <ul className="pacing-findings">
                {findings.map((f) => (
                  <li key={f.id}>
                    <button
                      className={`pacing-finding${f.id === selectedId ? ' selected' : ''}`}
                      data-testid="pacing-finding"
                      data-category={f.category}
                      data-severity={f.severity}
                      data-start={f.start}
                      data-end={f.end}
                      aria-pressed={f.id === selectedId}
                      onClick={() => selectFinding(f.id)}
                    >
                      <span className="pacing-finding-head">
                        <strong>{t(`pacing.cat.${f.category}`)}</strong>
                        <span className={`badge pacing-sev ${f.severity}`}>{t(`pacing.sev.${f.severity}`)}</span>
                        <span className="pacing-range-text">
                          {range(f.start, f.end)} ({t('unit.seconds', { n: span(f) })})
                        </span>
                      </span>
                      <span>{what(f)}</span>
                      <span className="muted">{t(`pacing.why.${f.category}`)}</span>
                      <span className="muted">{t('pacing.scenes', { list: f.sceneIds.map(sceneTitle).join(', ') })}</span>
                      {(f.dependsOnHypothetical || f.dependsOnAssumedTransitions) && (
                        <span className="pacing-deps">
                          {f.dependsOnHypothetical && <span className="badge pacing-dep" data-dep="hypothetical">{t('pacing.dep.hypothetical')}</span>}
                          {f.dependsOnAssumedTransitions && <span className="badge pacing-dep" data-dep="assumed">{t('pacing.dep.assumed')}</span>}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      <details className="sim-limits" data-testid="pacing-thresholds">
        <summary>{t('pacing.thresholds')}</summary>
        <ul className="pacing-th">
          <li>{t('pacing.th.cluster', { count: o.clusterCount, window: o.clusterWindow, caution: o.clusterCaution })}</li>
          <li>{t('pacing.th.high', { count: o.highRepeatCount, threshold: o.highThreshold, window: o.highRepeatWindow, caution: o.highCaution })}</li>
          <li>{t('pacing.th.kind', { count: o.kindCount, window: o.kindWindow, caution: o.kindCaution })}</li>
          <li>{t('pacing.th.silence', { window: o.silenceMin })}</li>
          <li>{t('pacing.th.escalation', { count: o.escalationMin, gap: o.escalationMaxGap })}</li>
        </ul>
        <p className="muted">{t('pacing.th.assumptions')}</p>
        <div className="row">
          <label className="field">
            <span className="field-label">{t('pacing.input.kindWindow')}</span>
            <span data-testid="pacing-kind-window">
              <NumberInput value={o.kindWindow} min={1} max={3600} onChange={(kindWindow) => setPacing({ kindWindow })} />
            </span>
          </label>
          <label className="field">
            <span className="field-label">{t('pacing.input.silenceMin')}</span>
            <span data-testid="pacing-silence-min">
              <NumberInput value={o.silenceMin} min={1} max={3600} onChange={(silenceMin) => setPacing({ silenceMin })} />
            </span>
          </label>
        </div>
      </details>
    </div>
  )
}
