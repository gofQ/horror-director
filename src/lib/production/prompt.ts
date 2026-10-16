import { tbdText, type PT } from './render'
import { ADAPTERS } from './engines'
import type { Brief } from './brief'
import { reportTemplateText, type ReportContext } from './report'

/**
 * Self-contained prompt for a coding agent (Claude Code, Codex, …) running INSIDE the target Unreal/Unity project.
 * It carries only the selected task (its brief); nothing about other scenes or the project history. Horror Director
 * has no access to the engine project, and every name in the brief is a proposal, which the prompt says explicitly.
 */
export function buildAgentPrompt(brief: Brief, t: PT, report?: Omit<ReportContext, 'engine' | 'taskId'>): string {
  const engine = t(`plan.engine.${brief.engine}`)
  const needs = brief.readiness.missing
  const out = [
    t('brief.prompt.intro', { engine, id: brief.taskId, title: brief.title }),
    '',
    t('brief.prompt.rules'),
    ...[1, 2, 3, 4, 5, 6].map((i) => `${i}. ${t(`brief.prompt.rule.${i}`, { engine, vocab: ADAPTERS[brief.engine].vocab.test })}`),
    '',
    needs.length ? `${t('brief.prompt.missing')}\n${tbdText(needs, t).map((x) => `- ${x}`).join('\n')}` : t('brief.prompt.noMissing'),
    '',
    t('brief.prompt.status', { state: t(`plan.ready.${brief.readiness.readiness}`) }),
    '',
    '---',
    '',
    brief.markdown.trimEnd(),
    '',
    ...(report
      ? [
          '---',
          '',
          `## ${t('progress.prompt.title')}`,
          '',
          t('progress.prompt.intro'),
          ...[1, 2, 3, 4, 5].map((i) => `${i}. ${t(`progress.prompt.rule.${i}`)}`),
          '',
          '```json',
          reportTemplateText({ ...report, engine: brief.engine, taskId: brief.taskId }),
          '```',
          '',
        ]
      : []),
  ]
  return out.join('\n')
}
