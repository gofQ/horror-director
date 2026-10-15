import { useCallback } from 'react'
import { useStore } from '../store/useStore'
import { useT } from '../i18n/store'
import { exprToText } from '../lib/flags'
import type { Expr } from '../lib/schema'

/** Readable text of a structured condition in the current language (flag names resolved by id). */
export function useExprText(): (e: Expr) => string {
  const { t } = useT()
  const flags = useStore((s) => s.project.flags)
  return useCallback(
    (e: Expr) =>
      exprToText(e, (id) => flags.find((f) => f.id === id)?.name, {
        and: t('expr.and'),
        or: t('expr.or'),
        not: t('expr.not'),
        isTrue: t('expr.isTrue'),
        isFalse: t('expr.isFalse'),
        unknown: t('expr.unknownFlag'),
      }),
    [flags, t],
  )
}
