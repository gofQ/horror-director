import type { Engine, Plan } from './plan'
import { assessPlan } from './readiness'
import { fingerprints } from './fingerprint'
import { entryKey, splitKey, staleness, summarize, type Entries } from './progress'
import { tbdText, type PT } from './render'

/** Production progress report (Markdown). Pure: statuses are the user-recorded ones, agent claims are labelled as such. */
export const progressReportFileName = (engine: Engine) => `production-progress-${engine}.md`

const cell = (s: string) => s.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|')

export function renderProgressReport(plan: Plan, engine: Engine, entries: Entries, t: PT, projectName = plan.overview.name): string {
  const assess = assessPlan(plan, engine)
  const fps = fingerprints(plan)
  const sum = summarize(plan, engine, entries, assess)
  const out: string[] = [`# ${t('progress.rep.title', { name: projectName, engine: t(`plan.engine.${engine}`) })}`, '', t('progress.rep.note'), '']
  out.push(`## ${t('progress.rep.summary')}`, '')
  out.push(`- ${t('progress.rep.total')}: ${sum.total}`)
  for (const k of ['notStarted', 'inProgress', 'submitted', 'verified', 'blocked'] as const) out.push(`- ${t(`progress.status.${k}`)}: ${sum.counts[k]}`)
  out.push(`- ${t('progress.stale.badge')}: ${sum.stale.length}`, `- ${t('progress.dash.ready')}: ${sum.ready.length}`, `- ${t('progress.dash.orphans')}: ${sum.orphans.length}`, '')
  out.push(`## ${t('progress.rep.tasks')}`, '', `| ${['id', 'engine', 'progress', 'freshness', 'review', 'readiness', 'deps'].map((c) => t(`progress.rep.col.${c}`)).join(' | ')} |`, '|---|---|---|---|---|---|---|')
  const issues: string[] = []
  for (const task of plan.tasks) {
    const rec = entries[entryKey(engine, task.id)]
    const stale = staleness(rec, fps.get(task.id)).stale
    const a = assess.get(task.id)!
    const done = task.dependsOn.filter((d) => entries[entryKey(engine, d)]?.status === 'verified').length
    out.push(`| ${cell(task.id)} | ${engine} | ${t(`progress.status.${rec?.status ?? 'notStarted'}`)} | ${rec?.captured ? (stale ? t('progress.stale.badge') : t('progress.fresh')) : '—'} | ${rec?.review ? t(`progress.review.outcome.${rec.review.outcome}`) : '—'} | ${t(`plan.ready.${a.readiness}`)} | ${done}/${task.dependsOn.length} |`)
    const un: string[] = []
    if (rec?.status === 'blocked') un.push(t('progress.status.blocked'))
    if (stale) un.push(t('progress.rep.staleIssue'))
    un.push(...tbdText(a.missing, t))
    for (const q of rec?.report?.report.agentClaim.questions ?? []) un.push(`${t('progress.rep.agentQuestion')}: ${q}`)
    for (const l of rec?.report?.report.agentClaim.limitations ?? []) un.push(`${t('progress.rep.agentLimitation')}: ${l}`)
    if (rec?.review?.outcome === 'changesRequested') un.push(`${t('progress.review.outcome.changesRequested')}: ${rec.review.note}`)
    if (un.length) issues.push(`### ${task.id}`, '', ...un.map((x) => `- ${x}`), '')
  }
  out.push('', `## ${t('progress.rep.unresolved')}`, '', ...(issues.length ? issues : ['—', '']))
  const orphans = Object.keys(entries).filter((k) => splitKey(k)?.engine === engine && !plan.tasks.some((x) => entryKey(engine, x.id) === k))
  if (orphans.length) out.push(`## ${t('progress.dash.orphans')}`, '', ...orphans.map((k) => `- ${k} — ${t(`progress.status.${entries[k].status}`)}`), '')
  out.push(`> ${t('progress.rep.claims')}`, '')
  return out.join('\n')
}
