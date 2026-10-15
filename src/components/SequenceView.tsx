import { useMemo, useState } from 'react'
import { ArrowRightFromLine, Clapperboard, Minus, Plus, TriangleAlert, Volume2, Zap } from 'lucide-react'
import { useT } from '../i18n/store'
import { buildSequence, type SequenceItem, type SequenceKind } from '../lib/sequence'
import { formatClock } from '../lib/simulate'
import { TRIGGER_COLOR } from '../lib/theme'
import type { Scene } from '../lib/schema'
import { AudioPlannerDialog } from './AudioPlannerDialog'
import { ShotPlannerDialog } from './ShotPlannerDialog'
import { ContextMenu, isEditableTarget, useContextMenu } from './ContextMenu'

const ZOOMS = [1, 2, 4, 8]
const LANE_H = 28
const TRACKS: SequenceKind[] = ['shot', 'audio', 'trigger']
const TRACK_LABEL = { shot: 'seq.track.camera', audio: 'seq.track.audio', trigger: 'seq.track.events' } as const
const TRACK_EMPTY = { shot: 'seq.empty.camera', audio: 'seq.empty.audio', trigger: 'seq.empty.events' } as const
const KIND_ICON = { shot: Clapperboard, audio: Volume2, trigger: Zap }

function tickStep(range: number, zoom: number) {
  const target = 10 * zoom
  return [1, 2, 5, 10, 15, 30, 60, 120, 300, 600].find((s) => range / s <= target) ?? 600
}

/**
 * Read-only cinematic overview of one scene (derived from shots, audio cues and triggers). It never
 * calls a mutating store action: editing happens in the existing Shot planner, Audio planner and
 * trigger editor, which this view only opens.
 */
