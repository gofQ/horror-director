import { describe, expect, it } from 'vitest'
import { showcaseProject } from '../showcase'
import { sampleProject } from '../sample'
import { buildPlan, type Plan } from './plan'
import { assessPlan } from './readiness'
import { diffParts, fingerprints, taskFingerprint } from './fingerprint'
import { applyAction, dependencyProgress, entryKey, staleness, summarize, TRANSITIONS, type ActionContext, type Entries, type TaskProgress } from './progress'
import { buildReportTemplate, parseReport, reportTemplateText, type ReportContext } from './report'
import { buildAgentPrompt } from './prompt'
import { buildBrief } from './brief'
import { asPT } from './render'
import { makeT } from '../../i18n'
import { renderProgressReport } from './progressReport'
import { serializeProject } from '../io'
import type { Project } from '../schema'

const deepFreeze = <T,>(o: T): T => {
  if (o && typeof o === 'object') {
    Object.freeze(o)
    for (const v of Object.values(o as object)) deepFreeze(v)
  }
  return o
}
const show = showcaseProject()
const plan = buildPlan(show)
const fps = fingerprints(plan)
const pt = asPT(makeT('en'))
const ptTr = asPT(makeT('tr'))
const fpOf = (p: Plan, id: string) => taskFingerprint(p, p.tasks.find((t) => t.id === id)!)
const edit = (f: (p: Project) => void): Plan => {
  const p = structuredClone(show)
  f(p)
  return buildPlan(p)
}
const ctx = (id: string, now = 1000, stale = false, p: Plan = plan): ActionContext => ({ now, fingerprint: fpOf(p, id), stale })
const ok = (r: ReturnType<typeof applyAction>): TaskProgress => {
  if (!r.ok) throw new Error(`action failed: ${r.error}`)
  return r.record
}

