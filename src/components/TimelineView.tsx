import { useMemo, useRef, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useStore } from '../store/useStore'
import { TRIGGER_KINDS } from '../lib/schema'
import { TRIGGER_COLOR } from '../lib/theme'
import { useT } from '../i18n/store'
import { Field, NumberInput, Select, TextArea, TextInput } from './fields'

const W = 1000
const H = 240
const PAD = { l: 36, r: 20, t: 16, b: 34 }

export function TimelineView() {
  const { t: T } = useT()
  const project = useStore((s) => s.project)
  const sceneId = useStore((s) => s.timelineSceneId)
  const setScene = useStore((s) => s.setTimelineScene)
  const selId = useStore((s) => s.selectedTriggerId)
  const selectTrigger = useStore((s) => s.selectTrigger)
  const addTrigger = useStore((s) => s.addTrigger)
  const updateTrigger = useStore((s) => s.updateTrigger)
  const deleteTrigger = useStore((s) => s.deleteTrigger)
  const svgRef = useRef<SVGSVGElement>(null)
  const [drag, setDrag] = useState<string | null>(null)

  const scene = project.scenes.find((s) => s.id === sceneId) ?? project.scenes[0]
  const sorted = useMemo(() => (scene ? [...scene.triggers].sort((a, b) => a.time - b.time) : []), [scene])

  if (!scene) return <div className="empty">{T('tl.empty')}</div>

  const maxT = Math.max(scene.duration, ...scene.triggers.map((t) => t.time), 1)
  const x = (t: number) => PAD.l + (t / maxT) * (W - PAD.l - PAD.r)
  const y = (i: number) => PAD.t + (1 - i / 10) * (H - PAD.t - PAD.b)
  const selected = scene.triggers.find((t) => t.id === selId)

  const toData = (e: { clientX: number; clientY: number }) => {
    const r = svgRef.current!.getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * W
    const py = ((e.clientY - r.top) / r.height) * H
    const time = ((px - PAD.l) / (W - PAD.l - PAD.r)) * maxT
    const intensity = (1 - (py - PAD.t) / (H - PAD.t - PAD.b)) * 10
    return {
      time: Math.min(maxT, Math.max(0, Math.round(time * 2) / 2)),
      intensity: Math.min(10, Math.max(0, Math.round(intensity))),
    }
  }

  const path = sorted.map((t, i) => `${i ? 'L' : 'M'}${x(t.time)},${y(t.intensity)}`).join(' ')
  const area = sorted.length
    ? `${path} L${x(sorted[sorted.length - 1].time)},${y(0)} L${x(sorted[0].time)},${y(0)} Z`
    : ''
  const tickStep = maxT > 240 ? 60 : maxT > 90 ? 30 : 10
  const ticks = Array.from({ length: Math.floor(maxT / tickStep) + 1 }, (_, i) => i * tickStep)

  return (
    <div className="view-pad timeline-view">
      <div className="toolbar">
        <Select
          value={scene.id}
          options={project.scenes.map((s) => ({ value: s.id, label: `${s.title} · ${T(`kind.${s.kind}`)}` }))}
          onChange={setScene}
        />
        <button className="btn primary" onClick={() => addTrigger(scene.id, maxT / 2)}>
          <Plus size={14} /> {T('tl.addTrigger')}
        </button>
        <span className="muted">
          {T('tl.summary', { seconds: scene.duration, n: scene.triggers.length })}
        </span>
      </div>

      <div className="card timeline-card">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={T('tl.chartAria')}
          className="timeline-svg"
          onPointerMove={(e) => {
            if (!drag) return
            const { time, intensity } = toData(e)
            updateTrigger(scene.id, drag, { time, intensity })
          }}
          onPointerUp={() => setDrag(null)}
          onPointerLeave={() => setDrag(null)}
          onDoubleClick={(e) => {
            const { time } = toData(e)
            const id = addTrigger(scene.id, time)
            const { intensity } = toData(e)
            updateTrigger(scene.id, id, { intensity })
          }}
        >
          <defs>
            <linearGradient id="tl-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#e0334c" stopOpacity="0.45" />
              <stop offset="1" stopColor="#e0334c" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0, 2.5, 5, 7.5, 10].map((v) => (
            <g key={v}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className="grid-line" />
              <text x={PAD.l - 8} y={y(v) + 4} className="axis-text" textAnchor="end">
                {v}
              </text>
            </g>
          ))}
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={x(tick)} x2={x(tick)} y1={PAD.t} y2={H - PAD.b} className="grid-line v" />
              <text x={x(tick)} y={H - PAD.b + 18} className="axis-text" textAnchor="middle">
                {T('unit.seconds', { n: tick })}
              </text>
            </g>
          ))}
          <line
            x1={x(scene.duration)}
            x2={x(scene.duration)}
            y1={PAD.t}
            y2={H - PAD.b}
            className="end-line"
          />
          {area && <path d={area} fill="url(#tl-fill)" />}
          {path && <path d={path} className="curve" />}
          {sorted.map((t) => (
            <g
              key={t.id}
              className={`marker${t.id === selId ? ' selected' : ''}`}
              onPointerDown={(e) => {
                e.stopPropagation()
                ;(e.target as Element).setPointerCapture?.(e.pointerId)
                selectTrigger(t.id)
                setDrag(t.id)
              }}
              onDoubleClick={(e) => e.stopPropagation()}
            >
              <line x1={x(t.time)} x2={x(t.time)} y1={y(t.intensity)} y2={y(0)} stroke={TRIGGER_COLOR[t.kind]} strokeOpacity={0.5} />
              <circle cx={x(t.time)} cy={y(t.intensity)} r={t.id === selId ? 9 : 7} fill={TRIGGER_COLOR[t.kind]} />
              <title>{T('tl.markerTitle', { name: t.name, time: t.time, intensity: t.intensity })}</title>
            </g>
          ))}
        </svg>
        <div className="legend">
          {TRIGGER_KINDS.map((k) => (
            <span key={k} className="legend-item">
              <i style={{ background: TRIGGER_COLOR[k] }} /> {T(`trigger.${k}`)}
            </span>
          ))}
        </div>
      </div>

      <div className="timeline-lower">
        <div className="card trigger-list">
          <div className="section-title">{T('tl.events')}</div>
          {sorted.length === 0 && <p className="muted">{T('tl.noTriggers')}</p>}
          {sorted.map((t) => (
            <button
              key={t.id}
              className={`trigger-row${t.id === selId ? ' selected' : ''}`}
              onClick={() => selectTrigger(t.id)}
            >
              <span className="trigger-time">{T('unit.seconds', { n: t.time })}</span>
              <i style={{ background: TRIGGER_COLOR[t.kind] }} />
              <span className="trigger-name">{t.name}</span>
              <span className="trigger-int">{t.intensity}/10</span>
            </button>
          ))}
        </div>
        <div className="card trigger-editor">
          {selected ? (
            <>
              <div className="insp-head">
                <h3>{T('tl.trigger')}</h3>
                <button className="btn small danger" onClick={() => deleteTrigger(scene.id, selected.id)}>
                  <Trash2 size={14} /> {T('btn.delete')}
                </button>
              </div>
              <Field label={T('field.name')}>
                <TextInput value={selected.name} onChange={(name) => updateTrigger(scene.id, selected.id, { name })} />
              </Field>
              <div className="row">
                <Field label={T('field.type')}>
                  <Select
                    value={selected.kind}
                    options={TRIGGER_KINDS.map((k) => ({ value: k, label: T(`trigger.${k}`) }))}
                    onChange={(kind) => updateTrigger(scene.id, selected.id, { kind })}
                  />
                </Field>
                <Field label={T('field.time')}>
                  <NumberInput value={selected.time} min={0} step={0.5} onChange={(time) => updateTrigger(scene.id, selected.id, { time })} />
                </Field>
                <Field label={T('field.intensity')}>
                  <NumberInput value={selected.intensity} min={0} max={10} onChange={(intensity) => updateTrigger(scene.id, selected.id, { intensity: Math.min(10, Math.max(0, intensity)) })} />
                </Field>
              </div>
              <Field label={T('field.description')}>
                <TextArea value={selected.description} onChange={(description) => updateTrigger(scene.id, selected.id, { description })} />
              </Field>
              <Field label={T('field.condition')}>
                <TextInput value={selected.condition} placeholder={T('ph.triggerCondition')} onChange={(condition) => updateTrigger(scene.id, selected.id, { condition })} />
              </Field>
              <label className="check">
                <input type="checkbox" checked={selected.once} onChange={(e) => updateTrigger(scene.id, selected.id, { once: e.target.checked })} />
                {T('check.once')}
              </label>
            </>
          ) : (
            <p className="muted">{T('tl.selectHint')}</p>
          )}
        </div>
      </div>
    </div>
  )
}
