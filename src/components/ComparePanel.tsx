import { useMemo, useState, type ReactNode } from 'react'
import { useStore } from '../store/useStore'
import { useSim } from '../store/simulator'
import { useT } from '../i18n/store'
import { compareRoutes, type CompareEvent, type Delta, type RouteComparison, type SharedEvent } from '../lib/compare'
import { formatClock } from '../lib/simulate'
import { PACING_CATEGORIES } from '../lib/pacing'
import { TRIGGER_KINDS } from '../lib/schema'
import { TRIGGER_COLOR } from '../lib/theme'

const W = 1000
const LANE = 96
const PAD = { l: 34, r: 16, t: 14, b: 26 }
const GAP = 30
const H = PAD.t + LANE * 2 + GAP + PAD.b
const TICKS = [5, 10, 15, 30, 60, 120, 300, 600, 1200, 1800, 3600]

type Scope = 'shared' | 'a' | 'b'

/**
 * Read-only A/B route comparison. Route A is the pinned copy of earlier choices, Route B is the live
 * route; both are re-simulated against the current project with the same limits and thresholds.
 * Descriptive only: no ranking, score or tension curve.
 */
export function ComparePanel() {
  const { t } = useT()
  const project = useStore((s) => s.project)
  const activeId = useStore((s) => s.library.activeId)
  const { pinned, choices, options, pacing, invalidatedNotice, marks } = useSim()
  const [selected, setSelected] = useState<string | null>(null)
  const pin = pinned && pinned.projectId === activeId ? pinned : null

  const cmp = useMemo(() => (pin ? compareRoutes(project, pin.choices, choices, options, pacing, { a: pin.marks, b: marks }) : null), [project, pin, choices, options, pacing, marks])

  if (!pin || !cmp) {
    return (
      <div className="card compare-panel" data-testid="compare-panel" data-state="empty">
        <div className="section-title">{t('compare.title')}</div>
        <p className="muted">{t('compare.intro')}</p>
      </div>
    )
  }
  return <CompareBody cmp={cmp} selected={selected} setSelected={setSelected} bNotice={invalidatedNotice} />
}