describe('task source fingerprint', () => {
  it('is deterministic, input-order independent and does not mutate a frozen project', () => {
    const frozen = deepFreeze(structuredClone(show))
    const again = fingerprints(buildPlan(frozen))
    expect([...again]).toEqual([...fps])
    const shuffled: Project = { ...show, scenes: [...show.scenes].reverse(), transitions: [...show.transitions].reverse(), logicNodes: [...show.logicNodes].reverse() }
    expect([...fingerprints(buildPlan(shuffled))]).toEqual([...fps])
  })

  it('ignores node positions, wire waypoints and unrelated scenes', () => {
    const moved = edit((p) => {
      p.scenes.forEach((s) => (s.position = { x: s.position.x + 17, y: s.position.y - 9 }))
      p.logicNodes.forEach((n) => (n.position = { x: n.position.x + 5, y: n.position.y + 5 }))
      p.transitions.forEach((t) => (t.waypoints = [{ x: 1, y: 2 }]))
    })
    for (const t of plan.tasks) expect(fpOf(moved, t.id).fp, t.id).toBe(fps.get(t.id)!.fp)
    // editing a far-away scene's description leaves the cottage tasks untouched
    const other = edit((p) => {
      p.scenes.find((s) => s.id !== 's_cottage' && s.audioCues.length === 0)!.description += ' changed'
    })
    expect(fpOf(other, 'T-assetAudio-s_cottage').fp).toBe(fps.get('T-assetAudio-s_cottage')!.fp)
    expect(fpOf(other, 'T-audio-s_cottage').fp).toBe(fps.get('T-audio-s_cottage')!.fp)
    expect(fpOf(other, 'T-random-rnd_door').fp).toBe(fps.get('T-random-rnd_door')!.fp)
  })

  it('changes for relevant edits: Random %, IF text, Sequence stage, audio cue, shot, trigger, character', () => {
    const rnd = edit((p) => (p.logicNodes.find((n) => n.id === 'rnd_door')!.probabilityA = 61))
    expect(fpOf(rnd, 'T-random-rnd_door').fp).not.toBe(fps.get('T-random-rnd_door')!.fp)
    const iff = edit((p) => (p.logicNodes.find((n) => n.id === 'if_free')!.condition += ' (v2)'))
    expect(fpOf(iff, 'T-branch-if_free').fp).not.toBe(fps.get('T-branch-if_free')!.fp)
    const seq = edit((p) => (p.logicNodes.find((n) => n.type === 'delay' && n.id === 'dly_beat')!.seconds = 9))
    expect(fpOf(seq, 'T-sequence-seq_break').fp).not.toBe(fps.get('T-sequence-seq_break')!.fp)
    const cue = edit((p) => (p.scenes.find((s) => s.id === 's_cottage')!.audioCues[0].fadeIn += 1))
    expect(fpOf(cue, 'T-assetAudio-s_cottage').fp).not.toBe(fps.get('T-assetAudio-s_cottage')!.fp)
    const sceneWithTrigger = show.scenes.find((s) => s.triggers.length)!
    const trig = edit((p) => (p.scenes.find((s) => s.id === sceneWithTrigger.id)!.triggers[0].time += 1))
    expect(fpOf(trig, `T-trigger-${sceneWithTrigger.id}`).fp).not.toBe(fps.get(`T-trigger-${sceneWithTrigger.id}`)!.fp)
    const ch = edit((p) => (p.characters[0].states[0].behavior += ' more'))
    expect(fpOf(ch, `T-character-${show.characters[0].id}`).fp).not.toBe(fps.get(`T-character-${show.characters[0].id}`)!.fp)
    const shotScene = show.scenes.find((s) => s.shots.length)!
    const shot = edit((p) => (p.scenes.find((s) => s.id === shotScene.id)!.shots[0].framing += 'x'))
    expect(fpOf(shot, `T-cinematic-${shotScene.id}`).fp).not.toBe(fps.get(`T-cinematic-${shotScene.id}`)!.fp)
  })

  it('explains what changed through its parts, and stays engine independent', () => {
    const rnd = edit((p) => (p.logicNodes.find((n) => n.id === 'rnd_door')!.probabilityA = 70))
    const d = diffParts(fps.get('T-random-rnd_door')!.parts, fpOf(rnd, 'T-random-rnd_door').parts)
    expect(d.changed).toEqual(['node:rnd_door'])
    expect(d.added).toEqual([])
    expect(fps.get('T-random-rnd_door')!.fp).toMatch(/^[0-9a-f]{14}$/)
  })

  it('works for the legacy sample too', () => {
    const p = buildPlan(sampleProject())
    expect(fingerprints(p).size).toBe(p.tasks.length)
  })
})