export function SequenceView({ scene, onEditTrigger }: { scene: Scene; onEditTrigger: (id: string) => void }) {
  const { t, formatNumber } = useT()
  const seq = useMemo(() => buildSequence(scene), [scene])
  const [selKey, setSelKey] = useState<string | null>(null)
  const [cursor, setCursor] = useState<number | null>(null)
  const [zoom, setZoom] = useState(1)
  const [editor, setEditor] = useState<{ kind: 'shot' | 'audio'; id: string } | null>(null)
  const { menu, open: openMenu, close: closeMenu } = useContextMenu()

  // Derived every render: a deleted or renamed-away item can never leave a stale selection.
  const sel = seq.items.find((i) => i.key === selKey) ?? null
  const pct = (v: number) => (v / seq.range) * 100
  const clock = (v: number) => formatClock(v)
  const num = (n: number) => formatNumber(Math.round(n * 100) / 100)
  const select = (i: SequenceItem) => {
    setSelKey(i.key)
    setCursor(i.start)
  }
  /** Context menu for an item: select it or open the existing editor (the view itself stays read-only). */
  const openItemMenu = (i: SequenceItem, x: number, y: number) => {
    select(i)
    openMenu({
      x,
      y,
      ariaLabel: t('ctx.itemMenu'),
      items: [
        { id: 'select', label: t('ctx.select'), onSelect: () => select(i) },
        { id: 'edit', label: t(`seq.edit.${i.kind}`), onSelect: () => (i.kind === 'trigger' ? onEditTrigger(i.id) : setEditor({ kind: i.kind, id: i.id })) },
      ],
    })
  }
  const itemMenuProps = (i: SequenceItem) => ({
    onContextMenu: (e: React.MouseEvent) => {
      if (isEditableTarget(e.target)) return
      e.preventDefault()
      openItemMenu(i, e.clientX, e.clientY)
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (!((e.shiftKey && e.key === 'F10') || e.key === 'ContextMenu')) return
      e.preventDefault()
      const r = e.currentTarget.getBoundingClientRect()
      openItemMenu(i, r.left + Math.min(r.width / 2, 40), r.bottom)
    },
  })
  const kindLabel = (k: SequenceKind) => t(`seq.kind.${k}`)
  const timeText = (i: SequenceItem) =>
    i.kind === 'trigger' ? t('seq.row.at', { time: clock(i.start) }) : t('seq.row.time', { start: clock(i.start), end: clock(i.end) })
  const ariaOf = (i: SequenceItem) => t('seq.itemAria', { kind: kindLabel(i.kind), title: i.title || kindLabel(i.kind), time: timeText(i) })
  const step = tickStep(seq.range, zoom)
  const ticks = Array.from({ length: Math.floor(seq.range / step) + 1 }, (_, n) => n * step)
  const w = seq.warnings
  const emptyTracks = TRACKS.filter((k) => seq.counts[k] === 0).map((k) => t(TRACK_LABEL[k]))
  const active =
    cursor === null
      ? []
      : seq.items.filter((i) => (i.kind === 'trigger' ? Math.abs(i.start - cursor) <= 0.5 : i.start <= cursor && cursor < i.end))
  const trackH = (k: SequenceKind) => seq.laneCount[k] * LANE_H + 8

  return (
    <div className="seq" data-testid="sequence-view">
      <p className="muted seq-intro">{t('seq.intro')}</p>

      <div className="toolbar seq-toolbar">
        <div className="seq-zoom" role="group" aria-label={t('seq.zoomLevel', { n: zoom })}>
          <button className="btn icon small" data-testid="seq-zoom-out" onClick={() => setZoom(ZOOMS[Math.max(0, ZOOMS.indexOf(zoom) - 1)])} disabled={zoom === ZOOMS[0]} title={t('seq.zoomOut')} aria-label={t('seq.zoomOut')}>
            <Minus size={14} />
          </button>
          <button className="btn small" data-testid="seq-zoom-fit" onClick={() => setZoom(1)} disabled={zoom === 1}>{t('seq.zoomFit')}</button>
          <button className="btn icon small" data-testid="seq-zoom-in" onClick={() => setZoom(ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.indexOf(zoom) + 1)])} disabled={zoom === ZOOMS[ZOOMS.length - 1]} title={t('seq.zoomIn')} aria-label={t('seq.zoomIn')}>
            <Plus size={14} />
          </button>
          <span className="muted" data-testid="seq-zoom-level">{t('seq.zoomLevel', { n: zoom })}</span>
        </div>
        <label className="seq-cursor-field">
          <span className="muted">{t('seq.cursor')}</span>
          <input
            type="range"
            data-testid="seq-cursor-input"
            min={0}
            max={Math.ceil(seq.range)}
            step={0.5}
            value={cursor ?? 0}
            onChange={(e) => setCursor(e.target.valueAsNumber)}
            aria-valuetext={cursor === null ? t('seq.cursor') : clock(cursor)}
          />
          <span className="seq-cursor-value" data-testid="seq-cursor-value">{cursor === null ? '—' : t('seq.cursorValue', { time: clock(cursor) })}</span>
          {cursor !== null && (
            <button className="btn small" data-testid="seq-cursor-clear" onClick={() => setCursor(null)}>{t('seq.cursorClear')}</button>
          )}
        </label>
      </div>

      <div className="card seq-card">
        <div className="seq-grid" role="group" aria-label={t('seq.chartAria')}>
          <div className="seq-labels">
            <div className="seq-label seq-label-axis" />
            {TRACKS.map((k) => {
              const Icon = KIND_ICON[k]
              return (
                <div key={k} className="seq-label" style={{ height: trackH(k) }} data-testid={`seq-label-${k}`}>
                  <Icon size={13} /> {t(TRACK_LABEL[k])}
                </div>
              )
            })}
          </div>
          <div className="seq-scroll" data-testid="seq-scroll">
            <div className="seq-chart" data-testid="seq-chart" style={{ width: `${zoom * 100}%` }}>
              <div className="seq-axis" aria-hidden="true">
                {ticks.map((tk) => (
                  <span key={tk} className={tk / seq.range > 0.96 ? 'end' : undefined} style={{ left: `${pct(tk)}%` }}>{clock(tk)}</span>
                ))}
              </div>
              {TRACKS.map((k) => (
                <div key={k} className={`seq-track seq-track-${k}`} data-testid={`seq-track-${k}`} style={{ height: trackH(k) }}>
                  {ticks.map((tk) => (
                    <i key={tk} className="seq-grid-line" style={{ left: `${pct(tk)}%` }} aria-hidden="true" />
                  ))}
                  {seq.counts[k] === 0 && <span className="seq-empty muted">{t(TRACK_EMPTY[k])}</span>}
                  {seq.items.filter((i) => i.kind === k).map((i) => {
                    const common = {
                      type: 'button' as const,
                      'data-testid': 'seq-item',
                      'data-kind': i.kind,
                      'data-key': i.key,
                      'aria-pressed': i.key === sel?.key,
                      'aria-label': ariaOf(i),
                      title: i.title,
                      onClick: () => select(i),
                      ...itemMenuProps(i),
                    }
                    const sel_ = i.key === sel?.key ? ' selected' : ''
                    if (i.kind === 'trigger') {
                      return (
                        <button
                          key={i.key}
                          {...common}
                          className={`seq-marker${sel_}${i.hypothetical ? ' hypothetical' : ''}${i.exceeds ? ' over' : ''}`}
                          style={{ left: `${pct(i.start)}%`, background: i.hypothetical ? 'transparent' : TRIGGER_COLOR[i.ref.kind], borderColor: TRIGGER_COLOR[i.ref.kind] }}
                        >
                          <span>{i.hypothetical ? '?' : ''}</span>
                        </button>
                      )
                    }
                    return (
                      <button
                        key={i.key}
                        {...common}
                        className={`seq-bar ${i.kind === 'shot' ? 'seq-shot' : `audio-bar type-${i.ref.type}`}${sel_}${i.exceeds ? ' over' : ''}`}
                        style={{ left: `${pct(i.start)}%`, width: `${Math.max(0.6, pct(i.end) - pct(i.start))}%`, top: 4 + i.lane * LANE_H }}
                      >
                        <span>{i.title}</span>
                      </button>
                    )
                  })}
                </div>
              ))}
              {seq.range > seq.sceneEnd && (
                <div className="seq-beyond" data-testid="seq-beyond" style={{ left: `${pct(seq.sceneEnd)}%`, right: 0 }} title={t('seq.beyond')} />
              )}
              <div className="seq-scene-end" data-testid="seq-scene-end" style={{ left: `${pct(seq.sceneEnd)}%` }}>
                <span>{t('seq.sceneEnd')} · {clock(seq.sceneEnd)}</span>
              </div>
              {cursor !== null && <div className="seq-cursor" data-testid="seq-cursor" style={{ left: `${pct(Math.min(cursor, seq.range))}%` }} aria-hidden="true" />}
            </div>
          </div>
        </div>
        <p className="muted seq-active" data-testid="seq-active">
          {cursor === null ? '' : active.length ? t('seq.active', { list: active.map((i) => i.title || kindLabel(i.kind)).join(' · ') }) : t('seq.activeNone')}
        </p>
      </div>

      {(w.empty || w.partial || w.shotsBeyond > 0 || w.audioBeyond > 0 || w.triggersBeyond > 0 || w.fadesTooLong > 0) && (
        <div className="issue warning" role="status" data-testid="seq-warnings">
          <TriangleAlert size={14} className="inline-icon" /> <strong>{t('seq.warn.title')}</strong>
          <ul>
            {w.empty && <li>{t('seq.warn.empty')}</li>}
            {w.partial && <li>{t('seq.warn.partial', { list: emptyTracks.join(', ') })}</li>}
            {w.shotsBeyond > 0 && <li>{t('seq.warn.shots', { n: w.shotsBeyond })}</li>}
            {w.audioBeyond > 0 && <li>{t('seq.warn.audio', { n: w.audioBeyond })}</li>}
            {w.triggersBeyond > 0 && <li>{t('seq.warn.triggers', { n: w.triggersBeyond })}</li>}
            {w.fadesTooLong > 0 && <li>{t('seq.warn.fades', { n: w.fadesTooLong })}</li>}
          </ul>
        </div>
      )}
      <p className="muted seq-disclaimer">{t('seq.disclaimer')}</p>

      <div className="timeline-lower">
        <div className="card trigger-list" data-testid="seq-list">
          <div className="section-title">{t('seq.list.title')}</div>
          {seq.items.length === 0 && <p className="muted">{t('seq.list.empty')}</p>}
          {seq.items.map((i) => (
            <button
              key={i.key}
              className={`trigger-row seq-row${i.key === sel?.key ? ' selected' : ''}`}
              data-testid="seq-row"
              data-key={i.key}
              aria-pressed={i.key === sel?.key}
              onClick={() => select(i)}
              {...itemMenuProps(i)}
            >
              <span className="trigger-time">{timeText(i)}</span>
              <span className={`badge seq-kind seq-kind-${i.kind}`}>{kindLabel(i.kind)}</span>
              <span className="trigger-name">{i.title || kindLabel(i.kind)}</span>
              {i.kind === 'trigger' && i.hypothetical && <span className="badge pacing-dep">{t('seq.hypBadge')}</span>}
            </button>
          ))}
        </div>

        <div className="card seq-details" data-testid="seq-details">
          <div className="section-title">{t('seq.details.title')}</div>
          {!sel ? (
            <p className="muted">{t('seq.details.none')}</p>
          ) : (
            <>
              <h3 className="seq-details-title">{sel.title || kindLabel(sel.kind)}</h3>
              <dl className="seq-dl">
                <dt>{t('seq.field.kind')}</dt>
                <dd>{kindLabel(sel.kind)}{sel.kind === 'audio' ? ` · ${t(`audioType.${sel.ref.type}`)}` : sel.kind === 'trigger' ? ` · ${t(`trigger.${sel.ref.kind}`)}` : ''}</dd>
                <dt>{t('seq.field.time')}</dt>
                <dd>{timeText(sel)}</dd>
                {sel.kind === 'shot' && (
                  <>
                    <dt>{t('shot.field.framing')}</dt><dd>{t(`framing.${sel.ref.framing}`)}</dd>
                    <dt>{t('shot.field.movement')}</dt><dd>{t(`movement.${sel.ref.movement}`)}</dd>
                    <dt>{t('shot.field.technique')}</dt><dd>{t(`technique.${sel.ref.technique}`)}</dd>
                    {sel.ref.soundNotes && (<><dt>{t('shot.field.sound')}</dt><dd>{sel.ref.soundNotes}</dd></>)}
                    {sel.ref.visualNotes && (<><dt>{t('shot.field.visual')}</dt><dd>{sel.ref.visualNotes}</dd></>)}
                  </>
                )}
                {sel.kind === 'audio' && (
                  <>
                    <dt>{t('audio.field.origin')}</dt><dd>{t(`audioOrigin.${sel.ref.origin}`)}</dd>
                    <dt>{t('audio.field.direction')}</dt><dd>{t(`audioDir.${sel.ref.direction}`)}</dd>
                    <dt>{t('audio.field.level')}</dt><dd>{num(sel.ref.level)}</dd>
                    <dt>{t('audio.field.fadeIn')} / {t('audio.field.fadeOut')}</dt><dd>{num(sel.ref.fadeIn)} / {num(sel.ref.fadeOut)}{sel.ref.loop ? ` · ${t('audio.field.loop')}` : ''}</dd>
                    {sel.ref.asset && (<><dt>{t('audio.field.asset')}</dt><dd>{sel.ref.asset}</dd></>)}
                    {sel.ref.notes && (<><dt>{t('audio.field.notes')}</dt><dd>{sel.ref.notes}</dd></>)}
                  </>
                )}
                {sel.kind === 'trigger' && (
                  <>
                    <dt>{t('field.intensity')}</dt><dd>{sel.ref.intensity}/10</dd>
                    {sel.ref.description && (<><dt>{t('field.description')}</dt><dd>{sel.ref.description}</dd></>)}
                  </>
                )}
              </dl>
              {sel.kind === 'audio' && sel.silence && <p className="muted">{t('seq.silenceNote')}</p>}
              {sel.kind === 'trigger' && sel.hypothetical && (
                <p className="seq-hyp" data-testid="seq-hypothetical">
                  <span className="badge pacing-dep">{t('seq.hypBadge')}</span> {t('seq.hypNote', { condition: sel.ref.condition })}
                </p>
              )}
              {(sel.exceeds || (sel.kind === 'audio' && sel.fadeTooLong)) && (
                <div className="shot-chips" data-testid="seq-item-warnings">
                  {sel.exceeds && (
                    <span className="badge pacing-dep">
                      {sel.kind === 'trigger'
                        ? t('seq.warn.triggerLate', { n: num(sel.start - seq.sceneEnd) })
                        : t(sel.kind === 'shot' ? 'shot.warn.exceeds' : 'audio.warn.exceeds', { n: num(sel.end - seq.sceneEnd) })}
                    </span>
                  )}
                  {sel.kind === 'audio' && sel.fadeTooLong && <span className="badge pacing-dep">{t('audio.warn.fade')}</span>}
                </div>
              )}
              <button
                className="btn"
                data-testid="seq-edit"
                onClick={() => (sel.kind === 'trigger' ? onEditTrigger(sel.id) : setEditor({ kind: sel.kind, id: sel.id }))}
              >
                <ArrowRightFromLine size={14} /> {t(`seq.edit.${sel.kind}`)}
              </button>
            </>
          )}
        </div>
      </div>

      {menu && <ContextMenu state={menu} onClose={closeMenu} />}
      {editor?.kind === 'shot' && <ShotPlannerDialog sceneId={scene.id} focusId={editor.id} onClose={() => setEditor(null)} />}
      {editor?.kind === 'audio' && <AudioPlannerDialog sceneId={scene.id} focusId={editor.id} onClose={() => setEditor(null)} />}
    </div>
  )
}
