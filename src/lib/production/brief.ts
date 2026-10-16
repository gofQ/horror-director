import { exprToText, type ExprWords } from '../flags'
import { formatClock } from '../simulate'
import { ADAPTERS, proposedScenePath } from './engines'
import type { Engine, Plan, PlanCharacter, PlanCue, PlanLink, PlanNode, PlanScene, PlanSequence, PlanStageNode, PlanTask, TaskKind } from './plan'
import { assessPlan, type TaskAssessment } from './readiness'
import { scenePathText, tbdText, type PT } from './render'

/**
 * Standalone implementation brief for ONE production task. Pure and deterministic: everything comes from the plan
 * (authored project data), the engine adapter and the localized templates. Authored facts, proposed implementation
 * choices and unresolved requirements are kept in separate sections. It never states that anything exists in an engine project.
 */
export interface BriefSection {
  id: string
  heading: string
  lines: string[]
}
export interface Brief {
  taskId: string
  engine: Engine
  title: string
  filename: string
  readiness: TaskAssessment
  sections: BriefSection[]
  markdown: string
}

/** File-name-safe brief name (task ids contain user ids; only `[A-Za-z0-9._-]` survives). */
export const briefFileName = (engine: Engine, taskId: string): string => `brief-${engine}-${taskId.replace(/[^A-Za-z0-9._-]/g, '_')}.md`

const n = (v: number) => String(Math.round(v * 100) / 100)
const bullets = (xs: string[]) => xs.map((x) => `- ${x}`)

function hopText(l: PlanLink, t: PT): string {
  const route = l.via.length ? l.via.map((v) => `${t(`plan.node.${v.type}`)} "${v.title}"${v.port ? ` [${v.port}]` : ''}`).join(' → ') : (l.labels[0] ?? t('plan.direct'))
  const delay = l.delaySeconds ? ` (${t('plan.incl.delay', { s: n(l.delaySeconds) })})` : ''
  const free = l.conditions.length ? ` — ${t('plan.freeText')}: ${l.conditions.join('; ')}` : ''
  return `${l.fromTitle} (${l.from}) → ${route} → ${l.toTitle} (${l.to}); ${n(l.gapSeconds)} s${delay}${free}`
}

const stageNodeText = (c: PlanStageNode, t: PT): string => {
  const base = `${t(`plan.node.${c.type}`)} "${c.title}" (${c.id})`
  if (c.type === 'delay') return `${base} ${n(c.seconds ?? 0)} s`
  if (c.type === 'event') return `${base} [${c.category ? t(`event.cat.${c.category}`) : ''}]`
  if (c.type === 'setFlag') return `${base} ${c.flag ?? 'TBD'} = ${c.value ? 'TRUE' : 'FALSE'}`
  return base
}

interface Facts {
  facts: string[]
  checks: string[]
}