describe('progress state machine and review rules', () => {
  const id = 'T-random-rnd_door'
  it('walks the normal path and only an explicit confirmed approval reaches Verified', () => {
    let r = ok(applyAction(undefined, { type: 'move', to: 'inProgress' }, ctx(id, 1)))
    expect(r.status).toBe('inProgress')
    r = ok(applyAction(r, { type: 'move', to: 'submitted' }, ctx(id, 2)))
    expect(r.captured?.fp).toBe(fps.get(id)!.fp)
    expect(applyAction(r, { type: 'move', to: 'verified' as never }, ctx(id)).ok).toBe(false)
    expect(applyAction(r, { type: 'approve', confirmed: false, note: '' }, ctx(id))).toEqual({ ok: false, error: 'notConfirmed' })
    const v = ok(applyAction(r, { type: 'approve', confirmed: true, note: 'looks right' }, ctx(id, 3)))
    expect(v.status).toBe('verified')
    expect(v.review).toMatchObject({ outcome: 'approved', note: 'looks right' })
    expect(v.history.map((h) => h.to)).toEqual(['inProgress', 'submitted', 'verified'])
  })

  it('cannot approve from the wrong state; no transition table entry targets verified', () => {
    for (const from of Object.keys(TRANSITIONS) as (keyof typeof TRANSITIONS)[]) expect(TRANSITIONS[from]).not.toContain('verified')
    expect(applyAction(undefined, { type: 'approve', confirmed: true, note: 'x' }, ctx(id))).toEqual({ ok: false, error: 'notSubmitted' })
  })

  it('request changes needs a note and returns to in progress; reopening keeps evidence', () => {
    const sub = ok(applyAction(ok(applyAction(undefined, { type: 'move', to: 'inProgress' }, ctx(id))), { type: 'move', to: 'submitted' }, ctx(id)))
    expect(applyAction(sub, { type: 'requestChanges', note: ' ' }, ctx(id))).toEqual({ ok: false, error: 'noNotes' })
    const back = ok(applyAction(sub, { type: 'requestChanges', note: 'fix pins' }, ctx(id)))
    expect(back.status).toBe('inProgress')
    expect(back.review?.outcome).toBe('changesRequested')
    const ver = ok(applyAction(ok(applyAction(back, { type: 'move', to: 'submitted' }, ctx(id))), { type: 'approve', confirmed: true, note: 'ok' }, ctx(id)))
    const reopened = ok(applyAction(ver, { type: 'move', to: 'inProgress' }, ctx(id)))
    expect(reopened.status).toBe('inProgress')
    expect(reopened.captured).toBeDefined()
    expect(reopened.review?.outcome).toBe('approved')
  })

  it('a stale approval needs explicit acknowledgement and re-captures the fingerprint', () => {
    const sub = ok(applyAction(ok(applyAction(undefined, { type: 'move', to: 'inProgress' }, ctx(id))), { type: 'move', to: 'submitted' }, ctx(id)))
    const changed = edit((p) => (p.logicNodes.find((n) => n.id === 'rnd_door')!.probabilityA = 30))
    const c2 = ctx(id, 9, true, changed)
    expect(staleness(sub, fpOf(changed, id)).stale).toBe(true)
    expect(staleness(sub, fps.get(id)).stale).toBe(false)
    expect(applyAction(sub, { type: 'approve', confirmed: true, note: 'x' }, c2)).toEqual({ ok: false, error: 'staleNotAcknowledged' })
    const v = ok(applyAction(sub, { type: 'approve', confirmed: true, note: 'x', acknowledgedChanges: true }, c2))
    expect(v.captured?.fp).toBe(fpOf(changed, id).fp)
    // a verified-but-stale record keeps its saved status until the user acts
    const ver = ok(applyAction(sub, { type: 'approve', confirmed: true, note: 'x' }, ctx(id)))
    expect(ver.status).toBe('verified')
    expect(staleness(ver, fpOf(changed, id)).stale).toBe(true)
    expect(ver.status).toBe('verified')
    expect(applyAction(ver, { type: 'approve', confirmed: true, note: 'again' }, ctx(id, 5, true, changed))).toEqual({ ok: false, error: 'staleNotAcknowledged' })
  })

  it('draft states are never stale; records without a captured fingerprint are never stale', () => {
    const r = ok(applyAction(undefined, { type: 'move', to: 'inProgress' }, ctx(id)))
    expect(staleness(r, { fp: 'other', parts: {} }).stale).toBe(false)
  })

  it('history is capped and notes are length checked', () => {
    let r: TaskProgress | undefined
    for (let i = 0; i < 80; i++) r = ok(applyAction(r, { type: 'move', to: r?.status === 'inProgress' ? 'blocked' : r?.status === 'blocked' ? 'inProgress' : 'inProgress' }, ctx(id, i)))
    expect(r!.history.length).toBeLessThanOrEqual(50)
    expect(applyAction(r, { type: 'setNotes', notes: 'x'.repeat(2001) }, ctx(id))).toEqual({ ok: false, error: 'tooLong' })
  })

  it('attaching a report never approves; it can submit only when asked', () => {
    const rep = buildReportTemplate({ projectId: 'p', engine: 'unreal', taskId: id, fingerprint: fps.get(id)!.fp })
    const a = ok(applyAction(undefined, { type: 'attachReport', report: rep, outdated: false, markSubmitted: false }, ctx(id)))
    expect(a.status).toBe('notStarted')
    const inProg = ok(applyAction(undefined, { type: 'move', to: 'inProgress' }, ctx(id)))
    const b = ok(applyAction(inProg, { type: 'attachReport', report: rep, outdated: false, markSubmitted: true }, ctx(id)))
    expect(b.status).toBe('submitted')
    expect(b.status).not.toBe('verified')
  })
})

