import { hasKey, makeT, type Lang, type MessageKey, type ParamsArg, type TFunction } from '../i18n'

/** A language-neutral message: a dictionary code plus its parameters. Rendered by the UI layer. */
export type DiagCode = Extract<MessageKey, `diag.${string}`>
export interface Diagnostic {
  code: DiagCode
  params?: Record<string, string | number>
}

/** Type-checked constructor: params must match the placeholders of the English message. */
export function diag<K extends DiagCode>(code: K, ...args: ParamsArg<K>): Diagnostic {
  return { code, params: args[0] as Record<string, string | number> | undefined }
}

/** `expected`/`received` of `diag.schema.invalidType` hold JSON type names, localized via `type.*`. */
const TYPE_PARAMS = new Set(['expected', 'received'])

export function formatDiagnostic(t: TFunction, d: Diagnostic): string {
  const raw = t as (k: MessageKey, p?: Record<string, string | number>) => string
  let params = d.params
  if (params && d.code === 'diag.schema.invalidType') {
    params = Object.fromEntries(
      Object.entries(params).map(([k, v]) => [k, TYPE_PARAMS.has(k) && hasKey(`type.${v}`) ? raw(`type.${v}` as MessageKey) : v]),
    )
  }
  return raw(d.code, params)
}

export function formatDiagnostics(lang: Lang, list: Diagnostic[]): string[] {
  const t = makeT(lang)
  return list.map((d) => formatDiagnostic(t, d))
}