export function buildBrief(plan: Plan, taskId: string, engine: Engine, t: PT): Brief | null {
  const task = plan.tasks.find((x) => x.id === taskId)
  if (!task) return null
  const adapter = ADAPTERS[engine]
  const assess = assessPlan(plan, engine).get(task.id)!
  const word: ExprWords = { and: t('expr.and'), or: t('expr.or'), not: t('expr.not'), isTrue: t('expr.isTrue'), isFalse: t('expr.isFalse'), unknown: t('expr.unknownFlag') }
  const params = { subject: task.subject, id: task.id, ...adapter.vocab, ...task.params } as Record<string, string | number>
  const sceneOf = (id: string): PlanScene | undefined => plan.scenes.find((x) => x.id === id)
  const nodeOf = (id: string): PlanNode | undefined => plan.nodes.find((x) => x.id === id)
  const sourceId = (kind: string) => task.sources.find((s) => s.kind === kind)?.id ?? ''
  const nameOf = (id: string) => sceneOf(id)?.title ?? nodeOf(id)?.title ?? id

  const cueLine = (c: PlanCue): string =>
    t('brief.f.cue', {
      title: c.title, id: c.id, type: t(`audioType.${c.type}`), origin: t(`audioOrigin.${c.origin}`), dir: t(`audioDir.${c.direction}`),
      start: formatClock(c.start), dur: n(c.duration), level: c.level, fi: n(c.fadeIn), fo: n(c.fadeOut), loop: c.loop ? t('brief.loopYes') : t('brief.loopNo'),
      asset: c.asset ? t('plan.path.authoredAsset', { path: c.asset }) : `TBD — ${t('plan.tbd.audioAsset')}`,
    }) + (c.type === 'silence' ? ` ${t('brief.silenceNote')}` : '')

  const sceneFacts = (s: PlanScene): Facts => {
    const facts = [
      t('brief.f.scene', { title: s.title, id: s.id, kind: t(`kind.${s.kind}`), type: s.customType ? ` / ${s.customType}` : '', duration: formatClock(s.duration), seconds: n(s.duration) }),
      t('brief.f.path', { path: scenePathText(engine, s, t) }),
      t('brief.f.reach', { value: s.reachable ? t('plan.yes') : t('plan.no') }),
    ]
    if (s.description) facts.push(t('brief.f.sceneDesc', { text: s.description }))
    if (s.ambience) facts.push(t('brief.f.ambience', { text: s.ambience }))
    if (s.ending) facts.push(t('plan.scene.ending'))
    if (s.loop.enabled) facts.push(t('plan.scene.loop', { max: n(s.loop.maxIterations), exit: s.loop.exitCondition || 'TBD' }))
    if (s.characterStates.length) facts.push(t('brief.f.chars', { list: s.characterStates.map((x) => `${x.character}: ${x.state}`).join('; ') }))
    for (const l of plan.links.filter((x) => x.from === s.id)) facts.push(`${t('brief.f.hop')}: ${hopText(l, t)}`)
    for (const l of plan.links.filter((x) => x.to === s.id && x.from !== s.id)) facts.push(`${t('brief.f.incoming')}: ${hopText(l, t)}`)
    const checks = [t('brief.c.level', { title: s.title })]
    if (s.loop.enabled) checks.push(t('brief.c.loop', { max: n(s.loop.maxIterations) }))
    return { facts, checks }
  }

  const portLines = (nd: PlanNode): string[] => nd.ports.map((o) => t('brief.f.port', { port: o.port.toUpperCase() || '?', target: `${o.targetTitle} (${o.targetId})`, label: o.label ? ` — ${o.label}` : '' }))
  const around = (nd: PlanNode): string[] =>
    nd.upstream.length || nd.downstream.length ? [t('brief.f.around', { up: nd.upstream.map(nameOf).join(', ') || '—', down: nd.downstream.map(nameOf).join(', ') || '—' })] : []

  const sequenceFacts = (sq: PlanSequence): Facts => {
    const facts = [t('brief.f.seq', { title: sq.title, id: sq.id })]
    for (const st of sq.stages)
      facts.push(t('brief.f.stage', { n: st.stage, chain: st.chain.map((c) => stageNodeText(c, t)).join(' → ') || `TBD — ${t('plan.tbd.stageContent')}`, ret: st.returnId ? `${nodeOf(st.returnId)?.title ?? st.returnId} (${st.returnId})` : 'TBD', delay: n(st.delaySeconds), done: st.complete ? '' : ` — ${t('plan.seq.incomplete')}` }))
    facts.push(sq.completed ? t('brief.f.seqDone', { target: `${sq.completed.title} (${sq.completed.id})` }) : `TBD — ${t('plan.seq.noCompleted')}`)
    const nd = nodeOf(sq.id)
    if (nd) facts.push(...around(nd))
    return { facts, checks: [t('brief.c.sequence', { title: sq.title })] }
  }

  const characterFacts = (c: PlanCharacter): Facts => ({
    facts: [
      `${c.name} (${c.id}) — ${t(`role.${c.role}`)}${c.description ? `: ${c.description}` : ''}`,
      ...c.states.map((st) => t('brief.f.charState', { name: st.name, id: st.id, aggr: st.aggression, behavior: st.behavior || `TBD — ${t('plan.tbd.characterBehavior')}`, scenes: st.scenes.map(nameOf).join(', ') || '—' })),
    ],
    checks: c.states.map((st) => t('brief.c.charState', { name: st.name })),
  })

  const collect = (): Facts => {
    switch (task.kind) {
      case 'foundation':
        return { facts: [t('brief.f.project', { name: plan.overview.name }), `${t('plan.ov.scenes')}: ${plan.scenes.length}; ${t('plan.ov.endings')}: ${plan.scenes.filter((x) => x.ending).length}; ${t('plan.ov.logic')}: ${plan.nodes.length}; ${t('plan.ov.flags')}: ${plan.flags.length}`, `${t('plan.ov.start')}: ${plan.overview.startSceneId ? `${plan.overview.startTitle} (${plan.overview.startSceneId})` : `TBD — ${t('plan.gap.noStart')}`}`], checks: [t('brief.c.foundation')] }
      case 'state':
        return {
          facts: plan.flags.map((f) => t('brief.f.flag', { name: f.name, id: f.id, def: f.defaultValue ? 'TRUE' : 'FALSE', setBy: f.setBy.map((x) => `${x.title} → ${x.value ? 'TRUE' : 'FALSE'}`).join('; ') || t('plan.never'), testedBy: f.testedBy.map((x) => x.title).join('; ') || '—' })),
          checks: [t('brief.c.state')],
        }
      case 'level': {
        const s = sceneOf(sourceId('scene'))
        return s ? sceneFacts(s) : { facts: [], checks: [] }
      }
      case 'transition': {
        const l = plan.links.find((x) => x.linkIds[0] === sourceId('transition') && !x.via.length)
        const facts = l ? [`${t('brief.f.hop')}: ${hopText(l, t)}`, t('brief.f.style', { style: l.styles.map((x) => t(`style.${x}`)).join(', '), layer: l.crossing === 'same-layer' ? t('plan.layer.same') : l.crossing })] : []
        if (l?.direction && (l.direction.technique !== 'none' || l.direction.playerBelief || l.direction.reality)) facts.push(t('brief.f.dir', { route: `${l.fromTitle} → ${l.toTitle}`, tech: t(`technique.${l.direction.technique}`), belief: l.direction.playerBelief || '—', real: l.direction.reality || '—', reveal: l.direction.reveal || '—', vc: l.direction.visualContinuity || '—', ac: l.direction.audioContinuity || '—', shots: [l.direction.sourceShotId, l.direction.targetShotId].filter(Boolean).join(' → ') || '—' }))
        return { facts, checks: [t('brief.c.transition', { seconds: n(l?.gapSeconds ?? 0) })] }
      }
      case 'branch': {
        const nd = nodeOf(sourceId('node'))
        if (!nd) return { facts: [], checks: [] }
        const facts = [nd.expression ? t('brief.f.ifExpr', { expr: exprToText(nd.expression, (id) => plan.flags.find((f) => f.id === id)?.name, word) }) : t('plan.cond.noStructured')]
        if (nd.condition) facts.push(t('brief.f.ifFree', { text: nd.condition }))
        if (!nd.expression && !nd.condition) facts.push(`TBD — ${t('plan.tbd.ifCondition')}`)
        facts.push(...portLines(nd), ...around(nd))
        return { facts, checks: [t('brief.c.branch', { title: nd.title })] }
      }
      case 'random': {
        const nd = nodeOf(sourceId('node'))
        if (!nd) return { facts: [], checks: [] }
        return { facts: [t('brief.f.rnd', { a: n(nd.probabilityA ?? 50), b: n(100 - (nd.probabilityA ?? 50)), la: nd.labelA || 'A', lb: nd.labelB || 'B' }), ...portLines(nd), ...around(nd)], checks: [t('brief.c.random', { title: nd.title })] }
      }
      case 'event': {
        const nd = nodeOf(sourceId('node'))
        if (!nd) return { facts: [], checks: [] }
        return { facts: [t('brief.f.evt', { title: nd.title, id: nd.id, category: nd.eventCategory ? t(`event.cat.${nd.eventCategory}`) : '—', text: nd.description || '—' }), ...portLines(nd), ...around(nd)], checks: [t('brief.c.event', { title: nd.title })] }
      }
      case 'delay': {
        const nd = nodeOf(sourceId('node'))
        if (!nd) return { facts: [], checks: [] }
        return { facts: [t('brief.f.dly', { title: nd.title, id: nd.id, seconds: n(nd.seconds ?? 0) }), ...(nd.description ? [nd.description] : []), ...portLines(nd), ...around(nd)], checks: [t('brief.c.delay', { seconds: n(nd.seconds ?? 0) })] }
      }
      case 'sequence': {
        const sq = plan.sequences.find((x) => x.id === sourceId('node'))
        return sq ? sequenceFacts(sq) : { facts: [], checks: [] }
      }
      case 'cinematic': {
        const sid = sourceId('scene')
        const shots = plan.shots.filter((x) => x.sceneId === sid)
        const facts = [`${nameOf(sid)} (${sid})`, ...shots.map((x) => t('brief.f.shot', { title: x.title, id: x.id, start: formatClock(x.start), dur: n(x.duration), framing: t(`framing.${x.framing}`), move: t(`movement.${x.movement}`), tech: t(`technique.${x.technique}`), visual: x.visualNotes || '—', sound: x.soundNotes || '—' }))]
        for (const l of plan.links.filter((x) => (x.from === sid || x.to === sid) && x.direction && (x.direction.technique !== 'none' || x.direction.playerBelief || x.direction.reality)))
          facts.push(t('brief.f.dir', { route: `${l.fromTitle} → ${l.toTitle}`, tech: t(`technique.${l.direction!.technique}`), belief: l.direction!.playerBelief || '—', real: l.direction!.reality || '—', reveal: l.direction!.reveal || '—', vc: l.direction!.visualContinuity || '—', ac: l.direction!.audioContinuity || '—', shots: [l.direction!.sourceShotId, l.direction!.targetShotId].filter(Boolean).join(' → ') || '—' }))
        return { facts, checks: shots.map((x) => t('brief.c.shot', { title: x.title, start: formatClock(x.start) })) }
      }
      case 'assetAudio':
      case 'audio': {
        const sid = sourceId('scene')
        const cues = plan.cues.filter((x) => x.sceneId === sid)
        return { facts: [`${nameOf(sid)} (${sid})`, ...cues.map(cueLine)], checks: cues.map((c) => (task.kind === 'assetAudio' ? t('brief.c.cueAsset', { title: c.title }) : t('brief.c.cue', { title: c.title, start: formatClock(c.start), dir: t(`audioDir.${c.direction}`) }))) }
      }
      case 'assetCharacter':
      case 'character': {
        const c = plan.characters.find((x) => x.id === sourceId('character'))
        if (!c) return { facts: [], checks: [] }
        const f = characterFacts(c)
        return task.kind === 'character' ? f : { facts: f.facts, checks: [t('brief.c.charAsset', { name: c.name })] }
      }
      case 'trigger': {
        const sid = sourceId('scene')
        const ts = plan.triggers.filter((x) => x.sceneId === sid)
        return {
          facts: [`${nameOf(sid)} (${sid})`, ...ts.map((x) => t('brief.f.trigger', { name: x.name, id: x.id, kind: t(`trigger.${x.kind}`), time: formatClock(x.time), intensity: x.intensity, once: x.once ? t('brief.once') : t('brief.repeat'), cond: x.condition || '—', desc: x.description || '—' }))],
          checks: ts.map((x) => t('brief.c.trigger', { name: x.name, time: formatClock(x.time), intensity: x.intensity })),
        }
      }
      case 'verifyEnding': {
        const s = sceneOf(sourceId('scene'))
        return s ? { ...sceneFacts(s), checks: [t('brief.c.ending', { title: s.title })] } : { facts: [], checks: [] }
      }
      case 'verify': {
        const ends = plan.scenes.filter((x) => x.ending)
        return {
          facts: [t('brief.f.project', { name: plan.overview.name }), ...ends.map((s) => `${t('plan.scene.ending')}: ${s.title} (${s.id})${s.reachable ? '' : ` — ${t('plan.no')} ${t('plan.col.reachable')}`}`), ...plan.scenes.filter((s) => !s.reachable).map((s) => t('plan.gap.unreachable', { title: s.title })), ...plan.gaps.filter((g) => g.code === 'noEnding' || g.code === 'noStart').map((g) => t(`plan.gap.${g.code}`, g.params))],
          checks: [t('brief.c.verify')],
        }
      }
    }
  }
  const { facts, checks } = collect()

  const kind: TaskKind = task.kind
  const k = (suffix: string, extra: Record<string, string | number> = {}) => t(`brief.${suffix}`, { ...params, ...extra })
  const idx = (prefix: string, count: number) => Array.from({ length: count }, (_, i) => k(`${prefix}.${kind}.${i + 1}`))
  const title = ['foundation', 'state', 'verify'].includes(kind) ? t(`plan.kind.${kind}`) : `${t(`plan.kind.${kind}`)}: ${task.subject}`
  const depLine = (id: string) => {
    const d = plan.tasks.find((x) => x.id === id)!
    return `${id} — ${['foundation', 'state', 'verify'].includes(d.kind) ? t(`plan.kind.${d.kind}`) : d.subject} (${t(`plan.ready.${assessOf(id)}`)})`
  }
  const all = assessPlan(plan, engine)
  const assessOf = (id: string) => all.get(id)!.readiness
  const proposals = adapter.proposals(task)
  if (kind === 'level' || kind === 'verifyEnding') {
    const sid = sourceId('scene')
    proposals.push(`${t('brief.proposedPath')}: ${proposedScenePath(engine, sid)}`)
  }

  const sections: BriefSection[] = [
    {
      id: 'project',
      heading: t('brief.h.project'),
      lines: bullets([
        t('brief.f.project', { name: plan.overview.name }),
        `${t('brief.engine')}: ${t(`plan.engine.${engine}`)}`,
        `${t('plan.col.id')}: ${task.id}`,
        `${t('plan.col.order')}: ${task.order + 1} · ${t('plan.col.phase')}: ${task.phase} — ${t(`plan.phase.${task.phase}`)}`,
        `${t('plan.col.readiness')}: ${t(`plan.ready.${assess.readiness}`)}${assess.blockedBy.length ? ` (${t('plan.col.blockedBy')}: ${assess.blockedBy.join(', ')})` : ''}`,
        t('plan.impl.unknown'),
        `${t('plan.col.sources')}: ${task.sources.map((s) => `${s.kind}:${s.id}`).join(', ')}`,
      ]),
    },
    { id: 'goal', heading: t('brief.h.goal'), lines: [t(`plan.${adapter.prefix}.${kind}.what`, params), '', `${t('brief.scope')}: ${k(`scope.${kind}`)}`] },
    { id: 'facts', heading: t('brief.h.facts'), lines: [t('brief.factsNote'), '', ...bullets(facts.length ? facts : ['—'])] },
    { id: 'inputs', heading: t('brief.h.inputs'), lines: bullets([...idx('inputs', 2), ...tbdText(assess.missing, t)]) },
    { id: 'proposed', heading: t('brief.h.proposed'), lines: [t('brief.proposedNote'), '', ...bullets(proposals.length ? proposals : ['—'])] },
    { id: 'approach', heading: t('brief.h.approach'), lines: [t(`plan.${adapter.prefix}.${kind}.how`, params)] },
    { id: 'steps', heading: t('brief.h.steps'), lines: [...idx('step', 4), k('step.final')].map((x, i) => `${i + 1}. ${x}`) },
    {
      id: 'deps',
      heading: t('brief.h.deps'),
      lines: [
        `**${t('plan.col.dependsOn')}**`,
        ...bullets(task.dependsOn.length ? task.dependsOn.map(depLine) : [t('brief.none')]),
        '',
        `**${t('brief.unblocks')}**`,
        ...bullets(task.dependents.length ? task.dependents.map(depLine) : [t('brief.none')]),
      ],
    },
    { id: 'expected', heading: t('brief.h.expected'), lines: [k(`expect.${kind}`)] },
    { id: 'edge', heading: t('brief.h.edge'), lines: bullets(idx('edge', 2)) },
    { id: 'acceptance', heading: t('brief.h.acceptance'), lines: bullets([t(`plan.${adapter.prefix}.${kind}.done`, params), ...checks]) },
    {
      id: 'limits',
      heading: t('brief.h.limits'),
      lines: [
        ...bullets([t('brief.limit.noEngine'), t('brief.limit.exist'), t('brief.limit.free')]),
        '',
        `**${t('plan.col.blocking')}**`,
        ...bullets(assess.missing.length ? tbdText(assess.missing, t) : [t('brief.none')]),
        '',
        `**${t('plan.col.confirm')}**`,
        ...bullets(assess.confirm.length ? tbdText(assess.confirm, t) : [t('brief.none')]),
      ],
    },
    { id: 'exclusions', heading: t('brief.h.exclusions'), lines: bullets([k(`excl.${kind}`), t('brief.excl.1'), t('brief.excl.2'), t('brief.excl.3'), t('brief.excl.4')]) },
  ]

  const md = [`# ${t('brief.title', { id: task.id, title })}`, '', `> ${t('brief.legend')}`, '']
  for (const sec of sections) md.push(`## ${sec.heading}`, '', ...sec.lines, '')
  return {
    taskId: task.id,
    engine,
    title,
    filename: briefFileName(engine, task.id),
    readiness: assess,
    sections,
    markdown: md.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n',
  }
}

export type { PlanTask }