describe('summary, dependency impact and orphans', () => {
  const assess = assessPlan(plan, 'unreal')
  const base = (e: Entries = {}) => summarize(plan, 'unreal', e, assess)
  const rec = (status: TaskProgress['status'], id: string, p: Plan = plan): TaskProgress => ({ status, notes: '', history: [], captured: { ...fpOf(p, id), at: 1 } })

  it('counts every task once; without records everything is not started', () => {
    const s = base()
    expect(s.total).toBe(plan.tasks.length)
    expect(s.counts.notStarted).toBe(plan.tasks.length)
    expect(s.stale).toEqual([])
  })

  it('never treats authoring readiness as progress; ready-to-begin needs verified dependencies', () => {
    const foundation = 'T-foundation-project'
    const s = base()
    expect(s.ready).toEqual([foundation].filter((id) => assess.get(id)!.readiness === 'ready'))
    const after = base({ [entryKey('unreal', foundation)]: rec('verified', foundation) })
    expect(after.ready).not.toContain(foundation)
    const stateTask = plan.tasks.find((t) => t.dependsOn.length === 1 && t.dependsOn[0] === foundation && assess.get(t.id)!.readiness === 'ready')
    if (stateTask) expect(after.ready).toContain(stateTask.id)
    // submitted is not enough for dependents
    const sub = base({ [entryKey('unreal', foundation)]: rec('submitted', foundation) })
    expect(sub.ready.some((id) => plan.tasks.find((t) => t.id === id)!.dependsOn.includes(foundation))).toBe(false)
  })

  it('stale tasks flag downstream tasks for rechecking and are reported', () => {
    const id = 'T-level-s_cottage'
    const changed = edit((p) => (p.scenes.find((s) => s.id === 's_cottage')!.duration += 5))
    const e = { [entryKey('unreal', id)]: rec('verified', id) }
    const s = summarize(changed, 'unreal', e, assessPlan(changed, 'unreal'))
    expect(s.stale).toEqual([id])
    expect(s.recheck).toContain('T-audio-s_cottage')
    expect(s.recheck).not.toContain(id)
    expect(s.counts.verified).toBe(1)
    expect(dependencyProgress(changed, 'unreal', e, 'T-audio-s_cottage').pending).toContain(id)
  })

  it('keeps records of vanished tasks as orphans and never as another engine’s', () => {
    const e: Entries = { [entryKey('unreal', 'T-gone-x')]: rec('verified', 'T-level-s_cottage'), [entryKey('unity', 'T-gone-y')]: rec('verified', 'T-level-s_cottage') }
    expect(summarize(plan, 'unreal', e, assess).orphans).toEqual(['T-gone-x'])
    expect(summarize(plan, 'unity', e, assessPlan(plan, 'unity')).orphans).toEqual(['T-gone-y'])
  })

  it('isolates engines: an Unreal record does not show up for Unity', () => {
    const id = 'T-level-s_cottage'
    const e = { [entryKey('unreal', id)]: rec('verified', id) }
    expect(summarize(plan, 'unity', e, assessPlan(plan, 'unity')).counts.verified).toBe(0)
    expect(summarize(plan, 'unreal', e, assess).counts.verified).toBe(1)
  })

  it('progress is not part of the authored project export', () => {
    const strip = (s: string) => s.replace(/"exportedAt": "[^"]*"/, '')
    const before = strip(serializeProject(show))
    base({ [entryKey('unreal', 'T-level-s_cottage')]: rec('verified', 'T-level-s_cottage') })
    expect(strip(serializeProject(show))).toBe(before)
    expect(before).not.toMatch(/inProgress|notStarted|"captured"|horror-director:progress/)
  })

  it('renders a progress report with ids, engine, status, freshness and unresolved issues', () => {
    const id = 'T-level-s_cottage'
    const changed = edit((p) => (p.scenes.find((s) => s.id === 's_cottage')!.duration += 5))
    const md = renderProgressReport(changed, 'unity', { [entryKey('unity', id)]: rec('verified', id) }, pt)
    expect(md).toContain(id)
    expect(md).toContain('unity')
    expect(md).toContain('STALE')
    expect(md).toContain('Verified / approved')
    expect(md).toContain('claims')
    expect(renderProgressReport(plan, 'unreal', {}, ptTr)).not.toMatch(/\{[a-z]+\}/)
  })
})