function CompareBody({ cmp, selected, setSelected, bNotice }: { cmp: RouteComparison; selected: string | null; setSelected: (k: string | null) => void; bNotice: number }) {
  {
    const { t, formatNumber } = useT()
    const sign = (n: Delta, fmt: (v: number) => string = formatNumber) => (n === null ? '—' : n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(-n)}` : fmt(0))
    const clockDelta = (n: Delta) => sign(n, (v) => formatClock(v))
    const num = (n: number | null) => (n === null ? '—' : formatNumber(n))
    const { a, b, deltas: d } = cmp

    interface Row { key: string; label: string; a: string; b: string; delta: string }
    const row = (key: string, label: string, av: number | null, bv: number | null, dv: Delta): Row => ({ key, label, a: num(av), b: num(bv), delta: sign(dv) })
    const summary: Row[] = [
      { key: 'status', label: t('compare.row.status'), a: t(`sim.status.${a.status}`), b: t(`sim.status.${b.status}`), delta: '—' },
      { key: 'duration', label: t('compare.row.duration'), a: formatClock(a.duration), b: formatClock(b.duration), delta: clockDelta(d.duration) },
      row('visits', t('compare.row.visits'), a.visits, b.visits, d.visits),
      row('unique', t('compare.row.unique'), a.uniqueScenes, b.uniqueScenes, d.uniqueScenes),
      row('repeats', t('compare.row.repeats'), a.repeatVisits, b.repeatVisits, d.repeatVisits),
      row('events', t('compare.row.events'), a.events, b.events, d.events),
      row('hypothetical', t('compare.row.hypothetical'), a.hypothetical, b.hypothetical, d.hypothetical),
      row('assumed', t('compare.row.assumed'), a.assumedTransitions, b.assumedTransitions, d.assumedTransitions),
      { key: 'overrides', label: t('compare.row.overrides'), a: num(a.overrides), b: num(b.overrides), delta: sign(b.overrides - a.overrides) },
      row('delay', t('compare.row.delay'), a.delayTotal, b.delayTotal, b.delayTotal - a.delayTotal),
      row('eventNodes', t('compare.row.eventNodes'), a.eventNodes, b.eventNodes, b.eventNodes - a.eventNodes),
      row('random', t('compare.row.random'), a.randomDecisions, b.randomDecisions, b.randomDecisions - a.randomDecisions),
      row('perMinute', t('compare.row.perMinute'), a.eventsPerMinute, b.eventsPerMinute, d.eventsPerMinute),
      row('avg', t('compare.row.avg'), a.avgIntensity, b.avgIntensity, d.avgIntensity),
      row('peak', t('compare.row.peak'), a.peakIntensity, b.peakIntensity, d.peakIntensity),
    ]
    const kinds: Row[] = TRIGGER_KINDS.map((k) => row(`kind-${k}`, t(`trigger.${k}`), a.perKind[k], b.perKind[k], d.perKind[k]))
    const findings: Row[] = [
      row('f-total', t('compare.row.total'), a.findingsTotal, b.findingsTotal, d.findingsTotal),
      row('f-caution', t('compare.row.caution'), a.findingsBySeverity.caution, b.findingsBySeverity.caution, d.findingsBySeverity.caution),
      row('f-informational', t('compare.row.informational'), a.findingsBySeverity.informational, b.findingsBySeverity.informational, d.findingsBySeverity.informational),
      ...PACING_CATEGORIES.map((c) => row(`f-${c}`, t(`pacing.cat.${c}`), a.findingsByCategory[c], b.findingsByCategory[c], d.findingsByCategory[c])),
    ]
    const table = (title: string, rows: Row[], id: string) => (
      <div className="compare-table-wrap">
        <table className="compare-table" data-testid={`compare-table-${id}`}>
          <caption>{title}</caption>
          <thead>
            <tr>
              <th scope="col">{t('compare.col.measure')}</th>
              <th scope="col">{t('compare.col.a')}</th>
              <th scope="col">{t('compare.col.b')}</th>
              <th scope="col">{t('compare.col.delta')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} data-row={r.key}>
                <th scope="row">{r.label}</th>
                <td data-col="a">{r.a}</td>
                <td data-col="b">{r.b}</td>
                <td data-col="delta" className="compare-delta">{r.delta}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )

    const dv = cmp.divergence
    const nextText = (side: 'A' | 'B', n: { label: string; targetTitle: string; assumed: boolean } | null) =>
      n ? (
        <li>
          {t('compare.div.next', { side, label: n.label || '—', target: n.targetTitle })}
          {n.assumed && <span className="badge pacing-dep"> {t('compare.assumed')}</span>}
        </li>
      ) : (
        <li>{t('compare.div.ends', { side })}</li>
      )

    // ---- aligned timelines ----
    const end = cmp.timelineEnd
    const x = (sec: number) => PAD.l + (sec / end) * (W - PAD.l - PAD.r)
    const laneTop = (side: 'a' | 'b') => PAD.t + (side === 'a' ? 0 : LANE + GAP)
    const y = (side: 'a' | 'b', i: number) => laneTop(side) + (1 - i / 10) * LANE
    const tickStep = TICKS.find((s) => end / s <= 10) ?? 7200
    const ticks = Array.from({ length: Math.floor(end / tickStep) + 1 }, (_, i) => i * tickStep)
    const where = (e: CompareEvent, side: 'a' | 'b'): string => t(e.shared ? 'compare.where.shared' : side === 'a' ? 'compare.where.a' : 'compare.where.b')
    const pickEvent = (id: string) => setSelected(selected === id ? null : id)
    const sel = [...cmp.events.a.map((e) => ({ e, side: 'a' as const })), ...cmp.events.b.map((e) => ({ e, side: 'b' as const }))].find((x) => x.e.identity === selected)

    const marker = (e: CompareEvent, side: 'a' | 'b') => {
      const cx = x(e.time)
      const cy = y(side, e.intensity)
      const color = TRIGGER_COLOR[e.kind]
      const on = e.identity === selected
      const fill = e.hypothetical ? 'var(--bg)' : color
      const stroke = on ? '#ffffff' : color
      const sw = on || e.hypothetical ? 2.5 : 2
      const r = on ? 9 : 7
      return (
        <g
          key={`${side}:${e.key}`}
          className="marker"
          role="button"
          tabIndex={0}
          data-testid="compare-marker"
          data-side={side}
          data-scope={e.shared ? 'shared' : side}
          data-hypothetical={e.hypothetical}
          aria-pressed={on}
          aria-label={`${side.toUpperCase()}: ${e.name} — ${e.sceneTitle} — ${formatClock(e.time)} — ${e.intensity}/10 — ${where(e, side)}`}
          onClick={() => pickEvent(e.identity)}
          onKeyDown={(ev) => {
            if (ev.key === 'Enter' || ev.key === ' ') {
              ev.preventDefault()
              pickEvent(e.identity)
            }
          }}
        >
          <line x1={cx} x2={cx} y1={cy} y2={y(side, 0)} stroke={color} strokeOpacity={0.45} />
          {e.shared ? (
            <circle cx={cx} cy={cy} r={r} fill={fill} stroke={stroke} strokeWidth={sw} strokeDasharray={e.hypothetical ? '3 2' : undefined} />
          ) : (
            <rect x={cx - r} y={cy - r} width={r * 2} height={r * 2} transform={`rotate(45 ${cx} ${cy})`} fill={fill} stroke={stroke} strokeWidth={sw} strokeDasharray={e.hypothetical ? '3 2' : undefined} />
          )}
          <title>{`${e.name} (${formatClock(e.time)}, ${e.intensity}/10) — ${where(e, side)}`}</title>
        </g>
      )
    }

    const evButton = (e: CompareEvent, scope: Scope, extra?: SharedEvent) => (
      <li key={`${scope}:${e.key}`}>
        <button className={`compare-ev${e.identity === selected ? ' selected' : ''}`} data-testid="compare-event" data-scope={scope} aria-pressed={e.identity === selected} onClick={() => pickEvent(e.identity)}>
          <i style={{ background: TRIGGER_COLOR[e.kind] }} />
          <span className="compare-ev-name">
            {e.name}
            <span className="muted"> · {e.sceneTitle}{e.visit > 1 ? ` (${t('compare.visit', { n: e.visit })})` : ''}</span>
            {e.hypothetical && <span className="badge pacing-dep"> {t('compare.hyp')}</span>}
          </span>
          <span className="compare-ev-time">
            {extra ? (
              <>
                {t('compare.eventShared', { a: formatClock(extra.timeA), b: formatClock(extra.timeB) })}
                {extra.shift !== 0 && <span className="muted"> · {t('compare.eventShift', { n: formatNumber(Math.abs(extra.shift)) })}</span>}
              </>
            ) : (
              formatClock(e.time)
            )}
            {' · '}
            {e.intensity}/10
          </span>
        </button>
      </li>
    )
    const group = (title: string, items: ReactNode[], testid: string) => (
      <div className="compare-group" data-testid={testid} data-count={items.length}>
        <div className="muted compare-group-title">{title}</div>
        {items.length ? <ul className="compare-list">{items}</ul> : <p className="muted">{t('compare.none')}</p>}
      </div>
    )
    const sceneItems = (list: RouteComparison['scenes']['shared']) =>
      list.map((s) => (
        <li key={s.id} className="compare-chip">
          {s.title}
          <span className="muted"> · {t('compare.sceneVisits', { a: s.visitsA, b: s.visitsB })}</span>
        </li>
      ))
    const trItems = (list: RouteComparison['transitions']['shared']) =>
      list.map((x) => (
        <li key={x.id} className="compare-chip">
          {x.label || t(`style.${x.style as 'cut'}`)}
          <span className="muted"> · {x.sourceTitle} → {x.targetTitle}</span>
          {x.assumed && <span className="badge pacing-dep"> {t('compare.assumed')}</span>}
        </li>
      ))
    const ev = cmp.events
    const sharedById = new Map(ev.a.map((e) => [e.identity, e]))

    return (
      <div className="card compare-panel" data-testid="compare-panel" data-state={cmp.incomplete ? 'incomplete' : cmp.identical ? 'identical' : 'ok'}>
        <div className="section-title">{t('compare.title')}</div>
        <p className="muted">{t('compare.disclaimer')}</p>

        {a.dropped > 0 && !a.unavailable && (
          <p className="issue warning" role="alert" data-testid="compare-warn-a">{t('compare.warn.aInvalid', { n: a.dropped })}</p>
        )}
        {bNotice > 0 && <p className="issue warning" role="status" data-testid="compare-warn-b">{t('compare.warn.bShortened', { n: bNotice })}</p>}
        {(a.unavailable || b.unavailable) && <p className="issue error" role="alert" data-testid="compare-unavailable">{t('compare.warn.unavailable')}</p>}
        {cmp.identical && !cmp.incomplete && <p className="issue info" role="status" data-testid="compare-identical">{t('compare.identical')}</p>}

        {!(a.unavailable || b.unavailable) && (
          <>
            <p className="muted">{t('compare.hypNote')}</p>
            {a.overrides + b.overrides > 0 && (
              <p className="muted" role="note" data-testid="compare-overrides-note">
                {t('compare.overridesNote')}
              </p>
            )}
            {a.randomDecisions + b.randomDecisions > 0 && (
              <p className="muted" role="note" data-testid="compare-random-note">
                {t('compare.randomNote', { aM: a.randomManual, aR: a.randomRolled, aU: a.randomDecisions - a.randomManual - a.randomRolled, bM: b.randomManual, bR: b.randomRolled, bU: b.randomDecisions - b.randomManual - b.randomRolled })}
              </p>
            )}
            {table(t('compare.sec.summary'), summary, 'summary')}
            {table(t('compare.sec.kinds'), kinds, 'kinds')}
            {table(t('compare.sec.findings'), findings, 'findings')}

            <div className="compare-div" data-testid="compare-divergence" data-kind={dv.kind}>
              <div className="section-title">{t('compare.div.title')}</div>
              {dv.kind === 'identical' && <p>{t('compare.identical')}</p>}
              {dv.kind === 'diverges' && (
                <>
                  <p>{t('compare.div.at', { n: dv.sharedSteps, scene: dv.sceneTitle || t('scene.untitled'), time: formatClock(dv.time) })}</p>
                  <ul className="compare-list">
                    {nextText('A', dv.next.a)}
                    {nextText('B', dv.next.b)}
                  </ul>
                </>
              )}
            </div>

            <div className="compare-lists">
              <div>
                <div className="section-title">{t('compare.scenes')}</div>
                {group(t('compare.shared', { n: cmp.scenes.shared.length }), sceneItems(cmp.scenes.shared), 'compare-scenes-shared')}
                {group(t('compare.onlyA', { n: cmp.scenes.onlyA.length }), sceneItems(cmp.scenes.onlyA), 'compare-scenes-a')}
                {group(t('compare.onlyB', { n: cmp.scenes.onlyB.length }), sceneItems(cmp.scenes.onlyB), 'compare-scenes-b')}
              </div>
              <div>
                <div className="section-title">{t('compare.transitions')}</div>
                {group(t('compare.shared', { n: cmp.transitions.shared.length }), trItems(cmp.transitions.shared), 'compare-transitions-shared')}
                {group(t('compare.onlyA', { n: cmp.transitions.onlyA.length }), trItems(cmp.transitions.onlyA), 'compare-transitions-a')}
                {group(t('compare.onlyB', { n: cmp.transitions.onlyB.length }), trItems(cmp.transitions.onlyB), 'compare-transitions-b')}
              </div>
              <div>
                <div className="section-title">{t('compare.events')}</div>
                {group(
                  t('compare.shared', { n: ev.shared.length }),
                  ev.shared.map((s) => evButton({ ...sharedById.get(s.identity)!, shared: true }, 'shared', s)),
                  'compare-events-shared',
                )}
                {group(t('compare.onlyA', { n: ev.onlyA.length }), ev.onlyA.map((e) => evButton(e, 'a')), 'compare-events-a')}
                {group(t('compare.onlyB', { n: ev.onlyB.length }), ev.onlyB.map((e) => evButton(e, 'b')), 'compare-events-b')}
              </div>
            </div>

            <div className="section-title">{t('compare.timeline')}</div>
            <svg viewBox={`0 0 ${W} ${H}`} className="timeline-svg" role="group" aria-label={t('compare.timelineAria')} data-testid="compare-chart">
              {(['a', 'b'] as const).map((side) => (
                <g key={side} data-lane={side}>
                  <text x={4} y={laneTop(side) + 12} className="axis-text">{side.toUpperCase()}</text>
                  {[0, 5, 10].map((v) => (
                    <line key={v} x1={PAD.l} x2={W - PAD.r} y1={y(side, v)} y2={y(side, v)} className="grid-line" />
                  ))}
                  <line x1={x(side === 'a' ? a.duration : b.duration)} x2={x(side === 'a' ? a.duration : b.duration)} y1={laneTop(side)} y2={laneTop(side) + LANE} className="end-line" />
                </g>
              ))}
              {ticks.map((tk) => (
                <text key={tk} x={x(tk)} y={H - 8} className="axis-text" textAnchor="middle">{formatClock(tk)}</text>
              ))}
              {cmp.divergenceTime !== null && (
                <line data-testid="compare-divergence-line" x1={x(cmp.divergenceTime)} x2={x(cmp.divergenceTime)} y1={PAD.t} y2={H - PAD.b} stroke="#ffffff" strokeOpacity={0.6} strokeDasharray="5 4" />
              )}
              {ev.shared.map((s) => (
                <line key={s.identity} x1={x(s.timeA)} y1={y('a', 0)} x2={x(s.timeB)} y2={y('b', 10)} stroke={TRIGGER_COLOR[s.kind]} strokeOpacity={s.identity === selected ? 0.9 : 0.25} />
              ))}
              {ev.a.map((e) => marker(e, 'a'))}
              {ev.b.map((e) => marker(e, 'b'))}
            </svg>
            <ul className="compare-legend muted">
              <li>● {t('compare.legend.shared')}</li>
              <li>◆ {t('compare.legend.exclusive')}</li>
              <li>{t('compare.legend.hypothetical')}</li>
              <li>{t('compare.legend.divergence')}</li>
            </ul>
            <p className="muted" data-testid="compare-detail" role="status">
              {sel
                ? t('compare.detail', { name: sel.e.name, scene: sel.e.sceneTitle, visit: t('compare.visit', { n: sel.e.visit }), time: formatClock(sel.e.time), intensity: sel.e.intensity, where: where(sel.e, sel.side) })
                : t('compare.detailHint')}
            </p>
          </>
        )}
      </div>
    )
  }
}
