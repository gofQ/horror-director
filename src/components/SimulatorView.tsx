import { useEffect, useMemo } from 'react'
import { ArrowDownRight, ArrowUpRight, Pin, PinOff, RotateCcw, Undo2 } from 'lucide-react'
import { useStore } from '../store/useStore'
import { useSim } from '../store/simulator'
import { useT } from '../i18n/store'
import { formatDiagnostic } from '../lib/diagnostics'
import { formatClock, simulateRoute, type SimEvent, type SimOption, type SimStatus } from '../lib/simulate'
import { KIND_COLOR, TRIGGER_COLOR } from '../lib/theme'
import { NumberInput } from './fields'
import { PacingPanel } from './PacingPanel'
import { ComparePanel } from './ComparePanel'
import { analyzePacing } from '../lib/pacing'

const W = 1000
const H = 300
const PAD = { l: 40, r: 16, t: 34, b: 34 }
const TICKS = [5, 10, 15, 30, 60, 120, 300, 600, 1200, 1800, 3600]

export function SimulatorView() {
  const { t, formatNumber } = useT()
  const project = useStore((s) => s.project)
  const { choices, options, selectedEventKey, selectedFindingId, pacing, pinned, invalidatedNotice, choose, back, restart, setOptions, prune, selectEvent, pinRouteA, clearPin } = useSim()
  const activeId = useStore((s) => s.library.activeId)
  const hasPin = !!pinned && pinned.projectId === activeId

  const result = useMemo(() => simulateRoute(project, choices, options), [project, choices, options])

  // Graph edits (or lower limits) can invalidate the route: keep only its valid prefix.
  useEffect(() => {
    if (result.validChoices.length !== choices.length) prune(result.validChoices, result.invalidated)
  }, [result, choices.length, prune])

  const analysis = useMemo(() => analyzePacing(result, pacing), [result, pacing])
  const selectedFinding = analysis.findings.find((f) => f.id === selectedFindingId) ?? null
  const highlighted = useMemo(() => new Set(selectedFinding?.eventKeys ?? []), [selectedFinding])
  const sceneTitle = (id: string) => project.scenes.find((sc) => sc.id === id)?.title || t('scene.untitled')

  const selected = result.events.find((e) => e.key === selectedEventKey) ?? null
  const cur = result.current
  const label = (o: { label: string; style: SimOption['style'] }) => o.label || t(`style.${o.style}`)

  const statusClass: Record<SimStatus, string> = {
    active: 'info',
    ending: 'ok',
    deadEnd: 'error',
    loopLimit: 'warning',
    stepLimit: 'warning',
    empty: 'error',
    noStart: 'error',
  }

  // chart geometry
  const end = Math.max(result.timelineEnd, 1)
  const x = (sec: number) => PAD.l + (sec / end) * (W - PAD.l - PAD.r)
  const y = (i: number) => PAD.t + (1 - i / 10) * (H - PAD.t - PAD.b)
  const tickStep = TICKS.find((s) => end / s <= 12) ?? 7200
  const ticks = Array.from({ length: Math.floor(end / tickStep) + 1 }, (_, i) => i * tickStep)

  const pick = (e: SimEvent) => selectEvent(selectedEventKey === e.key ? null : e.key)

  return (
    <div className="view-pad sim-view">
      <div>
        <h3>{t('sim.title')}</h3>
        <p className="muted">{t('sim.intro')}</p>
      </div>

      {result.status === 'empty' || result.status === 'noStart' ? (
        <>
          <div className="card">
            <p className="issue error" data-testid="sim-status" data-status={result.status}>
              {t(`sim.status.${result.status}`)}
            </p>
          </div>
          {hasPin && (
            <>
              <ComparePanel />
              <button className="btn" data-testid="compare-clear" onClick={clearPin}>
                <PinOff size={14} /> {t('compare.clear')}
              </button>
            </>
          )}
        </>
      ) : (
        <>
          <div className="sim-top">
            <div className="card sim-scene">
              <div className="section-title">{t('sim.current')}</div>
              {cur && (
                <>
                  <div className="sim-scene-head">
                    <span className="kind-dot" style={{ ['--kind' as string]: KIND_COLOR[cur.kind] }} />
                    <strong data-testid="sim-current-title">{cur.title || t('scene.untitled')}</strong>
                    <span className="muted">{t(`kind.${cur.kind}`)}</span>
                    {cur.visit > 1 && <span className="badge loop">{t('sim.visit', { n: cur.visit })}</span>}
                  </div>
                  <p className={`issue ${statusClass[result.status]}`} data-testid="sim-status" data-status={result.status}>
                    {t(`sim.status.${result.status}`)}
                  </p>
                </>
              )}

              <div className="section-title">{t('sim.options')}</div>
              {result.options.length === 0 && <p className="muted">{t('sim.noOptions')}</p>}
              <div className="sim-options">
                {result.options.map((o) => (
                  <button
                    key={o.transitionId}
                    className="sim-option"
                    data-testid="sim-option"
                    data-blocked={o.blocked ?? ''}
                    disabled={o.blocked !== null}
                    onClick={() => choose(o.transitionId)}
                  >
                    <span className="sim-option-title">
                      {label(o)} → <strong>{o.targetTitle || t('scene.untitled')}</strong>
                      <span className="muted"> ({t(`kind.${o.targetKind}`)})</span>
                    </span>
                    <span className="muted">
                      {t(`style.${o.style}`)} · {t('unit.seconds', { n: o.duration })}
                      {o.crossing === 'reality->dream' && (
                        <>
                          {' · '}
                          <ArrowDownRight size={12} className="inline-icon" /> {t('crossing.down')}
                        </>
                      )}
                      {o.crossing === 'dream->reality' && (
                        <>
                          {' · '}
                          <ArrowUpRight size={12} className="inline-icon" /> {t('crossing.up')}
                        </>
                      )}
                    </span>
                    {o.condition.trim() && (
                      <span className="sim-assumption" title={t('sim.assumptionHint')}>
                        {t('sim.assumption', { text: o.condition.trim() })}
                      </span>
                    )}
                    {o.blocked && <span className="sim-blocked">{t(`sim.blocked.${o.blocked}`)}</span>}
                  </button>
                ))}
              </div>

              <div className="sim-controls">
                <button className="btn" data-testid="sim-back" onClick={back} disabled={choices.length === 0}>
                  <Undo2 size={14} /> {t('sim.back')}
                </button>
                <button className="btn" data-testid="sim-restart" onClick={restart} disabled={choices.length === 0}>
                  <RotateCcw size={14} /> {t('sim.restart')}
                </button>
                <button className="btn" data-testid="sim-pin" onClick={pinRouteA}>
                  <Pin size={14} /> {hasPin ? t('compare.replace') : t('compare.pin')}
                </button>
                {hasPin && (
                  <button className="btn" data-testid="compare-clear" onClick={clearPin}>
                    <PinOff size={14} /> {t('compare.clear')}
                  </button>
                )}
              </div>

              <details className="sim-limits">
                <summary>{t('sim.limits')}</summary>
                <div className="row">
                  <label className="field">
                    <span className="field-label">{t('sim.stepCap')}</span>
                    <span data-testid="sim-step-cap">
                      <NumberInput value={options.stepCap} min={1} max={200} onChange={(stepCap) => setOptions({ stepCap })} />
                    </span>
                  </label>
                  <label className="field">
                    <span className="field-label">{t('sim.unlimitedLimit')}</span>
                    <NumberInput value={options.unlimitedLimit} min={1} max={20} onChange={(unlimitedLimit) => setOptions({ unlimitedLimit })} />
                  </label>
                </div>
                <p className="muted">{t('sim.limitsNote')}</p>
              </details>
            </div>

            <div className="sim-side">
              {(result.warnings.length > 0 || invalidatedNotice > 0) && (
                <div className="card">
                  <div className="section-title">{t('sim.warnings')}</div>
                  <ul className="issues" role="status" data-testid="sim-warnings">
                    {invalidatedNotice > 0 && (
                      <li className="issue warning" data-testid="sim-invalidated">
                        <span>{t('sim.invalidatedNotice')}</span>
                      </li>
                    )}
                    {result.warnings.map((w, i) => (
                      <li key={i} className="issue warning">
                        <span>{formatDiagnostic(t, w)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="card">
                <div className="section-title">{t('sim.route')}</div>
                <ol className="sim-route" data-testid="sim-route">
                  {result.steps.map((s) => (
                    <li key={s.index} data-testid="sim-route-step">
                      <span className="kind-dot" style={{ ['--kind' as string]: KIND_COLOR[s.kind] }} />
                      <span>
                        <strong>{s.title || t('scene.untitled')}</strong>
                        {s.visit > 1 && <span className="badge loop"> {t('sim.visit', { n: s.visit })}</span>}
                        <span className="muted">
                          {' '}
                          {formatClock(s.start)}–{formatClock(s.end)}
                        </span>
                        {s.via && (
                          <span className="muted sim-via">
                            {t('sim.via', { label: label(s.via) })} · {t(`style.${s.via.style}`)} · {t('unit.seconds', { n: s.via.duration })}
                            {s.via.condition.trim() && <span className="sim-assumption"> {t('sim.assumption', { text: s.via.condition.trim() })}</span>}
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="section-title">{t('sim.stats')}</div>
            <div className="sim-stats" data-testid="sim-stats">
              {(
                [
                  ['duration', formatClock(result.stats.totalDuration)],
                  ['visits', result.stats.visits],
                  ['unique', result.stats.uniqueScenes],
                  ['occurrences', result.stats.occurrences],
                  ['hypothetical', result.stats.hypothetical],
                  ['beyond', result.stats.beyondDuration],
                  ['onceSkipped', result.stats.onceSkipped],
                  ['avg', result.stats.avgIntensity === null ? '—' : formatNumber(result.stats.avgIntensity)],
                  ['peak', result.stats.peakIntensity === null ? '—' : result.stats.peakIntensity],
                  ['toDream', result.stats.realityToDream],
                  ['toReality', result.stats.dreamToReality],
                  ['repeats', result.stats.repeatVisits],
                  ['status', t(`sim.status.${result.status}`)],
                ] as const
              ).map(([k, v]) => (
                <div className="sim-stat" key={k} data-stat={k}>
                  <div className="sim-stat-value">{v}</div>
                  <div className="sim-stat-label">{t(`sim.stat.${k}`)}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="section-title">{t('sim.chart')}</div>
            <svg viewBox={`0 0 ${W} ${H}`} className="timeline-svg" role="img" aria-label={t('sim.chartAria')} data-testid="sim-chart">
              <defs>
                <pattern id="sim-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <line x1="0" y1="0" x2="0" y2="6" stroke="#6d6479" strokeWidth="2" />
                </pattern>
              </defs>
              {[0, 5, 10].map((v) => (
                <g key={v}>
                  <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className="grid-line" />
                  <text x={PAD.l - 8} y={y(v) + 4} className="axis-text" textAnchor="end">
                    {v}
                  </text>
                </g>
              ))}
              {result.steps.map((s, i) => {
                const w = x(s.end) - x(s.start)
                const next = result.steps[i + 1]
                const maxChars = Math.max(0, Math.floor(w / 7) - 1)
                const title = `${s.title}${s.visit > 1 ? ` ×${s.visit}` : ''}`
                return (
                  <g key={s.index} data-testid="sim-band">
                    <rect x={x(s.start)} y={PAD.t - 20} width={w} height={H - PAD.t - PAD.b + 20} fill={KIND_COLOR[s.kind]} opacity={i % 2 ? 0.1 : 0.17}>
                      <title>{`${title} · ${formatClock(s.start)}–${formatClock(s.end)}`}</title>
                    </rect>
                    <line x1={x(s.start)} x2={x(s.start)} y1={PAD.t - 20} y2={H - PAD.b} stroke={KIND_COLOR[s.kind]} strokeOpacity={0.7} />
                    {maxChars >= 4 && (
                      <text x={x(s.start) + 4} y={PAD.t - 7} className="axis-text">
                        {title.length > maxChars ? `${title.slice(0, maxChars - 1)}…` : title}
                      </text>
                    )}
                    {next && next.start > s.end && (
                      <rect x={x(s.end)} y={PAD.t - 20} width={x(next.start) - x(s.end)} height={H - PAD.t - PAD.b + 20} fill="url(#sim-hatch)" opacity={0.6}>
                        <title>{t('sim.transitionGap', { label: label(next.via!) })}</title>
                      </rect>
                    )}
                  </g>
                )
              })}
              {selectedFinding && (
                <rect
                  data-testid="pacing-range"
                  x={x(selectedFinding.start)}
                  y={PAD.t - 20}
                  width={Math.max(x(selectedFinding.end) - x(selectedFinding.start), 4)}
                  height={H - PAD.t - PAD.b + 20}
                  fill="#ffffff"
                  opacity={0.12}
                  stroke="#ffffff"
                  strokeOpacity={0.5}
                  strokeDasharray="4 3"
                >
                  <title>{`${t('pacing.rangeLabel')}: ${formatClock(selectedFinding.start)}–${formatClock(selectedFinding.end)}`}</title>
                </rect>
              )}
              <line x1={x(result.stats.totalDuration)} x2={x(result.stats.totalDuration)} y1={PAD.t - 20} y2={H - PAD.b} className="end-line" />
              {ticks.map((tk) => (
                <text key={tk} x={x(tk)} y={H - PAD.b + 18} className="axis-text" textAnchor="middle">
                  {formatClock(tk)}
                </text>
              ))}
              {result.events.map((e) => {
                const color = TRIGGER_COLOR[e.kind]
                const sel = e.key === selectedEventKey
                const hl = highlighted.has(e.key)
                return (
                  <g
                    key={e.key}
                    className={`marker${sel ? ' selected' : ''}`}
                    role="button"
                    tabIndex={0}
                    data-testid="sim-marker"
                    data-hypothetical={e.hypothetical}
                    data-beyond={e.beyondDuration}
                    data-highlighted={hl}
                    aria-label={`${e.name} — ${e.sceneTitle} — ${formatClock(e.absoluteTime)} — ${e.intensity}/10`}
                    onClick={() => pick(e)}
                    onKeyDown={(ev) => {
                      if (ev.key === 'Enter' || ev.key === ' ') {
                        ev.preventDefault()
                        pick(e)
                      }
                    }}
                  >
                    <line x1={x(e.absoluteTime)} x2={x(e.absoluteTime)} y1={y(e.intensity)} y2={y(0)} stroke={color} strokeOpacity={0.5} />
                    <circle
                      cx={x(e.absoluteTime)}
                      cy={y(e.intensity)}
                      r={sel || hl ? 9 : 7}
                      fill={e.hypothetical ? 'var(--bg)' : color}
                      stroke={hl ? '#ffffff' : e.beyondDuration ? '#ff4d6a' : color}
                      strokeWidth={hl || e.hypothetical || e.beyondDuration ? 2.5 : 2}
                      strokeDasharray={e.hypothetical ? '3 2' : undefined}
                    />
                    <title>{`${e.name} (${formatClock(e.absoluteTime)}, ${e.intensity}/10)`}</title>
                  </g>
                )
              })}
            </svg>
            {result.events.length === 0 && <p className="muted">{t('sim.chartEmpty')}</p>}
            <p className="muted sim-disclaimer">{t('sim.disclaimer')}</p>
          </div>

          <PacingPanel analysis={analysis} sceneTitle={sceneTitle} selectedId={selectedFinding?.id ?? null} />

          <ComparePanel />

          <div className="timeline-lower">
            <div className="card trigger-list">
              <div className="section-title">{t('sim.events')}</div>
              {result.events.map((e) => (
                <button key={e.key} className={`trigger-row${e.key === selectedEventKey ? ' selected' : ''}${highlighted.has(e.key) ? ' highlighted' : ''}`} data-testid="sim-event" data-highlighted={highlighted.has(e.key)} onClick={() => pick(e)}>
                  <span className="trigger-time">{formatClock(e.absoluteTime)}</span>
                  <i style={{ background: TRIGGER_COLOR[e.kind] }} />
                  <span className="trigger-name">
                    {e.name}
                    <span className="muted"> · {e.sceneTitle}</span>
                  </span>
                  <span className="trigger-int">{e.intensity}/10</span>
                </button>
              ))}
            </div>
            <div className="card trigger-editor" data-testid="sim-event-detail">
              {selected ? (
                <>
                  <div className="insp-head">
                    <h3>{selected.name}</h3>
                    <button className="btn small" onClick={() => selectEvent(null)}>
                      {t('sim.event.close')}
                    </button>
                  </div>
                  <dl className="sim-detail">
                    <dt>{t('sim.event.scene')}</dt>
                    <dd>{selected.sceneTitle}</dd>
                    <dt>{t('sim.event.local')}</dt>
                    <dd>{t('unit.seconds', { n: selected.localTime })}</dd>
                    <dt>{t('sim.event.absolute')}</dt>
                    <dd>{formatClock(selected.absoluteTime)}</dd>
                    <dt>{t('sim.event.type')}</dt>
                    <dd>{t(`trigger.${selected.kind}`)}</dd>
                    <dt>{t('sim.event.intensity')}</dt>
                    <dd>{selected.intensity}/10</dd>
                  </dl>
                  {selected.description && <p className="muted">{selected.description}</p>}
                  {selected.hypothetical && <p className="issue warning">{t('sim.event.hypothetical', { text: selected.condition })}</p>}
                  {selected.beyondDuration && <p className="issue error">{t('sim.event.beyond')}</p>}
                </>
              ) : (
                <p className="muted">{t('sim.eventHint')}</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