describe('completion report', () => {
  const id = 'T-random-rnd_door'
  const c: ReportContext = { projectId: 'p_abc', engine: 'unreal', taskId: id, fingerprint: fps.get(id)!.fp }
  const good = () => JSON.parse(reportTemplateText(c))

  it('accepts the template and keeps agent claims separate from verified facts', () => {
    const r = parseReport(reportTemplateText(c), c)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.warnings).toEqual([])
      expect(r.report.independentlyVerified).toEqual([])
      expect(Object.keys(r.report)).toContain('agentClaim')
    }
  })

  it('rejects bad JSON, other formats, unsupported versions and malformed fields', () => {
    expect(parseReport('{nope', c)).toEqual({ ok: false, errors: [{ code: 'notJson' }] })
    expect(parseReport('x'.repeat(200_000), c)).toEqual({ ok: false, errors: [{ code: 'tooLarge' }] })
    expect(parseReport({ ...good(), format: 'other' }, c)).toEqual({ ok: false, errors: [{ code: 'format' }] })
    expect(parseReport({ ...good(), version: 2 }, c)).toEqual({ ok: false, errors: [{ code: 'version' }] })
    const bad = good()
    bad.agentClaim.outcome = 'great'
    const r = parseReport(bad, c)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors[0]).toMatchObject({ code: 'malformed', detail: 'agentClaim.outcome' })
    const extra = good()
    extra.hack = true
    expect(parseReport(extra, c).ok).toBe(false)
    expect(parseReport([], c).ok).toBe(false)
  })

  it('rejects mismatched project, engine and task identity', () => {
    for (const [patch, code] of [[{ projectId: 'other' }, 'project'], [{ engine: 'unity' }, 'engine'], [{ taskId: 'T-x' }, 'task']] as const)
      expect(parseReport({ ...good(), ...patch }, c)).toEqual({ ok: false, errors: [{ code }] })
    const all = parseReport({ ...good(), projectId: 'o', engine: 'unity', taskId: 'T-x' }, c)
    expect(all.ok === false && all.errors.map((e) => e.code)).toEqual(['project', 'engine', 'task'])
  })

  it('flags an outdated fingerprint but still lets it be reviewed', () => {
    const r = parseReport({ ...good(), sourceFingerprint: 'oldoldoldold' }, c)
    expect(r.ok && r.warnings).toEqual(['outdatedSource'])
  })

  it('never trusts independentlyVerified from outside and strips control characters', () => {
    const rep = good()
    rep.independentlyVerified = ['tests passed']
    rep.agentClaim.notes = 'ok\u0000‮evil <img src=x onerror=alert(1)>'
    const r = parseReport(rep, c)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.warnings).toContain('verifiedIgnored')
      expect(r.report.independentlyVerified).toEqual([])
      expect(r.report.agentClaim.notes).not.toMatch(/[\u0000‮]/)
      expect(r.report.agentClaim.notes).toContain('<img') // kept as plain text; the UI renders it as text only
    }
  })

  it('the agent prompt carries the template and honesty rules only when a context is given', () => {
    const brief = buildBrief(plan, id, 'unreal', pt)!
    const without = buildAgentPrompt(brief, pt)
    const withCtx = buildAgentPrompt(brief, pt, { projectId: c.projectId, fingerprint: c.fingerprint })
    expect(without).not.toContain('horror-director.completion-report')
    expect(withCtx).toContain('horror-director.completion-report')
    expect(withCtx).toContain(`"sourceFingerprint": "${c.fingerprint}"`)
    expect(withCtx).toContain(`"projectId": "p_abc"`)
    expect(withCtx).toMatch(/Never invent test results/)
    expect(withCtx.startsWith(without.trimEnd())).toBe(true)
    expect(buildAgentPrompt(buildBrief(plan, id, 'unity', ptTr)!, ptTr, { projectId: 'p', fingerprint: 'f' })).not.toMatch(/\{[a-z]+\}/)
  })
})
