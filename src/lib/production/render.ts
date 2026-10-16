import { exprToText, type ExprWords } from '../flags'
import { formatDiagnostic } from '../diagnostics'
import { formatClock } from '../simulate'
import type { TFunction } from '../../i18n'
import { ADAPTERS, proposedScenePath } from './engines'
import { assessPlan, tbdFor, type TaskAssessment } from './readiness'
import { PHASES, type Engine, type Plan, type PlanNode, type PlanScene, type PlanTask } from './plan'

/** Localized text lookup for the renderer (any `plan.*` / existing key; the unit tests render every key in both languages). */
export type PT = (key: string, params?: Record<string, string | number>) => string
export const asPT = (t: TFunction): PT => t as unknown as PT

export const planFileName = (e: Engine) => `${ADAPTERS[e].fileBase}.md`
export const csvFileName = (e: Engine) => `${ADAPTERS[e].fileBase.replace('production-plan', 'production-tasks')}.csv`

/** One Markdown table cell: user text may contain pipes and line breaks. */
export const cell = (s: string | number): string => String(s).replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim() || '—'
const table = (head: string[], rows: (string | number)[][]): string =>
  rows.length ? [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`)].join('\n') : ''
const n = (v: number) => String(Math.round(v * 100) / 100)

const words = (t: PT): ExprWords => ({ and: t('expr.and'), or: t('expr.or'), not: t('expr.not'), isTrue: t('expr.isTrue'), isFalse: t('expr.isFalse'), unknown: t('expr.unknownFlag') })

const HAS_NOTE = new Set(['transition', 'branch', 'random', 'event', 'delay', 'sequence', 'level'])

/** The scene/level reference for one engine: Unreal shows the authored reference (unverified), Unity only a proposal. */
export function scenePathText(engine: Engine, s: Pick<PlanScene, 'id' | 'authoredUnrealRef'>, t: PT): string {
  if (engine === 'unity') return t('plan.path.proposalUnity', { path: proposedScenePath('unity', s.id) })
  return s.authoredUnrealRef ? t('plan.path.authoredUnreal', { path: s.authoredUnrealRef }) : t('plan.path.proposalUnreal', { path: proposedScenePath('unreal', s.id) })
}

export const tbdText = (codes: readonly string[], t: PT): string[] => codes.map((c) => `TBD — ${t(`plan.tbd.${c}`)}`)

function taskText(task: PlanTask, engine: Engine, t: PT, as?: TaskAssessment) {
  const a = ADAPTERS[engine]
  const params = { subject: task.subject, id: task.id, ...task.params }
  const kindLabel = t(`plan.kind.${task.kind}`)
  const title = ['foundation', 'state', 'verify'].includes(task.kind) ? kindLabel : `${kindLabel}: ${task.subject}`
  const notes = HAS_NOTE.has(task.kind) ? [t(`plan.note.${task.kind}`, params)] : []
  return {
    title,
    concept: t(`plan.${a.prefix}.${task.kind}.what`, params),
    how: t(`plan.${a.prefix}.${task.kind}.how`, params),
    done: t(`plan.${a.prefix}.${task.kind}.done`, params),
    proposals: a.proposals(task),
    tbd: tbdText(as?.missing ?? tbdFor(task, engine), t),
    confirm: as ? tbdText(as.confirm, t) : [],
    notes,
  }
}

const dep = (task: PlanTask) => (task.dependsOn.length ? task.dependsOn.join(', ') : '—')
const srcs = (task: PlanTask) => task.sources.map((s) => `${s.kind}:${s.id}`).join(', ')

export function renderMarkdown(plan: Plan, engine: Engine, t: PT): string {
  const a = ADAPTERS[engine]
  const ex = (x: PlanNode) => (x.expression ? exprToText(x.expression, (id) => plan.flags.find((f) => f.id === id)?.name, words(t)) : '')
  const sceneName = (id: string) => plan.scenes.find((s) => s.id === id)?.title ?? plan.nodes.find((x) => x.id === id)?.title ?? id
  const out: string[] = []
  const h = (i: number) => `## ${i}. ${t(`plan.s${i}`)}`
  /** Each argument is its own block (blank line between blocks); `L` joins the lines of one block (list or paragraph). */
  const P = (...x: string[]) => out.push(...x.filter((s) => s !== '').flatMap((b) => [b, '']))
  const L = (...x: string[]) => x.filter((s) => s !== '').join('\n')

  P(`# ${t('plan.title', { engine: t(`plan.engine.${engine}`) })}`)
  P(`> ${t('plan.disclaimer.generated')}`, `> ${t('plan.disclaimer.noRuntime')}`, `> ${t('plan.disclaimer.proposed')}`)

  // 1
  P(h(1))
  const c = plan.overview.counts
  P(table([t('plan.col.item'), t('plan.col.value')], [
    [t('plan.ov.project'), plan.overview.name],
    [t('plan.ov.description'), plan.overview.description || `TBD — ${t('plan.ov.noDescription')}`],
    [t('plan.ov.start'), plan.overview.startSceneId ? `${plan.overview.startTitle} (${plan.overview.startSceneId})` : `TBD — ${t('plan.gap.noStart')}`],
    [t('plan.ov.scenes'), c.scenes], [t('plan.ov.endings'), c.endings], [t('plan.ov.transitions'), c.transitions],
    [t('plan.ov.logic'), plan.nodes.length], [t('plan.ov.flags'), c.flags], [t('plan.ov.loops'), c.loops],
  ]))
  P(`**${t('plan.assumptions')}**`, L(...[1, 2, 3, 4, 5].map((i) => `- ${t(`plan.assume.${i}`)}`)))

  // 2
  P(h(2))
  P(table(
    [t('plan.col.id'), t('plan.col.scene'), t('plan.col.kind'), t('plan.col.duration'), a.id === 'unreal' ? t('plan.col.levelUnreal') : t('plan.col.levelUnity'), t('plan.col.reachable'), t('plan.col.notes')],
    plan.scenes.map((s) => [
      s.id, s.title, s.customType ? `${t(`kind.${s.kind}`)} / ${s.customType}` : t(`kind.${s.kind}`), formatClock(s.duration),
      scenePathText(engine, s, t), s.reachable ? t('plan.yes') : t('plan.no'),
      [s.ending ? t('plan.scene.ending') : '', s.loop.enabled ? t('plan.scene.loop', { max: n(s.loop.maxIterations), exit: s.loop.exitCondition || 'TBD' }) : '', s.ambience].filter(Boolean).join('; '),
    ]),
  ))

  // 3
  P(h(3))
  P(t('plan.s3.intro'))
  P(table(
    [t('plan.col.from'), t('plan.col.route'), t('plan.col.to'), t('plan.col.gap'), t('plan.col.layer'), t('plan.col.assumption')],
    plan.links.map((l) => [
      `${l.fromTitle} (${l.from})`,
      l.via.length ? l.via.map((v) => `${t(`plan.node.${v.type}`)} "${v.title}"${v.port ? ` [${v.port}]` : ''}`).join(' → ') : (l.labels[0] ?? t('plan.direct')),
      `${l.toTitle} (${l.to})`,
      `${n(l.gapSeconds)} s${l.delaySeconds ? ` (${t('plan.incl.delay', { s: n(l.delaySeconds) })})` : ''}`,
      l.crossing === 'same-layer' ? t('plan.layer.same') : l.crossing,
      l.conditions.length ? `${t('plan.freeText')}: ${l.conditions.join('; ')}` : '',
    ]),
  ))
  const dirs = plan.links.filter((l) => l.direction && (l.direction.playerBelief || l.direction.reality || l.direction.technique !== 'none'))
  if (dirs.length) {
    P(`**${t('plan.beliefReality')}**`)
    P(table([t('plan.col.route'), t('plan.col.technique'), t('plan.col.belief'), t('plan.col.reality'), t('plan.col.reveal')], dirs.map((l) => [`${l.fromTitle} → ${l.toTitle}`, t(`technique.${l.direction!.technique}`), l.direction!.playerBelief, l.direction!.reality, l.direction!.reveal])))
  }

  // 4
  P(h(4))
  P(plan.flags.length ? t('plan.s4.intro') : t('plan.s4.none'))
  P(table([t('plan.col.flag'), t('plan.col.default'), t('plan.col.setBy'), t('plan.col.testedBy')], plan.flags.map((f) => [
    `${f.name} (${f.id})`, f.defaultValue ? 'true' : 'false',
    f.setBy.map((s) => `${s.title} → ${s.value}`).join('; ') || t('plan.never'),
    f.testedBy.map((s) => s.title).join('; ') || '—',
  ])))

  // 5
  P(h(5))
  const ifs = plan.nodes.filter((x) => x.type === 'branch')
  const rands = plan.nodes.filter((x) => x.type === 'random')
  if (!ifs.length && !rands.length) P(t('plan.s5.none'))
  for (const b of ifs) {
    P(`### ${t('plan.node.branch')}: ${b.title} (${b.id})`)
    P(L(
      b.expression ? `- ${t('plan.cond.structured')}: \`${ex(b)}\`` : `- ${t('plan.cond.noStructured')}`,
      b.condition ? `- ${t('plan.cond.freeText')}: ${b.condition}` : '',
      !b.expression && !b.condition ? `- TBD — ${t('plan.tbd.ifCondition')}` : '',
      ...b.ports.map((o) => `- ${o.port.toUpperCase() || '?'} → ${o.targetTitle} (${o.targetId})${o.label ? ` — ${o.label}` : ''}`),
    ))
  }
  for (const r of rands) {
    P(`### ${t('plan.node.random')}: ${r.title} (${r.id})`)
    P(L(
      `- ${t('plan.random.intent', { a: n(r.probabilityA ?? 50), b: n(100 - (r.probabilityA ?? 50)) })}`,
      ...r.ports.map((o) => `- ${o.port.toUpperCase() || '?'} (${o.port === 'a' ? r.labelA : r.labelB}) → ${o.targetTitle} (${o.targetId})`),
    ))
  }

  // 6
  P(h(6))
  const evs = plan.nodes.filter((x) => x.type === 'event')
  const dls = plan.nodes.filter((x) => x.type === 'delay')
  if (!evs.length && !dls.length && !plan.sequences.length) P(t('plan.s6.none'))
  if (evs.length) P(`**${t('plan.events')}**`, t('plan.events.note'), table([t('plan.col.id'), t('plan.col.title'), t('plan.col.category'), t('plan.col.inSequence')], evs.map((e) => [e.id, e.title, e.eventCategory ? t(`event.cat.${e.eventCategory}`) : '—', e.stage ? `${e.stage.sequenceId} / ${e.stage.stage}` : '—'])))
  if (dls.length) P(`**${t('plan.delays')}**`, t('plan.delays.note'), table([t('plan.col.id'), t('plan.col.title'), t('plan.col.seconds'), t('plan.col.inSequence')], dls.map((d) => [d.id, d.title, n(d.seconds ?? 0), d.stage ? `${d.stage.sequenceId} / ${d.stage.stage}` : '—'])))
  for (const s of plan.sequences) {
    P(`### ${t('plan.node.sequence')}: ${s.title} (${s.id})`, t('plan.seq.order'))
    const names = (id: string | null) => (id ? plan.nodes.find((x) => x.id === id)?.title ?? id : '—')
    P(L(
      ...s.stages.flatMap((st) => [
        `${st.stage * 2 + 1}. ${t('plan.seq.then', { n: st.stage })}: ${st.chain.map((x) => `${t(`plan.node.${x.type}`)} "${x.title}"`).join(' → ') || `TBD — ${t('plan.tbd.stageContent')}`}${st.complete ? '' : ` — ${t('plan.seq.incomplete')}`}`,
        `${st.stage * 2 + 2}. ${t('plan.seq.return', { n: st.stage })}: ${st.returnId ? names(st.returnId) : 'TBD'}`,
      ]),
      `5. ${t('plan.seq.completed')}: ${s.completed ? `${s.completed.title} (${s.completed.id})` : `TBD — ${t('plan.seq.noCompleted')}`}`,
    ))
  }

  // 7
  P(h(7))
  P(plan.shots.length ? table([t('plan.col.scene'), t('plan.col.shot'), t('plan.col.start'), t('plan.col.duration'), t('plan.col.framing'), t('plan.col.movement'), t('plan.col.technique'), t('plan.col.notes')], plan.shots.map((s) => [sceneName(s.sceneId), s.title, formatClock(s.start), n(s.duration), t(`framing.${s.framing}`), t(`movement.${s.movement}`), t(`technique.${s.technique}`), [s.visualNotes, s.soundNotes].filter(Boolean).join('; ')])) : t('plan.s7.none'))
  const styled = plan.links.filter((l) => l.styles.some((s) => s !== 'cut') && !l.via.length)
  if (styled.length) P(`**${t('plan.cinTransitions')}**`, table([t('plan.col.route'), t('plan.col.style')], styled.map((l) => [`${l.fromTitle} → ${l.toTitle}`, l.styles.map((s) => t(`style.${s}`)).join(', ')])))

  // 8
  P(h(8))
  P(plan.cues.length ? table([t('plan.col.scene'), t('plan.col.cue'), t('plan.col.type'), t('plan.col.origin'), t('plan.col.spatial'), t('plan.col.level'), t('plan.col.start'), t('plan.col.duration'), t('plan.col.asset')], plan.cues.map((x) => [sceneName(x.sceneId), x.type === 'silence' ? `${x.title} (${t('plan.silence')})` : x.title, t(`audioType.${x.type}`), t(`audioOrigin.${x.origin}`), t(`audioDir.${x.direction}`), x.level, formatClock(x.start), n(x.duration), x.asset || `TBD — ${t('plan.tbd.audioAsset')}`])) : t('plan.s8.none'))

  // 9
  P(h(9))
  if (!plan.characters.length) P(t('plan.s9.none'))
  for (const ch of plan.characters) {
    P(`### ${ch.name} (${ch.id}) — ${t(`role.${ch.role}`)}`, ch.description)
    P(table([t('plan.col.state'), t('plan.col.behavior'), t('plan.col.aggression'), t('plan.col.usedIn')], ch.states.map((s) => [s.name, s.behavior || `TBD — ${t('plan.tbd.characterBehavior')}`, s.aggression, s.scenes.map(sceneName).join(', ') || '—'])))
  }

  // 10
  P(h(10))
  P(plan.triggers.length ? table([t('plan.col.scene'), t('plan.col.trigger'), t('plan.col.kind'), t('plan.col.time'), t('plan.col.intensity'), t('plan.col.once'), t('plan.col.assumption')], plan.triggers.map((x) => [sceneName(x.sceneId), x.name, t(`trigger.${x.kind}`), formatClock(x.time), x.intensity, x.once ? t('plan.yes') : t('plan.no'), x.condition ? `${t('plan.freeText')}: ${x.condition}` : ''])) : t('plan.s10.none'))

  // 11
  P(h(11))
  P(table([t('plan.col.asset'), t('plan.col.scene'), t('plan.col.id'), t('plan.col.status')], [
    ...plan.scenes.map((x) => [t('plan.asset.level'), x.title, x.id, scenePathText(engine, x, t)]),
    ...plan.assets.map((x) => [t('plan.asset.audio'), sceneName(x.sceneId), x.id, x.value ? t('plan.path.authoredAsset', { path: x.value }) : `TBD — ${t('plan.tbd.audioAsset')}`]),
    ...plan.characters.map((x) => [t('plan.asset.character'), x.name, x.id, `TBD — ${t('plan.tbd.characterAssets')}`]),
  ]))
  P(`**${t('plan.gaps')}** (${plan.gaps.length + plan.issues.length})`)
  const fmt = (d: Parameters<typeof formatDiagnostic>[1]) => formatDiagnostic(t as unknown as TFunction, d)
  const lines = [
    ...plan.gaps.map((g) => `- [${g.severity}] ${t(`plan.gap.${g.code}`, g.params)}${g.ids.length ? ` (${g.ids.join(', ')})` : ''}`),
    ...plan.issues.map((i) => `- [${i.severity}] ${fmt(i.diagnostic)}`),
  ]
  P(L(...(lines.length ? lines : [t('plan.noGaps')])))

  // 12
  P(h(12))
  P(t('plan.order.note'))
  P(table([t('plan.col.phase'), t('plan.col.milestone'), t('plan.col.tasks'), t('plan.col.exit')], PHASES.map((ph) => [ph.n, t(`plan.phase.${ph.n}`), plan.tasks.filter((x) => x.phase === ph.n).length, t(`plan.exit.${ph.n}`)])))

  // 13
  P(h(13))
  P(t('plan.readyMeaning'), t('plan.impl.unknown'))
  const assess = assessPlan(plan, engine)
  for (const task of plan.tasks) {
    const as = assess.get(task.id)!
    const x = taskText(task, engine, t, as)
    P(`### ${task.id} — ${x.title}`)
    P(L(
      `- **${t('plan.col.order')}:** ${task.order + 1} · **${t('plan.col.phase')}:** ${task.phase} — ${t(`plan.phase.${task.phase}`)}`,
      `- **${t('plan.col.readiness')}:** ${t(`plan.ready.${as.readiness}`)}${as.blockedBy.length ? ` (${t('plan.col.blockedBy')}: ${as.blockedBy.join(', ')})` : ''}`,
      `- **${t('plan.col.sources')}:** ${srcs(task)}`,
      `- **${t('plan.col.concept')}:** ${x.concept}`,
      x.proposals.length ? `- **${t('plan.col.proposed')}:** ${x.proposals.join('; ')}` : '',
      `- **${t('plan.col.instructions')}:** ${x.how}`,
      `- **${t('plan.col.dependsOn')}:** ${dep(task)}`,
      `- **${t('plan.col.done')}:** ${x.done}`,
      x.tbd.length ? `- **${t('plan.col.blocking')}:** ${x.tbd.join(' | ')}` : '',
      x.confirm.length || x.notes.length ? `- **${t('plan.col.confirm')}:** ${[...x.confirm, ...x.notes].join(' | ')}` : '',
    ))
  }

  // 14
  P(h(14))
  P(`**${t('plan.verify.engine')}**`, L(...[1, 2, 3, 4, 5, 6].map((i) => `- [ ] ${t(`plan.${a.prefix}.verify.${i}`)}`)))
  P(`**${t('plan.verify.project')}**`)
  P(L(
    ...plan.scenes.filter((s) => s.ending).map((s) => `- [ ] ${t('plan.verify.ending', { title: s.title, id: s.id })}`),
    ...ifs.map((b) => `- [ ] ${t('plan.verify.if', { title: b.title, id: b.id })}`),
    ...rands.map((r) => `- [ ] ${t('plan.verify.random', { title: r.title, id: r.id })}`),
    ...plan.sequences.map((s) => `- [ ] ${t('plan.verify.sequence', { title: s.title, id: s.id })}`),
    ...plan.scenes.filter((s) => s.loop.enabled).map((s) => `- [ ] ${t('plan.verify.loop', { title: s.title, max: n(s.loop.maxIterations) })}`),
    ...plan.scenes.filter((s) => !s.reachable).map((s) => `- [ ] ${t('plan.verify.unreachable', { title: s.title, id: s.id })}`),
    `- [ ] ${t('plan.verify.playtest')}`,
  ))

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n'
}

/** RFC 4180 field: quoted when needed; a leading `= + - @` is neutralised so spreadsheets never treat user text as a formula. */
export function csvField(v: string | number): string {
  let s = String(v)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function renderTaskCsv(plan: Plan, engine: Engine, t: PT): string {
  const head = ['id', 'order', 'phase', 'kind', 'title', 'readiness', 'blockedBy', 'sources', 'concept', 'proposed', 'instructions', 'dependsOn', 'done', 'blocking', 'confirm'].map((k) => t(`plan.csv.${k}`))
  const assess = assessPlan(plan, engine)
  const rows = plan.tasks.map((task) => {
    const as = assess.get(task.id)!
    const x = taskText(task, engine, t, as)
    return [task.id, task.order + 1, task.phase, task.kind, x.title, as.readiness, as.blockedBy.join(' '), srcs(task), x.concept, x.proposals.join('; '), x.how, task.dependsOn.join(' '), x.done, x.tbd.join(' | '), [...x.confirm, ...x.notes].join(' | ')]
  })
  return [head, ...rows].map((r) => r.map(csvField).join(',')).join('\r\n') + '\r\n'
}
